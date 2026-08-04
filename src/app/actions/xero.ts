"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/session";
import {
  buildAuthorisationUrl,
  disconnect,
  getConnection,
  xeroConfigured,
  type XeroConnection,
} from "@/lib/integrations/xero/client";
import { XERO_STATE_COOKIE } from "@/app/api/xero/callback/route";

export interface XeroStatus {
  configured: boolean;
  connection: XeroConnection | null;
  /** Xero kills a refresh token 60 days after its last use. */
  daysUntilExpiry: number | null;
}

export async function getXeroStatus(): Promise<XeroStatus> {
  const session = await requireCapability("finance.view");
  if (!xeroConfigured()) return { configured: false, connection: null, daysUntilExpiry: null };

  const connection = await getConnection(session.org.id);
  if (!connection) return { configured: true, connection: null, daysUntilExpiry: null };

  const elapsedDays = (Date.now() - connection.lastRefreshedAt.getTime()) / 86_400_000;
  return { configured: true, connection, daysUntilExpiry: Math.max(0, Math.round(60 - elapsedDays)) };
}

/**
 * Begins authorisation. The `state` is random per attempt and stored in an
 * httpOnly cookie, so the callback can prove the response belongs to a flow this
 * app started rather than one an attacker induced.
 */
export async function connectXero(): Promise<void> {
  await requireCapability("finance.view");
  if (!xeroConfigured()) throw new Error("Xero is not configured.");

  const state = randomUUID();
  const jar = await cookies();
  jar.set(XERO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Long enough to read Xero's consent screen, short enough not to linger.
    maxAge: 600,
  });

  redirect(buildAuthorisationUrl(state));
}

/** Returns void so it can be used directly as a `<form action>`. */
export async function disconnectXero(): Promise<void> {
  const session = await requireCapability("finance.view");
  await disconnect(session.org.id);
  revalidatePath("/finance");
}

/**
 * Push a project's accepted quote to Xero as a draft invoice.
 *
 * `finance.manage` rather than `finance.view`: this writes to the customer's
 * accounting system, which is a different thing from being allowed to look at
 * margins.
 */
export async function exportInvoiceToXero(projectId: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireCapability("finance.manage");
  if (!xeroConfigured()) return { ok: false, message: "Xero is not configured." };
  if (!(await getConnection(session.org.id))) return { ok: false, message: "Connect Xero first, from Finance." };

  const { exportProjectInvoice } = await import("@/lib/integrations/xero/sync");
  const settings = await getXeroSettings(session.org.id);
  const result = await exportProjectInvoice(session.org.id, projectId, {
    revenueAccountCode: settings.revenueAccountCode,
  });

  revalidatePath("/finance");
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: result.ok, message: result.message };
}

/**
 * Push a project quote to Xero as a draft quote.
 *
 * `quote.send` rather than `finance.manage`: this is the estimator's own step,
 * and it creates a customer-facing document rather than touching the ledger.
 * Approving and emailing it still happens in Xero.
 */
export async function exportQuoteToXero(quoteId: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireCapability("quote.send");
  if (!xeroConfigured()) return { ok: false, message: "Xero is not configured." };
  if (!(await getConnection(session.org.id))) return { ok: false, message: "Connect Xero first, from Finance." };

  const { exportProjectQuote } = await import("@/lib/integrations/xero/sync");
  const settings = await getXeroSettings(session.org.id);
  const result = await exportProjectQuote(session.org.id, quoteId, {
    revenueAccountCode: settings.revenueAccountCode,
  });

  revalidatePath("/projects", "layout");
  return { ok: result.ok, message: result.message };
}

/** Bill a specific quote, rather than whichever one the project has accepted. */
export async function exportQuoteInvoiceToXero(
  projectId: string,
  quoteId: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await requireCapability("finance.manage");
  if (!xeroConfigured()) return { ok: false, message: "Xero is not configured." };
  if (!(await getConnection(session.org.id))) return { ok: false, message: "Connect Xero first, from Finance." };

  const { exportProjectInvoice } = await import("@/lib/integrations/xero/sync");
  const settings = await getXeroSettings(session.org.id);
  const result = await exportProjectInvoice(session.org.id, projectId, {
    revenueAccountCode: settings.revenueAccountCode,
    quoteId,
  });

  revalidatePath("/finance");
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: result.ok, message: result.message };
}

/**
 * Mirror Xero's inventory items into the material catalogue.
 *
 * One way only. Xero is where the bookkeeper maintains prices, and a catalogue
 * that can write back is a catalogue that can put a typo into the accounting
 * system.
 */
