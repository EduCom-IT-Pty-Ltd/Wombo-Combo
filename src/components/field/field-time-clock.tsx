"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CirclePause, Play, Square } from "lucide-react";
import { clockOff, clockOn, toggleClockPause } from "@/app/actions/field";
import { entryHours } from "@/lib/domain/costing";
import type { TimeEntry } from "@/lib/data/types";
import { Button, Card, CardHeader } from "@/components/ui";
import { formatTime } from "@/lib/utils";

const BREAK_OPTIONS = [0, 15, 30, 45, 60];

/** Mobile-first personal clock. The project tabs sit immediately below it. */
export function FieldTimeClock({ projectId, openEntry }: { projectId: string; openEntry: TimeEntry | null }) {
  return <ClockPanel projectId={projectId} entry={openEntry} />;
}

function ClockPanel({ projectId, entry }: { projectId: string; entry: TimeEntry | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(interval); }, []);
  const elapsed = entry ? entryHours(new Date(entry.startedAt), entry.endedAt ? new Date(entry.endedAt) : new Date(now), entry.breakMinutes) : 0;
  const paused = Boolean(entry?.pausedAt);
  function run(action: () => Promise<{ ok: boolean; message: string }>) { startTransition(async () => { const result = await action(); if (result.ok) router.refresh(); }); }

  return <Card className="overflow-hidden"><CardHeader title="Time clock" description={entry ? paused ? "On site, paused" : "On site, checked in" : "On site, not checked in"} /><div className="space-y-4 p-4 sm:p-5"><div className={`rounded-xl border p-4 text-center ${entry ? paused ? "border-amber-400/50 bg-amber-400/10" : "border-emerald-500/40 bg-emerald-500/10" : "border-border-strong bg-surface-muted"}`}><p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">{entry ? paused ? "On site, paused" : "On site, checked in" : "On site, not checked in"}</p><p className="mt-1 text-4xl font-bold tabular-nums">{entry ? formatHours(elapsed) : "0h 00m"}</p>{entry ? <p className="mt-1 text-sm text-muted-foreground">Started {formatTime(entry.startedAt)} · {entry.breakMinutes}m break</p> : <p className="mt-1 text-sm text-muted-foreground">Check in when you arrive on site.</p>}</div>{entry ? <><div className="grid grid-cols-2 gap-2"><Button size="lg" variant={paused ? "primary" : "secondary"} disabled={pending} onClick={() => run(() => toggleClockPause({ entryId: entry.id }))}>{paused ? <Play className="size-5" /> : <CirclePause className="size-5" />}{paused ? "Resume" : "Pause"}</Button><Button size="lg" variant="danger" disabled={pending} onClick={() => run(() => clockOff({ entryId: entry.id, breakMinutes }))}><Square className="size-5" /> Check out</Button></div><div><p className="mb-2 text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">Additional break</p><div className="grid grid-cols-5 gap-1.5">{BREAK_OPTIONS.map((minutes) => <button key={minutes} type="button" onClick={() => setBreakMinutes(minutes)} aria-pressed={breakMinutes === minutes} className={`h-11 rounded-lg border text-sm font-bold ${breakMinutes === minutes ? "border-primary bg-primary-muted text-primary" : "border-border-strong text-muted-foreground"}`}>{minutes === 0 ? "None" : `${minutes}m`}</button>)}</div></div></> : <Button size="lg" variant="primary" className="w-full" disabled={pending} onClick={() => run(() => clockOn({ projectId }))}><Play className="size-5" /> Check in</Button>}</div></Card>;
}

function formatHours(hours: number) { const totalMinutes = Math.max(0, Math.round(hours * 60)); return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`; }
