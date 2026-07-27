"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { addSchedulePhase, deleteSchedulePhase, type SchedulePhaseActionState, updateSchedulePhase } from "@/app/actions/schedule-phases";
import { Button, Card, CardHeader, EmptyState } from "@/components/ui";
import type { Person, SchedulePhaseView } from "@/lib/data/types";
import { formatDate } from "@/lib/utils";

const initial: SchedulePhaseActionState = { ok: false };
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground";

export function SchedulePhaseManager({ projectId, phases, people, canManage }: { projectId: string; phases: SchedulePhaseView[]; people: Person[]; canManage: boolean }) {
  const [adding, setAdding] = useState(false);
  return <div className="space-y-4"><Card><CardHeader title="Project phases" description="Each phase appears on the calendar for its assigned user." action={canManage ? <Button size="sm" variant="primary" onClick={() => setAdding(true)}><CalendarPlus className="size-4" /> Add phase</Button> : null} />{adding ? <PhaseForm projectId={projectId} people={people} onClose={() => setAdding(false)} /> : null}{phases.length ? <div className="divide-y divide-border-subtle">{phases.map((phase) => <PhaseRow key={phase.id} phase={phase} projectId={projectId} people={people} canManage={canManage} />)}</div> : <EmptyState title="No phases scheduled" description={canManage ? "Add the first phase to put this project on the calendar." : "No project phases have been scheduled yet."} />}</Card></div>;
}

function PhaseRow({ phase, projectId, people, canManage }: { phase: SchedulePhaseView; projectId: string; people: Person[]; canManage: boolean }) {
  const [editing, setEditing] = useState(false); const [deleting, startTransition] = useTransition(); const router = useRouter(); const person = people.find((item) => item.id === phase.userId);
  if (editing) return <PhaseForm projectId={projectId} phase={phase} people={people} onClose={() => setEditing(false)} />;
  return <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{phase.title}</p><span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold">{formatDate(phase.date, true)}</span></div>{phase.description ? <p className="mt-1 text-sm text-muted-foreground">{phase.description}</p> : null}<p className="mt-1 text-xs text-muted-foreground">Assigned to {person?.name ?? "Unknown user"}</p></div>{canManage ? <div className="flex gap-2"><Button type="button" size="sm" onClick={() => setEditing(true)}><Pencil className="size-3.5" /> Edit</Button><Button type="button" size="sm" variant="danger" disabled={deleting} onClick={() => { if (window.confirm(`Remove the ${phase.title} phase?`)) startTransition(async () => { await deleteSchedulePhase(phase.id, projectId); router.refresh(); }); }}><Trash2 className="size-3.5" /> Remove</Button></div> : null}</div>;
}

function PhaseForm({ projectId, people, phase, onClose }: { projectId: string; people: Person[]; phase?: SchedulePhaseView; onClose: () => void }) {
  const [state, action, pending] = useActionState(phase ? updateSchedulePhase : addSchedulePhase, initial);
  return <form action={action} className="space-y-3 border-b border-border-subtle bg-surface-muted p-4"><input type="hidden" name="projectId" value={projectId} />{phase ? <input type="hidden" name="id" value={phase.id} /> : null}<div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-medium text-muted-foreground">Phase</span><input required name="title" defaultValue={phase?.title ?? ""} placeholder="Installation, site measure…" className={inputClass} /></label><label><span className="mb-1 block text-xs font-medium text-muted-foreground">Date</span><input required name="date" type="date" defaultValue={phase?.date ?? ""} className={inputClass} /></label><label><span className="mb-1 block text-xs font-medium text-muted-foreground">Assigned user</span><select required name="userId" defaultValue={phase?.userId ?? ""} className={inputClass}><option value="" disabled>Select user…</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label><span className="mb-1 block text-xs font-medium text-muted-foreground">Description</span><input name="description" defaultValue={phase?.description ?? ""} placeholder="Optional details" className={inputClass} /></label></div><div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : phase ? "Save phase" : "Add phase"}</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>{state.message ? <p className={`text-xs ${state.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>{state.message}</p> : null}</div></form>;
}
