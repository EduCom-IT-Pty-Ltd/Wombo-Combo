import "server-only";
import { and, eq } from "drizzle-orm";
import { db, hasDatabase } from "@/lib/db";
import { customers } from "@/lib/db/schema/crm";
import { getCustomer, importXeroCustomers, type XeroCustomerImport } from "@/lib/data/pg/customers";
import { getConnection, xeroConfigured, xeroFetch } from "./client";

/**
 * Customers, mirrored from Xero's contacts.
 *
 * Xero is the source of truth. It is where the bookkeeper already maintains
 * names, payment terms and billing addresses, and it is where every quote and
 * invoice this app produces has to land — so a customer that exists here but not
 * there is a customer nothing can be billed against. Pulling rather than keeping
 * a parallel list means the two cannot drift.
 *
 * The push direction exists so nobody has to leave the portal to take on a new
 * job: creating or editing a customer here writes the same change to Xero and
 * links the two by `ContactID`. It is deliberately narrow — name, primary
 * contact, payment terms and archive state, the fields this app actually owns a
 * form for. Everything else about a contact is Xero's business.
 */

export interface XeroContact {
  ContactID: string;
  Name: string;
}

interface XeroPhone {
  PhoneType?: string;
  PhoneNumber?: string;
  PhoneAreaCode?: string;
  PhoneCountryCode?: string;
}

interface XeroAddress {
  AddressType?: string;
  AddressLine1?: string;
  AddressLine2?: string;
  City?: string;
  Region?: string;
  PostalCode?: string;
  Country?: string;
}

interface XeroPaymentTerms {
  Sales?: { Day?: number; Type?: string };
}

interface XeroContactRecord {
  ContactID: string;
  Name: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
  TaxNumber?: string;
  IsCustomer?: boolean;
  IsSupplier?: boolean;
  Phones?: XeroPhone[];
  Addresses?: XeroAddress[];
  PaymentTerms?: XeroPaymentTerms;
}

/**
 * Xero pages contacts at 100 by default. The cap is a runaway guard, not an
 * expected limit — 200 pages is 20,000 contacts, well past what an installation
 * contractor has and far short of anything that would run forever.
 */
const PAGE_SIZE = 100;
const MAX_PAGES = 200;

/**
 * Suppliers are contacts too, and pulling them in would put every timber
 * merchant in the customer list. Anything Xero flags as a supplier is skipped.
 *
 * Contacts with neither flag are kept, and that is not an oversight: Xero only
 * sets `IsCustomer` once a contact has been invoiced, so testing for it would
 * mean a customer created in Xero five minutes ago — exactly the one somebody is
 * about to quote — never syncs. "Not a supplier" is the strictest test that
 * still lets a brand-new customer through.
 */
function isCustomerContact(contact: XeroContactRecord): boolean {
  return contact.IsSupplier !== true;
}

