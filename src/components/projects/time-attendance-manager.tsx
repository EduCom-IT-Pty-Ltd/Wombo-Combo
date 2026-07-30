"use client";

import { useActionState, useState, useTransition } from "react";
import { Clock3, Pencil, Plus, Trash2 } from "lucide-react";
import { addAttendanceEntry, deleteAttendanceEntry, type AttendanceActionState, updateAttendanceEntry } from "@/app/actions/attendance";
import { Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { entryHours } from "@/lib/domain/costing";
import type { Person, TimeEntry } from "@/lib/data/types";
import { formatDate, formatTime } from "@/lib/utils";

const initial: AttendanceActionState = { ok: false };
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground";

export function TimeAttendanceManager({ projectId, entries, people, canManage }: { projectId: string; entries: TimeEntry[]; people: Person[]; canManage: boolean }) {
  const [adding, setAdding] = useState(false);
  const sorted = [...entries].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return <Card><CardHeader title="Time & attendance" description="Field clock entries and office adjustments. Completed entries feed straight into labour costing." action={canManage ? <Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus className="size-4" /> Add attendance</Button> : null} />{adding ? <AttendanceForm projectId={projectId} people={people} onClose={() => setAdding(false)} /> : null}{sorted.length ? <div className="divide-y divide-border-subtle">{sorted.map((entry) => <AttendanceRow key={entry.id} entry={entry} projectId={projectId} people={people} canManage={canManage} />)}</div> : <EmptyState title="No attendance recorded" description={canManage ? "Add a clock-in and clock-out to record time manually." : "No one has clocked time against this project yet."} />}</Card>;
}

function AttendanceRow({ entry, projectId, people, canManage }: { entry: TimeEntry; projectId: string; people: Person[]; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [deleting, startTransition] = useTransition();
  const person = people.find((item) => item.id === entry.userId);
  const hours = entryHours(new Date(entry.startedAt), entry.endedAt ? new Date(entry.endedAt) : new Date(), entry.breakMinutes);
  if (editing) return <AttendanceForm projectId={projectId} people={people} entry={entry} onClose={() => setEditing(false)} />;
  return <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{person?.name ?? "Unknown employee"}</p>{entry.endedAt ? <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{hours.toFixed(1)}h</span> : <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600">On site</span>}</div><p className="mt-1 text-sm text-muted-foreground">{formatDate(entry.startedAt, true)} · {formatTime(entry.startedAt)} – {entry.endedAt ? formatTime(entry.endedAt) : "currently clocked in"}{entry.breakMinutes ? ` · ${entry.breakMinutes}m paused` : ""}</p>{entry.notes ? <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p> : null}</div>{canManage ? <div className="flex gap-2"><Button type="button" size="sm" onClick={() => setEditing(true)}><Pencil className="size-3.5" /> Edit</Button><Button type="button" size="sm" variant="danger" disabled={deleting} onClick={() => { if (window.confirm("Delete this attendance entry? This will update labour costing.")) startTransition(async () => { await deleteAttendanceEntry(entry.id); }); }}><Trash2 className="size-3.5" /> Delete</Button></div> : null}</div>;
}

function AttendanceForm({ projectId, people, entry, onClose }: { projectId: string; people: Person[]; entry?: TimeEntry; onClose: () => void }) {
  const [state, action, pending] = useActionState(entry ? updateAttendanceEntry : addAttendanceEntry, initial);
  const start = toLocalParts(entry?.startedAt ?? new Date().toISOString());
  const end = toLocalParts(entry?.endedAt ?? new Date().toISOString());
  return <form action={action} className="space-y-3 border-b border-border-subtle bg-surface-muted p-4"><input type="hidden" name="projectId" value={projectId} />{entry ? <input type="hidden" name="entryId" value={entry.id} /> : null}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label><span className="mb-1 block text-xs font-medium text-muted-foreground">Employee</span><select required name="userId" defaultValue={entry?.userId ?? ""} className={inputClass}><option value="" disabled>Select employee…</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label><span className="mb-1 block text-xs font-medium text-muted-foreground">Work date</span><input required name="date" type="date" defaultValue={start.date} className={inputClass} /></label><label><span className="mb-1 block text-xs font-medium text-muted-foreground">Clock in</span><input required name="startedTime" type="time" defaultValue={start.time} className={inputClass} /></label><label><span className="mb-1 block text-xs font-medium text-muted-foreground">Clock out</span><input required name="endedTime" type="time" defaultValue={end.time} className={inputClass} /></label></div><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]"><label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Note <span className="font-normal">(optional)</span></span><input name="notes" defaultValue={entry?.notes ?? ""} maxLength={500} placeholder="Manual adjustment, timesheet reference…" className={inputClass} /></label><label><span className="mb-1 block text-xs font-medium text-muted-foreground">Paused minutes</span><input name="breakMinutes" type="number" min="0" max="480" defaultValue={entry?.breakMinutes ?? 0} className={inputClass} /></label></div><div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" variant="primary" disabled={pending}><Clock3 className="size-3.5" />{pending ? "Saving…" : entry ? "Save attendance" : "Add attendance"}</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>{state.message ? <p className={`text-xs ${state.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>{state.message}</p> : null}</div></form>;
}

function toLocalParts(value: string) { const date = new Date(value); const pad = (number: number) => String(number).padStart(2, "0"); return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` }; }
