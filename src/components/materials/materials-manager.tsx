"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMaterial, addPriceList, deleteMaterial, deletePriceList, importMaterials, type MaterialActionState, updateMaterial, updatePriceList } from "@/app/actions/materials";
import { Button, Card, CardHeader } from "@/components/ui";
import { XeroSyncButton } from "@/components/materials/xero-sync-button";
import { CSV_HEADINGS } from "@/lib/domain/catalogue-csv";
import type { CatalogueMaterial, CustomerPriceList } from "@/lib/data/types";

const initial: MaterialActionState = { ok: false };
const input = "h-10 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm text-foreground";
// The same list the importer reads back, so an export can always be re-imported.
const csvHeadings = CSV_HEADINGS;

function materialLabel(material: CatalogueMaterial) { return material.variation ? `${material.name} — ${material.variation}` : material.name; }
function csvValue(value: string | number | null) { const text = value == null ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function groupMaterials(materials: CatalogueMaterial[]) { return Array.from(materials.reduce((groups, material) => { const entries = groups.get(material.name) ?? []; entries.push(material); groups.set(material.name, entries); return groups; }, new Map<string, CatalogueMaterial[]>()).entries()); }
function selectableMaterials(materials: CatalogueMaterial[]) { return groupMaterials(materials).flatMap(([, group]) => group.some((material) => material.variation) ? group.filter((material) => material.variation) : group.filter((material) => material.standardPriceCentsPerM2 > 0)); }

export function MaterialsManager({ materials, priceLists }: { materials: CatalogueMaterial[]; priceLists: CustomerPriceList[] }) {
  const [materialState, materialAction, materialPending] = useActionState(addMaterial, initial);
  const [importState, importAction, importPending] = useActionState(importMaterials, initial);
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
      <CardHeader title="Material catalogue" description="Group variations under a main product, with internal cost and standard customer price per square metre." />
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-3">
        <XeroSyncButton />
        <Button type="button" size="sm" variant="secondary" onClick={exportCsv}>{materials.length ? "Export CSV" : "Download CSV template"}</Button>
        <a href="#import-materials" className="text-xs font-semibold text-primary hover:underline">CSV format</a>
        <span className="text-xs text-muted-foreground">Imports update matching SKUs and add new ones.</span>
      </div>
      <form id="import-materials" action={importAction} className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-muted p-4">
        <label className="sr-only" htmlFor="materials-csv">Materials CSV</label>
        <input id="materials-csv" name="file" type="file" accept=".csv,text/csv" required className="min-w-0 flex-1 text-sm" />
        <Button type="submit" size="sm" variant="secondary" disabled={importPending}>{importPending ? "Importing…" : "Import CSV"}</Button>
        {importState.message ? <p className="w-full text-xs text-muted-foreground">{importState.message}</p> : <p className="w-full text-xs text-muted-foreground">Headings: {csvHeadings.join(", ")}. A Xero item export also imports as-is.</p>}
      </form>
      <form action={materialAction} className="grid gap-2 border-b border-border-subtle p-4 sm:grid-cols-2">
        <input name="name" required placeholder="Main material name" className={input} />
        <input name="sku" placeholder="SKU (optional for a parent material)" className={input} />
        <input name="description" placeholder="Description" className={input} />
        <input name="costPerM2" type="number" min="0" step="0.01" placeholder="Cost per m² (optional for parent)" className={input} />
        <input name="standardPricePerM2" type="number" min="0" step="0.01" placeholder="Standard sell $/m² (optional for parent)" className={input} />
        <Button type="submit" variant="primary" disabled={materialPending}>{materialPending ? "Adding…" : "Add material"}</Button>
        {materialState.message ? <p className="self-center text-xs text-muted-foreground">{materialState.message}</p> : null}
      </form>
      <MaterialCatalogue materials={materials} />
    </Card>
    <Card>
      <CardHeader title="Customer price lists" description="Enter only the prices that differ. Blank prices use the standard material price." />
      <form action={listAction} className="space-y-3 border-b border-border-subtle p-4"><input name="name" required placeholder="Price list name" className={input} /><input type="hidden" name="entries" value={entries} /><div className="space-y-2">{selectableMaterials(materials).map((material) => <label key={material.id} className="flex items-center gap-3"><span className="min-w-0 flex-1 truncate text-sm">{materialLabel(material)}</span><input type="number" min="0" step="0.01" placeholder={`Standard $${(material.standardPriceCentsPerM2 / 100).toFixed(2)}`} value={prices[material.id] ?? ""} onChange={(event) => setPrices((current) => ({ ...current, [material.id]: event.target.value }))} className="h-10 w-36 rounded-lg border border-border-strong bg-surface px-2 text-sm" /></label>)}</div><Button type="submit" variant="primary" disabled={listPending || !selectableMaterials(materials).length}>{listPending ? "Saving…" : "Create price list"}</Button>{listState.message ? <p className="text-xs text-muted-foreground">{listState.message}</p> : null}</form><div className="divide-y divide-border-subtle">{priceLists.map((list) => <PriceListEditor key={list.id} list={list} materials={selectableMaterials(materials)} />)}</div>
    </Card>
  </div>;
}

function MaterialCatalogue({ materials }: { materials: CatalogueMaterial[] }) { return <div className="divide-y divide-border-subtle">{groupMaterials(materials).map(([name, group]) => <MaterialGroup key={name} name={name} materials={group} />)}</div>; }

function MaterialGroup({ name, materials }: { name: string; materials: CatalogueMaterial[] }) {
  const [addingVariation, setAddingVariation] = useState(false);
  const hasVariations = materials.some((material) => material.variation);
  const children = hasVariations ? materials.filter((material) => material.variation) : materials;
  return <div>
    {hasVariations ? <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-muted px-4 py-2.5"><div className="flex items-center gap-2"><p className="text-sm font-bold">{name}</p><span className="rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{materials.filter((material) => material.variation).length} variation{materials.filter((material) => material.variation).length === 1 ? "" : "s"}</span></div><Button size="sm" variant="secondary" onClick={() => setAddingVariation((current) => !current)}>{addingVariation ? "Close" : "Add variation"}</Button></div> : null}
    <div className={hasVariations ? "divide-y divide-border-subtle" : ""}>{children.map((material) => <MaterialEditor key={material.id} material={material} nested={hasVariations} onAddVariation={hasVariations ? undefined : () => setAddingVariation((current) => !current)} />)}</div>
    {addingVariation ? <VariationForm mainName={name} onDone={() => setAddingVariation(false)} /> : null}
  </div>;
}

function VariationForm({ mainName, onDone }: { mainName: string; onDone: () => void }) { const [state, action, pending] = useActionState(addMaterial, initial); return <form action={action} className="grid gap-2 border-t border-border-subtle bg-surface-muted p-4 sm:grid-cols-2"><input type="hidden" name="name" value={mainName} /><div className="sm:col-span-2"><p className="text-sm font-bold">Add variation to {mainName}</p><p className="text-xs text-muted-foreground">The main material is already set. Add the variation-specific SKU and pricing.</p></div><input name="variation" required placeholder="Variation name (e.g. R2.5)" className={input} /><input name="sku" required placeholder="SKU" className={input} /><input name="description" placeholder="Description" className={input} /><input name="costPerM2" required type="number" min="0.01" step="0.01" placeholder="Cost per m²" className={input} /><input name="standardPricePerM2" required type="number" min="0.01" step="0.01" placeholder="Standard sell $/m²" className={input} /><div className="flex gap-2"><Button size="sm" type="submit" variant="primary" disabled={pending}>{pending ? "Adding…" : "Add variation"}</Button><Button size="sm" type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>{state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}</form>; }

function MaterialEditor({ material, nested = false, onAddVariation }: { material: CatalogueMaterial; nested?: boolean; onAddVariation?: () => void }) { const [editing, setEditing] = useState(false); const [state, action, pending] = useActionState(updateMaterial, initial); const [deleting, start] = useTransition(); const router = useRouter(); const isVariation = Boolean(material.variation); const displayName = nested ? material.variation || "Standard" : materialLabel(material); const pricing = material.standardPriceCentsPerM2 > 0 ? ` · Cost $${(material.costCentsPerM2 / 100).toFixed(2)} · Standard $${(material.standardPriceCentsPerM2 / 100).toFixed(2)}/m²` : " · Parent material — add a variation before quoting"; if (!editing) return <div className={`flex items-center justify-between gap-3 px-4 py-3 ${nested ? "pl-8" : ""}`}><div><p className="text-sm font-bold">{displayName}</p><p className="text-xs text-muted-foreground">{material.sku || "No SKU"}{material.description ? ` · ${material.description}` : ""}{pricing}</p></div><div className="flex gap-2">{onAddVariation ? <Button size="sm" variant="secondary" onClick={onAddVariation}>Add variation</Button> : null}<Button size="sm" onClick={() => setEditing(true)}>Edit</Button><Button size="sm" variant="danger" disabled={deleting} onClick={() => { if (window.confirm(`Remove ${materialLabel(material)}?`)) start(async () => { await deleteMaterial(material.id); router.refresh(); }); }}>Remove</Button></div></div>; return <form action={action} className={`grid gap-2 bg-surface-muted p-4 sm:grid-cols-2 ${nested ? "border-l-4 border-primary/30" : ""}`}><input type="hidden" name="id" value={material.id} /><input name="name" defaultValue={material.name} className={input} /><input name="variation" required={isVariation} defaultValue={material.variation ?? ""} placeholder="Variation (optional)" className={input} /><input name="sku" required={isVariation} defaultValue={material.sku} placeholder={isVariation ? "SKU" : "SKU (optional for parent)"} className={input} /><input name="description" defaultValue={material.description ?? ""} className={input} /><input name="costPerM2" required={isVariation} type="number" min="0" step="0.01" defaultValue={material.costCentsPerM2 ? (material.costCentsPerM2 / 100).toFixed(2) : ""} className={input} /><input name="standardPricePerM2" required={isVariation} type="number" min="0" step="0.01" defaultValue={material.standardPriceCentsPerM2 ? (material.standardPriceCentsPerM2 / 100).toFixed(2) : ""} className={input} /><div className="flex gap-2"><Button size="sm" type="submit" variant="primary" disabled={pending}>Save</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>{state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}</form>; }

function PriceListEditor({ list, materials }: { list: CustomerPriceList; materials: CatalogueMaterial[] }) { const [editing, setEditing] = useState(false); const [state, action, pending] = useActionState(updatePriceList, initial); const [deleting, start] = useTransition(); const router = useRouter(); const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(list.entries.map((entry) => [entry.materialId, (entry.priceCentsPerM2 / 100).toFixed(2)]))); const entries = Object.entries(prices).filter(([, value]) => Number(value) > 0).map(([id, value]) => `${id}:${value}`).join("\n"); if (!editing) return <div className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-bold">{list.name}</p><p className="text-xs text-muted-foreground">{list.entries.length} customer prices</p></div><div className="flex gap-2"><Button size="sm" onClick={() => setEditing(true)}>Edit</Button><Button size="sm" variant="danger" disabled={deleting} onClick={() => { if (window.confirm(`Remove ${list.name}? Customers will return to default pricing.`)) start(async () => { await deletePriceList(list.id); router.refresh(); }); }}>Remove</Button></div></div>; return <form action={action} className="space-y-2 bg-surface-muted p-4"><input type="hidden" name="id" value={list.id} /><input type="hidden" name="entries" value={entries} /><input name="name" defaultValue={list.name} className={input} />{materials.map((material) => <label key={material.id} className="flex items-center gap-3"><span className="min-w-0 flex-1 truncate text-sm">{materialLabel(material)}</span><input type="number" step="0.01" placeholder={`Standard $${(material.standardPriceCentsPerM2 / 100).toFixed(2)}`} value={prices[material.id] ?? ""} onChange={(event) => setPrices((current) => ({ ...current, [material.id]: event.target.value }))} className="h-10 w-32 rounded-lg border border-border-strong bg-surface px-2 text-sm" /></label>)}<p className="text-xs text-muted-foreground">Leave a price blank to use the standard material price.</p><div className="flex gap-2"><Button size="sm" type="submit" variant="primary" disabled={pending}>Save</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>{state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}</form>; }
