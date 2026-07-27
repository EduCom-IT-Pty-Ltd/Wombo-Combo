"use client";

import { useState, useTransition } from "react";
import { createMaterialQuote } from "@/app/actions/quotes";
import { Button, Card, CardHeader } from "@/components/ui";
import type { CatalogueMaterial } from "@/lib/data/types";

export function MaterialQuoteBuilder({ projectId, materials }: { projectId: string; materials: CatalogueMaterial[] }) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function create() { startTransition(async () => { const result = await createMaterialQuote({ projectId, selections: Object.entries(quantities).map(([materialId, quantity]) => ({ materialId, quantity: Number(quantity) })) }); setMessage(result.message); }); }
  return <Card><CardHeader title="Create material quote" description="Uses the customer price list when one is assigned; otherwise standard material pricing applies." /><div className="space-y-2 p-4">{materials.length ? materials.map((material) => <label key={material.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-border-subtle px-3"><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{material.name}</span><span className="block text-xs text-muted-foreground">{material.sku} · m²</span></span><input type="number" min="0" step="0.1" placeholder="Qty" value={quantities[material.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [material.id]: event.target.value }))} className="h-10 w-24 rounded-lg border border-border-strong bg-surface px-2 text-sm" /></label>) : <p className="text-sm text-muted-foreground">Add materials in the Materials module first.</p>}<div className="flex items-center gap-3 pt-2"><Button type="button" variant="primary" disabled={pending || !materials.length} onClick={create}>{pending ? "Creating…" : "Generate quote"}</Button>{message ? <p className="text-xs text-muted-foreground">{message}</p> : null}</div></div></Card>;
}
