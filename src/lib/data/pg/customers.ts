import "server-only";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, customers, sites } from "@/lib/db/schema/crm";
import { projects } from "@/lib/db/schema/projects";
import type { ProjectStatus } from "@/lib/db/schema/enums";
import type { Customer } from "../types";

/**
 * Postgres reads and writes for customers.
 *
 * The `Customer` view model carries three aggregates the table does not hold —
 * `siteCount`, `activeProjects` and `lifetimeValueCents` — plus the primary
 * contact, which lives in its own table. They are gathered in grouped queries
 * rather than per row, so listing N customers stays four round trips instead
 * of 3N + 1.
 */

/**
 * Statuses that do not count towards "active projects" on a customer card.
 *
 * Typed as `ProjectStatus[]` rather than a bare string list so a future rename
 * of a status fails the build here. Postgres rejects an unknown enum label at
 * runtime, which is a query-time error on a page rather than a caught mistake.
 */
const FINISHED_PROJECT_STATUSES: ProjectStatus[] = ["closed", "lost", "cancelled"];

export async function listCustomers(orgId: string): Promise<Customer[]> {
  return loadCustomers(orgId, true, true);
}

export async function listArchivedCustomers(orgId: string): Promise<Customer[]> {
  return loadCustomers(orgId, false, false);
}

/** All active customers, including ones intentionally hidden from portal views. */
export async function listCustomersForPortalPresentation(orgId: string): Promise<Customer[]> {
  return loadCustomers(orgId, true, false);
}

/**
 * Just enough customer to fill a picker.
 *
 * `listCustomers` enriches every row with its primary contact, site count and
 * lifetime value — three extra queries, and none of it visible in a dropdown.
 * The project header and the new-project form want a name and an id.
 */
export async function listCustomerOptions(
  orgId: string,
  includeCustomerIds: string[] = [],
): Promise<Array<{ id: string; name: string; defaultProjectTemplateId: string | null }>> {
  const visibility = includeCustomerIds.length
    ? or(eq(customers.portalVisible, true), inArray(customers.id, includeCustomerIds))
    : eq(customers.portalVisible, true);
  return db()
    .select({
      id: customers.id,
      name: customers.name,
      defaultProjectTemplateId: customers.defaultProjectTemplateId,
    })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.active, true), visibility))
    .orderBy(asc(customers.name));
}

export async function getCustomer(orgId: string, id: string): Promise<Customer | null> {
  const [row] = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, id)))
    .limit(1);
  if (!row) return null;
  const [enriched] = await enrich(orgId, [row]);
  return enriched ?? null;
}

export async function isCustomerArchived(orgId: string, id: string): Promise<boolean> {
  const [row] = await db()
    .select({ active: customers.active })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, id)))
    .limit(1);
  // Absent is not archived — the caller distinguishes "gone" via getCustomer.
  return row ? !row.active : false;
}

async function loadCustomers(orgId: string, active: boolean, visibleOnly: boolean): Promise<Customer[]> {
  const conditions = [eq(customers.orgId, orgId), eq(customers.active, active)];
  if (visibleOnly) conditions.push(eq(customers.portalVisible, true));
  const rows = await db()
    .select()
    .from(customers)
    .where(and(...conditions))
    .orderBy(asc(customers.name));
  return enrich(orgId, rows);
}

