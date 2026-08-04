import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema/crm";
import { invoiceExports } from "@/lib/db/schema/finance";
import { organizations } from "@/lib/db/schema/org";
import { projects } from "@/lib/db/schema/projects";
import { quotes } from "@/lib/db/schema/quoting";
import { xeroFetch } from "./client";
import { getQuote, listQuotes } from "@/lib/data/pg/quotes";
import { getCustomer } from "@/lib/data/pg/customers";
import { getXeroItemRefs } from "@/lib/data/pg/settings";
import { priceLine } from "@/lib/domain/quote";
import type { QuoteSummary } from "@/lib/data/types";

/**
 * Contact sync, quote export and invoice export.
 *
 * We do not issue quotes or invoices — Xero does. Everything created here is a
 * **draft**, so nothing reaches a customer until someone approves it in Xero.
 * That is deliberate: an automated system that emails invoices is one bug away
 * from billing the wrong person the wrong amount.
 */

/** Revenue account invoices are coded to. Read from settings, with a default. */
export const DEFAULT_REVENUE_ACCOUNT_CODE = "224";

/**
 * GST on Income, in Xero's Australian tax types.
 *
 * Sent explicitly rather than left to the account default because the Quotes
 * endpoint — alone among them — does not populate the tax rate from the account
 * code when the field is absent, which produces a quote showing no GST.
 */
const SALES_TAX_TYPE = "OUTPUT";

interface XeroLineItem {
  Description: string;
  Quantity: number;
  UnitAmount: number;
  TaxType: string;
  AccountCode: string;
  ItemCode?: string;
}

/**
 * Quote lines as Xero line items.
 *
 * Where a line came from a catalogue material that mirrors a Xero item, the item
 * code goes on the line and it is coded to that item's own revenue account. That
 * is the point of syncing the catalogue from Xero: the coding decisions the
 * bookkeeper already made are the ones that get used, instead of every line
 * landing in one catch-all.
 *
 * An account is always sent, never left for Xero to infer. Items are allowed to
 * have no sales account, and a line with neither its own account nor one on the
 * item is rejected — which would fail the whole invoice over a single
 * unconfigured product.
 */
async function toXeroLineItems(
  orgId: string,
  quote: QuoteSummary,
  fallbackAccountCode: string,
): Promise<XeroLineItem[]> {
  const materialIds = quote.lines.flatMap((line) => (line.catalogueMaterialId ? [line.catalogueMaterialId] : []));
  const items = await getXeroItemRefs(orgId, materialIds);

  return quote.lines.map((line) => {
    const item = line.catalogueMaterialId ? items.get(line.catalogueMaterialId) : undefined;
    return {
      Description: line.description,
      Quantity: line.quantity,
      // Priced by the same `priceLine` the quote screen uses, so what Xero shows
      // cannot disagree with what the customer was quoted. Cents to dollars
      // happens only here, at the API boundary.
      UnitAmount: priceLine(line).unitSellCents / 100,
      TaxType: SALES_TAX_TYPE,
      AccountCode: item?.salesAccountCode ?? fallbackAccountCode,
      ...(item ? { ItemCode: item.code } : {}),
    };
  });
}

export interface XeroContact {
  ContactID: string;
  Name: string;
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
  const [row] = await db()
    .select({ id: customers.id, name: customers.name, xeroContactId: customers.xeroContactId })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)))
    .limit(1);
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
          {
            Name: row.name,
            EmailAddress: customer?.primaryContactEmail ?? undefined,
            FirstName: customer?.primaryContactName?.split(/\s+/)[0] ?? undefined,
            LastName: customer?.primaryContactName?.split(/\s+/).slice(1).join(" ") || undefined,
            // Xero's own terms, so its ageing reports match ours.
            PaymentTerms: customer
              ? { Sales: { Day: customer.paymentTermsDays, Type: "DAYSAFTERBILLDATE" } }
              : undefined,
          },
        ],
      }),
    });
    contactId = created.Contacts[0].ContactID;
  }

  await db()
    .update(customers)
    .set({ xeroContactId: contactId, updatedAt: new Date() })
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)));

  return contactId;
}

export interface ExportResult {
  ok: boolean;
  message: string;
  invoiceNumber?: string;
}

/**
 * Today, in the organisation's own timezone.
 *
 * `toISOString().slice(0, 10)` would be UTC, which for an Australian
 * organisation is yesterday for the last ten hours of every day — a quote dated
 * before the conversation that produced it is the kind of small wrong the
 * customer notices.
 */
async function today(orgId: string): Promise<string> {
  const [org] = await db()
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  // en-CA formats as YYYY-MM-DD, which is what Xero wants.
  return new Intl.DateTimeFormat("en-CA", { timeZone: org?.timezone || "Australia/Sydney" }).format(new Date());
}

