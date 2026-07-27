"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addProductionTemplate,
  deleteProductionTemplate,
  type ProductionTemplateActionState,
  updateProductionTemplate,
} from "@/app/actions/production-templates";
import { Button, Card, CardHeader, EmptyState } from "@/components/ui";
import type { CatalogueMaterial, ProductionTemplate } from "@/lib/data/types";

const initialState: ProductionTemplateActionState = { ok: false };
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground";

export function ProductionTemplateManager({
  materials,
  templates,
}: {
  materials: CatalogueMaterial[];
  templates: ProductionTemplate[];
}) {
  const [state, action, pending] = useActionState(addProductionTemplate, initialState);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const entries = serialiseMaterials(selected);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="New production template" description="Build a reusable material model, including its default quantities." />
        <form action={action} className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input required name="name" placeholder="Template name" className={inputClass} />
            <input name="description" placeholder="Description (optional)" className={inputClass} />
          </div>
          <input type="hidden" name="materials" value={entries} />
          <MaterialChoices materials={materials} selected={selected} onChange={setSelected} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={pending || !materials.length}>{pending ? "Adding…" : "Add template"}</Button>
            {state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}
          </div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Saved templates" description="Edit the model, selected materials, or its default quantities at any time." />
        {templates.length ? <div className="divide-y divide-border-subtle">{templates.map((template) => <TemplateEditor key={template.id} template={template} materials={materials} />)}</div> : <EmptyState title="No production templates yet" description="Create your first production model above." />}
      </Card>
    </div>
  );
}

function MaterialChoices({
  materials,
  selected,
  onChange,
}: {
  materials: CatalogueMaterial[];
  selected: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}) {
  if (!materials.length) return <p className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted-foreground">Add materials in the Materials module before creating a template.</p>;
  return <div className="overflow-x-auto rounded-lg border border-border-subtle"><div className="min-w-[520px] divide-y divide-border-subtle"><div className="grid grid-cols-[48px_minmax(200px,1fr)_140px] gap-3 bg-surface-muted px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><span>Use</span><span>Material</span><span>Default m²</span></div>{materials.map((material) => { const active = selected[material.id] !== undefined; return <div key={material.id} className="grid min-h-14 grid-cols-[48px_minmax(200px,1fr)_140px] items-center gap-3 px-3 py-2"><input aria-label={`Use ${material.name}`} type="checkbox" checked={active} onChange={() => onChange(active ? Object.fromEntries(Object.entries(selected).filter(([id]) => id !== material.id)) : { ...selected, [material.id]: "1" })} className="size-5 accent-primary" /><span><span className="block text-sm font-semibold">{material.name}</span><span className="block text-xs text-muted-foreground">{material.sku}</span></span><input aria-label={`Default quantity for ${material.name}`} type="number" min="0.1" step="0.1" disabled={!active} value={selected[material.id] ?? ""} onChange={(event) => onChange({ ...selected, [material.id]: event.target.value })} className={`${inputClass} disabled:opacity-40`} /></div>; })}</div></div>;
}

function TemplateEditor({ template, materials }: { template: ProductionTemplate; materials: CatalogueMaterial[] }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateProductionTemplate, initialState);
  const [deleting, startTransition] = useTransition();
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, string>>(() => Object.fromEntries(template.materials.map((item) => [item.materialId, String(item.defaultQuantity)])));

  if (!editing) return <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><div><p className="text-sm font-bold">{template.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{template.description || "No description"} · {template.materials.length} materials</p></div><div className="flex gap-2"><Button size="sm" onClick={() => setEditing(true)}>Edit</Button><Button size="sm" variant="danger" disabled={deleting} onClick={() => { if (window.confirm(`Remove ${template.name}?`)) startTransition(async () => { await deleteProductionTemplate(template.id); router.refresh(); }); }}>Remove</Button></div></div>;

  return <form action={action} className="space-y-4 bg-surface-muted p-4"><input type="hidden" name="id" value={template.id} /><div className="grid gap-3 sm:grid-cols-2"><input required name="name" defaultValue={template.name} className={inputClass} /><input name="description" defaultValue={template.description ?? ""} className={inputClass} /></div><input type="hidden" name="materials" value={serialiseMaterials(selected)} /><MaterialChoices materials={materials} selected={selected} onChange={setSelected} /><div className="flex flex-wrap items-center gap-2"><Button size="sm" type="submit" variant="primary" disabled={pending}>Save changes</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>{state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}</div></form>;
}

function serialiseMaterials(selected: Record<string, string>) {
  return Object.entries(selected).filter(([, quantity]) => Number(quantity) > 0).map(([id, quantity]) => `${id}:${quantity}`).join("\n");
}
