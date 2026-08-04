import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { xeroConnections } from "@/lib/db/schema/integrations";
import { xeroFetch } from "./client";

/**
 * Deep links into Xero's own UI.
 *
 * Every one is addressed by the organisation's `ShortCode` rather than the
 * tenant id. That is not decoration: a bookkeeper signed into more than one Xero
 * organisation who follows a link without it lands in whichever org Xero last
 * had open, looking at a document that is not the one they clicked. The short
 * code names the organisation in the URL, so the link is unambiguous.
 *
 * Formats follow Xero's own MCP server (`XeroAPI/xero-mcp-server`,
 * `src/consts/deeplinks.ts`), which is the closest thing to a maintained
 * statement of them.
 */

export function xeroQuoteUrl(shortCode: string, quoteId: string): string {
  return `https://go.xero.com/app/${shortCode}/quotes/view/${quoteId}`;
}

export function xeroInvoiceUrl(shortCode: string, invoiceId: string): string {
  return `https://go.xero.com/app/${shortCode}/invoicing/view/${invoiceId}`;
}

export function xeroContactUrl(shortCode: string, contactId: string): string {
  return `https://go.xero.com/app/${shortCode}/contacts/contact/${contactId}`;
}

/**
 * The connected organisation's short code, fetched once and remembered.
 *
 * Lazy rather than captured during authorisation, so the connection that is
 * already live picks it up on the first page that wants a link instead of
 * needing someone to disconnect and reconnect.
 *
 * Never throws. A missing short code costs a hyperlink; it must not take down a
 * quote screen, which is why every failure path here ends in `null` and the
 * caller renders plain text instead.
 */
export async function getXeroShortCode(orgId: string): Promise<string | null> {
  const [row] = await db()
    .select({ shortCode: xeroConnections.shortCode })
    .from(xeroConnections)
    .where(eq(xeroConnections.orgId, orgId))
    .limit(1);

  // No row is no connection, which is a different thing from a connection whose
  // short code has not been read yet. Only the latter is worth an API call.
  if (!row) return null;
  if (row.shortCode) return row.shortCode;

  try {
    const result = await xeroFetch<{ Organisations?: Array<{ ShortCode?: string }> }>(
      orgId,
      "/api.xro/2.0/Organisation",
    );
    const shortCode = result.Organisations?.[0]?.ShortCode?.trim();
    if (!shortCode) return null;

    await db()
      .update(xeroConnections)
      .set({ shortCode, updatedAt: new Date() })
      .where(eq(xeroConnections.orgId, orgId));
    return shortCode;
  } catch {
    return null;
  }
}