export interface QuoteExportResult {
  ok: boolean;
  message: string;
  quoteNumber?: string;
}

/**
 * Push a project quote to Xero as a draft quote.
 *
 * Idempotent on the quote: one already in Xero is reported rather than sent
 * twice. A second quote for the same job is not as damaging as a second invoice,
 * but it still leaves the customer holding two documents and the office
 * wondering which one they accepted.
 *
 * Created as DRAFT, never SENT. Xero is where it gets looked over and emailed —
 * this only saves the retyping.
 */
export async function exportProjectQuote(
  orgId: string,
  quoteId: string,
  options: { revenueAccountCode?: string } = {},
): Promise<QuoteExportResult> {
  const quote = await getQuote(orgId, quoteId);
  if (!quote) return { ok: false, message: "Quote not found." };
  if (quote.xeroQuoteId) {
    return {
      ok: true,
      message: `Already in Xero as ${quote.xeroQuoteNumber ?? quote.xeroQuoteId}.`,
      quoteNumber: quote.xeroQuoteNumber ?? undefined,
    };
  }
  if (!quote.lines.length) return { ok: false, message: "This quote has no lines to send." };

  const [project] = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, quote.projectId)))
    .limit(1);
  if (!project) return { ok: false, message: "Project not found." };

  const contactId = await ensureXeroContact(orgId, project.customerId);
  const payload = {
    Contact: { ContactID: contactId },
    Date: await today(orgId),
    ...(quote.validUntil ? { ExpiryDate: quote.validUntil.slice(0, 10) } : {}),
    Status: "DRAFT",
    LineAmountTypes: "Exclusive",
    // Xero's quote numbering is left alone: `Reference` and `Title` carry ours,
    // so both numbers appear on the document and either one finds the job.
    Reference: quote.reference,
    Title: project.title.slice(0, 100),
    LineItems: await toXeroLineItems(orgId, quote, options.revenueAccountCode ?? DEFAULT_REVENUE_ACCOUNT_CODE),
  };

  try {
    const created = await xeroFetch<{ Quotes: Array<{ QuoteID: string; QuoteNumber: string; Status: string }> }>(
      orgId,
      "/api.xro/2.0/Quotes",
      { method: "POST", body: JSON.stringify({ Quotes: [payload] }) },
    );
    const xeroQuote = created.Quotes[0];

    await db()
      .update(quotes)
      .set({
        xeroQuoteId: xeroQuote.QuoteID,
        xeroQuoteNumber: xeroQuote.QuoteNumber,
        xeroQuoteStatus: xeroQuote.Status,
        xeroSyncedAt: new Date(),
        xeroLastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)));

    return { ok: true, message: `Draft quote ${xeroQuote.QuoteNumber} created in Xero.`, quoteNumber: xeroQuote.QuoteNumber };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db()
      .update(quotes)
      .set({ xeroLastError: message, updatedAt: new Date() })
      .where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)));
    return { ok: false, message };
  }
}

/**
 * Walk the Xero quote to INVOICED once we have billed it.
 *
 * Xero only allows ACCEPTED -> INVOICED, so a quote sitting in DRAFT or SENT has
 * to be moved through ACCEPTED first. Best effort throughout: the invoice is the
 * thing that matters, and failing the export because a status nudge was rejected
 * would be the tail wagging the dog. What it buys is a Xero quote list that does
 * not still show this job as open.
 */
async function markQuoteInvoiced(orgId: string, quoteId: string, xeroQuoteId: string): Promise<void> {
  try {
    for (const status of ["ACCEPTED", "INVOICED"]) {
      await xeroFetch(orgId, "/api.xro/2.0/Quotes", {
        method: "POST",
        body: JSON.stringify({ Quotes: [{ QuoteID: xeroQuoteId, Status: status }] }),
      });
    }
    await db()
      .update(quotes)
      .set({ xeroQuoteStatus: "INVOICED", xeroSyncedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)));
  } catch {
    // Left as it was in Xero. The invoice exists either way, which is the part
    // that has to be right.
  }
}

/**
 * Push a project's accepted quote to Xero as a draft invoice.
 *
 * Idempotent on the project: an existing successful export is returned rather
 * than creating a second invoice. Double-invoicing a customer is the worst
 * failure this code could have, and a retry after a timeout is exactly when it
 * would happen.
 */
