"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPriceList, deleteMaterial, deletePriceList, type MaterialActionState, updatePriceList } from "@/app/actions/materials";
import { Button, Card, CardHeader } from "@/components/ui";
import { XeroSyncButton } from "@/components/materials/xero-sync-button";
import { CSV_HEADINGS } from "@/lib/domain/catalogue-csv";
import type { CatalogueMaterial, CustomerPriceList } from "@/lib/data/types";

/**
 * The catalogue is read-only here on purpose.
 *
 * Xero owns every field on a material — name, code, cost and sell price — so an
 * edit made here would be undone by the next sync, and in the meantime it would
 * detach the row from its Xero item and quietly stop its quote lines carrying an
 * item code. Materials are added and repriced in Xero, then pulled through.
 * Removing a row stays available: the sync never retires an item deleted in
 * Xero, so this is the only way to clear one that no longer exists there.
 */
const initial: MaterialActionState = { ok: false };
const input = "h-10 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm text-foreground";
const csvHeadings = CSV_HEADINGS;

function materialLabel(material: CatalogueMaterial) { return material.variation ? `${material.name} — ${material.variation}` : material.name; }
function csvValue(value: string | number | null) { const text = value == null ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function groupMaterials(materials: CatalogueMaterial[]) { return Array.from(materials.reduce((groups, material) => { const entries = groups.get(material.name) ?? []; entries.push(material); groups.set(material.name, entries); return groups; }, new Map<string, CatalogueMaterial[]>()).entries()); }
function selectableMaterials(materials: CatalogueMaterial[]) { return groupMaterials(materials).flatMap(([, group]) => group.some((material) => material.variation) ? group.filter((material) => material.variation) : group.filter((material) => material.standardPriceCentsPerM2 > 0)); }

export function MaterialsManager({ materials, priceLists }: { materials: CatalogueMaterial[]; priceLists: CustomerPriceList[] }) {
  const [listState, listAction, listPending] = useActionState(addPriceList, initial);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const entries = Object.entries(prices).filter(([, value]) => Number(value) > 0).map(([id, value]) => `${id}:${value}`).join("\n");

  function exportCsv() {
    const content = [csvHeadings.join(","), ...materials.map((material) => [material.name, material.variation, material.sku, material.description, (material.costCentsPerM2 / 100).toFixed(2), (material.standardPriceCentsPerM2 / 100).toFixed(2)].map(csvValue).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "materials.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <div className="grid gap-4 xl:grid-cols-2">
    <Card>
      <CardHeader title="Material catalogue" description="Mirrored from Xero's items. Cost and sell price are maintained in Xero, per square metre." />
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-3">
        <XeroSyncButton />
        {materials.length ? <Button type="button" size="sm" variant="secondary" onClick={exportCsv}>Export CSV</Button> : null}
        <span className="text-xs text-muted-foreground">Add or reprice a material in Xero, then sync to pull it through.</span>
      </div>
      <MaterialCatalogue materials={materials} />
    </Card>
    <Card>
      <CardHeader title="Customer price lists" description="Enter only the prices that differ. Blank prices use the standard material price." />
      <form action={listAction} className="space-y-3 border-b border-border-subtle p-4"><input name="name" required placeholder="Price list name" className={input} /><input type="hidden" name="entries" value={entries} /><div className="space-y-2">{selectableMaterials(materials).map((material) => <label key={material.id} className="flex items-center gap-3"><span className="min-w-0 flex-1 truncate text-sm">{materialLabel(material)}</span><input type="number" min="0" step="0.01" placeholder={`Standard $${(material.standardPriceCentsPerM2 / 100).toFixed(2)}`} value={prices[material.id] ?? ""} onChange={(event) => setPrices((current) => ({ ...current, [material.id]: event.target.value }))} className="h-10 w-36 rounded-lg border border-border-strong bg-surface px-2 text-sm" /></label>)}</div><Button type="submit" variant="primary" disabled={listPending || !selectableMaterials(materials).length}>{listPending ? "Saving…" : "Create price list"}</Button>{listState.message ? <p className="text-xs text-muted-foreground">{listState.message}</p> : null}</form><div className="divide-y divide-border-subtle">{priceLists.map((list) => <PriceListEditor key={list.id} list={list} materials={selectableMaterials(materials)} />)}</div>
    </Card>
  </div>;
}

function MaterialCatalogue({ materials }: { materials: CatalogueMaterial[] }) {
  if (!materials.length) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No materials yet. Connect Xero from Finance, then sync to pull your items in.</p>;
  return <div className="divide-y divide-border-subtle">{groupMaterials(materials).map(([name, group]) => <MaterialGroup key={name} name={name} materials={group} />)}</div>;
}

function MaterialGroup({ name, materials }: { name: string; materials: CatalogueMaterial[] }) {
  const variations = materials.filter((material) => material.variation);
  const hasVariations = variations.length > 0;
  return <div>
    {hasVariations ? <div className="flex flex-wrap items-center gap-2 bg-surface-muted px-4 py-2.5"><p className="text-sm font-bold">{name}</p><span className="rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{variations.length} variation{variations.length === 1 ? "" : "s"}</span></div> : null}
    <div className={hasVariations ? "divide-y divide-border-subtle" : ""}>{(hasVariations ? variations : materials).map((material) => <MaterialRow key={material.id} material={material} nested={hasVariations} />)}</div>
  </div>;
}

function MaterialRow({ material, nested = false }: { material: CatalogueMaterial; nested?: boolean }) {
  const [deleting, start] = useTransition();
  const router = useRouter();
  const displayName = nested ? material.variation || "Standard" : materialLabel(material);
  const pricing = material.standardPriceCentsPerM2 > 0
    ? ` · Cost $${(material.costCentsPerM2 / 100).toFixed(2)} · Standard $${(material.standardPriceCentsPerM2 / 100).toFixed(2)}/m²`
    : " · No sell price — set one in Xero before quoting";
  return <div className={`flex items-center justify-between gap-3 px-4 py-3 ${nested ? "pl-8" : ""}`}>
    <div><p className="text-sm font-bold">{displayName}</p><p className="text-xs text-muted-foreground">{material.sku || "No SKU"}{material.description ? ` · ${material.description}` : ""}{pricing}</p></div>
    <Button size="sm" variant="danger" disabled={deleting} onClick={() => { if (window.confirm(`Remove ${materialLabel(material)}? A sync brings it back if it still exists in Xero.`)) start(async () => { await deleteMaterial(material.id); router.refresh(); }); }}>Remove</Button>
  </div>;
}

function PriceListEditor({ list, materials }: { list: CustomerPriceList; materials: CatalogueMaterial[] }) { const [editing, setEditing] = useState(false); const [state, action, pending] = useActionState(updatePriceList, initial); const [deleting, start] = useTransition(); const router = useRouter(); const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(list.entries.map((entry) => [entry.materialId, (entry.priceCentsPerM2 / 100).toFixed(2)]))); const entries = Object.entries(prices).filter(([, value]) => Number(value) > 0).map(([id, value]) => `${id}:${value}`).join("\n"); if (!editing) return <div className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-bold">{list.name}</p><p className="text-xs text-muted-foreground">{list.entries.length} customer prices</p></div><div className="flex gap-2"><Button size="sm" onClick={() => setEditing(true)}>Edit</Button><Button size="sm" variant="danger" disabled={deleting} onClick={() => { if (window.confirm(`Remove ${list.name}? Customers will return to default pricing.`)) start(async () => { await deletePriceList(list.id); router.refresh(); }); }}>Remove</Button></div></div>; return <form action={action} className="space-y-2 bg-surface-muted p-4"><input type="hidden" name="id" value={list.id} /><input type="hidden" name="entries" value={entries} /><input name="name" defaultValue={list.name} className={input} />{materials.map((material) => <label key={material.id} className="flex items-center gap-3"><span className="min-w-0 flex-1 truncate text-sm">{materialLabel(material)}</span><input type="number" step="0.01" placeholder={`Standard $${(material.standardPriceCentsPerM2 / 100).toFixed(2)}`} value={prices[material.id] ?? ""} onChange={(event) => setPrices((current) => ({ ...current, [material.id]: event.target.value }))} className="h-10 w-32 rounded-lg border border-border-strong bg-surface px-2 text-sm" /></label>)}<p className="text-xs text-muted-foreground">Leave a price blank to use the standard material price.</p><div className="flex gap-2"><Button size="sm" type="submit" variant="primary" disabled={pending}>Save</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>{state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}</form>; }
