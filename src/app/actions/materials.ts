"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import * as pgSettings from "@/lib/data/pg/settings";
import { listCustomerPriceLists } from "@/lib/data/repository";
import {
  createLocalPriceList,
  deleteLocalCatalogueMaterial,
  deleteLocalPriceList,
  updateLocalPriceList,
} from "@/lib/data/local-store";
import type { CustomerPriceList } from "@/lib/data/types";

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
  revalidatePath("/production-templates");
  revalidatePath("/projects", "layout");
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