export async function exportProjectInvoice(
  orgId: string,
  projectId: string,
  options: { revenueAccountCode?: string; quoteId?: string } = {},
): Promise<ExportResult> {
  const [existing] = await db()
    .select()
    .from(invoiceExports)
    .where(and(eq(invoiceExports.orgId, orgId), eq(invoiceExports.projectId, projectId)))
    .limit(1);

  if (existing?.xeroInvoiceId) {
    return {
      ok: true,
      message: `Already exported as ${existing.xeroInvoiceNumber ?? existing.xeroInvoiceId}.`,
      invoiceNumber: existing.xeroInvoiceNumber ?? undefined,
    };
  }

  const [project] = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)))
    .limit(1);
  if (!project) return { ok: false, message: "Project not found." };

  // An explicitly chosen quote wins — that is the "invoice this one" button on
  // the quote itself. Otherwise fall back to whichever quote the customer
  // accepted, which is what the Finance list means by invoicing a project.
  const chosen = options.quoteId ? await getQuote(orgId, options.quoteId) : null;
  if (options.quoteId && (!chosen || chosen.projectId !== projectId)) {
    return { ok: false, message: "Quote not found on this project." };
  }

  const quote = chosen
    ?? (project.acceptedQuoteId
      ? await getQuote(orgId, project.acceptedQuoteId)
      : (await listQuotes(orgId, projectId)).find((q) => q.status === "accepted") ?? null);

  if (!quote) return { ok: false, message: "This project has no accepted quote to invoice." };

  const accountCode = options.revenueAccountCode ?? DEFAULT_REVENUE_ACCOUNT_CODE;
  const contactId = await ensureXeroContact(orgId, project.customerId);

  const payload = {
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    Date: await today(orgId),
    Reference: project.projectNumber,
    // DRAFT, never AUTHORISED. Someone approves it in Xero before it goes out.
    Status: "DRAFT",
    LineAmountTypes: "Exclusive",
    LineItems: await toXeroLineItems(orgId, quote, accountCode),
  };

  try {
    const created = await xeroFetch<{ Invoices: Array<{ InvoiceID: string; InvoiceNumber: string }> }>(
      orgId,
      "/api.xro/2.0/Invoices",
      { method: "POST", body: JSON.stringify({ Invoices: [payload] }) },
    );
    const invoice = created.Invoices[0];

    const values = {
      orgId,
      projectId,
      quoteId: quote.id,
      status: "exported" as const,
      amountCents: quote.totalCents,
      // The payload as sent, so a later edit in Xero stays traceable to what we
      // pushed rather than to whatever it has since become.
      payload: payload as unknown as Record<string, unknown>,
      xeroInvoiceId: invoice.InvoiceID,
      xeroInvoiceNumber: invoice.InvoiceNumber,
      exportedAt: new Date(),
      lastError: null,
    };

    if (existing) {
      await db().update(invoiceExports).set({ ...values, updatedAt: new Date() }).where(eq(invoiceExports.id, existing.id));
    } else {
      await db().insert(invoiceExports).values(values);
    }

    // Only once the invoice is safely recorded — a quote marked INVOICED with no
    // invoice against it is worse than one still showing as open.
    if (quote.xeroQuoteId) await markQuoteInvoiced(orgId, quote.id, quote.xeroQuoteId);

    return { ok: true, message: `Draft invoice ${invoice.InvoiceNumber} created in Xero.`, invoiceNumber: invoice.InvoiceNumber };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = {
      orgId,
      projectId,
      quoteId: quote.id,
      status: "failed" as const,
      amountCents: quote.totalCents,
      payload: payload as unknown as Record<string, unknown>,
      lastError: message,
    };
    if (existing) {
      await db().update(invoiceExports).set({ ...failure, updatedAt: new Date() }).where(eq(invoiceExports.id, existing.id));
    } else {
      await db().insert(invoiceExports).values(failure);
    }
    return { ok: false, message };
  }
}

/**
 * Refresh payment status from Xero.
 *
 * The `closed` transition guard requires the invoice to be paid, and Xero is the
 * only system that knows. Reading `AmountDue` rather than trusting `Status`
 * alone means a part-payment does not read as settled.
 */
export async function syncInvoicePayments(orgId: string): Promise<{ checked: number; paid: number }> {
  const rows = await db()
    .select()
    .from(invoiceExports)
    .where(and(eq(invoiceExports.orgId, orgId), eq(invoiceExports.status, "exported")));

  let paid = 0;
  for (const row of rows) {
    if (!row.xeroInvoiceId) continue;
    const result = await xeroFetch<{ Invoices: Array<{ Status: string; AmountDue: number }> }>(
      orgId,
      `/api.xro/2.0/Invoices/${row.xeroInvoiceId}`,
    );
    const invoice = result.Invoices[0];
    if (invoice && invoice.Status === "PAID" && invoice.AmountDue === 0) {
      await db()
        .update(invoiceExports)
        .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
        .where(eq(invoiceExports.id, row.id));
      paid++;
    }
  }
  return { checked: rows.length, paid };
}