export async function syncMaterialsFromXero(): Promise<{ ok: boolean; message: string }> {
  const session = await requireCapability("quote.edit");
  if (!xeroConfigured()) return { ok: false, message: "Xero is not configured." };
  if (!(await getConnection(session.org.id))) return { ok: false, message: "Connect Xero first, from Finance." };

  try {
    const { syncItemsFromXero } = await import("@/lib/integrations/xero/items");
    const { created, updated, unpriced, total } = await syncItemsFromXero(session.org.id);
    revalidatePath("/materials");
    revalidatePath("/production-templates");
    revalidatePath("/projects", "layout");
    return {
      ok: true,
      message: `${total} item${total === 1 ? "" : "s"} from Xero: ${created} added, ${updated} updated.${
        unpriced ? ` ${unpriced} have no sell price and cannot be quoted yet.` : ""
      }`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not read items from Xero." };
  }
}

/**
 * Mirror Xero's contacts into the customer list.
 *
 * `customer.manage` rather than `finance.*`: this maintains the customer list,
 * which is the estimator's and the office's job, not the bookkeeper's.
 *
 * Manual, like the material sync, and for the same reason — a name or terms
 * changing underneath someone mid-quote is worse than a list that is a day old,
 * and the result says exactly what moved.
 */
export async function syncCustomersFromXero(): Promise<{ ok: boolean; message: string }> {
  const session = await requireCapability("customer.manage");
  if (!xeroConfigured()) return { ok: false, message: "Xero is not configured." };
  if (!(await getConnection(session.org.id))) return { ok: false, message: "Connect Xero first, from Finance." };

  try {
    const { syncContactsFromXero } = await import("@/lib/integrations/xero/contacts");
    const { created, updated, archived, total } = await syncContactsFromXero(session.org.id);
    revalidatePath("/customers");
    // The list alone is not enough — a renamed customer's own page caches too.
    revalidatePath("/customers/[id]", "page");
    revalidatePath("/projects", "layout");
    return {
      ok: true,
      message: `${total} contact${total === 1 ? "" : "s"} from Xero: ${created} added, ${updated} updated.${
        archived ? ` ${archived} archived in Xero and now archived here.` : ""
      }`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not read contacts from Xero." };
  }
}

/** Refreshes payment status so the `closed` guard can see settled invoices. */
export async function refreshXeroPayments(): Promise<{ ok: boolean; message: string }> {
  const session = await requireCapability("finance.manage");
  if (!(await getConnection(session.org.id))) return { ok: false, message: "Xero is not connected." };

  const { syncInvoicePayments } = await import("@/lib/integrations/xero/sync");
  const { checked, paid } = await syncInvoicePayments(session.org.id);
  revalidatePath("/finance");
  return { ok: true, message: `Checked ${checked} invoice${checked === 1 ? "" : "s"}; ${paid} now paid.` };
}

/**
 * Which revenue account invoices are coded to.
 *
 * Configurable rather than hardcoded because it is a bookkeeping decision, not a
 * technical one — coding installation work to the wrong account puts it in the
 * wrong place in their P&L and someone has to journal it back.
 */
export async function getXeroSettings(orgId: string): Promise<{ revenueAccountCode: string }> {
  const { getXeroAccountCode } = await import("@/lib/data/pg/settings");
  const { DEFAULT_REVENUE_ACCOUNT_CODE } = await import("@/lib/integrations/xero/sync");
  return { revenueAccountCode: (await getXeroAccountCode(orgId)) ?? DEFAULT_REVENUE_ACCOUNT_CODE };
}

export async function setXeroRevenueAccount(code: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireCapability("finance.manage");
  const { setXeroAccountCode } = await import("@/lib/data/pg/settings");
  await setXeroAccountCode(session.org.id, code.trim());
  revalidatePath("/finance");
  return { ok: true, message: `Invoices will be coded to account ${code.trim()}.` };
}

/** Revenue accounts from the connected Xero org, for the settings picker. */
export async function listXeroRevenueAccounts(): Promise<Array<{ code: string; name: string }>> {
  const session = await requireCapability("finance.manage");
  if (!(await getConnection(session.org.id))) return [];
  const { xeroFetch } = await import("@/lib/integrations/xero/client");
  const result = await xeroFetch<{ Accounts: Array<{ Code: string; Name: string; Status: string }> }>(
    session.org.id,
    '/api.xro/2.0/Accounts?where=Type=="REVENUE"',
  );
  return result.Accounts.filter((a) => a.Status === "ACTIVE").map((a) => ({ code: a.Code, name: a.Name }));
}

/** Projects already pushed to Xero, so the table can render in one query. */
export async function listExportedProjectIds(): Promise<string[]> {
  const session = await requireCapability("finance.view");
  const { db } = await import("@/lib/db");
  const { invoiceExports } = await import("@/lib/db/schema/finance");
  const { and, eq, isNotNull } = await import("drizzle-orm");
  const rows = await db()
    .select({ projectId: invoiceExports.projectId })
    .from(invoiceExports)
    .where(and(eq(invoiceExports.orgId, session.org.id), isNotNull(invoiceExports.xeroInvoiceId)));
  return rows.map((row) => row.projectId);
}
