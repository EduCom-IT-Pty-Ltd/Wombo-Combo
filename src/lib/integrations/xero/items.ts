import "server-only";
import { importCatalogueMaterials, type CatalogueMaterialInput } from "@/lib/data/pg/settings";
import { xeroFetch } from "./client";

/**
 * The material catalogue, mirrored from Xero's inventory items.
 *
 * Xero is the source of truth for what a thing costs and what it sells for —
 * that is where the bookkeeper maintains it, and a second hand-kept list would
 * be wrong within a week. Pulling rather than pushing also means the item codes
 * we later put on quote and invoice lines are codes Xero already knows.
 *
 * The pull is one-way. Nothing here writes back to Xero, so a mistake in this
 * app can never corrupt the accounting system's product list.
 */

interface XeroItemDetails {
  UnitPrice?: number;
  AccountCode?: string;
  TaxType?: string;
}

export interface XeroItem {
  ItemID: string;
  Code: string;
  Name?: string;
  Description?: string;
  PurchaseDescription?: string;
  IsSold?: boolean;
  IsPurchased?: boolean;
  PurchaseDetails?: XeroItemDetails;
  SalesDetails?: XeroItemDetails;
}

/** Dollars to integer cents, tolerating the absent prices Xero returns freely. */
function cents(value: number | undefined): number {
  return value == null ? 0 : Math.round(value * 100);
}

function toMaterial(item: XeroItem): CatalogueMaterialInput {
  return {
    // Xero lets an item have a code and no name. The code is at least something
    // a human picked, so it beats showing a blank row in the catalogue.
    name: item.Name?.trim() || item.Code,
    variation: null,
    sku: item.Code,
    description: item.Description?.trim() || item.PurchaseDescription?.trim() || null,
    costCentsPerM2: cents(item.PurchaseDetails?.UnitPrice),
    standardPriceCentsPerM2: cents(item.SalesDetails?.UnitPrice),
    xeroItemId: item.ItemID,
    // Carried so a line billed from this item is coded where Xero codes it.
    xeroSalesAccountCode: item.SalesDetails?.AccountCode ?? null,
  };
}

export interface ItemSyncResult {
  created: number;
  updated: number;
  /** Items with no sales price. They import, but cannot be quoted as they stand. */
  unpriced: number;
  total: number;
}

/**
 * Pull every item from Xero into the catalogue, matching on code.
 *
 * `unitdp=4` because Xero rounds prices to two decimal places by default, and a
 * per-square-metre rate is exactly the kind of number that is carried to four.
 * Rounding to cents is this application's decision to make at the boundary, not
 * something to inherit already done.
 */
export async function syncItemsFromXero(orgId: string): Promise<ItemSyncResult> {
  const response = await xeroFetch<{ Items?: XeroItem[] }>(orgId, "/api.xro/2.0/Items?unitdp=4");
  const items = (response.Items ?? []).filter((item) => item.Code);

  const materials = items.map(toMaterial);
  const { created, updated } = await importCatalogueMaterials(orgId, materials);

  return {
    created,
    updated,
    unpriced: materials.filter((material) => material.standardPriceCentsPerM2 <= 0).length,
    total: materials.length,
  };
}
