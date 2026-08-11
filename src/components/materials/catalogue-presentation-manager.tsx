"use client";

import { useActionState, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { saveMaterialCataloguePresentation, type MaterialActionState } from "@/app/actions/materials";
import { Button, Card, CardHeader } from "@/components/ui";
import type { CatalogueMaterial, MaterialCataloguePresentation } from "@/lib/data/types";

const initial: MaterialActionState = { ok: false };
const input = "h-10 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm text-foreground";
const labelFor = (material: CatalogueMaterial) => material.variation ? `${material.name} — ${material.variation}` : material.name;

/**
 * This editor deliberately stores IDs and display labels only. The Xero item
 * itself is not edited here, and a group maps straight back to that same row.
 */
export function CataloguePresentationManager({ materials, presentation }: { materials: CatalogueMaterial[]; presentation: MaterialCataloguePresentation }) {
  const [state, action, pending] = useActionState(saveMaterialCataloguePresentation, initial);
  const [hiddenMaterialIds, setHiddenMaterialIds] = useState(presentation.hiddenMaterialIds);
  const [groups, setGroups] = useState(presentation.groups);
  const [groupName, setGroupName] = useState("");
  const [showVisibility, setShowVisibility] = useState(false);
  const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const groupedIds = new Set(groups.flatMap((group) => group.entries.map((entry) => entry.materialId)));
  const visibleMaterials = materials.filter((material) => !hiddenMaterialIds.includes(material.id));

  function toggleMaterial(id: string) {
    setHiddenMaterialIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function addGroup() {
    const name = groupName.trim();
    if (!name) return;
    setGroups((current) => [...current, { id: `catalogue-group-${crypto.randomUUID()}`, name, entries: [] }]);
    setGroupName("");
  }

  function addEntry(groupId: string, materialId: string) {
    const material = materialById.get(materialId);
    if (!material) return;
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return { ...group, entries: group.entries.filter((entry) => entry.materialId !== materialId) };
      if (group.entries.some((entry) => entry.materialId === materialId)) return group;
      return { ...group, entries: [...group.entries, { materialId, label: material.variation ?? material.name }] };
    }));
  }

  return <Card className="xl:col-span-2">
    <CardHeader title="Platform catalogue display" description="Choose which synced Xero items appear in this platform, then optionally map them into quote categories. These controls never edit or sync anything back to Xero." action={<Button type="button" size="sm" variant="secondary" onClick={() => setShowVisibility(true)}>Visible products · {visibleMaterials.length}</Button>} />
    <form action={action} className="space-y-5 p-4">
      <input type="hidden" name="presentation" value={JSON.stringify({ hiddenMaterialIds, groups })} />
      <div>
        <section className="rounded-xl border border-border-subtle bg-surface-muted/50 p-3">
          <div className="mb-3"><h3 className="font-semibold">Quote categories</h3><p className="text-xs text-muted-foreground">For example, map Wall Wrap 2.0, 2.5 and 3.0 under one “Wall Wrap” choice.</p></div>
          <div className="mb-3 flex gap-2"><input value={groupName} onChange={(event) => setGroupName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addGroup(); } }} className={input} placeholder="New category, e.g. Wall Wrap" /><Button type="button" onClick={addGroup}>Add</Button></div>
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">{groups.map((group) => <div key={group.id} className="rounded-lg border border-border-subtle bg-surface p-3"><div className="mb-2 flex items-center justify-between gap-2"><input value={group.name} onChange={(event) => setGroups((current) => current.map((item) => item.id === group.id ? { ...item, name: event.target.value } : item))} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" /><Button type="button" size="sm" variant="ghost" onClick={() => setGroups((current) => current.filter((item) => item.id !== group.id))}>Remove</Button></div><select className={input} value="" onChange={(event) => { addEntry(group.id, event.target.value); event.currentTarget.value = ""; }}><option value="">Add a visible Xero item…</option>{visibleMaterials.filter((material) => !groupedIds.has(material.id) || group.entries.some((entry) => entry.materialId === material.id)).map((material) => <option value={material.id} key={material.id}>{labelFor(material)}{material.sku ? ` · ${material.sku}` : ""}</option>)}</select><div className="mt-2 space-y-1.5">{group.entries.map((entry) => <div key={entry.materialId} className="flex items-center gap-2 rounded-md bg-surface-muted px-2 py-1.5"><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{labelFor(materialById.get(entry.materialId) ?? { name: "Unknown material", variation: null } as CatalogueMaterial)}</span><input className="h-8 w-28 rounded border border-border-subtle bg-surface px-2 text-xs" value={entry.label} onChange={(event) => setGroups((current) => current.map((item) => item.id !== group.id ? item : { ...item, entries: item.entries.map((value) => value.materialId === entry.materialId ? { ...value, label: event.target.value } : value) }))} placeholder="Option label" /><Button type="button" size="sm" variant="ghost" onClick={() => setGroups((current) => current.map((item) => item.id !== group.id ? item : { ...item, entries: item.entries.filter((value) => value.materialId !== entry.materialId) }))}>×</Button></div>)}</div></div>)}{!groups.length ? <p className="rounded-lg border border-dashed border-border-subtle p-4 text-center text-sm text-muted-foreground">No quote categories yet. Materials can still be quoted individually.</p> : null}</div>
        </section>
      </div>
      <div className="flex items-center gap-3"><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save platform display"}</Button>{state.message ? <p className={state.ok ? "text-xs text-emerald-600" : "text-xs text-destructive"}>{state.message}</p> : null}</div>
      {showVisibility ? createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Visible platform products"><div className="flex h-[min(760px,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"><div className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle px-5 py-4"><div><h2 className="text-base font-bold">Visible in platform</h2><p className="mt-1 text-sm text-muted-foreground">Choose the synced Xero items available in platform material and quote pickers. Hiding a product never changes it in Xero.</p></div><Button type="button" size="sm" variant="ghost" onClick={() => setShowVisibility(false)}>Close</Button></div><div className="min-h-0 flex-1 divide-y divide-border-subtle overflow-y-auto">{materials.map((material) => { const hidden = hiddenMaterialIds.includes(material.id); return <div key={material.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{labelFor(material)}</p><p className="truncate text-xs text-muted-foreground">{material.sku || "No item code"}{hidden ? " · Hidden from platform" : ""}</p></div><Button type="button" size="sm" variant={hidden ? "secondary" : "ghost"} onClick={() => toggleMaterial(material.id)}>{hidden ? "Show" : "Hide"}</Button></div>; })}{!materials.length ? <p className="p-6 text-center text-sm text-muted-foreground">No synced materials yet.</p> : null}</div><div className="flex shrink-0 items-center justify-between border-t border-border-subtle px-5 py-4"><p className="text-xs text-muted-foreground">{visibleMaterials.length} shown · {hiddenMaterialIds.length} hidden</p><Button type="button" variant="primary" onClick={() => setShowVisibility(false)}>Done</Button></div></div></div>, document.body) : null}
    </form>
  </Card>;
}
