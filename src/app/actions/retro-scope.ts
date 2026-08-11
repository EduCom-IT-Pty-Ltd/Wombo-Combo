"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { createDocument } from "@/lib/data/pg/field";
import { deleteProjectRetroScope, saveProjectRetroScope } from "@/lib/data/pg/settings";
import { getProjectRetroScope, getProjectType } from "@/lib/data/repository";
import { deleteLocalRetroScope, saveLocalRetroScope } from "@/lib/data/local-store";
import { forgetReads } from "@/lib/data/request-scope";
import { MAX_DOCUMENT_BYTES } from "@/lib/domain/documents";
import { normaliseRetroScopeValues, type RetroScopeRecord } from "@/lib/domain/retro-scope";

export type RetroScopeActionState = { ok: boolean; message?: string; documentId?: string };
const projectSchema = z.object({ projectId: z.uuid("Unknown project.") });
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function json(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}

function invalidate(projectId: string) {
  forgetReads();
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath(`/field/${projectId}`, "layout");
}

async function verifiedProjectPhotoIds(orgId: string, projectId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  if (!hasDatabase) return [];
  const { db } = await import("@/lib/db");
  const { documents } = await import("@/lib/db/schema/documents");
  const { and, eq, inArray } = await import("drizzle-orm");
  const rows = await db().select({ id: documents.id }).from(documents).where(and(eq(documents.orgId, orgId), eq(documents.projectId, projectId), eq(documents.kind, "photo"), inArray(documents.id, [...new Set(ids)])));
  return rows.map((row) => row.id);
}

export async function saveProjectRetroScopeAction(_state: RetroScopeActionState, formData: FormData): Promise<RetroScopeActionState> {
  const session = await requireCapability("field.record");
  const parsed = (hasDatabase ? projectSchema : z.object({ projectId: z.string().min(1) })).safeParse({ projectId: formData.get("projectId") });
  if (!parsed.success) return { ok: false, message: "Unknown project." };
  if (await getProjectType(session.org.id, parsed.data.projectId) !== "retro") return { ok: false, message: "A retrofit scope is only available on Retro projects." };
  const existing = await getProjectRetroScope(session.org.id, parsed.data.projectId);
  const requested = json(formData.get("photoDocumentIds"));
  const photoIds = Array.isArray(requested) ? requested.filter((id): id is string => typeof id === "string" && isUuid(id)) : existing?.photoDocumentIds ?? [];
  const now = new Date().toISOString();
  const record: RetroScopeRecord = {
    values: normaliseRetroScopeValues(json(formData.get("values"))),
    photoDocumentIds: hasDatabase ? [...new Set(await verifiedProjectPhotoIds(session.org.id, parsed.data.projectId, photoIds))] : photoIds,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdByUserId: existing?.createdByUserId ?? (isUuid(session.user.id) ? session.user.id : null),
    updatedByUserId: isUuid(session.user.id) ? session.user.id : null,
  };
  if (hasDatabase) {
    if (!await saveProjectRetroScope(session.org.id, parsed.data.projectId, record)) return { ok: false, message: "That project no longer exists." };
  } else await saveLocalRetroScope(parsed.data.projectId, record);
  invalidate(parsed.data.projectId);
  return { ok: true, message: "Retro scope saved." };
}

export async function deleteProjectRetroScopeAction(projectId: string): Promise<RetroScopeActionState> {
  const session = await requireCapability("field.record");
  if (!z.uuid().safeParse(projectId).success && hasDatabase) return { ok: false, message: "Unknown project." };
  if (hasDatabase) {
    if (!await deleteProjectRetroScope(session.org.id, projectId)) return { ok: false, message: "That project no longer exists." };
  } else await deleteLocalRetroScope(projectId);
  invalidate(projectId);
  return { ok: true, message: "Retro scope deleted. Any project photos remain safely stored." };
}

/** Uploads a scope image to the existing project SharePoint Site Photos folder. */
export async function uploadRetroScopePhotoAction(_state: RetroScopeActionState, formData: FormData): Promise<RetroScopeActionState> {
  const session = await requireCapability("field.record");
  if (!hasDatabase) return { ok: false, message: "Photo uploads need the production database." };
  const parsed = projectSchema.safeParse({ projectId: formData.get("projectId") });
  if (!parsed.success) return { ok: false, message: "Unknown project." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || !file.type.startsWith("image/")) return { ok: false, message: "Choose an image file." };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, message: "That photo is over 4 MB. Add it directly to the project SharePoint folder, then return to save the scope." };
  const { graphConfigured } = await import("@/lib/integrations/graph/client");
  if (!graphConfigured()) return { ok: false, message: "SharePoint is not configured on this deployment." };
  const { db } = await import("@/lib/db");
  const { projects } = await import("@/lib/db/schema/projects");
  const { and, eq } = await import("drizzle-orm");
  const [project] = await db().select({ driveId: projects.sharepointDriveId, folderItemId: projects.sharepointFolderItemId, projectNumber: projects.projectNumber }).from(projects).where(and(eq(projects.orgId, session.org.id), eq(projects.id, parsed.data.projectId))).limit(1);
  if (!project?.driveId || !project.folderItemId) return { ok: false, message: "This project does not have a SharePoint folder yet." };
  const { safeFileName, uploadProjectDocument } = await import("@/lib/integrations/sharepoint/upload");
  const name = safeFileName(`RETRO-SCOPE-${project.projectNumber}-${file.name}`);
  try {
    const item = await uploadProjectDocument({ driveId: project.driveId, folderItemId: project.folderItemId, kind: "photo", fileName: name, contentType: file.type, bytes: await file.arrayBuffer() });
    const document = await createDocument(session.org.id, { projectId: parsed.data.projectId, name, kind: "photo", storageKey: item.id, mimeType: file.type, sizeBytes: file.size, requiresAcknowledgement: false, uploadedByUserId: isUuid(session.user.id) ? session.user.id : null });
    invalidate(parsed.data.projectId);
    return { ok: true, message: "Scope photo added to the project SharePoint folder.", documentId: document.id };
  } catch (error) {
    return { ok: false, message: `Could not upload the scope photo: ${error instanceof Error ? error.message : String(error)}` };
  }
}
