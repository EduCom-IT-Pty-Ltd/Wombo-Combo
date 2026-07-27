"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { saveStatusSettingsAction, type SaveStatusSettingsState } from "@/app/actions/status-settings";
import { Button, Card, CardHeader } from "@/components/ui";
import type { StatusFieldTemplate, StatusSetting, StatusTaskTemplate } from "@/lib/domain/status-settings";

type EditableStatus = StatusSetting & { tasks: string[]; fields: string[] };
const initial: SaveStatusSettingsState = { status: "idle" };
const extraStatuses: Array<{ status: StatusSetting["status"]; label: string }> = [
  { status: "awaiting_approval", label: "Approval pending" },
  { status: "on_hold", label: "On hold" },
];
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary";

function mergeSettings(settings: StatusSetting[], templates: StatusTaskTemplate[], fields: StatusFieldTemplate[]): EditableStatus[] {
  return settings.map((setting) => ({ ...setting, tasks: templates.filter((task) => task.status === setting.status).sort((a, b) => a.position - b.position).map((task) => task.title), fields: fields.filter((field) => field.status === setting.status).sort((a, b) => a.position - b.position).map((field) => field.label) }));
}

export function StatusFlowSettings({ settings, templates, fields }: { settings: StatusSetting[]; templates: StatusTaskTemplate[]; fields: StatusFieldTemplate[] }) {
  const router = useRouter();
  const [items, setItems] = useState(() => mergeSettings(settings, templates, fields));
  const [state, action, pending] = useActionState(saveStatusSettingsAction, initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableStatus | null>(null);
  const [isNew, setIsNew] = useState(false);
  useEffect(() => { if (state.status === "success") router.refresh(); }, [router, state.status]);

  const flow = useMemo(() => items.filter((item) => item.inProgressFlow && item.status !== "lost" && item.status !== "cancelled").sort((a, b) => a.position - b.position), [items]);
  const offRamps = useMemo(() => items.filter((item) => item.status === "lost" || item.status === "cancelled"), [items]);
  const available = extraStatuses.filter((option) => !items.some((item) => item.status === option.status));
  const payload = JSON.stringify({ settings: [...flow, ...offRamps].map(({ status, label, color, inProgressFlow, tasks, fields: detailFields }) => ({ status, label, color, inProgressFlow, tasks, fields: detailFields })) });

  function reorder(targetId: string) {
    if (!dragging || dragging === targetId) return;
    const ordered = [...flow];
    const from = ordered.findIndex((item) => item.status === dragging);
    const to = ordered.findIndex((item) => item.status === targetId);
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setItems([...ordered.map((item, index) => ({ ...item, position: index + 1 })), ...offRamps.map((item, index) => ({ ...item, position: ordered.length + index + 1 }))]);
    setDragging(null);
  }

  function saveEditor(item: EditableStatus) {
    const cleaned = { ...item, label: item.label.trim(), tasks: item.tasks.map((task) => task.trim()).filter(Boolean) };
    setItems((current) => isNew ? [...current, cleaned] : current.map((entry) => entry.status === cleaned.status ? cleaned : entry));
    setEditing(null);
  }

  function deleteStatus(status: StatusSetting["status"]) {
    setItems((current) => current.filter((item) => item.status !== status));
    setEditing(null);
  }

  function newStatus() {
    const option = available[0];
    if (!option) return;
    setIsNew(true);
    setEditing({ status: option.status, label: option.label, color: "#2563eb", position: flow.length + 1, inProgressFlow: true, tasks: [], fields: [] });
  }

  return <form action={action}><input type="hidden" name="status-settings" value={payload} />
    <Card>
      <CardHeader title="Project status flow" description="Drag stages to change their order. Edit a stage to change its name, colour and checklist." action={<Button type="button" size="sm" variant="primary" onClick={newStatus} disabled={available.length === 0}><Plus className="size-4" /> Add status</Button>} />
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-bold">Workflow stages</p><p className="text-xs text-muted-foreground">Drag cards into the order your projects follow.</p></div><span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-bold text-muted-foreground">{flow.length} stages</span></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {flow.map((item, index) => <button key={item.status} type="button" draggable onDragStart={() => setDragging(item.status)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(item.status)} onClick={() => { setIsNew(false); setEditing(item); }} className={`group flex min-h-20 items-center gap-3 rounded-xl border bg-surface p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md ${dragging === item.status ? "opacity-40" : ""}`}>
            <GripVertical className="size-5 shrink-0 text-muted-foreground" /><span className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: item.color }}>{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{item.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.tasks.length} {item.tasks.length === 1 ? "task" : "tasks"} · {item.fields.length} {item.fields.length === 1 ? "field" : "fields"}</span></span><Pencil className="size-4 text-muted-foreground group-hover:text-primary" />
          </button>)}
        </div>
        <div className="mt-5 border-t border-border-subtle pt-4"><p className="text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">Fixed outcomes</p><div className="mt-2 flex flex-wrap gap-2">{offRamps.map((item) => <button key={item.status} type="button" onClick={() => { setIsNew(false); setEditing(item); }} className="inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-bold" style={{ borderColor: item.color, color: item.color }}><span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}<Pencil className="size-3.5" /></button>)}</div></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-4 py-3 sm:px-5"><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>{state.message ? <p className={state.status === "error" ? "text-xs text-[var(--tone-rose-fg)]" : "text-xs text-[var(--tone-emerald-fg)]"}>{state.message}</p> : null}</div>
    </Card>
    {editing ? <StatusEditor item={editing} isNew={isNew} extraOptions={available} canDelete={!isNew && editing.inProgressFlow && flow.length > 1} onClose={() => setEditing(null)} onSave={saveEditor} onDelete={deleteStatus} /> : null}
  </form>;
}

