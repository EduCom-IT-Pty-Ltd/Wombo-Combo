"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

/** Kept in the global header so a crew member can always return to their clock. */
export function ActiveShiftLink({ projectId, projectTitle, startedAt, paused }: { projectId: string; projectTitle: string; startedAt: string; paused: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);
  const minutes = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000));
  return <Link href={`/field/${projectId}`} className="active-shift-link inline-flex h-10 min-w-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-white shadow-sm" title={`Return to ${projectTitle} time clock`}><Clock3 className="size-4 shrink-0" /><span className="hidden sm:inline">{paused ? "Paused" : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`}</span></Link>;
}