async function enrich(orgId: string, rows: (typeof customers.$inferSelect)[]): Promise<Customer[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [primaryContacts, siteCounts, projectStats] = await Promise.all([
    db()
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), inArray(contacts.customerId, ids), eq(contacts.isPrimary, true))),
    db()
      .select({ customerId: sites.customerId, count: sql<number>`count(*)::int` })
      .from(sites)
      .where(and(eq(sites.orgId, orgId), inArray(sites.customerId, ids)))
      .groupBy(sites.customerId),
    db()
      .select({
        customerId: projects.customerId,
        // Lifetime value counts every project regardless of status; active
        // counts only those still in flight. Two aggregates, one scan.
        lifetimeValueCents: sql<number>`coalesce(sum(${projects.contractValueCents}), 0)::int`,
        activeProjects: sql<number>`count(*) filter (where ${projects.status} not in ${FINISHED_PROJECT_STATUSES})::int`,
      })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), inArray(projects.customerId, ids)))
      .groupBy(projects.customerId),
  ]);

  const contactBy = new Map(primaryContacts.map((c) => [c.customerId, c]));
  const sitesBy = new Map(siteCounts.map((s) => [s.customerId, s.count]));
  const projectsBy = new Map(projectStats.map((p) => [p.customerId, p]));

  return rows.map((row) => {
    const contact = contactBy.get(row.id);
    const stats = projectsBy.get(row.id);
    return {
      id: row.id,
      name: row.name,
      accountType: row.accountType,
      abn: row.abn,
      // `payment_terms_days` is a text column. Parsed with a 30-day default
      // rather than 0, because 0 would silently mean "due immediately".
      paymentTermsDays: Number.parseInt(row.paymentTermsDays ?? "", 10) || 30,
      primaryContactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : null,
      primaryContactEmail: contact?.email ?? null,
      primaryContactPhone: contact?.phone ?? null,
      siteCount: sitesBy.get(row.id) ?? 0,
      activeProjects: stats?.activeProjects ?? 0,
      lifetimeValueCents: stats?.lifetimeValueCents ?? 0,
      priceListId: row.priceListId,
      defaultProjectTemplateId: row.defaultProjectTemplateId,
      portalVisible: row.portalVisible,
      color: row.portalColor,
      xeroContactId: row.xeroContactId,
    };
  });
}

/**
 * Create a customer and, when contact details were given, its primary contact.
 *
 * Two inserts rather than one, and `neon-http` has no interactive transactions,
 * so a failure between them leaves a customer with no contact. That is the
 * benign direction to fail in — a contactless customer is editable, whereas an
 * orphaned contact would not be reachable at all.
 */
export async function createCustomer(
  orgId: string,
  input: {
    name: string;
    accountType?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    paymentTermsDays: number;
  },
): Promise<Customer> {
  const [row] = await db()
    .insert(customers)
    .values({
      orgId,
      name: input.name,
      accountType: input.accountType || null,
      paymentTermsDays: String(input.paymentTermsDays),
      active: true,
    })
    .returning();

  const contactName = input.contactName?.trim();
  if (contactName || input.contactEmail || input.contactPhone) {
    const [firstName, ...rest] = (contactName || input.contactEmail || "Contact").split(/\s+/);
    await db().insert(contacts).values({
      orgId,
      customerId: row.id,
      firstName,
      lastName: rest.join(" ") || null,
      email: input.contactEmail || null,
      phone: input.contactPhone || null,
      isPrimary: true,
    });
  }

  const created = await getCustomer(orgId, row.id);
  if (!created) throw new Error("Customer was inserted but could not be read back.");
  return created;
}

/**
 * Edit a customer from the record form.
 *
 * The contact fields on that form are the *primary* contact, which lives in its
 * own table — so this is an update of one row and an upsert of another. Clearing
 * every contact field deletes the primary contact rather than leaving a blank
 * one behind, because a nameless, emailless contact renders as an empty line on
 * the customer card and cannot be got rid of any other way.
 */
export async function updateCustomer(
  orgId: string,
  input: {
    id: string;
    name: string;
    accountType?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    paymentTermsDays: number;
    priceListId?: string;
    defaultProjectTemplateId?: string;
  },
): Promise<void> {
  const updated = await db()
    .update(customers)
    .set({
      name: input.name.trim(),
      accountType: input.accountType?.trim() || null,
      paymentTermsDays: String(input.paymentTermsDays),
      priceListId: input.priceListId || null,
      defaultProjectTemplateId: input.defaultProjectTemplateId || null,
      updatedAt: new Date(),
    })
    .where(and(eq(customers.orgId, orgId), eq(customers.id, input.id)))
    .returning({ id: customers.id });
  if (updated.length === 0) throw new Error("Customer not found");

  const contactName = input.contactName?.trim();
  const email = input.contactEmail?.trim() || null;
  const phone = input.contactPhone?.trim() || null;

  const [existing] = await db()
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.customerId, input.id), eq(contacts.isPrimary, true)))
    .limit(1);

  if (!contactName && !email && !phone) {
    if (existing) await db().delete(contacts).where(eq(contacts.id, existing.id));
    return;
  }

  const [firstName, ...rest] = (contactName || email || "Contact").split(/\s+/);
  const values = { firstName, lastName: rest.join(" ") || null, email, phone };

  if (existing) {
    await db().update(contacts).set({ ...values, updatedAt: new Date() }).where(eq(contacts.id, existing.id));
    return;
  }
  await db().insert(contacts).values({ orgId, customerId: input.id, isPrimary: true, ...values });
}

