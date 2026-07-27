"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, X } from "lucide-react";
import {
  addProjectTemplate,
  deleteProjectTemplate,
  type ProjectTemplateActionState,
  updateProjectTemplate,
} from "@/app/actions/project-templates";
import { Button } from "@/components/ui";
import type { ProjectTemplate } from "@/lib/data/types";
import type { StatusSetting } from "@/lib/domain/status-settings";

const initial: ProjectTemplateActionState = { ok: false };
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground";

export function ProjectTemplateDialog({ templates, statuses }: { templates: ProjectTemplate[]; statuses: StatusSetting[] }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}><Layers className="size-4" /> Templates</Button>{open ? <TemplateModal templates={templates} statuses={statuses} onClose={() => setOpen(false)} /> : null}</>;
}

function TemplateModal({ templates, statuses, onClose }: { templates: ProjectTemplate[]; statuses: StatusSetting[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(addProjectTemplate, initial);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Project templates"><div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"><div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4"><div><h2 className="text-base font-bold">Project templates</h2><p className="mt-0.5 text-sm text-muted-foreground">Start new projects at the right workflow stage and complete earlier checklist tasks automatically.</p></div><Button size="sm" variant="ghost" aria-label="Close templates" onClick={onClose}><X className="size-4" /></Button></div><div className="overflow-y-auto"><form action={action} className="space-y-3 border-b border-border-subtle p-5"><p className="text-sm font-bold">New template</p><div className="grid gap-3 sm:grid-cols-2"><input required name="name" placeholder="Template name" className={inputClass} /><select required name="startingStatus" defaultValue="" className={inputClass}><option value="" disabled>Starting status…</option>{statuses.map((status) => <option key={status.status} value={status.status}>{status.label}</option>)}</select></div><input name="description" placeholder="Description (optional)" className={inputClass} /><div className="flex items-center gap-3"><Button type="submit" variant="primary" size="sm" disabled={pending}>{pending ? "Adding…" : "Add template"}</Button>{state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}</div></form><div className="divide-y divide-border-subtle">{templates.length ? templates.map((template) => <TemplateRow key={template.id} template={template} statuses={statuses} />) : <p className="px-5 py-8 text-center text-sm text-muted-foreground">No templates yet.</p>}</div></div></div></div>;
}

function TemplateRow({ template, statuses }: { template: ProjectTemplate; statuses: StatusSetting[] }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateProjectTemplate, initial);
  const [deleting, startTransition] = useTransition();
  const router = useRouter();
  const statusLabel = statuses.find((status) => status.status === template.startingStatus)?.label ?? template.startingStatus;
  if (!editing) return <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-bold">{template.name}</p><p className="mt-0.5 text-xs text-muted-foreground">Starts at {statusLabel}{template.description ? ` · ${template.description}` : ""}</p></div><div className="flex gap-2"><Button type="button" size="sm" onClick={() => setEditing(true)}>Edit</Button><Button type="button" size="sm" variant="danger" disabled={deleting} onClick={() => { if (window.confirm(`Remove ${template.name}? Customers using it will return to Standard project.`)) startTransition(async () => { await deleteProjectTemplate(template.id); router.refresh(); }); }}>Remove</Button></div></div>;
  return <form action={action} className="space-y-3 bg-surface-muted px-5 py-4"><input type="hidden" name="id" value={template.id} /><div className="grid gap-3 sm:grid-cols-2"><input required name="name" defaultValue={template.name} className={inputClass} /><select required name="startingStatus" defaultValue={template.startingStatus} className={inputClass}>{statuses.map((status) => <option key={status.status} value={status.status}>{status.label}</option>)}</select></div><input name="description" defaultValue={template.description ?? ""} className={inputClass} /><div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" variant="primary" disabled={pending}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>{state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}</div></form>;
}
