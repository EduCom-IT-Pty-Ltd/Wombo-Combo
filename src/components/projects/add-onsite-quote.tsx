"use client";

import { useActionState, useState } from "react";
import { CalendarPlus, X } from "lucide-react";
import { addSchedulePhase, type SchedulePhaseActionState } from "@/app/actions/schedule-phases";
import { Button } from "@/components/ui";
import type { Person } from "@/lib/data/types";

const initial: SchedulePhaseActionState = { ok: false };
const inputClass = "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground";

export function AddOnsiteQuote({ projectId, people }: { projectId: string; people: Person[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addSchedulePhase, initial);
  return <><Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}><CalendarPlus className="size-4" /> Add onsite quote</Button>{open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Add onsite quote"><form action={action} className="w-full max-w-md overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"><div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4"><div><h2 className="text-base font-bold">Add onsite quote</h2><p className="mt-0.5 text-sm text-muted-foreground">This will appear on the calendar for the selected user.</p></div><Button type="button" size="sm" variant="ghost" aria-label="Close" onClick={() => setOpen(false)}><X className="size-4" /></Button></div><div className="space-y-4 p-5"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="title" value="Onsite quote" /><label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Date</span><input required name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} /></label><label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Assigned user</span><select required name="userId" defaultValue="" className={inputClass}><option value="" disabled>Select user…</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Notes</span><input name="description" placeholder="Optional quote visit details" className={inputClass} /></label></div><div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-5 py-4"><Button type="submit" variant="primary" disabled={pending}>{pending ? "Adding…" : "Add to calendar"}</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>{state.message ? <p className={`text-xs ${state.ok ? "text-[var(--tone-emerald-fg)]" : "text-[var(--tone-rose-fg)]"}`}>{state.message}</p> : null}</div></form></div> : null}</>;
}