/**
 * Park a customer, or bring one back. `active` is the same flag the list pages
 * split on, so archiving is one column and nothing moves.
 */
export async function setCustomerActive(orgId: string, id: string, active: boolean): Promise<boolean> {
  const rows = await db()
    .update(customers)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(customers.orgId, orgId), eq(customers.id, id)))
    .returning({ id: customers.id });
  return rows.length > 0;
}

/**
 * Delete a customer outright. Contacts and sites cascade with it.
 *
 * Projects do not: `projects.customer_id` references this table without a
 * cascade, so Postgres refuses the delete while any project still points here.
 * That refusal is the desired behaviour — silently deleting somebody's job
 * history along with their customer record would be far worse — but the raw
 * foreign-key error is not something to put in front of a person, so it is
 * turned into a sentence.
 */
export async function deleteCustomer(orgId: string, id: string): Promise<boolean> {
  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.customerId, id)));
  if (count > 0) {
    throw new Error(`This customer still has ${count} project${count === 1 ? "" : "s"}. Delete or reassign them first.`);
  }

  const rows = await db()
    .delete(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, id)))
    .returning({ id: customers.id });
  return rows.length > 0;
}

export interface XeroCustomerImport {
  xeroContactId: string;
  name: string;
  abn: string | null;
  billingAddress: string | null;
  /** Null when Xero's terms are month-relative and do not express a day count. */
  paymentTermsDays: number | null;
  /** Null when Xero holds no person, which must not blank out one held here. */
  contact: { firstName: string; lastName: string | null; email: string | null; phone: string | null } | null;
}

/** Kept well inside Postgres' parameter ceiling with eight columns per row. */
const IMPORT_CHUNK = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/** Case and spacing are how the same company gets typed twice, so neither counts. */
function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Mirror Xero's contacts into the customer table.
 *
 * Adds and updates; never deletes, and never touches `active`. A customer here
 * with no Xero contact is left alone — it predates the integration or was
 * created while Xero was down, it may have live projects hanging off it, and
 * `ensureXeroContact` links it the first time something is exported for it.
 * Archiving stays a decision someone makes, in one place or the other, rather
 * than something a sync does on their behalf.
 *
 * Two passes, because a first sync has to recognise customers that already exist
 * on both sides. The first claims unlinked rows whose name matches a contact,
 * which is what stops the initial run from duplicating the entire list. The
 * second is one upsert keyed on `xero_contact_id`, so a steady-state sync of
 * several hundred contacts is a handful of statements rather than one per row —
 * `neon-http` charges a round trip for each, and a per-row loop is how a sync
 * button ends up outliving the request timeout.
 */
