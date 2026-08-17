"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { createDocument } from "@/lib/data/pg/field";
import { deleteProjectRetroScope, saveProjectRetroScope } from "@/lib/data/pg/settings";
import { getOrganisationLogoLocation, getOrganisationSettings, getProject, getProjectRetroScope, getProjectType } from "@/lib/data/repository";
import { deleteLocalRetroScope, saveLocalRetroScope } from "@/lib/data/local-store";
import { forgetReads } from "@/lib/data/request-scope";
import { MAX_DOCUMENT_BYTES } from "@/lib/domain/documents";
import { normaliseRetroScopeSketch, normaliseRetroScopeValues, type RetroScopeRecord } from "@/lib/domain/retro-scope";
import { createRetroScopePdf } from "@/lib/documents/retro-scope-pdf";
import type { PdfImage } from "@/lib/documents/swms-pdf";

export type RetroScopeActionState = { ok: boolean; message?: string; documentId?: string; documentName?: string; downloadUrl?: string };
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
  const photoIds = Array.isArray(requested) ? requested.filter((id): id is string => typeof id === "string" && isUuid(id)) : [];
  const now = new Date().toISOString();
  const record: RetroScopeRecord = {
    values: normaliseRetroScopeValues(json(formData.get("values"))),
    sketch: normaliseRetroScopeSketch(json(formData.get("sketch"))),
    // This screen only adds photos; it does not offer a remove control. Merge
    // existing links so an intermittent client form update can never make an
    // already attached SharePoint photo disappear from a saved scope.
    photoDocumentIds: hasDatabase ? [...new Set(await verifiedProjectPhotoIds(session.org.id, parsed.data.projectId, [...(existing?.photoDocumentIds ?? []), ...photoIds]))] : [...new Set([...(existing?.photoDocumentIds ?? []), ...photoIds])],
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

/** Links a photo already belonging to this project to an existing retrofit scope. */
export async function attachProjectRetroScopePhotoAction(projectId: string, documentId: string): Promise<RetroScopeActionState> {
  const session = await requireCapability("field.record");
  if (!hasDatabase) return { ok: false, message: "Existing project photos are available with the production database." };
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(documentId).success) return { ok: false, message: "Unknown project photo." };
  if (await getProjectType(session.org.id, projectId) !== "retro") return { ok: false, message: "A retrofit scope is only available on Retro projects." };

  const existing = await getProjectRetroScope(session.org.id, projectId);
  if (!existing) return { ok: false, message: "Save the scope first, then add existing project photos." };
  const photoDocumentIds = [...new Set(await verifiedProjectPhotoIds(session.org.id, projectId, [...existing.photoDocumentIds, documentId]))];
  if (!photoDocumentIds.includes(documentId)) return { ok: false, message: "That photo does not belong to this project." };

  const record: RetroScopeRecord = {
    ...existing,
    photoDocumentIds,
    updatedAt: new Date().toISOString(),
    updatedByUserId: isUuid(session.user.id) ? session.user.id : null,
  };
  if (!await saveProjectRetroScope(session.org.id, projectId, record)) return { ok: false, message: "That project no longer exists." };
  invalidate(projectId);
  return { ok: true, message: "Project photo linked to the scope." };
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
    // Uploading a photo must immediately link it to the scope. Previously the
    // browser held the link only until a second Save click, so a successful
    // SharePoint upload could look as if it had disappeared from the scope.
    const existing = await getProjectRetroScope(session.org.id, parsed.data.projectId);
    const submittedPhotoIds = json(formData.get("photoDocumentIds"));
    const requestedIds = Array.isArray(submittedPhotoIds) ? submittedPhotoIds.filter((id): id is string => typeof id === "string" && isUuid(id)) : [];
    const now = new Date().toISOString();
    const record: RetroScopeRecord = {
      values: normaliseRetroScopeValues(json(formData.get("values"))),
      sketch: normaliseRetroScopeSketch(json(formData.get("sketch"))) ?? existing?.sketch ?? null,
      photoDocumentIds: [...new Set(await verifiedProjectPhotoIds(session.org.id, parsed.data.projectId, [...(existing?.photoDocumentIds ?? []), ...requestedIds, document.id]))],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      createdByUserId: existing?.createdByUserId ?? (isUuid(session.user.id) ? session.user.id : null),
      updatedByUserId: isUuid(session.user.id) ? session.user.id : null,
    };
    if (!await saveProjectRetroScope(session.org.id, parsed.data.projectId, record)) return { ok: false, message: "The photo uploaded, but the scope could not be linked to this project." };
    invalidate(parsed.data.projectId);
    return { ok: true, message: "Scope photo uploaded and linked.", documentId: document.id, documentName: name };
  } catch (error) {
    return { ok: false, message: `Could not upload the scope photo: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Export the completed Retrofit scope as the one current PDF in the project root. */
export async function exportProjectRetroScopePdfAction(projectId: string): Promise<RetroScopeActionState> {
  const session = await requireCapability("field.record");
  if (!hasDatabase) return { ok: false, message: "PDF export needs the production database." };
  if (!z.uuid().safeParse(projectId).success) return { ok: false, message: "Unknown project." };
  if (await getProjectType(session.org.id, projectId) !== "retro") return { ok: false, message: "A retrofit scope is only available on Retro projects." };
  const [project, record] = await Promise.all([getProject(session.org.id, projectId), getProjectRetroScope(session.org.id, projectId)]);
  if (!project) return { ok: false, message: "That project no longer exists." };
  if (!record) return { ok: false, message: "Save the retrofit scope before exporting it." };
  const { graphConfigured } = await import("@/lib/integrations/graph/client");
  if (!graphConfigured()) return { ok: false, message: "SharePoint is not configured on this deployment." };
  const { db } = await import("@/lib/db");
  const { projects } = await import("@/lib/db/schema/projects");
  const { documents } = await import("@/lib/db/schema/documents");
  const { and, eq, inArray } = await import("drizzle-orm");
  const [storageProject] = await db().select({ driveId: projects.sharepointDriveId, folderItemId: projects.sharepointFolderItemId }).from(projects).where(and(eq(projects.orgId, session.org.id), eq(projects.id, projectId))).limit(1);
  if (!storageProject?.driveId || !storageProject.folderItemId) return { ok: false, message: "This project does not have a SharePoint folder yet." };
  const photoRows = record.photoDocumentIds.length ? await db().select({ name: documents.name, storageKey: documents.storageKey, mimeType: documents.mimeType }).from(documents).where(and(eq(documents.orgId, session.org.id), eq(documents.projectId, projectId), eq(documents.kind, "photo"), inArray(documents.id, record.photoDocumentIds))) : [];
  const [{ logoUrl }, logoLocation] = await Promise.all([getOrganisationSettings(session.org.id), getOrganisationLogoLocation(session.org.id)]);
  const [logo, photos] = await Promise.all([loadLogo(logoLocation, logoUrl), loadPhotos(storageProject.driveId, photoRows)]);
  let pdfBytes: Uint8Array;
  try { pdfBytes = await createRetroScopePdf({ project, record, logo, photos }); } catch (error) { return { ok: false, message: `The retrofit scope PDF could not be created: ${error instanceof Error ? error.message : String(error)}` }; }
  const { replaceProjectTopLevelDocument, safeFileName } = await import("@/lib/integrations/sharepoint/upload");
  const name = safeFileName(`${project.projectNumber} - Retrofit Scope.pdf`);
  let item;
  try { item = await replaceProjectTopLevelDocument({ driveId: storageProject.driveId, folderItemId: storageProject.folderItemId, fileName: name, contentType: "application/pdf", bytes: toArrayBuffer(pdfBytes) }); } catch (error) { return { ok: false, message: `SharePoint could not save the retrofit scope PDF: ${error instanceof Error ? error.message : String(error)}` }; }
  const document = await createDocument(session.org.id, { projectId, name, kind: "other", storageKey: item.id, mimeType: "application/pdf", sizeBytes: pdfBytes.byteLength, requiresAcknowledgement: false, uploadedByUserId: isUuid(session.user.id) ? session.user.id : null });
  const { recordEvent } = await import("@/lib/data/pg/workflow");
  await recordEvent({ orgId: session.org.id, projectId, type: "document.uploaded", summary: `${name} exported${document.version > 1 ? ` (v${document.version})` : ""}`, actorUserId: isUuid(session.user.id) ? session.user.id : null, payload: { documentId: document.id, kind: "retro_scope", driveItemId: item.id } });
  invalidate(projectId);
  return { ok: true, message: "Retrofit scope PDF exported to SharePoint and downloaded.", documentId: document.id, downloadUrl: `/api/documents/${document.id}?download=1` };
}

async function loadLogo(location: { driveId: string; itemId: string } | null, legacyUrl: string | null): Promise<PdfImage | null> {
  if (location) return loadSharePointImage(location.driveId, location.itemId, "Organisation logo");
  if (!legacyUrl?.startsWith("http")) return null;
  try { const response = await fetch(legacyUrl); return response.ok ? { name: "Organisation logo", mimeType: response.headers.get("content-type"), bytes: new Uint8Array(await response.arrayBuffer()) } : null; } catch { return null; }
}
async function loadPhotos(driveId: string, rows: Array<{ name: string; storageKey: string; mimeType: string | null }>): Promise<PdfImage[]> { return (await Promise.all(rows.map((row) => loadSharePointImage(driveId, row.storageKey, row.name, row.mimeType)))).filter((item): item is PdfImage => item !== null); }
async function loadSharePointImage(driveId: string, itemId: string, name: string, mimeType?: string | null): Promise<PdfImage | null> { try { const { getDocumentUrl } = await import("@/lib/integrations/sharepoint/upload"); const url = await getDocumentUrl(driveId, itemId); if (!url) return null; const response = await fetch(url); return response.ok ? { name, mimeType: mimeType ?? response.headers.get("content-type"), bytes: new Uint8Array(await response.arrayBuffer()) } : null; } catch { return null; } }
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; }
