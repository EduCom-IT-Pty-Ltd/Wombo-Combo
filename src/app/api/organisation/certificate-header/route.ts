import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { hasDatabase } from "@/lib/db";
import { getOrganisationCertificateHeaderLocation } from "@/lib/data/repository";
import { getDocumentUrl } from "@/lib/integrations/sharepoint/upload";

export const runtime = "nodejs";

/** Secure preview for the organisation-level compliance-certificate letterhead. */
export async function GET() {
  const session = await getSession();
  if (!can(session.role, "admin.manage", session.permissionOverrides)) return new Response("Not found", { status: 404 });
  if (!hasDatabase) return new Response("Not found", { status: 404 });
  const location = await getOrganisationCertificateHeaderLocation(session.org.id);
  if (!location) return new Response("Certificate header not found", { status: 404 });
  const url = await getDocumentUrl(location.driveId, location.itemId).catch(() => null);
  if (!url) return new Response("Certificate header could not be loaded from SharePoint", { status: 502 });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
}
