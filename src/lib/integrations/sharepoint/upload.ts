import "server-only";
import { graphFetch } from "../graph/client";
import { ensureFolder, sanitiseSegment, type DriveItemRef } from "./folders";

export { MAX_DOCUMENT_BYTES } from "@/lib/domain/documents";

/**
 * Putting a file into a project's SharePoint folder, and getting it back out.
 *
 * SharePoint is the customer's system of record for files — `src/lib/data/assets.ts`
 * is only for the app's own branding images. What we keep is the `driveItemId`,
 * which survives a rename or a drag in the SharePoint UI; the download URL is
 * short-lived and so is resolved when someone actually clicks.
 */

/**
 * Which project subfolder each kind of document lands in.
 *
 * Kinds with no entry go to the project folder itself rather than being forced
 * into an approximate home — `other` genuinely has no right subfolder, and a
 * file in the wrong one is harder to find than a file at the top.
 */
const KIND_FOLDERS: Record<string, string> = {
  quote_pdf: "01 Quote",
  purchase_order: "01 Quote",
  drawing: "02 Drawings",
  photo: "03 Site Photos",
  swms: "04 QA",
  permit: "04 QA",
  certificate: "06 Handover",
  completion_certificate: "06 Handover",
};

/**
 * Strip what SharePoint rejects while keeping the extension.
 *
 * `sanitiseSegment` truncates at 120 characters, which on a long name would eat
 * the `.pdf` and leave a file nothing can open. The stem is trimmed instead.
 */
export function safeFileName(name: string): string {
  const cleaned = sanitiseSegment(name.split(/[\\/]/).pop() ?? name);
  const dot = cleaned.lastIndexOf(".");
  if (dot <= 0 || cleaned.length <= 120) return cleaned || "document";
  const extension = cleaned.slice(dot);
  return `${cleaned.slice(0, 120 - extension.length)}${extension}`;
}

/** Upload one file and return the drive item it became. */
export async function uploadProjectDocument(input: {
  driveId: string;
  folderItemId: string;
  kind: string;
  fileName: string;
  contentType: string;
  bytes: ArrayBuffer;
}): Promise<DriveItemRef> {
  const subfolder = KIND_FOLDERS[input.kind];
  // Created on demand: projects provisioned before a subfolder was added to the
  // list, or one deleted by hand in SharePoint, would otherwise fail the upload.
  const parentId = subfolder
    ? (await ensureFolder(input.driveId, input.folderItemId, subfolder)).id
    : input.folderItemId;

  const name = safeFileName(input.fileName);

  // `rename` rather than `replace`: two people uploading "Drawing.pdf" a fortnight
  // apart are two revisions, and overwriting the first loses it. SharePoint keeps
  // both; our own `version` column is what links them.
  return graphFetch<DriveItemRef>(
    `/drives/${input.driveId}/items/${parentId}:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=rename`,
    {
      method: "PUT",
      headers: { "content-type": input.contentType || "application/octet-stream" },
      // An ArrayBuffer rather than a stream, because `graphFetch` retries on a
      // 429 and a consumed stream cannot be sent twice.
      body: input.bytes,
    },
  );
}

/**
 * The URL to fetch an item's bytes from, valid for a few minutes.
 *
 * Falls back to `webUrl` — the SharePoint page for the file — when Graph does
 * not return a download URL, which is better than a dead link.
 */
export async function getDocumentUrl(driveId: string, itemId: string): Promise<string | null> {
  const item = await graphFetch<Record<string, unknown>>(`/drives/${driveId}/items/${itemId}`);
  const download = item["@microsoft.graph.downloadUrl"];
  if (typeof download === "string") return download;
  return typeof item.webUrl === "string" ? item.webUrl : null;
}
