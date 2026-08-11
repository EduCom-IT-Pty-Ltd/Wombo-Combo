"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import * as pgSettings from "@/lib/data/pg/settings";
import { listCatalogueMaterials, listCustomerPriceLists } from "@/lib/data/repository";
import {
  createLocalPriceList,
  deleteLocalCatalogueMaterial,
  deleteLocalPriceList,
  saveLocalMaterialCataloguePresentation,
  updateLocalPriceList,
} from "@/lib/data/local-store";
import type { CustomerPriceList, MaterialCataloguePresentation } from "@/lib/data/types";
import { normaliseMaterialCataloguePresentation } from "@/lib/domain/material-catalogue";

/**
 * Materials are read-only here. Xero's item sync is the only thing that writes
 * the catalogue — see `src/lib/integrations/xero/items.ts` — so there is no
 * create, update or import action to go with the delete below. Anything that
 * wrote a material from this side would detach the row from its Xero item and
 * stop its quote lines carrying an item code, silently and until the next sync.
 */

const listSchema = z.object({ name: z.string().trim().min(2), entries: z.string() });
export type MaterialActionState = { ok: boolean; message?: string };

function revalidateMaterials() {
  revalidatePath("/materials");
  revalidatePath("/projects", "layout");
}

function parsePresentation(value: FormDataEntryValue | null): MaterialCataloguePresentation | null {
  if (typeof value !== "string") return null;
  try { return normaliseMaterialCataloguePresentation(JSON.parse(value)); } catch { return null; }
}

/**
 * Saves only how existing Xero items appear inside this platform. It never
 * writes to the material table, so Xero item IDs, codes and sync stay intact.
 */
export async function saveMaterialCataloguePresentation(_state: MaterialActionState, formData: FormData): Promise<MaterialActionState> {
  const session = await requireCapability("quote.edit");
  const requested = parsePresentation(formData.get("presentation"));
  if (!requested) return { ok: false, message: "Could not read the catalogue display settings." };
  const materialIds = new Set((await listCatalogueMaterials(session.org.id)).map((material) => material.id));
  const value = {
    hiddenMaterialIds: requested.hiddenMaterialIds.filter((id) => materialIds.has(id)),
    groups: requested.groups.map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => materialIds.has(entry.materialId)),
    })).filter((group) => group.entries.length > 0),
  };
  if (hasDatabase) await pgSettings.saveMaterialCataloguePresentation(session.org.id, value);
  else await saveLocalMaterialCataloguePresentation(value);
  revalidateMaterials();
  return { ok: true, message: "Platform catalogue display saved. Xero was not changed." };
}

function parsePriceListEntries(value: string) {
  return value.split("\n").map((row) => row.trim()).filter(Boolean).map((row) => {
    const [materialId, price] = row.split(":");
    return { materialId, priceCentsPerM2: Math.round(Number(price) * 100) };
  }).filter((entry) => entry.materialId && Number.isFinite(entry.priceCentsPerM2) && entry.priceCentsPerM2 > 0);
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

/**
 * Clear a material the catalogue should no longer offer.
 *
 * The Xero sync only ever adds and updates, so an item deleted in Xero would
 * otherwise sit here forever. Removing one that still exists in Xero is not
 * permanent — the next sync brings it back.
 */
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
