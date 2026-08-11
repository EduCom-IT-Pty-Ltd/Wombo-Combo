"use client";

import { useMemo, useState, useTransition } from "react";
import { createMaterialQuote } from "@/app/actions/quotes";
import { Button, Card, CardHeader } from "@/components/ui";
import type { CatalogueMaterial, MaterialCataloguePresentation } from "@/lib/data/types";
import { formatMoney } from "@/lib/domain/money";

type QuoteMaterial = CatalogueMaterial & { quotePriceCentsPerM2: number; usesCustomerPrice: boolean };
type ProductChoice = { id: string; name: string; options: Array<{ material: QuoteMaterial; label: string }> };
const labelFor = (material: CatalogueMaterial) => material.variation ? `${material.name} — ${material.variation}` : material.name;

/** Groups are display-only; every selected option below remains the source Xero material ID. */
function quoteChoices(materials: QuoteMaterial[], presentation: MaterialCataloguePresentation): ProductChoice[] {
  const hidden = new Set(presentation.hiddenMaterialIds);
  const available = materials.filter((material) => !hidden.has(material.id) && material.quotePriceCentsPerM2 > 0);
  const byId = new Map(available.map((material) => [material.id, material]));
  const mappedIds = new Set<string>();
  const grouped = presentation.groups.flatMap((group) => {
    const options = group.entries.flatMap((entry) => {
      const material = byId.get(entry.materialId);
      if (!material) return [];
      mappedIds.add(material.id);
      return [{ material, label: entry.label || labelFor(material) }];
    });
    return options.length ? [{ id: `group:${group.id}`, name: group.name, options }] : [];
  });
  const direct = available.filter((material) => !mappedIds.has(material.id));
  const rawGroups = Array.from(direct.reduce((acc, material) => {
    const key = material.name;
    const current = acc.get(key) ?? [];
    current.push(material);
    acc.set(key, current);
    return acc;
  }, new Map<string, QuoteMaterial[]>()).entries()).map(([name, entries]) => ({
    id: `direct:${name}`,
    name,
    options: entries.map((material) => ({ material, label: material.variation || labelFor(material) })),
  }));
  return [...grouped, ...rawGroups];
}

export function MaterialQuoteBuilder({ projectId, materials, priceListName, presentation }: { projectId: string; materials: QuoteMaterial[]; priceListName: string | null; presentation: MaterialCataloguePresentation }) {
  const choices = useMemo(() => quoteChoices(materials, presentation), [materials, presentation]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [selectedChoiceId, setSelectedChoiceId] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const selectedChoice = choices.find((choice) => choice.id === selectedChoiceId) ?? null;
  const included = materials.filter((material) => quantities[material.id] !== undefined);
  const lines = included.map((material) => ({ material, quantity: Number(quantities[material.id]) || 0, totalCents: Math.round((Number(quantities[material.id]) || 0) * material.quotePriceCentsPerM2) }));
  const subtotalCents = lines.reduce((total, line) => total + line.totalCents, 0);

  function selectChoice(id: string) {
    setSelectedChoiceId(id);
    const choice = choices.find((candidate) => candidate.id === id);
    setSelectedMaterialId(choice?.options.length === 1 ? choice.options[0].material.id : "");
  }
  function addMaterial() {
    if (!selectedMaterialId) return;
    setQuantities((current) => ({ ...current, [selectedMaterialId]: current[selectedMaterialId] || "1" }));
    setSelectedChoiceId(""); setSelectedMaterialId(""); setMessage("");
  }
  function create() { startTransition(async () => { const result = await createMaterialQuote({ projectId, selections: lines.filter((line) => line.quantity > 0).map(({ material, quantity }) => ({ materialId: material.id, quantity })) }); setMessage(result.message); }); }

  return <Card><CardHeader title="Create material quote" description={priceListName ? `Using ${priceListName}; blank customer prices use the standard price.` : "Using standard material pricing."} />
    <div className="grid gap-3 border-b border-border-subtle p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"><label className="block text-xs font-semibold text-muted-foreground">Material or category<select value={selectedChoiceId} onChange={(event) => selectChoice(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"><option value="">Choose a material…</option>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}{choice.options.length > 1 ? " — choose option" : ""}</option>)}</select></label>{selectedChoice ? <label className="block text-xs font-semibold text-muted-foreground">{selectedChoice.options.length > 1 ? "Option" : "Selected material"}<select value={selectedMaterialId} onChange={(event) => setSelectedMaterialId(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"><option value="">{selectedChoice.options.length > 1 ? "Choose an option…" : "Choose material…"}</option>{selectedChoice.options.map(({ material, label }) => <option key={material.id} value={material.id}>{label}{material.sku ? ` · ${material.sku}` : ""}</option>)}</select></label> : <div /> }<Button type="button" variant="primary" disabled={!selectedMaterialId} onClick={addMaterial}>Add material</Button></div>
    {!choices.length ? <p className="border-b border-border-subtle px-4 py-5 text-sm text-muted-foreground">No visible materials with a sell price are available. Check the Xero sync or your platform catalogue display settings.</p> : null}
    {included.length ? <div className="overflow-x-auto"><InvoiceRows materials={included} quantities={quantities} onQuantityChange={setQuantities} onRemove={(id) => setQuantities((current) => { const next = { ...current }; delete next[id]; return next; })} /><div className="grid min-w-[700px] grid-cols-[minmax(220px,1fr)_120px_130px_140px_48px] items-center gap-3 bg-surface-muted px-4 py-4"><p className="col-span-4 text-right text-sm font-bold">Subtotal</p><p className="text-right text-lg font-bold">{formatMoney(subtotalCents)}</p></div></div> : null}
    <div className="flex flex-wrap items-center gap-3 p-4"><Button type="button" variant="primary" disabled={pending || !subtotalCents} onClick={create}>{pending ? "Creating…" : "Generate quote"}</Button>{message ? <p className="text-xs text-muted-foreground">{message}</p> : null}</div>
  </Card>;
}

function InvoiceRows({ materials, quantities, onQuantityChange, onRemove }: { materials: QuoteMaterial[]; quantities: Record<string, string>; onQuantityChange: (next: Record<string, string>) => void; onRemove: (id: string) => void }) { return <div className="min-w-[700px] divide-y divide-border-subtle"><div className="grid grid-cols-[minmax(220px,1fr)_120px_130px_140px_48px] gap-3 bg-surface-muted px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><span>Material</span><span>Quantity (m²)</span><span className="text-right">Price / m²</span><span className="text-right">Line total</span><span /></div>{materials.map((material) => { const totalCents = Math.round((Number(quantities[material.id]) || 0) * material.quotePriceCentsPerM2); return <div key={material.id} className="grid min-h-16 grid-cols-[minmax(220px,1fr)_120px_130px_140px_48px] items-center gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{labelFor(material)}</p><p className="truncate text-xs text-muted-foreground">{material.sku} · {material.usesCustomerPrice ? "Customer price" : "Standard price"}</p></div><input aria-label={`Quantity for ${labelFor(material)}`} type="number" min="0" step="0.1" value={quantities[material.id] ?? ""} onChange={(event) => onQuantityChange({ ...quantities, [material.id]: event.target.value })} className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold" /><p className="text-right text-sm font-medium">{formatMoney(material.quotePriceCentsPerM2)}</p><p className="text-right text-base font-bold">{formatMoney(totalCents)}</p><Button type="button" size="sm" variant="ghost" onClick={() => onRemove(material.id)} aria-label={`Remove ${labelFor(material)}`}>×</Button></div>; })}</div>; }
