"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import {
  createLocalCatalogueMaterial,
  createLocalPriceList,
  deleteLocalCatalogueMaterial,
  deleteLocalPriceList,
  importLocalCatalogueMaterials,
  updateLocalCatalogueMaterial,
  updateLocalPriceList,
} from "@/lib/data/local-store";

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

/** Handles quoted CSV fields, including commas in descriptions. */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = "";
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export async function addMaterial(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  await requireCapability("quote.edit");
  const parsed = materialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Main materials can be label-only. Variations need a SKU, cost and standard sell price." };
  await createLocalCatalogueMaterial(toMaterial(parsed.data));
  revalidateMaterials();
  return { ok: true, message: "Material added." };
}

export async function importMaterials(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  await requireCapability("quote.edit");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Choose a CSV file to import." };
  if (file.size > 2_000_000) return { ok: false, message: "CSV files must be smaller than 2 MB." };
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { ok: false, message: "The CSV needs a header row and at least one material." };
  const header = rows[0].map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (!header.includes("name")) return { ok: false, message: "The CSV needs a name column. Use the supplied headings: name, variation, sku, description, cost_per_m2, standard_price_per_m2." };
  const values = rows.slice(1).map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""])));
  const parsed = values.map((row) => materialSchema.safeParse({ name: row.name, variation: row.variation, sku: row.sku, description: row.description, costPerM2: row.costperm2 ?? "", standardPricePerM2: row.standardpriceperm2 ?? "" }));
  const invalid = parsed.findIndex((result) => !result.success);
  if (invalid >= 0) return { ok: false, message: `Check row ${invalid + 2}: a variation needs a SKU, cost and standard sell price.` };
  const result = await importLocalCatalogueMaterials(parsed.flatMap((entry) => entry.success ? [toMaterial(entry.data)] : []));
  revalidateMaterials();
  return { ok: true, message: `Imported ${result.created} new and updated ${result.updated} existing material${result.created + result.updated === 1 ? "" : "s"}.` };
}

export async function addPriceList(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  await requireCapability("quote.edit");
  const parsed = listSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter a price list name." };
  await createLocalPriceList({ name: parsed.data.name, entries: parsePriceListEntries(parsed.data.entries) });
  revalidatePath("/materials"); revalidatePath("/customers/new"); revalidatePath("/projects", "layout");
  return { ok: true, message: "Price list added." };
}

export async function updateMaterial(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  await requireCapability("quote.edit");
  const parsed = materialSchema.safeParse(Object.fromEntries(formData));
  const id = String(formData.get("id") ?? "");
  if (!id || !parsed.success) return { ok: false, message: "Check the material details." };
  await updateLocalCatalogueMaterial(id, toMaterial(parsed.data));
  revalidateMaterials();
  return { ok: true, message: "Material updated." };
}
export async function deleteMaterial(id: string) { await requireCapability("quote.edit"); await deleteLocalCatalogueMaterial(id); revalidateMaterials(); }
export async function updatePriceList(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> { await requireCapability("quote.edit"); const parsed = listSchema.safeParse(Object.fromEntries(formData)); const id = String(formData.get("id") ?? ""); if (!id || !parsed.success) return { ok: false, message: "Check the price list details." }; await updateLocalPriceList(id, { name: parsed.data.name, entries: parsePriceListEntries(parsed.data.entries) }); revalidatePath("/materials"); revalidatePath("/customers"); revalidatePath("/projects", "layout"); return { ok: true, message: "Price list updated." }; }
export async function deletePriceList(id: string) { await requireCapability("quote.edit"); await deleteLocalPriceList(id); revalidatePath("/materials"); revalidatePath("/customers"); revalidatePath("/projects", "layout"); }
