"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { QUOTE_DYNAMIC_FIELDS, type QuoteDocumentTemplateSettings } from "@/lib/data/types";
import { readQuoteDocumentTemplateSettings, saveQuoteDocumentTemplateSettings } from "@/lib/data/local-store";
import { hasDatabase } from "@/lib/db";
import { storeAsset } from "@/lib/data/assets";
import { getQuoteDocumentTemplateSettings, saveQuoteDocumentTemplateSettings as savePgQuoteTemplate } from "@/lib/data/pg/settings";

export type QuoteTemplateActionState = { ok: boolean; message?: string };

const position = z.number().finite().min(0).max(100);
const templateSchema = z.object({
  letterheadUrl: z.string().nullable(),
  fields: z.array(z.object({ id: z.string().min(1), field: z.union([z.enum(QUOTE_DYNAMIC_FIELDS), z.literal("plain_text")]), text: z.string().trim().max(200).optional(), x: position, y: position, width: position.refine((value) => value > 0) })).max(12),
  table: z.object({ x: position, y: position, width: position.refine((value) => value > 0) }),
});

export async function saveQuoteDocumentTemplate(_state: QuoteTemplateActionState, formData: FormData): Promise<QuoteTemplateActionState> {
  const session = await requireCapability("admin.manage");
  let submitted: unknown;
  try { submitted = JSON.parse(String(formData.get("settings") ?? "")); } catch { return { ok: false, message: "Quote template settings could not be read." }; }
  const parsed = templateSchema.safeParse(submitted);
  if (!parsed.success) return { ok: false, message: "Keep all positions between 0 and 100%." };

  const current = hasDatabase
    ? await getQuoteDocumentTemplateSettings(session.org.id)
    : await readQuoteDocumentTemplateSettings();
  let letterheadUrl = parsed.data.letterheadUrl ?? current?.letterheadUrl ?? null;

  const letterhead = formData.get("letterhead");
  if (letterhead instanceof File && letterhead.size > 0) {
    const stored = await storeAsset("quote-letterhead", letterhead);
    if (!stored.ok) return { ok: false, message: stored.message ?? "Letterhead could not be saved." };
    letterheadUrl = stored.url!;
  }

  const settings: QuoteDocumentTemplateSettings = { ...parsed.data, letterheadUrl };
  if (hasDatabase) await savePgQuoteTemplate(session.org.id, settings);
  else await saveQuoteDocumentTemplateSettings(settings);
  revalidatePath("/admin", "layout");
  revalidatePath("/projects", "layout");
  return { ok: true, message: "Quote letterhead template saved." };
}
