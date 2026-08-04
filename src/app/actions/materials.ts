"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import * as pgSettings from "@/lib/data/pg/settings";
import { listCustomerPriceLists } from "@/lib/data/repository";
import { readCatalogueCsv } from "@/lib/domain/catalogue-csv";
import {
  createLocalCatalogueMaterial,
  createLocalPriceList,
  deleteLocalCatalogueMaterial,
  deleteLocalPriceList,
  importLocalCatalogueMaterials,
  updateLocalCatalogueMaterial,
  updateLocalPriceList,
} from "@/lib/data/local-store";
import type { CustomerPriceList } from "@/lib/data/types";

const materialSchema = z.object({
  name: z.string().trim().min(2),
  variation: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  description: z.string().trim().optional(),
  costPerM2: z.coerce.number().nonnegative(),
  standardPricePerM2: z.coerce.number().nonnegative(),
}).superRefine((material, context) => {
  if (material.variation && (!material.sku || material.costPerM2 <= 0 || material.standardPricePerM2 <= 0)) {
    context.addIssue({ code: "custom", message: "Variations need a SKU, cost and standard sell price." });
  }
});
const listSchema = z.object({ name: z.string().trim().min(2), entries: z.string() });
export type MaterialActionState = { ok: boolean; message?: string };

function revalidateMaterials() {
  revalidatePath("/materials");
  revalidatePath("/production-templates");
  revalidatePath("/projects", "layout");
}

function toMaterial(input: z.infer<typeof materialSchema>) {
  return {
    name: input.name,
    variation: input.variation || null,
    sku: input.sku || "",
    description: input.description || null,
    costCentsPerM2: Math.round(input.costPerM2 * 100),
    standardPriceCentsPerM2: Math.round(input.standardPricePerM2 * 100),
  };
}

function parsePriceListEntries(value: string) {
  return value.split("\n").map((row) => row.trim()).filter(Boolean).map((row) => {
    const [materialId, price] = row.split(":");
    return { materialId, priceCentsPerM2: Math.round(Number(price) * 100) };
  }).filter((entry) => entry.materialId && Number.isFinite(entry.priceCentsPerM2) && entry.priceCentsPerM2 > 0);
}

export async function addMaterial(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const session = await requireCapability("quote.edit");
  const parsed = materialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Main materials can be label-only. Variations need a SKU, cost and standard sell price." };
  if (hasDatabase) await pgSettings.createCatalogueMaterial(session.org.id, toMaterial(parsed.data));
  else await createLocalCatalogueMaterial(toMaterial(parsed.data));
  revalidateMaterials();
  return { ok: true, message: "Material added." };
}

export async function importMaterials(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const session = await requireCapability("quote.edit");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Choose a CSV file to import." };
  if (file.size > 2_000_000) return { ok: false, message: "CSV files must be smaller than 2 MB." };
  const csv = readCatalogueCsv(await file.text());
  if (!csv.ok) return { ok: false, message: csv.message };
  const parsed = csv.rows.map((row) => materialSchema.safeParse(row));
  const invalid = parsed.findIndex((result) => !result.success);
  if (invalid >= 0) return { ok: false, message: csv.xero ? `Check row ${invalid + 2}: it has no item code or name.` : `Check row ${invalid + 2}: a variation needs a SKU, cost and standard sell price.` };
  const materials = parsed.flatMap((entry) => (entry.success ? [toMaterial(entry.data)] : []));
  const result = hasDatabase
    ? await pgSettings.importCatalogueMaterials(session.org.id, materials)
    : await importLocalCatalogueMaterials(materials);
  const unpriced = materials.filter((material) => material.standardPriceCentsPerM2 <= 0).length;
  revalidateMaterials();
  return {
    ok: true,
    message: `Imported ${result.created} new and updated ${result.updated} existing material${result.created + result.updated === 1 ? "" : "s"}.${unpriced ? ` ${unpriced} have no sell price and cannot be quoted until one is set.` : ""}`,
  };
}

/**
 * Price lists live in the org settings blob rather than a table, so every edit
 * is a read-modify-write of the whole array.
 */
async function savePriceLists(orgId: string, update: (lists: CustomerPriceList[]) => CustomerPriceList[]): Promise<void> {
  await pgSettings.saveCustomerPriceLists(orgId, update(await listCustomerPriceLists(orgId)));
}

export async function addPriceList(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const session = await requireCapability("quote.edit");
  const parsed = listSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter a price list name." };
  const list = { name: parsed.data.name, entries: parsePriceListEntries(parsed.data.entries) };
  if (hasDatabase) await savePriceLists(session.org.id, (lists) => [...lists, { id: `pl-${randomUUID()}`, ...list }]);
  else await createLocalPriceList(list);
  revalidatePath("/materials"); revalidatePath("/customers/new"); revalidatePath("/projects", "layout");
  return { ok: true, message: "Price list added." };
}

export async function updateMaterial(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const session = await requireCapability("quote.edit");
  const parsed = materialSchema.safeParse(Object.fromEntries(formData));
  const id = String(formData.get("id") ?? "");
  if (!id || !parsed.success) return { ok: false, message: "Check the material details." };
  if (hasDatabase) await pgSettings.updateCatalogueMaterial(session.org.id, id, toMaterial(parsed.data));
  else await updateLocalCatalogueMaterial(id, toMaterial(parsed.data));
  revalidateMaterials();
  return { ok: true, message: "Material updated." };
}

export async function deleteMaterial(id: string) {
  const session = await requireCapability("quote.edit");
  if (hasDatabase) await pgSettings.deleteCatalogueMaterial(session.org.id, id);
  else await deleteLocalCatalogueMaterial(id);
  revalidateMaterials();
}

export async function updatePriceList(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const session = await requireCapability("quote.edit");
  const parsed = listSchema.safeParse(Object.fromEntries(formData));
  const id = String(formData.get("id") ?? "");
  if (!id || !parsed.success) return { ok: false, message: "Check the price list details." };
  const value = { name: parsed.data.name, entries: parsePriceListEntries(parsed.data.entries) };
  if (hasDatabase) await savePriceLists(session.org.id, (lists) => lists.map((list) => (list.id === id ? { ...list, ...value } : list)));
  else await updateLocalPriceList(id, value);
  revalidatePath("/materials"); revalidatePath("/customers"); revalidatePath("/projects", "layout");
  return { ok: true, message: "Price list updated." };
}

export async function deletePriceList(id: string) {
  const session = await requireCapability("quote.edit");
  if (hasDatabase) await savePriceLists(session.org.id, (lists) => lists.filter((list) => list.id !== id));
  else await deleteLocalPriceList(id);
  revalidatePath("/materials"); revalidatePath("/customers"); revalidatePath("/projects", "layout");
}
