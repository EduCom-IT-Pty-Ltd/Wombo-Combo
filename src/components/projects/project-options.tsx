"use client";

import { useActionState, useState, useTransition } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { archiveProjectRecord, deleteProjectRecord, restoreProjectRecord, type RecordActionState, updateProjectRecord } from "@/app/actions/records";
import { Button } from "@/components/ui";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { ProjectDetail } from "@/lib/data/types";

const initial: RecordActionState = { ok: false };
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground";

export function ProjectOptions({ project, customers, archived = false, canArchive = false, canDelete = false }: { project: ProjectDetail; customers: Array<{ id: string; name: string }>; archived?: boolean; canArchive?: boolean; canDelete?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Navigate only once the action reports success. Routing first would land on a
  // list that still contains the project when the write failed, which reads as
  // the archive silently not working.
  const run = (action: () => Promise<RecordActionState>, onSuccess: () => void) => startTransition(async () => {
    const result = await action();
    if (!result.ok) { setError(result.message ?? "That did not work."); return; }
    setError(null);
    setMenuOpen(false);
    onSuccess();
    router.refresh();
  });

  return <div className="relative">
    <Button type="button" size="sm" variant="ghost" aria-label="Project options" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal className="size-5" /></Button>
    {menuOpen ? <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-border-strong bg-surface p-1 shadow-xl">
      <button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted" onClick={() => { setEditing(true); setMenuOpen(false); }}>Edit project</button>
      {canArchive ? (archived
        ? <button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted" disabled={pending} onClick={() => run(() => restoreProjectRecord(project.id), () => router.push(`/projects/${project.id}`))}>Restore</button>
        : <button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted" disabled={pending} onClick={() => { if (window.confirm(`Archive ${project.title}? It moves to Archived projects and drops out of the active list. Nothing is deleted and you can restore it at any time.`)) run(() => archiveProjectRecord(project.id), () => router.push("/projects?group=archived")); }}>Archive</button>
      ) : null}
      {canDelete ? <button className="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--tone-rose-fg)] hover:bg-surface-muted" disabled={pending} onClick={() => { if (window.prompt(`Deleting ${project.title} is permanent. Its quotes, tasks, time entries, QA records and its SharePoint folder are all destroyed, and there is no undo.\n\nType the Project ID ${project.projectNumber} to confirm.`)?.trim().toUpperCase() === project.projectNumber.toUpperCase()) run(() => deleteProjectRecord(project.id), () => router.push("/projects")); }}>Delete permanently</button> : null}
      {error ? <p className="px-3 py-2 text-xs text-[var(--tone-rose-fg)]">{error}</p> : null}
    </div> : null}
    {editing ? <ProjectEditor project={project} customers={customers} onClose={() => setEditing(false)} /> : null}
  </div>;
}

function ProjectEditor({ project, customers, onClose }: { project: ProjectDetail; customers: Array<{ id: string; name: string }>; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateProjectRecord, initial);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Edit project"><form action={action} className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"><div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4"><div><h2 className="text-base font-bold">Edit project</h2><p className="mt-0.5 text-sm text-muted-foreground">Update project details, including the generated Project ID.</p></div><Button type="button" size="sm" variant="ghost" aria-label="Close edit project" onClick={onClose}><X className="size-4" /></Button></div><div className="space-y-4 overflow-y-auto p-5"><input type="hidden" name="id" value={project.id} /><div className="grid gap-4 sm:grid-cols-2"><Field name="title" label="Project title" defaultValue={project.title} required /><Field name="projectNumber" label="Project ID" defaultValue={project.projectNumber} required /></div><CustomerPicker customers={customers} defaultCustomerId={project.customerId} required /><div className="grid gap-4 sm:grid-cols-2"><Field name="siteName" label="Site name" defaultValue={project.site?.name ?? ""} /><Field name="contactName" label="Site contact" defaultValue={project.site?.accessNotes?.replace(/^Site contact:\s*/, "") ?? ""} /></div><div className="grid gap-4 sm:grid-cols-2"><Field name="requestedStartOn" label="Requested start" type="date" defaultValue={project.requestedStartOn ?? ""} /><Field name="poNumber" label="PO number" defaultValue={project.poNumber ?? ""} /></div><label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Scope of works</span><textarea name="scopeOfWorks" rows={5} defaultValue={project.scopeOfWorks ?? ""} className={`${inputClass} h-auto py-3`} /></label><label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Initial notes</span><textarea name="initialNotes" rows={3} defaultValue={project.initialNotes ?? ""} className={`${inputClass} h-auto py-3`} /></label></div><div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-5 py-4"><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>{state.message ? <p className={`text-xs ${state.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>{state.message}</p> : null}</div></form></div>;
}

function Field({ name, label, defaultValue, type = "text", required = false }: { name: string; label: string; defaultValue: string; type?: string; required?: boolean }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span><input name={name} type={type} required={required} defaultValue={defaultValue} className={inputClass} /></label>; }