export async function importXeroCustomers(
  orgId: string,
  raw: XeroCustomerImport[],
): Promise<{ created: number; updated: number }> {
  // Postgres refuses an ON CONFLICT that would touch the same row twice in one
  // statement, so a contact appearing on two pages must not reach the insert
  // twice. Last wins, which for paged reads is the fresher copy.
  const inputs = [...new Map(raw.map((input) => [input.xeroContactId, input])).values()];
  if (inputs.length === 0) return { created: 0, updated: 0 };

  const existing = await db()
    .select({
      id: customers.id,
      name: customers.name,
      xeroContactId: customers.xeroContactId,
    })
    .from(customers)
    .where(eq(customers.orgId, orgId));

  const linkedIds = new Set(existing.map((row) => row.xeroContactId).filter(Boolean) as string[]);

  // Only unlinked rows are candidates, and only where the name is unambiguous —
  // two customers called "Smith Building" cannot be told apart by name, and
  // guessing would attach a Xero contact to the wrong company's job history.
  const unlinkedByName = new Map<string, string | null>();
  for (const row of existing) {
    if (row.xeroContactId) continue;
    const key = normaliseName(row.name);
    unlinkedByName.set(key, unlinkedByName.has(key) ? null : row.id);
  }

  let created = 0;
  let updated = 0;

  for (const input of inputs) {
    if (linkedIds.has(input.xeroContactId)) continue;
    const match = unlinkedByName.get(normaliseName(input.name));
    if (!match) continue;
    await db()
      .update(customers)
      .set({ xeroContactId: input.xeroContactId, updatedAt: new Date() })
      .where(and(eq(customers.orgId, orgId), eq(customers.id, match)));
    // Claimed, so a second contact with the same name falls through to an insert
    // rather than stealing the row back.
    unlinkedByName.set(normaliseName(input.name), null);
    linkedIds.add(input.xeroContactId);
  }

  for (const batch of chunk(inputs, IMPORT_CHUNK)) {
    const rows = await db()
      .insert(customers)
      .values(
        batch.map((input) => ({
          orgId,
          name: input.name,
          abn: input.abn,
          billingAddress: input.billingAddress,
          paymentTermsDays: input.paymentTermsDays == null ? null : String(input.paymentTermsDays),
          xeroContactId: input.xeroContactId,
          // Contacts mirrored from Xero start hidden. Making one available in
          // this portal is a deliberate local presentation decision.
          portalVisible: false,
        })),
      )
      .onConflictDoUpdate({
        target: [customers.orgId, customers.xeroContactId],
        set: {
          name: sql`excluded.name`,
          abn: sql`excluded.abn`,
          billingAddress: sql`excluded.billing_address`,
          // Xero not expressing a day count must not reset the row to nothing,
          // so a null from the import keeps whatever is already there.
          paymentTermsDays: sql`coalesce(excluded.payment_terms_days, ${customers.paymentTermsDays})`,
          // `active` is deliberately absent. Archiving is somebody's decision,
          // and a customer parked here stays parked no matter what Xero says.
          updatedAt: new Date(),
        },
      })
      .returning({ id: customers.id, xeroContactId: customers.xeroContactId, inserted: sql<boolean>`(xmax = 0)` });

    for (const row of rows) {
      if (row.inserted) created += 1;
      else updated += 1;
    }
  }

  await importPrimaryContacts(orgId, inputs);

  return { created, updated };
}

/**
 * The primary contact for each imported customer.
 *
 * Its own table and no unique key to upsert on, so this reads what is there and
 * writes only what differs. That is not just tidiness: after the first sync
 * almost nothing changes, and skipping the unchanged rows is what keeps a
 * routine sync down to a couple of statements.
 */
async function importPrimaryContacts(orgId: string, inputs: XeroCustomerImport[]): Promise<void> {
  const withContacts = inputs.filter((input) => input.contact);
  if (withContacts.length === 0) return;

  const xeroIds = withContacts.map((input) => input.xeroContactId);
  const linked = new Map<string, string>();
  for (const batch of chunk(xeroIds, IMPORT_CHUNK)) {
    const rows = await db()
      .select({ id: customers.id, xeroContactId: customers.xeroContactId })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), inArray(customers.xeroContactId, batch)));
    for (const row of rows) if (row.xeroContactId) linked.set(row.xeroContactId, row.id);
  }

  const customerIds = [...linked.values()];
  const existing = new Map<string, typeof contacts.$inferSelect>();
  for (const batch of chunk(customerIds, IMPORT_CHUNK)) {
    const rows = await db()
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), inArray(contacts.customerId, batch), eq(contacts.isPrimary, true)));
    for (const row of rows) existing.set(row.customerId, row);
  }

  const inserts: (typeof contacts.$inferInsert)[] = [];
  for (const input of withContacts) {
    const customerId = linked.get(input.xeroContactId);
    if (!customerId) continue;
    const values = {
      firstName: input.contact!.firstName,
      lastName: input.contact!.lastName,
      email: input.contact!.email,
      phone: input.contact!.phone,
    };
    const current = existing.get(customerId);
    if (!current) {
      inserts.push({ orgId, customerId, isPrimary: true, ...values });
      continue;
    }
    const unchanged =
      current.firstName === values.firstName &&
      (current.lastName ?? null) === values.lastName &&
      (current.email ?? null) === values.email &&
      (current.phone ?? null) === values.phone;
    if (unchanged) continue;
    await db().update(contacts).set({ ...values, updatedAt: new Date() }).where(eq(contacts.id, current.id));
  }

  for (const batch of chunk(inserts, IMPORT_CHUNK)) {
    await db().insert(contacts).values(batch);
  }
}

