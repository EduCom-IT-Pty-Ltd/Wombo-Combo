import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Storage for uploaded branding images — the organisation logo and the quote
 * letterhead.
 *
 * Two backends, chosen by whether `BLOB_READ_WRITE_TOKEN` is set:
 *
 * - **Vercel Blob** in production. Writing to `public/` does not work on Vercel:
 *   the filesystem is read-only, and even if it were not, files written at
 *   runtime are not served — `public/` is baked at build time.
 * - **`public/uploads/`** locally, so development needs no cloud account.
 *
 * Project documents do not come through here. Those go to SharePoint, which is
 * the customer's system of record for files; this is only for a couple of small
 * images that belong to the app itself.
 */

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export const MAX_ASSET_BYTES = 2 * 1024 * 1024;

export interface AssetResult {
  ok: boolean;
  url?: string;
  message?: string;
}

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Store an uploaded image and return a URL to serve it from.
 *
 * `prefix` names the asset kind, e.g. `organisation` or `letterhead`. A uuid is
 * appended rather than reusing a fixed name so a replaced image is not served
 * stale from a CDN cache.
 */
export async function storeAsset(prefix: string, file: File): Promise<AssetResult> {
  const extension = MIME_EXTENSIONS[file.type];
  if (!extension) return { ok: false, message: "Image must be a PNG, JPG, WebP or SVG." };
  if (file.size > MAX_ASSET_BYTES) return { ok: false, message: "Image must be 2 MB or smaller." };

  const name = `${prefix}-${randomUUID()}.${extension}`;

  if (blobConfigured()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`branding/${name}`, file, {
      access: "public",
      contentType: file.type,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { ok: true, url: blob.url };
  }

  // Local development only. This branch cannot run on Vercel — the guard above
  // is what keeps it from being reached there.
  await mkdir(join(process.cwd(), "public", "uploads"), { recursive: true });
  const url = `/uploads/${name}`;
  await writeFile(join(process.cwd(), "public", url), Buffer.from(await file.arrayBuffer()));
  return { ok: true, url };
}