function StatusEditor({ item, isNew, extraOptions, canDelete, onClose, onSave, onDelete }: { item: EditableStatus; isNew: boolean; extraOptions: Array<{ status: StatusSetting["status"]; label: string }>; canDelete: boolean; onClose: () => void; onSave: (item: EditableStatus) => void; onDelete: (status: StatusSetting["status"]) => void }) {
  const [draft, setDraft] = useState(item);
  return createPortal(<><button type="button" aria-label="Close status editor" onClick={onClose} className="fixed inset-0 z-[90] bg-black/45" /><section role="dialog" aria-modal="true" aria-labelledby="status-editor-title" className="fixed top-1/2 left-1/2 z-[100] max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border-strong bg-surface shadow-2xl"><div className="flex items-center justify-between border-b border-border-subtle px-5 py-4"><div><p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">Status editor</p><h2 id="status-editor-title" className="mt-0.5 text-lg font-bold">{isNew ? "Add status" : "Edit status"}</h2></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted"><X className="size-5" /></button></div><div className="space-y-4 p-5"><label className="block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">Status name</span><input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} className={inputClass} autoFocus /></label>{isNew ? <label className="block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">Status type</span><select value={draft.status} onChange={(event) => { const option = extraOptions.find((entry) => entry.status === event.target.value); if (option) setDraft({ ...draft, status: option.status, label: option.label }); }} className={inputClass}>{extraOptions.map((option) => <option key={option.status} value={option.status}>{option.label}</option>)}</select></label> : null}<label className="block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">Stage colour</span><div className="flex items-center gap-3"><input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} className="size-11 rounded-lg border border-border-strong bg-surface p-1" /><span className="rounded-full px-3 py-1.5 text-sm font-bold text-white" style={{ backgroundColor: draft.color }}>{draft.label || "Preview"}</span></div></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">Checklist tasks</span><span className="mb-2 block text-xs text-muted-foreground">One task per line. These appear on the project at this stage.</span><textarea rows={5} value={draft.tasks.join("\n")} onChange={(event) => setDraft({ ...draft, tasks: event.target.value.split("\n") })} className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground" placeholder={"First task\nSecond task\nThird task"} /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">Project detail fields</span><span className="mb-2 block text-xs text-muted-foreground">One field label per line, e.g. PO Number. The project shows a saved text input for each field at this stage.</span><textarea rows={4} value={draft.fields.join("\n")} onChange={(event) => setDraft({ ...draft, fields: event.target.value.split("\n") })} className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground" placeholder={"PO Number\nPO received date"} /></label></div><div className="flex items-center justify-between gap-2 border-t border-border-subtle px-5 py-4">{canDelete ? <Button type="button" variant="danger" size="sm" onClick={() => { if (window.confirm(`Delete ${draft.label}? Its own checklist and detail-field templates will be removed when you save the status flow.`)) onDelete(draft.status); }}><Trash2 className="size-3.5" /> Delete status</Button> : <span />}{" "}<div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" variant="primary" disabled={draft.label.trim().length < 2} onClick={() => onSave(draft)}>Save status</Button></div></div></section></>, document.body);
}
