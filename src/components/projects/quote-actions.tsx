"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteMaterialQuote, updateMaterialQuote } from "@/app/actions/quotes";
import { formatMoney } from "@/lib/domain/money";
import type { CatalogueMaterial, QuoteSummary } from "@/lib/data/types";
import { Button } from "@/components/ui";

type PricedMaterial = CatalogueMaterial & { quotePriceCentsPerM2: number };

export function QuoteActions({ projectId, quote, materials, visibleMaterialIds }: { projectId: string; quote: QuoteSummary; materials: PricedMaterial[]; visibleMaterialIds: string[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const initialQuantities = Object.fromEntries(quote.lines.flatMap((line) => {
    const materialId = line.catalogueMaterialId ?? materials.find((material) => material.name === line.description)?.id;
    return materialId ? [[materialId, String(line.quantity)]] : [];
  }));
  const [quantities, setQuantities] = useState<Record<string, string>>(initialQuantities);
  const selected = materials.filter((material) => quantities[material.id] !== undefined);
  const visibleIds = new Set(visibleMaterialIds);
  const available = materials.filter((material) => quantities[material.id] === undefined && visibleIds.has(material.id));

  function save() {
    startTransition(async () => {
      const result = await updateMaterialQuote({ projectId, quoteId: quote.id, selections: selected.map((material) => ({ materialId: material.id, quantity: Number(quantities[material.id]) || 0 })) });
      setMessage(result.message);
      if (result.ok) setEditing(false);
    });
  }

  function remove() {
    if (!window.confirm(`Delete ${quote.reference}? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteMaterialQuote({ projectId, quoteId: quote.id });
      setMessage(result.message);
    });
  }

  return <><div className="flex items-center gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => { setQuantities(initialQuantities); setMessage(""); setEditing(true); }}><Pencil className="size-3.5" /> Edit</Button><Button type="button" size="sm" variant="danger" disabled={pending} onClick={remove}><Trash2 className="size-3.5" /> Delete</Button></div>{message && !editing ? <p className="text-xs text-muted-foreground">{message}</p> : null}{editing ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`Edit ${quote.reference}`}><div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"><div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4"><div><h2 className="text-base font-bold">Edit {quote.reference}</h2><p className="mt-0.5 text-sm text-muted-foreground">Change quantities, add catalogue materials, or remove a line.</p></div><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Close</Button></div><div className="max-h-[60vh] overflow-y-auto p-5"><div className="space-y-3">{selected.map((material) => <div key={material.id} className="grid grid-cols-[minmax(0,1fr)_100px_auto] items-center gap-3 rounded-lg border border-border-subtle p-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{material.name}</p><p className="text-xs text-muted-foreground">{material.sku} · {formatMoney(material.quotePriceCentsPerM2)} / m²</p></div><input aria-label={`Quantity for ${material.name}`} type="number" min="0" step="0.1" value={quantities[material.id]} onChange={(event) => setQuantities({ ...quantities, [material.id]: event.target.value })} className="h-11 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold" /><Button type="button" size="sm" variant="ghost" onClick={() => { const next = { ...quantities }; delete next[material.id]; setQuantities(next); }}>Remove</Button></div>)}</div>{available.length ? <label className="mt-4 block text-sm font-semibold">Add material<select className="mt-1 h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm" defaultValue="" onChange={(event) => { if (!event.target.value) return; setQuantities({ ...quantities, [event.target.value]: "1" }); event.currentTarget.value = ""; }}><option value="">Choose a material…</option>{available.map((material) => <option key={material.id} value={material.id}>{material.name} · {material.sku}</option>)}</select></label> : null}</div><div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-4"><p className="text-xs text-muted-foreground">{message}</p><div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button type="button" variant="primary" disabled={pending || !selected.length} onClick={save}>{pending ? "Saving…" : "Save quote"}</Button></div></div></div></div> : null}</>;
}
