"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { DOCUMENT_KINDS } from "@/lib/db/schema/enums";
import { createDocument } from "@/lib/data/pg/field";
import { forgetReads } from "@/lib/data/request-scope";
import { MAX_DOCUMENT_BYTES } from "@/lib/domain/documents";

export type DocumentUploadState = { ok: boolean; message?: string };

const schema = z.object({
  projectId: z.uuid("Unknown project."),
  kind: z.enum(DOCUMENT_KINDS),
  requiresAcknowledgement: z.boolean(),
});

/**
 * Upload a file into the project's SharePoint folder and record it here.
 *
 * The bytes are relayed through the server rather than sent to SharePoint from
 * the browser: an upload URL handed to the client would be a pre-authenticated
 * write into the customer's document library, and the capability check has to
 * happen somewhere the client cannot skip. The cost is a size ceiling — see
 * `MAX_DOCUMENT_BYTES`.
 *
 * The SharePoint write happens first. If it succeeds and the metadata insert
 * then fails, the file is in the folder without a row, which someone can see and
 * fix; the reverse would be a document in the list that opens nothing.
 */
export async function uploadDocument(
  _prev: DocumentUploadState,
  formData: FormData,
): Promise<DocumentUploadState> {
  const session = await requireCapability("document.upload");

  const parsed = schema.safeParse({
    projectId: formData.get("projectId"),
    kind: formData.get("kind"),
    requiresAcknowledgement: formData.get("requiresAcknowledgement") === "on",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the upload details." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      message: "That file is over 4 MB. Add it through the SharePoint folder link above instead.",
    };
  }

  if (!hasDatabase) return { ok: false, message: "Uploads need a database and are not available in demo mode." };

  const { graphConfigured } = await import("@/lib/integrations/graph/client");
  if (!graphConfigured()) return { ok: false, message: "SharePoint is not configured on this deployment." };

  const { db } = await import("@/lib/db");
  const { projects } = await import("@/lib/db/schema/projects");
  const { and, eq } = await import("drizzle-orm");
  const [project] = await db()
    .select({
      driveId: projects.sharepointDriveId,
      folderItemId: projects.sharepointFolderItemId,
    })
    .from(projects)
    .where(and(eq(projects.orgId, session.org.id), eq(projects.id, parsed.data.projectId)))
    .limit(1);

  if (!project) return { ok: false, message: "That project no longer exists." };
  if (!project.driveId || !project.folderItemId) {
    return { ok: false, message: "This project has no SharePoint folder yet — create it above, then upload." };
  }

  const { safeFileName, uploadProjectDocument } = await import("@/lib/integrations/sharepoint/upload");
  const name = safeFileName(file.name);
  let item;
  try {
    item = await uploadProjectDocument({
      driveId: project.driveId,
      folderItemId: project.folderItemId,
      kind: parsed.data.kind,
      fileName: name,
      contentType: file.type,
      bytes: await file.arrayBuffer(),
    });
  } catch (error) {
    // Graph's message names the actual problem — a missing Sites.Selected grant,
    // a locked file, a throttle that outlasted the retries. Passing it through
    // beats "upload failed" for anyone trying to fix it.
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `SharePoint rejected the upload: ${message}` };
  }

  const record = await createDocument(session.org.id, {
    projectId: parsed.data.projectId,
    name,
    kind: parsed.data.kind,
    storageKey: item.id,
    mimeType: file.type || null,
    sizeBytes: file.size,
    requiresAcknowledgement: parsed.data.requiresAcknowledgement,
    // A bootstrap administrator has no people row, so no uuid to attribute the
    // upload to. Recording no one is honest; a cast would fail the insert.
    uploadedByUserId: isUuid(session.user.id) ? session.user.id : null,
  });

  const { recordEvent } = await import("@/lib/data/pg/workflow");
  await recordEvent({
    orgId: session.org.id,
    projectId: parsed.data.projectId,
    type: "document.uploaded",
    summary: `${name} uploaded${record.version > 1 ? ` (v${record.version})` : ""}`,
    actorUserId: isUuid(session.user.id) ? session.user.id : null,
    payload: { documentId: record.id, kind: parsed.data.kind, driveItemId: item.id },
  });

  // Reads are deduplicated per request and this request already listed the
  // documents — without dropping that, the revalidated page renders the list
  // from before the upload.
  forgetReads();
  revalidatePath(`/projects/${parsed.data.projectId}`, "layout");

  return {
    ok: true,
    message: record.version > 1 ? `${name} uploaded as v${record.version}.` : `${name} uploaded.`,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
