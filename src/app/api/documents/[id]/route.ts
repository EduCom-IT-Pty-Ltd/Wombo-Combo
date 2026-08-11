import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { hasDatabase } from "@/lib/db";
import { getDocumentLocation } from "@/lib/data/pg/field";
import { getDocumentUrl } from "@/lib/integrations/sharepoint/upload";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Open a project document.
 *
 * A redirect to a freshly minted Graph download URL rather than a stored link:
 * those URLs last minutes, and going through here is what makes access a
 * property of the caller's session instead of a property of holding the link.
 * The lookup is scoped by org, so a document id from another tenant is a 404
 * rather than a leak.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const session = await getSession();
  if (!can(session.role, "document.view", session.permissionOverrides)) {
    return new Response("Your role cannot open documents.", { status: 403 });
  }
  if (!hasDatabase) return new Response("Not found", { status: 404 });

  const record = await getDocumentLocation(session.org.id, id);
  if (!record) return new Response("Not found", { status: 404 });
  if (!record.driveId) {
    return new Response("This document's project has no SharePoint folder.", { status: 404 });
  }

  const url = await getDocumentUrl(record.driveId, record.storageKey).catch(() => null);
  if (!url) return new Response("This file could not be opened — it may have been moved in SharePoint.", { status: 502 });

  // A generated SWMS should save straight to the user's device after export.
  // The regular document route remains a redirect for in-browser viewing.
  if (new URL(request.url).searchParams.get("download") === "1") {
    const file = await fetch(url).catch(() => null);
    if (!file?.ok || !file.body) return new Response("This file could not be downloaded from SharePoint.", { status: 502 });
    return new Response(file.body, {
      headers: {
        "content-type": file.headers.get("content-type") ?? "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.name)}`,
        "cache-control": "no-store",
      },
    });
  }

  // no-store so a shared browser cannot serve the redirect — and with it the
  // pre-authenticated URL — to whoever sits down next.
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
}
