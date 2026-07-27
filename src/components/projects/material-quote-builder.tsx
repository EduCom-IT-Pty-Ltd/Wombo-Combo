"use client";

import { useState, useTransition } from "react";
import { createMaterialQuote } from "@/app/actions/quotes";
import { Button, Card, CardHeader } from "@/components/ui";
import type { CatalogueMaterial } from "@/lib/data/types";
import { formatMoney } from "@/lib/domain/money";

type QuoteMaterial = CatalogueMaterial & {
  quotePriceCentsPerM2: number;
  usesCustomerPrice: boolean;
};

export function MaterialQuoteBuilder({
  projectId,
  materials,
  priceListName,
}: {
  projectId: string;
  materials: QuoteMaterial[];
  priceListName: string | null;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const lines = materials.map((material) => {
    const quantity = Number(quantities[material.id]) || 0;
    return { material, quantity, totalCents: Math.round(quantity * material.quotePriceCentsPerM2) };
  });
  const subtotalCents = lines.reduce((total, line) => total + line.totalCents, 0);

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
      />
      {materials.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[640px] divide-y divide-border-subtle">
            <div className="grid grid-cols-[minmax(220px,1fr)_120px_130px_140px] gap-3 bg-surface-muted px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span>Material</span>
              <span>Quantity (m²)</span>
              <span className="text-right">Price / m²</span>
              <span className="text-right">Line total</span>
            </div>
            {lines.map(({ material, totalCents }) => (
              <div key={material.id} className="grid min-h-16 grid-cols-[minmax(220px,1fr)_120px_130px_140px] items-center gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{material.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {material.sku} · {material.usesCustomerPrice ? "Customer price" : "Standard price"}
                  </p>
                </div>
                <input
                  aria-label={`Quantity for ${material.name}`}
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0"
                  value={quantities[material.id] ?? ""}
                  onChange={(event) => setQuantities((current) => ({ ...current, [material.id]: event.target.value }))}
                  className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold"
                />
                <p className="text-right text-sm font-medium">{formatMoney(material.quotePriceCentsPerM2) }</p>
                <p className="text-right text-base font-bold">{formatMoney(totalCents)}</p>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(220px,1fr)_120px_130px_140px] items-center gap-3 bg-surface-muted px-4 py-4">
              <p className="col-span-3 text-right text-sm font-bold">Subtotal</p>
              <p className="text-right text-lg font-bold">{formatMoney(subtotalCents)}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">Add materials in the Materials module first.</p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle p-4">
        <Button type="button" variant="primary" disabled={pending || !materials.length || !subtotalCents} onClick={create}>
          {pending ? "Creating…" : "Generate quote"}
        </Button>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>
    </Card>
  );
}
