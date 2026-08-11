import { getSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { getOrganisationLogoLocation } from "@/lib/data/repository";
import { getDocumentUrl } from "@/lib/integrations/sharepoint/upload";

export const runtime = "nodejs";

/**
 * Mint a fresh, short-lived link to the organisation's SharePoint logo.
 * The stored image identity stays as a drive item id, never a public or
 * expiring URL, and the caller can only load their own organisation's asset.
 */
export async function GET() {
  const session = await getSession();
  if (!hasDatabase) return new Response("Not found", { status: 404 });

  const location = await getOrganisationLogoLocation(session.org.id);
  if (!location) return new Response("Logo not found", { status: 404 });
  const url = await getDocumentUrl(location.driveId, location.itemId).catch(() => null);
  if (!url) return new Response("Logo could not be loaded from SharePoint", { status: 502 });

  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
}
