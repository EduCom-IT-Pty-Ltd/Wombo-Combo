import Link from "next/link";
import { Clock3 } from "lucide-react";
import { fieldUserId, getSession } from "@/lib/auth/session";
import { entryHours } from "@/lib/domain/costing";
import { getOpenTimeEntry, listPeople, listSchedulePhases, listTimeEntries } from "@/lib/data/repository";
import { Stat } from "@/components/ui";
import { PhaseCalendar } from "@/components/schedule/calendar";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "My Field Schedule" };

/** The crew's personal calendar — it intentionally contains only their Call-Ups. */
export default async function FieldPage() {
  const session = await getSession();
  const userId = fieldUserId(session);
  const [people, phases, entries, openEntry] = await Promise.all([
    listPeople(session.org.id),
    listSchedulePhases(session.org.id, { userId }),
    listTimeEntries(session.org.id, { userId }),
    getOpenTimeEntry(session.org.id, userId),
  ]);
  const me = people.find((person) => person.id === userId);
  const today = new Date();
  const hoursToday = entries.filter((entry) => entry.startedAt >= new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()).reduce((sum, entry) => sum + entryHours(new Date(entry.startedAt), entry.endedAt ? new Date(entry.endedAt) : new Date(), entry.breakMinutes), 0);

  return <div className="space-y-4"><div><h1 className="text-2xl font-bold tracking-tight">My field schedule</h1><p className="mt-1 text-sm text-muted-foreground">{formatDate(today, true)} · {me?.name ?? "Crew member"}</p></div><div className="grid grid-cols-2 gap-3"><Stat label="Today" value={`${hoursToday.toFixed(1)}h`} hint="Time logged" /><Stat label="Call-Ups" value={phases.length} hint="Assigned to you" /></div>{openEntry ? <Link href={`/field/${openEntry.projectId}`} className="flex min-h-14 items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 transition-colors hover:bg-emerald-500/15"><Clock3 className="size-5 text-emerald-600" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold">On site, checked in</span><span className="text-xs text-muted-foreground">Tap to return to the time clock</span></span><span className="text-xs font-bold text-emerald-700">Open</span></Link> : null}<PhaseCalendar phases={phases} people={me ? [me] : []} mode="field" title="My calendar" description="Your assigned project Call-Ups. Tap one to open its field job." onSiteProjectId={openEntry?.projectId} /></div>;
}
