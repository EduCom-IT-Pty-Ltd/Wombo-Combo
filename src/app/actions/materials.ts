"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { createLocalCatalogueMaterial, createLocalPriceList } from "@/lib/data/local-store";

const materialSchema = z.object({ name: z.string().trim().min(2), sku: z.string().trim().min(1), description: z.string().trim().optional(), costPerM2: z.coerce.number().positive() });
const listSchema = z.object({ name: z.string().trim().min(2), entries: z.string() });
export type MaterialActionState = { ok: boolean; message?: string };

export async function addMaterial(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  await requireCapability("quote.edit");
  const parsed = materialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter a material name, SKU and valid cost per m²." };
  await createLocalCatalogueMaterial({ name: parsed.data.name, sku: parsed.data.sku, description: parsed.data.description || null, costCentsPerM2: Math.round(parsed.data.costPerM2 * 100) });
  revalidatePath("/materials");
  return { ok: true, message: "Material added." };
}

export async function addPriceList(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  await requireCapability("quote.edit");
  const parsed = listSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter a price list name." };
  const entries = parsed.data.entries.split("\n").map((row) => row.trim()).filter(Boolean).map((row) => { const [materialId, price] = row.split(":"); return { materialId, priceCentsPerM2: Math.round(Number(price) * 100) }; }).filter((entry) => entry.materialId && Number.isFinite(entry.priceCentsPerM2) && entry.priceCentsPerM2 > 0);
  await createLocalPriceList({ name: parsed.data.name, entries });
  revalidatePath("/materials");
  revalidatePath("/customers/new");
  return { ok: true, message: "Price list added." };
}