function phoneOf(contact: XeroContactRecord): string | null {
  const phones = (contact.Phones ?? []).filter((phone) => phone.PhoneNumber?.trim());
  // DEFAULT is the one on the contact card; MOBILE is the next best thing to
  // ring. FAX and DDI are neither.
  const phone =
    phones.find((item) => item.PhoneType === "DEFAULT") ?? phones.find((item) => item.PhoneType === "MOBILE");
  if (!phone) return null;
  return [phone.PhoneCountryCode, phone.PhoneAreaCode, phone.PhoneNumber]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

function addressOf(contact: XeroContactRecord): string | null {
  const addresses = contact.Addresses ?? [];
  const address = addresses.find((item) => item.AddressType === "STREET") ?? addresses.find((item) => item.AddressType === "POBOX");
  if (!address) return null;
  const parts = [address.AddressLine1, address.AddressLine2, address.City, address.Region, address.PostalCode, address.Country]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Payment terms as a day count, or null when Xero's terms do not express one.
 *
 * Only `DAYSAFTERBILLDATE` maps cleanly. The month-relative types — 20th of the
 * following month and so on — are not a number of days, and inventing one would
 * put a wrong due date on every invoice for that customer. Null means "leave
 * whatever the app already has", which is at worst stale rather than wrong.
 */
function paymentTermDaysOf(contact: XeroContactRecord): number | null {
  const terms = contact.PaymentTerms?.Sales;
  if (!terms || terms.Type !== "DAYSAFTERBILLDATE") return null;
  return typeof terms.Day === "number" && terms.Day >= 0 ? terms.Day : null;
}

function toImport(contact: XeroContactRecord): XeroCustomerImport {
  const firstName = contact.FirstName?.trim() || null;
  const lastName = contact.LastName?.trim() || null;
  const email = contact.EmailAddress?.trim() || null;
  const phone = phoneOf(contact);

  return {
    xeroContactId: contact.ContactID,
    name: contact.Name.trim(),
    abn: contact.TaxNumber?.trim() || null,
    billingAddress: addressOf(contact),
    paymentTermsDays: paymentTermDaysOf(contact),
    // Null rather than an empty contact when Xero holds no person: the sync
    // should not blank out a name and mobile somebody typed into the portal
    // just because the accounting system never had them.
    contact:
      firstName || lastName || email || phone
        ? { firstName: firstName ?? email ?? "Contact", lastName, email, phone }
        : null,
  };
}

async function fetchAllContacts(orgId: string): Promise<XeroContactRecord[]> {
  const all: XeroContactRecord[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // Active contacts only. Archived ones are archived for a reason and have no
    // business turning up on the new-project form; Xero's default already
    // excludes them, and the filter says so rather than relying on that.
    const response = await xeroFetch<{ Contacts?: XeroContactRecord[] }>(
      orgId,
      `/api.xro/2.0/Contacts?where=${encodeURIComponent('ContactStatus=="ACTIVE"')}&page=${page}&pageSize=${PAGE_SIZE}`,
    );
    const batch = response.Contacts ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

export interface ContactSyncResult {
  created: number;
  updated: number;
  total: number;
  /** Contacts Xero returned that were skipped as suppliers. */
  suppliersSkipped: number;
}

/**
 * Pull the active, non-supplier contacts from Xero.
 *
 * Adds and updates only, and never archives. A customer that exists here and not
 * in Xero — because it predates the integration, or was archived there — is left
 * exactly as it is; it may well have live projects, and taking it off the forms
 * people are using is not something a sync should do on its own. Unlinked rows
 * get their contact id the first time a quote is exported, by
 * `ensureXeroContact`.
 */
export async function syncContactsFromXero(orgId: string): Promise<ContactSyncResult> {
  const fetched = (await fetchAllContacts(orgId)).filter((contact) => contact.ContactID && contact.Name?.trim());
  const contacts = fetched.filter(isCustomerContact);
  const imports = contacts.map(toImport);
  const { created, updated } = await importXeroCustomers(orgId, imports);
  return { created, updated, total: imports.length, suppliersSkipped: fetched.length - contacts.length };
}

/**
 * The contact body Xero accepts, from the fields this app has a form for.
 *
 * Empty strings rather than omitted keys, because Xero treats an absent field as
 * "leave it alone". Omitting them would make clearing an email or a phone number
 * here a change the next sync quietly undoes — the same one-sided-edit trap that
 * archiving has, and just as hard to explain to whoever pressed save.
 *
 * Only the fields this app owns a form for are sent. Everything else on a Xero
 * contact — addresses, tax numbers, defaults — is left untouched precisely
 * because this rule would otherwise blank it.
 */
function contactPayload(input: {
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  paymentTermsDays?: number | null;
}): Record<string, unknown> {
  const [firstName, ...rest] = (input.contactName?.trim() || "").split(/\s+/).filter(Boolean);
  return {
    Name: input.name.trim(),
    EmailAddress: input.contactEmail?.trim() || "",
    FirstName: firstName ?? "",
    LastName: rest.join(" "),
    Phones: [{ PhoneType: "DEFAULT", PhoneNumber: input.contactPhone?.trim() || "" }],
    // Xero's own terms, so its ageing reports match ours.
    ...(input.paymentTermsDays == null
      ? {}
      : { PaymentTerms: { Sales: { Day: input.paymentTermsDays, Type: "DAYSAFTERBILLDATE" } } }),
  };
}

/**
 * Whether there is anywhere to push to.
 *
 * Checked here rather than in each caller so the four write paths cannot drift,
 * and so demo mode — no database, therefore no stored connection — is a quiet
 * no-op instead of a thrown error on a screen that otherwise works.
 */
async function pushAvailable(orgId: string): Promise<boolean> {
  if (!hasDatabase || !xeroConfigured()) return false;
  return Boolean(await getConnection(orgId));
}

async function readCustomerLink(orgId: string, customerId: string) {
  const [row] = await db()
    .select({ id: customers.id, name: customers.name, xeroContactId: customers.xeroContactId })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)))
    .limit(1);
  return row ?? null;
}

async function storeContactId(orgId: string, customerId: string, contactId: string): Promise<void> {
  await db()
    .update(customers)
    .set({ xeroContactId: contactId, updatedAt: new Date() })
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)));
}

