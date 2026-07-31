import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema/crm";
import { invoiceExports } from "@/lib/db/schema/finance";
import { projects } from "@/lib/db/schema/projects";
import { xeroFetch } from "./client";
import { getQuote, listQuotes } from "@/lib/data/pg/quotes";
import { getCustomer } from "@/lib/data/pg/customers";
import { priceLine } from "@/lib/domain/quote";

/**
 * Contact sync and invoice export.
 *
 * We do not issue invoices — Xero does. Everything created here is a **draft**,
 * so nothing reaches a customer until someone approves it in Xero. That is
 * deliberate: an automated system that emails invoices is one bug away from
 * billing the wrong person the wrong amount.
 */

/** Revenue account invoices are coded to. Read from settings, with a default. */
export const DEFAULT_REVENUE_ACCOUNT_CODE = "224";

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
  options: { revenueAccountCode?: string } = {},
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

  const quote = project.acceptedQuoteId
    ? await getQuote(orgId, project.acceptedQuoteId)
    : (await listQuotes(orgId, projectId)).find((q) => q.status === "accepted") ?? null;

  if (!quote) return { ok: false, message: "This project has no accepted quote to invoice." };

  const accountCode = options.revenueAccountCode ?? DEFAULT_REVENUE_ACCOUNT_CODE;
  const contactId = await ensureXeroContact(orgId, project.customerId);

  const payload = {
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    Reference: project.projectNumber,
    // DRAFT, never AUTHORISED. Someone approves it in Xero before it goes out.
    Status: "DRAFT",
    LineAmountTypes: "Exclusive",
    LineItems: quote.lines.map((line) => ({
      Description: line.description,
      Quantity: line.quantity,
      // Priced by the same `priceLine` the quote screen uses, so the invoice
      // cannot disagree with the quote the customer accepted. Cents to dollars
      // happens only here, at the API boundary.
      UnitAmount: priceLine(line).unitSellCents / 100,
      AccountCode: accountCode,
      TaxType: "OUTPUT",
    })),
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

    return { ok: true, message: `Draft invoice ${invoice.InvoiceNumber} created in Xero.`, invoiceNumber: invoice.InvoiceNumber };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = {
      orgId,
      projectId,
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
