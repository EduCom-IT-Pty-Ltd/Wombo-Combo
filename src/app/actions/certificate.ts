"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { createDocument } from "@/lib/data/pg/field";
import { getOrganisationCertificateHeaderLocation, getProject } from "@/lib/data/repository";
import { forgetReads } from "@/lib/data/request-scope";
import { createComplianceCertificatePdf } from "@/lib/documents/certificate-pdf";
import type { PdfImage } from "@/lib/documents/swms-pdf";

export type CertificateActionState = { ok: boolean; message?: string; documentId?: string; downloadUrl?: string; viewUrl?: string };

const uuid = z.uuid("Unknown project.");
const isUuid = (value: string) => uuid.safeParse(value).success;

/** Generate the current compliance certificate, retain it in the project folder, then download it. */
export async function exportProjectCertificateAction(projectId: string): Promise<CertificateActionState> {
  const session = await requireCapability("qa.certify");
  if (!hasDatabase) return { ok: false, message: "Certificate export needs the production database." };
  if (!isUuid(projectId)) return { ok: false, message: "Unknown project." };

  const [project, headerLocation] = await Promise.all([
    getProject(session.org.id, projectId),
    getOrganisationCertificateHeaderLocation(session.org.id),
  ]);
  if (!project) return { ok: false, message: "That project no longer exists." };
  if (!headerLocation) return { ok: false, message: "An administrator needs to upload the Certificate Header in Organisation settings first." };

  const { graphConfigured } = await import("@/lib/integrations/graph/client");
  if (!graphConfigured()) return { ok: false, message: "SharePoint is not configured on this deployment." };

  const { db } = await import("@/lib/db");
  const { projects } = await import("@/lib/db/schema/projects");
  const { and, eq } = await import("drizzle-orm");
  const [storageProject] = await db().select({ driveId: projects.sharepointDriveId, folderItemId: projects.sharepointFolderItemId }).from(projects).where(and(eq(projects.orgId, session.org.id), eq(projects.id, projectId))).limit(1);
  if (!storageProject?.driveId || !storageProject.folderItemId) return { ok: false, message: "This project does not have a SharePoint folder yet." };

  const header = await loadSharePointImage(headerLocation.driveId, headerLocation.itemId, "Certificate header");
  if (!header) return { ok: false, message: "The configured Certificate Header could not be loaded from SharePoint." };

  const now = new Date();
  const certificateReference = `${project.projectNumber}-CERT`;
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await createComplianceCertificatePdf({ project, header, issuedAt: now, certificateReference });
  } catch (error) {
    return { ok: false, message: `The certificate PDF could not be created: ${error instanceof Error ? error.message : String(error)}` };
  }

  const { replaceProjectTopLevelDocument, safeFileName } = await import("@/lib/integrations/sharepoint/upload");
  const name = safeFileName(`${project.projectNumber} - Certificate of Compliance.pdf`);
  let item;
  try {
    item = await replaceProjectTopLevelDocument({ driveId: storageProject.driveId, folderItemId: storageProject.folderItemId, fileName: name, contentType: "application/pdf", bytes: toArrayBuffer(pdfBytes) });
  } catch (error) {
    return { ok: false, message: `SharePoint could not save the certificate PDF: ${error instanceof Error ? error.message : String(error)}` };
  }

  const document = await createDocument(session.org.id, {
    projectId,
    name,
    kind: "certificate",
    storageKey: item.id,
    mimeType: "application/pdf",
    sizeBytes: pdfBytes.byteLength,
    requiresAcknowledgement: false,
    uploadedByUserId: isUuid(session.user.id) ? session.user.id : null,
  });
  const { recordEvent } = await import("@/lib/data/pg/workflow");
  await recordEvent({
    orgId: session.org.id,
    projectId,
    type: "certificate.issued",
    summary: `${name} exported${document.version > 1 ? ` (v${document.version})` : ""}`,
    actorUserId: isUuid(session.user.id) ? session.user.id : null,
    payload: { documentId: document.id, kind: "certificate", driveItemId: item.id, certificateReference },
  });
  forgetReads();
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath(`/field/${projectId}`, "layout");
  return { ok: true, message: "Certificate exported to SharePoint and downloaded.", documentId: document.id, downloadUrl: `/api/documents/${document.id}?download=1`, viewUrl: `/api/documents/${document.id}` };
}

async function loadSharePointImage(driveId: string, itemId: string, name: string): Promise<PdfImage | null> {
  try {
    const { getDocumentUrl } = await import("@/lib/integrations/sharepoint/upload");
    const url = await getDocumentUrl(driveId, itemId);
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    return { name, mimeType: response.headers.get("content-type"), bytes: new Uint8Array(await response.arrayBuffer()) };
  } catch { return null; }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
