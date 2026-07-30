"use server";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { QUOTE_DYNAMIC_FIELDS, type QuoteDocumentTemplateSettings } from "@/lib/data/types";
import { readQuoteDocumentTemplateSettings, saveQuoteDocumentTemplateSettings } from "@/lib/data/local-store";

export type QuoteTemplateActionState = { ok: boolean; message?: string };

const position = z.number().finite().min(0).max(100);
const templateSchema = z.object({
  letterheadUrl: z.string().nullable(),
  fields: z.array(z.object({ id: z.string().min(1), field: z.union([z.enum(QUOTE_DYNAMIC_FIELDS), z.literal("plain_text")]), text: z.string().trim().max(200).optional(), x: position, y: position, width: position.refine((value) => value > 0) })).max(12),
  table: z.object({ x: position, y: position, width: position.refine((value) => value > 0) }),
});

export async function saveQuoteDocumentTemplate(_state: QuoteTemplateActionState, formData: FormData): Promise<QuoteTemplateActionState> {
  await requireCapability("admin.manage");
  let submitted: unknown;
  try { submitted = JSON.parse(String(formData.get("settings") ?? "")); } catch { return { ok: false, message: "Quote template settings could not be read." }; }
  const parsed = templateSchema.safeParse(submitted);
  if (!parsed.success) return { ok: false, message: "Keep all positions between 0 and 100%." };

  const current = await readQuoteDocumentTemplateSettings();
  let letterheadUrl = parsed.data.letterheadUrl ?? current.letterheadUrl;
  const letterhead = formData.get("letterhead");
  if (letterhead instanceof File && letterhead.size > 0) {
    const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[letterhead.type];
    if (!extension) return { ok: false, message: "Letterhead must be a PNG, JPG or WebP image." };
    if (letterhead.size > 8 * 1024 * 1024) return { ok: false, message: "Letterhead must be 8 MB or smaller." };
    await mkdir(join(process.cwd(), "public", "uploads"), { recursive: true });
    letterheadUrl = `/uploads/quote-letterhead-${randomUUID()}.${extension}`;
    await writeFile(join(process.cwd(), "public", letterheadUrl), Buffer.from(await letterhead.arrayBuffer()));
  }

  const settings: QuoteDocumentTemplateSettings = { ...parsed.data, letterheadUrl };
  await saveQuoteDocumentTemplateSettings(settings);
  revalidatePath("/admin");
  revalidatePath("/projects", "layout");
  return { ok: true, message: "Quote letterhead template saved." };
}