/**
 * Active customers that came from Xero, with how many projects hang off each.
 *
 * Feeds the clean-up review. Rows with no `xero_contact_id` are excluded by the
 * join condition rather than filtered afterwards — they never came from Xero and
 * are not the review's business.
 */
export async function listActiveXeroLinkedCustomers(
  orgId: string,
): Promise<Array<{ id: string; name: string; xeroContactId: string; projectCount: number }>> {
  const rows = await db()
    .select({
      id: customers.id,
      name: customers.name,
      xeroContactId: customers.xeroContactId,
      projectCount: sql<number>`count(${projects.id})::int`,
    })
    .from(customers)
    .leftJoin(projects, and(eq(projects.orgId, orgId), eq(projects.customerId, customers.id)))
    .where(and(eq(customers.orgId, orgId), eq(customers.active, true), isNotNull(customers.xeroContactId)))
    .groupBy(customers.id, customers.name, customers.xeroContactId)
    .orderBy(asc(customers.name));

  return rows.map((row) => ({ ...row, xeroContactId: row.xeroContactId! }));
}

/**
 * Archive a reviewed set in one statement.
 *
 * Archive rather than delete: these rows may carry quotes, invoices and job
 * history, `projects.customer_id` would refuse the delete for any that do, and
 * "wrong about a supplier" should cost somebody one click to undo rather than a
 * restore from backup.
 *
 * Scoped to `orgId` and to rows that actually came from Xero, so a stale or
 * doctored list of ids cannot reach a customer this clean-up has no business
 * touching.
 */
export async function archiveXeroLinkedCustomers(orgId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db()
    .update(customers)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(customers.orgId, orgId),
        inArray(customers.id, ids),
        isNotNull(customers.xeroContactId),
        eq(customers.active, true),
      ),
    )
    .returning({ id: customers.id });
  return rows.length;
}

/**
 * Updates portal-only customer settings in one database statement. Neither the
 * Xero ID nor any Xero-owned contact data is part of this operation.
 */
export async function saveCustomerPortalPresentation(
  orgId: string,
  entries: Array<{ id: string; portalVisible: boolean; color: string | null }>,
): Promise<void> {
  if (!entries.length) return;
  // jsonb_to_recordset matches its column list against the JSON keys by name, so
  // the payload is rewritten to the column names rather than sent as-is. A
  // camelCase key does not error — it reads as NULL for every row.
  const payload = entries.map((entry) => ({
    id: entry.id,
    portal_visible: entry.portalVisible,
    portal_color: entry.color,
  }));
  await db().execute(sql`
    update ${customers} as customer
    set
      portal_visible = incoming.portal_visible,
      portal_color = incoming.portal_color,
      updated_at = now()
    from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb)
      as incoming(id uuid, portal_visible boolean, portal_color text)
    where customer.org_id = ${orgId}
      and customer.id = incoming.id
      and customer.active = true
  `);
}

/** Search index for the top bar: one query, none of the list-page aggregates. */
export async function listCustomersForSearch(
  orgId: string,
  limit = 500,
): Promise<Array<{ id: string; name: string; primaryContactName: string | null }>> {
  const rows = await db()
    .select({
      id: customers.id,
      name: customers.name,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(customers)
    .leftJoin(
      contacts,
      and(eq(contacts.customerId, customers.id), eq(contacts.isPrimary, true)),
    )
    .where(and(eq(customers.orgId, orgId), eq(customers.active, true), eq(customers.portalVisible, true)))
    .orderBy(asc(customers.name))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    primaryContactName: row.firstName ? [row.firstName, row.lastName].filter(Boolean).join(" ") : null,
  }));
}