/**
 * Find or create the Xero contact for a customer, and remember its id.
 *
 * Matching is by stored `xeroContactId` first and name second. Name matching is
 * a fallback for customers that already exist in Xero from before this
 * integration — without it every one of them would be duplicated on first
 * export, which is tedious to unpick in an accounting system.
 */
export async function ensureXeroContact(orgId: string, customerId: string): Promise<string> {
  const row = await readCustomerLink(orgId, customerId);
  if (!row) throw new Error(`Customer ${customerId} not found.`);
  if (row.xeroContactId) return row.xeroContactId;

  const search = await xeroFetch<{ Contacts?: XeroContact[] }>(
    orgId,
    `/api.xro/2.0/Contacts?where=${encodeURIComponent(`Name=="${row.name.replace(/"/g, '\\"')}"`)}`,
  );

  let contactId = search.Contacts?.[0]?.ContactID;

  if (!contactId) {
    const customer = await getCustomer(orgId, customerId);
    const created = await xeroFetch<{ Contacts: XeroContact[] }>(orgId, "/api.xro/2.0/Contacts", {
      method: "POST",
      body: JSON.stringify({
        Contacts: [
          contactPayload({
            name: row.name,
            contactName: customer?.primaryContactName,
            contactEmail: customer?.primaryContactEmail,
            contactPhone: customer?.primaryContactPhone,
            paymentTermsDays: customer?.paymentTermsDays ?? null,
          }),
        ],
      }),
    });
    contactId = created.Contacts[0].ContactID;
  }

  await storeContactId(orgId, customerId, contactId);
  return contactId;
}

/**
 * Write a customer created or edited here back to Xero.
 *
 * Best effort by design, and the caller is expected to report rather than throw:
 * the customer is already saved by the time this runs, and losing somebody's
 * typing because the accounting system was briefly unreachable would be a worse
 * outcome than a row that syncs on the next attempt.
 *
 * Xero requires contact names to be unique among active contacts, so a rename
 * onto an existing name is rejected there and accepted here. The message says so
 * rather than leaving the two silently different.
 */
export async function pushCustomerToXero(
  orgId: string,
  customerId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!(await pushAvailable(orgId))) return { ok: true };
  const row = await readCustomerLink(orgId, customerId);
  if (!row) return { ok: false, message: "Customer not found." };
  const customer = await getCustomer(orgId, customerId);
  if (!customer) return { ok: false, message: "Customer not found." };

  const payload = {
    // A POST carrying a ContactID updates that contact; without one it creates.
    ...(row.xeroContactId ? { ContactID: row.xeroContactId } : {}),
    ...contactPayload({
      name: customer.name,
      contactName: customer.primaryContactName,
      contactEmail: customer.primaryContactEmail,
      contactPhone: customer.primaryContactPhone,
      paymentTermsDays: customer.paymentTermsDays,
    }),
  };

  try {
    const result = await xeroFetch<{ Contacts: XeroContact[] }>(orgId, "/api.xro/2.0/Contacts", {
      method: "POST",
      body: JSON.stringify({ Contacts: [payload] }),
    });
    const contactId = result.Contacts?.[0]?.ContactID;
    if (contactId && contactId !== row.xeroContactId) await storeContactId(orgId, customerId, contactId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: /name/i.test(message) && /unique|already/i.test(message)
        ? "Xero already has a contact with that name. Saved here, but not in Xero."
        : `Saved here, but Xero rejected it: ${message}`,
    };
  }
}

/**
 * Mirror an archive or restore into Xero.
 *
 * Without this the next sync would read Xero's still-active contact and undo the
 * archive, which reads as the button not working.
 */
export async function setXeroContactArchived(
  orgId: string,
  customerId: string,
  archived: boolean,
): Promise<{ ok: boolean; message?: string }> {
  if (!(await pushAvailable(orgId))) return { ok: true };
  const row = await readCustomerLink(orgId, customerId);
  // Never synced, so there is nothing in Xero to archive.
  if (!row?.xeroContactId) return { ok: true };

  try {
    await xeroFetch(orgId, "/api.xro/2.0/Contacts", {
      method: "POST",
      body: JSON.stringify({
        Contacts: [{ ContactID: row.xeroContactId, ContactStatus: archived ? "ARCHIVED" : "ACTIVE" }],
      }),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: `Saved here, but Xero rejected it: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
