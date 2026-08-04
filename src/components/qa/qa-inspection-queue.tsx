"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CalendarPlus, Pencil } from "lucide-react";
import { scheduleQaInspection, type QaScheduleActionState } from "@/app/actions/qa-schedule";
import { Button, EmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import type { Inspection, LeaveEntry, Person, ProjectSummary } from "@/lib/data/types";

const initial: QaScheduleActionState = { ok: false };
const inputClass = "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground";

export function QaInspectionQueue({ queue, people, leave, canSchedule }: { queue: Array<{ project: ProjectSummary; inspection: Inspection | null }>; people: Person[]; leave: LeaveEntry[]; canSchedule: boolean }) {
  return <>{queue.length ? <ul className="divide-y divide-border-subtle">{queue.map(({ project, inspection }) => <InspectionRow key={inspection?.id ?? project.id} project={project} inspection={inspection} people={people} leave={leave} canSchedule={canSchedule} />)}</ul> : <EmptyState title="Queue is clear" />}</>;
}

function InspectionRow({ project, inspection, people, leave, canSchedule }: { project: ProjectSummary; inspection: Inspection | null; people: Person[]; leave: LeaveEntry[]; canSchedule: boolean }) {
  const [scheduling, setScheduling] = useState(false);
  const assigned = people.find((person) => person.id === inspection?.inspectorId);
  return <li className="px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-3"><Link href={`/projects/${project.id}/qa`} className="min-w-0 flex-1 hover:text-primary"><p className="truncate text-sm font-bold">{project.title}</p><p className="truncate text-xs text-muted-foreground">{project.customerName}{inspection?.scheduledFor ? ` · QA ${inspection.scheduledFor.slice(0, 10)}` : " · Not scheduled"}{assigned ? ` · ${assigned.name}` : ""}</p></Link><div className="flex items-center gap-2"><StatusBadge status={project.status} />{canSchedule ? <Button type="button" size="sm" variant={inspection?.scheduledFor ? "secondary" : "primary"} onClick={() => setScheduling((current) => !current)}>{inspection?.scheduledFor ? <Pencil className="size-3.5" /> : <CalendarPlus className="size-3.5" />}{inspection?.scheduledFor ? "Reschedule" : "Schedule QA"}</Button> : null}</div></div>{scheduling ? <QaScheduleForm project={project} inspection={inspection} people={people} leave={leave} onClose={() => setScheduling(false)} /> : null}</li>;
}

function QaScheduleForm({ project, inspection, people, leave, onClose }: { project: ProjectSummary; inspection: Inspection | null; people: Person[]; leave: LeaveEntry[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(scheduleQaInspection, initial);
  const [date, setDate] = useState(inspection?.scheduledFor?.slice(0, 10) ?? today());
  return <form action={action} className="mt-3 grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]"><input type="hidden" name="inspectionId" value={inspection?.id ?? ""} /><input type="hidden" name="projectId" value={project.id} /><label><span className="mb-1 block text-xs font-bold text-muted-foreground">Inspector</span><select name="inspectorId" required defaultValue={inspection?.inspectorId ?? ""} className={inputClass}><option value="" disabled>Select person…</option>{people.map((person) => { const unavailable = unavailableOn(leave, person.id, date); return <option key={person.id} value={person.id} disabled={Boolean(unavailable)}>{person.name}{unavailable ? ` — unavailable (${unavailable.type.replaceAll("_", " ")})` : ""}</option>; })}</select></label><label><span className="mb-1 block text-xs font-bold text-muted-foreground">QA date</span><input name="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required className={inputClass} /></label><div className="flex items-end gap-2"><Button type="submit" size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : "Add to calendar"}</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div><p className="sm:col-span-3 text-xs text-muted-foreground">Unavailable people are shown but cannot be selected. This creates one QA entry on their calendar.</p>{state.message ? <p className={`sm:col-span-3 text-xs ${state.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>{state.message}</p> : null}</form>;
}

function unavailableOn(leave: LeaveEntry[], userId: string, date: string) { return leave.find((entry) => entry.userId === userId && entry.status !== "cancelled" && entry.status !== "declined" && date >= availabilityDate(entry.startsAt) && date <= availabilityDate(entry.endsAt)); }
function availabilityDate(value: string) { if (value.length === 10) return value; const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
