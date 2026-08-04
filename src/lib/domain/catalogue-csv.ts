/**
 * Reading a material catalogue out of a CSV.
 *
 * Two shapes are accepted: this application's own export, and the file that
 * falls out of Xero → Products and services → Export, unchanged. Taking Xero's
 * format as-is matters more than it looks — it is the file most likely to be to
 * hand, and rekeying fifty prices into different column headings is how a
 * catalogue ends up quietly disagreeing with the accounting system.
 */

/** Column headings this application exports, and reads back. */
export const CSV_HEADINGS = ["name", "variation", "sku", "description", "cost_per_m2", "standard_price_per_m2"];

export interface CatalogueCsvRow {
  name: string;
  variation: string;
  sku: string;
  description: string;
  costPerM2: string;
  standardPricePerM2: string;
}

/** Splits a CSV, honouring quoted fields and the commas inside descriptions. */
export function parseCsv(text: string): string[][] {
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

/** Headings, reduced to letters and digits so `*ItemCode` and `ItemCode` agree. */
export function normaliseHeader(header: string[]): string[] {
  return header.map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/** Xero's export, recognised by its item code and price columns. */
export function isXeroExport(header: string[]): boolean {
  return header.includes("itemcode") && (header.includes("salesunitprice") || header.includes("purchasesunitprice"));
}

/**
 * A Xero item row as a catalogue material.
 *
 * Purchase and sales prices are both optional in Xero and often only one is set,
 * so neither is required. A row that arrives with no sell price imports anyway —
 * it simply cannot be quoted until someone gives it one, which is a truth about
 * the item rather than a fault in the file.
 */
export function fromXeroExport(row: Record<string, string>): CatalogueCsvRow {
  return {
    // Xero allows an item to have a code and no name. The code is at least
    // something a human chose, so it beats a blank row in the catalogue.
    name: row.itemname || row.itemcode,
    variation: "",
    sku: row.itemcode,
    description: row.salesdescription || row.purchasesdescription || "",
    costPerM2: row.purchasesunitprice || "0",
    standardPricePerM2: row.salesunitprice || "0",
  };
}

function fromOwnExport(row: Record<string, string>): CatalogueCsvRow {
  return {
    name: row.name ?? "",
    variation: row.variation ?? "",
    sku: row.sku ?? "",
    description: row.description ?? "",
    costPerM2: row.costperm2 ?? "",
    standardPricePerM2: row.standardpriceperm2 ?? "",
  };
}

export type CatalogueCsv =
  | { ok: false; message: string }
  | { ok: true; xero: boolean; rows: CatalogueCsvRow[] };

/**
 * Turn a CSV into rows ready for validation, whichever of the two shapes it is.
 *
 * Archived Xero items are dropped. Bringing them in would put products nobody
 * sells any more in front of whoever is building a quote, and the export
 * contains them either way.
 */
export function readCatalogueCsv(text: string): CatalogueCsv {
  const raw = parseCsv(text);
  if (raw.length < 2) return { ok: false, message: "The CSV needs a header row and at least one material." };

  const header = normaliseHeader(raw[0]);
  const xero = isXeroExport(header);
  if (!xero && !header.includes("name")) {
    return {
      ok: false,
      message: `The CSV needs a name column. Use the supplied headings: ${CSV_HEADINGS.join(", ")} — or drop in a Xero item export unchanged.`,
    };
  }

  const values = raw.slice(1).map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""])));
  const active = xero ? values.filter((row) => (row.status || "active").toLowerCase() === "active") : values;
  if (!active.length) return { ok: false, message: "That export has no active items in it." };

  return { ok: true, xero, rows: active.map((row) => (xero ? fromXeroExport(row) : fromOwnExport(row))) };
}
