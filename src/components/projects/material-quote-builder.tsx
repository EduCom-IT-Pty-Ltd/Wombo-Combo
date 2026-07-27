"use client";

import { useState, useTransition } from "react";
import { createMaterialQuote } from "@/app/actions/quotes";
import { Button, Card, CardHeader } from "@/components/ui";
import type { CatalogueMaterial, ProductionTemplate } from "@/lib/data/types";
import { formatMoney } from "@/lib/domain/money";

type QuoteMaterial = CatalogueMaterial & {
  quotePriceCentsPerM2: number;
  usesCustomerPrice: boolean;
};

export function MaterialQuoteBuilder({
  projectId,
  materials,
  priceListName,
  productionTemplates,
}: {
  projectId: string;
  materials: QuoteMaterial[];
  priceListName: string | null;
  productionTemplates: ProductionTemplate[];
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [addedTemplateIds, setAddedTemplateIds] = useState<string[]>([]);
  const [showProductionPicker, setShowProductionPicker] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const selectedTemplates = productionTemplates.filter((template) => addedTemplateIds.includes(template.id));
  const includedIds = new Set(selectedTemplates.flatMap((template) => template.materials.map((item) => item.materialId)));
  const quoteMaterials = materials.filter((material) => includedIds.has(material.id));
  const lines = quoteMaterials.map((material) => {
    const quantity = Number(quantities[material.id]) || 0;
    return { material, quantity, totalCents: Math.round(quantity * material.quotePriceCentsPerM2) };
  });
  const subtotalCents = lines.reduce((total, line) => total + line.totalCents, 0);

  function addProduction(template: ProductionTemplate) {
    if (addedTemplateIds.includes(template.id)) return;
    setAddedTemplateIds((current) => [...current, template.id]);
    setQuantities((current) => {
      const next = { ...current };
      for (const item of template.materials) {
        next[item.materialId] = String((Number(next[item.materialId]) || 0) + item.defaultQuantity);
      }
      return next;
    });
    setShowProductionPicker(false);
    setMessage("");
  }

  function create() {
    startTransition(async () => {
      const result = await createMaterialQuote({
        projectId,
        selections: lines.map(({ material, quantity }) => ({ materialId: material.id, quantity })),
      });
      setMessage(result.message);
    });
  }

  return (
    <Card>
      <CardHeader
        title="Create material quote"
        description={priceListName ? `Using ${priceListName}; blank customer prices use the standard price.` : "Using standard material pricing."}
        action={<Button type="button" size="sm" variant="primary" disabled={!productionTemplates.length} onClick={() => setShowProductionPicker(true)}>Add production</Button>}
      />
      {selectedTemplates.length ? <div className="flex flex-wrap gap-2 border-b border-border-subtle px-4 py-3">{selectedTemplates.map((template) => <span key={template.id} className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold">{template.name}<button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${template.name}`} onClick={() => setAddedTemplateIds((current) => current.filter((id) => id !== template.id))}>×</button></span>)}</div> : <div className="border-b border-border-subtle px-4 py-5 text-sm text-muted-foreground">Choose a production template to add its materials to this quote.</div>}
      {quoteMaterials.length ? <div className="overflow-x-auto"><InvoiceRows materials={quoteMaterials} quantities={quantities} onQuantityChange={setQuantities} /><div className="grid min-w-[640px] grid-cols-[minmax(220px,1fr)_120px_130px_140px] items-center gap-3 bg-surface-muted px-4 py-4"><p className="col-span-3 text-right text-sm font-bold">Subtotal</p><p className="text-right text-lg font-bold">{formatMoney(subtotalCents)}</p></div></div> : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle p-4">
        <Button type="button" variant="primary" disabled={pending || !subtotalCents} onClick={create}>{pending ? "Creating…" : "Generate quote"}</Button>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>
      {showProductionPicker ? <ProductionPicker templates={productionTemplates} addedTemplateIds={addedTemplateIds} onAdd={addProduction} onClose={() => setShowProductionPicker(false)} /> : null}
    </Card>
  );
}

function InvoiceRows({ materials, quantities, onQuantityChange }: { materials: QuoteMaterial[]; quantities: Record<string, string>; onQuantityChange: (next: Record<string, string>) => void }) {
  return <div className="min-w-[640px] divide-y divide-border-subtle"><div className="grid grid-cols-[minmax(220px,1fr)_120px_130px_140px] gap-3 bg-surface-muted px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><span>Material</span><span>Quantity (m²)</span><span className="text-right">Price / m²</span><span className="text-right">Line total</span></div>{materials.map((material) => { const totalCents = Math.round((Number(quantities[material.id]) || 0) * material.quotePriceCentsPerM2); return <div key={material.id} className="grid min-h-16 grid-cols-[minmax(220px,1fr)_120px_130px_140px] items-center gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{material.name}</p><p className="truncate text-xs text-muted-foreground">{material.sku} · {material.usesCustomerPrice ? "Customer price" : "Standard price"}</p></div><input aria-label={`Quantity for ${material.name}`} type="number" min="0" step="0.1" value={quantities[material.id] ?? ""} onChange={(event) => onQuantityChange({ ...quantities, [material.id]: event.target.value })} className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold" /><p className="text-right text-sm font-medium">{formatMoney(material.quotePriceCentsPerM2)}</p><p className="text-right text-base font-bold">{formatMoney(totalCents)}</p></div>; })}</div>;
}

function ProductionPicker({ templates, addedTemplateIds, onAdd, onClose }: { templates: ProductionTemplate[]; addedTemplateIds: string[]; onAdd: (template: ProductionTemplate) => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Add production template"><div className="w-full max-w-xl overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"><div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4"><div><h2 className="text-base font-bold">Add production</h2><p className="mt-0.5 text-sm text-muted-foreground">Select a production model to add its materials and default quantities.</p></div><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div><div className="max-h-[60vh] divide-y divide-border-subtle overflow-y-auto">{templates.map((template) => { const alreadyAdded = addedTemplateIds.includes(template.id); return <div key={template.id} className="flex items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-bold">{template.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{template.description || "No description"} · {template.materials.length} materials</p></div><Button size="sm" disabled={alreadyAdded} variant={alreadyAdded ? "ghost" : "primary"} onClick={() => onAdd(template)}>{alreadyAdded ? "Added" : "Add"}</Button></div>; })}</div></div></div>;
}
