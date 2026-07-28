"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { transitionProject } from "@/app/actions/projects";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui";
import type { ProjectSummary } from "@/lib/data/types";
import type { ProjectStatus } from "@/lib/domain/status";
import type { StatusSetting } from "@/lib/domain/status-settings";
import { formatRelative, cn } from "@/lib/utils";

type PendingMove = { project: ProjectSummary; target: StatusSetting };

/**
 * The board deliberately keeps its tile markup and normal visual treatment
 * unchanged. Dragging is an extra interaction layer: a drop only proposes a
 * status change and cannot update a project until it is confirmed.
 */
export function ActiveProjectBoard({ projects, statusSettings, canTransition }: { projects: ProjectSummary[]; statusSettings: StatusSetting[]; canTransition: boolean }) {
  const router = useRouter();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<ProjectStatus | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const flow = [...statusSettings].filter((setting) => setting.inProgressFlow).sort((a, b) => a.position - b.position);
  const known = new Set(flow.map((setting) => setting.status));
  const unknownStatuses = [...new Set(projects.filter((project) => !known.has(project.status)).map((project) => project.status))];
  const sections = [
    ...flow.map((setting) => ({ ...setting, projects: projects.filter((project) => project.status === setting.status), canDrop: true })),
    ...unknownStatuses.map((status) => ({ status, label: status.replaceAll("_", " "), color: "#64748b", position: flow.length + 1, inProgressFlow: true, projects: projects.filter((project) => project.status === status), canDrop: false })),
  ];

  function requestDrop(target: StatusSetting, projectId: string) {
    setOverStatus(null);
    setDraggingId(null);
    const project = projects.find((item) => item.id === projectId);
    if (!project || project.status === target.status) return;
    setError(null);
    setPendingMove({ project, target });
  }

  function confirmMove(completeSkipped: boolean) {
    if (!pendingMove) return;
    startTransition(async () => {
      const result = await transitionProject({
        projectId: pendingMove.project.id,
        to: pendingMove.target.status,
        confirmJump: true,
        completeSkipped,
        overrideReason: "Project board drag confirmed",
      });
      if (result.ok) {
        setPendingMove(null);
        router.refresh();
      } else setError(result.message);
    });
  }

  return <>
    <div className="space-y-7">
      {sections.map((section) => <section
        key={section.status}
        onDragOver={section.canDrop && canTransition ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOverStatus(section.status); } : undefined}
        onDragLeave={section.canDrop ? () => setOverStatus((current) => current === section.status ? null : current) : undefined}
        onDrop={section.canDrop && canTransition ? (event) => { event.preventDefault(); requestDrop(section, event.dataTransfer.getData("text/project-id")); } : undefined}
        className={cn("rounded-xl", overStatus === section.status && "ring-2 ring-primary/70 ring-offset-2 ring-offset-background")}
      >
        <div className="mb-3 flex items-center gap-2"><StatusBadge status={section.status} /><span className="text-xs font-bold text-muted-foreground">{section.projects.length}</span><span className="h-px flex-1 bg-border-subtle" /></div>
        <div className="grid min-h-24 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {section.projects.map((project) => <ActiveProjectTile key={project.id} project={project} color={section.color} draggable={canTransition} onDragStart={() => setDraggingId(project.id)} onDragEnd={() => { setDraggingId(null); setOverStatus(null); }} dragging={draggingId === project.id} />)}
          {section.projects.length === 0 ? <div className="col-span-full" aria-hidden="true" /> : null}
        </div>
      </section>)}
    </div>
    {pendingMove ? <BoardMoveDialog move={pendingMove} flow={flow} pending={pending} error={error} onConfirm={confirmMove} onCancel={() => { if (!pending) { setPendingMove(null); setError(null); } }} /> : null}
  </>;
}

function ActiveProjectTile({ project, color, draggable, dragging, onDragStart, onDragEnd }: { project: ProjectSummary; color: string; draggable: boolean; dragging: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  return <Link href={`/projects/${project.id}`} draggable={draggable} onDragStart={(event) => { event.dataTransfer.setData("text/project-id", project.id); event.dataTransfer.effectAllowed = "move"; onDragStart(); }} onDragEnd={onDragEnd} className={cn("active-project-tile-pop group relative flex aspect-square flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface p-4 shadow-sm transition-all", dragging && "opacity-50")}><span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: color }} /><div className="flex items-start justify-between gap-2"><span className="font-mono text-[11px] text-muted-foreground">{project.projectNumber}</span><ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div><div className="mt-4"><p className="line-clamp-3 text-base font-bold leading-snug">{project.title}</p><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{project.customerName}</p></div><div className="mt-auto border-t border-border-subtle pt-3"><span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><Clock3 className="size-3" />{formatRelative(project.updatedAt)}</span></div></Link>;
}

function BoardMoveDialog({ move, flow, pending, error, onConfirm, onCancel }: { move: PendingMove; flow: StatusSetting[]; pending: boolean; error: string | null; onConfirm: (completeSkipped: boolean) => void; onCancel: () => void }) {
  const [completeSkipped, setCompleteSkipped] = useState(false);
  const currentIndex = flow.findIndex((setting) => setting.status === move.project.status);
  const targetIndex = flow.findIndex((setting) => setting.status === move.target.status);
  const direction = targetIndex < currentIndex ? "backward" : targetIndex > currentIndex + 1 ? "skip" : "forward";
  const skipped = direction === "skip" ? flow.slice(currentIndex, targetIndex).map((setting) => setting.label) : [];
  const message = direction === "backward"
    ? "This moves the project backward. Its earlier checklist history, completed tasks and saved details will remain available."
    : direction === "skip"
      ? `This skips ${skipped.length} ${skipped.length === 1 ? "stage" : "stages"}: ${skipped.join(", ")}.`
      : "This moves the project to the next stage. Any incomplete tasks remain open.";
  return createPortal(<><button type="button" aria-label="Close confirmation" onClick={onCancel} disabled={pending} className="fixed inset-0 z-40 bg-black/45" /><div role="dialog" aria-modal="true" aria-labelledby="board-move-title" className="fixed top-1/2 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-primary bg-surface p-5 shadow-2xl"><p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">Confirm status change</p><h2 id="board-move-title" className="mt-1 text-lg font-bold">Move {move.project.title} to {move.target.label}?</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>{direction === "skip" ? <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border-strong bg-surface-muted px-3 py-2.5"><input type="checkbox" checked={completeSkipped} onChange={(event) => setCompleteSkipped(event.target.checked)} className="size-5 shrink-0 accent-[var(--primary)]" /><span className="text-sm font-semibold">Mark skipped-stage checklist tasks complete</span></label> : null}{error ? <p className="mt-3 text-sm font-semibold text-[var(--tone-rose-fg)]">{error}</p> : null}<div className="mt-5 flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button><Button size="sm" variant="primary" disabled={pending} onClick={() => onConfirm(completeSkipped)}>Confirm move</Button></div></div></>, document.body);
}
