"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { createDocument } from "@/lib/data/pg/field";
import { deleteProjectSwms, saveProjectSwms, saveSwmsTemplate } from "@/lib/data/pg/settings";
import { getProjectSwms, getSwmsTemplate } from "@/lib/data/repository";
import { forgetReads } from "@/lib/data/request-scope";
import { MAX_DOCUMENT_BYTES } from "@/lib/domain/documents";
import { normaliseSwmsTemplate, normaliseSwmsValues, type SwmsRecord } from "@/lib/domain/swms";

export type SwmsActionState = { ok: boolean; message?: string; documentId?: string };

const projectSchema = z.object({ projectId: z.uuid("Unknown project.") });

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function json(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}

export async function saveSwmsTemplateAction(_state: SwmsActionState, formData: FormData): Promise<SwmsActionState> {
  const session = await requireCapability("admin.manage");
  if (!hasDatabase) return { ok: false, message: "SWMS templates need the production database." };
  const template = normaliseSwmsTemplate(json(formData.get("template")));
  await saveSwmsTemplate(session.org.id, template);
  forgetReads();
  revalidatePath("/swms-template");
  revalidatePath("/projects", "layout");
  return { ok: true, message: "SWMS template saved." };
}

export async function saveProjectSwmsAction(_state: SwmsActionState, formData: FormData): Promise<SwmsActionState> {
  const session = await requireCapability("field.record");
  if (!hasDatabase) return { ok: false, message: "SWMS records need the production database." };
  const parsed = projectSchema.safeParse({ projectId: formData.get("projectId") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Unknown project." };

  const template = await getSwmsTemplate(session.org.id);
  const existing = await getProjectSwms(session.org.id, parsed.data.projectId);
  const now = new Date().toISOString();
  const submittedPhotoIds = json(formData.get("photoDocumentIds"));
  const requestedPhotoIds = Array.isArray(submittedPhotoIds)
    ? submittedPhotoIds.filter((id): id is string => typeof id === "string" && isUuid(id))
    : existing?.photoDocumentIds ?? [];

  // A document id is not enough authority on its own. Keep the SWMS limited to
  // image documents that belong to this same tenant and project, so a crafted
  // form submission cannot attach another project's SharePoint upload.
  const photoDocumentIds = await verifiedProjectPhotoIds(session.org.id, parsed.data.projectId, requestedPhotoIds);
  const record: SwmsRecord = {
    templateName: template.name,
    templateVersion: template.versionLabel,
    values: normaliseSwmsValues(json(formData.get("values")), template),
    photoDocumentIds: [...new Set(photoDocumentIds)],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdByUserId: existing?.createdByUserId ?? (isUuid(session.user.id) ? session.user.id : null),
    updatedByUserId: isUuid(session.user.id) ? session.user.id : null,
  };
  if (!await saveProjectSwms(session.org.id, parsed.data.projectId, record)) return { ok: false, message: "That project no longer exists." };
  forgetReads();
  revalidatePath(`/projects/${parsed.data.projectId}`, "layout");
  revalidatePath(`/field/${parsed.data.projectId}`, "layout");
  return { ok: true, message: "SWMS saved." };
}

async function verifiedProjectPhotoIds(orgId: string, projectId: string, documentIds: string[]): Promise<string[]> {
  if (documentIds.length === 0) return [];
  const { db } = await import("@/lib/db");
  const { documents } = await import("@/lib/db/schema/documents");
  const { and, eq, inArray } = await import("drizzle-orm");
  const rows = await db()
    .select({ id: documents.id })
    .from(documents)
    .where(and(
      eq(documents.orgId, orgId),
      eq(documents.projectId, projectId),
      eq(documents.kind, "photo"),
      inArray(documents.id, [...new Set(documentIds)]),
    ));
  return rows.map((row) => row.id);
}

export async function deleteProjectSwmsAction(projectId: string): Promise<SwmsActionState> {
  const session = await requireCapability("field.record");
  if (!hasDatabase) return { ok: false, message: "SWMS records need the production database." };
  if (!z.uuid().safeParse(projectId).success) return { ok: false, message: "Unknown project." };
  if (!await deleteProjectSwms(session.org.id, projectId)) return { ok: false, message: "That project no longer exists." };
  forgetReads();
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath(`/field/${projectId}`, "layout");
  return { ok: true, message: "SWMS deleted. Project photos remain safely stored in SharePoint." };
}

/** Uploads a photo into the existing project's SharePoint Site Photos folder. */
export async function uploadSwmsPhotoAction(_state: SwmsActionState, formData: FormData): Promise<SwmsActionState> {
  const session = await requireCapability("field.record");
  if (!hasDatabase) return { ok: false, message: "Photo uploads need the production database." };
  const parsed = projectSchema.safeParse({ projectId: formData.get("projectId") });
  if (!parsed.success) return { ok: false, message: "Unknown project." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a photo." };
  if (!file.type.startsWith("image/")) return { ok: false, message: "Choose an image file." };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, message: "That photo is over 4 MB. Add it directly to the project SharePoint folder, then return to save the SWMS." };

  const { graphConfigured } = await import("@/lib/integrations/graph/client");
  if (!graphConfigured()) return { ok: false, message: "SharePoint is not configured on this deployment." };
  const { db } = await import("@/lib/db");
  const { projects } = await import("@/lib/db/schema/projects");
  const { and, eq } = await import("drizzle-orm");
  const [project] = await db().select({ driveId: projects.sharepointDriveId, folderItemId: projects.sharepointFolderItemId, projectNumber: projects.projectNumber }).from(projects).where(and(eq(projects.orgId, session.org.id), eq(projects.id, parsed.data.projectId))).limit(1);
  if (!project?.driveId || !project.folderItemId) return { ok: false, message: "This project does not have a SharePoint folder yet." };

  const { safeFileName, uploadProjectDocument } = await import("@/lib/integrations/sharepoint/upload");
  const name = safeFileName(`SWMS-${project.projectNumber}-${file.name}`);
  try {
    const item = await uploadProjectDocument({ driveId: project.driveId, folderItemId: project.folderItemId, kind: "photo", fileName: name, contentType: file.type, bytes: await file.arrayBuffer() });
    const document = await createDocument(session.org.id, {
      projectId: parsed.data.projectId, name, kind: "photo", storageKey: item.id, mimeType: file.type, sizeBytes: file.size,
      requiresAcknowledgement: false, uploadedByUserId: isUuid(session.user.id) ? session.user.id : null,
    });
    forgetReads();
    revalidatePath(`/projects/${parsed.data.projectId}`, "layout");
    return { ok: true, message: "Photo added to the project SharePoint folder.", documentId: document.id };
  } catch (error) {
    return { ok: false, message: `SharePoint rejected the photo: ${error instanceof Error ? error.message : String(error)}` };
  }
}
