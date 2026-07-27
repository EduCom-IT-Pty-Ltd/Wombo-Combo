"use client";

import { type ProjectStatus } from "@/lib/domain/status";
import { useStatusSettings } from "@/components/status-settings-provider";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/data/types";
import { setWorkflowTaskComplete, transitionProject } from "@/app/actions/projects";
import { Button } from "@/components/ui";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const { settingFor } = useStatusSettings();
  const setting = settingFor(status);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap text-white", className)} style={{ backgroundColor: setting?.color }}>
      {setting?.label ?? status.replaceAll("_", " ")}
    </span>
  );
}

/**
 * Compact pipeline stepper for the project header. Shows position without
 * listing all thirteen stages — on mobile there is no room, and on desktop the
 * full list is noise once you know where you are.
 */
export function StatusStepper({ status, projectId, tasks, canEdit }: { status: ProjectStatus; projectId?: string; tasks?: Task[]; canEdit?: boolean }) {
  const { flow, settingFor } = useStatusSettings();
  const index = flow.findIndex((setting) => setting.status === status);
  const offPipeline = index === -1;
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<ProjectStatus | null>(null);
  const incomplete = (tasks ?? []).filter((task) => task.status !== "done" && task.status !== "cancelled");
  const next = index >= 0 ? flow[index + 1] : undefined;

  function completeTask(task: Task, complete: boolean) {
    if (!projectId || !task.workflowTemplateId) return;
    startTransition(async () => { await setWorkflowTaskComplete({ projectId, templateId: task.workflowTemplateId!, complete }); });
  }

  function move(to: ProjectStatus, jumping: boolean) {
    if (!projectId) return;
    startTransition(async () => {
      await transitionProject({ projectId, to, confirmJump: jumping, overrideReason: jumping ? "Workflow stage confirmed" : undefined });
      setConfirming(null);
    });
  }

  return (
    <div className="space-y-3">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-max items-start gap-1.5">
        {flow.map((setting, i) => (
          <button
            key={setting.status}
            type="button"
            title={`Move to ${setting.label}`}
            onClick={() => canEdit && setting.status !== status && setConfirming(setting.status)}
            disabled={!canEdit || pending}
            className={cn("group flex w-28 shrink-0 flex-col gap-1 rounded-[var(--radius)] p-1 text-left enabled:hover:bg-surface-muted disabled:cursor-default", !offPipeline && i === index && "ring-1 ring-border-strong")}
          >
            <span className={cn("h-2 w-full rounded-full", !offPipeline && i <= index ? "opacity-100" : "bg-surface-muted")} style={!offPipeline && i <= index ? { backgroundColor: setting.color } : undefined} />
            <span className={cn("line-clamp-2 text-center text-[10px] leading-tight", !offPipeline && i <= index ? "font-medium text-foreground" : "text-muted-foreground")}>{setting.label}</span>
          </button>
        ))}
      </div>
      </div>
      {projectId && !offPipeline ? <div className="rounded-[var(--radius)] border border-border-subtle bg-surface-muted px-3 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-medium text-muted-foreground">Current stage</p><p className="text-sm font-semibold">{settingFor(status)?.label}</p></div>{next ? <Button size="sm" variant="primary" disabled={!canEdit || pending || incomplete.length > 0} onClick={() => move(next.status, false)}>Move to {next.label}</Button> : null}</div>{tasks?.length ? <ul className="mt-2 divide-y divide-border-subtle">{tasks.map((task) => <li key={task.id} className="flex min-h-11 items-center justify-between gap-3 py-1.5"><button type="button" onClick={() => completeTask(task, task.status !== "done")} disabled={!canEdit || pending} aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`} className={cn("grid size-9 shrink-0 place-items-center rounded-full border transition-colors", task.status === "done" ? "border-[var(--tone-emerald-fg)] bg-[var(--tone-emerald-fg)] text-white" : "border-border-strong bg-surface text-transparent enabled:hover:border-[var(--tone-emerald-fg)]")}><Check className="size-5" strokeWidth={3} /></button><span className={cn("min-w-0 flex-1 text-sm", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</span><span className={task.status === "done" ? "text-xs font-medium text-[var(--tone-emerald-fg)]" : "text-xs text-muted-foreground"}>{task.status === "done" ? "Complete" : "To do"}</span></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No checklist tasks configured for this stage.</p>}{incomplete.length > 0 && next ? <p className="mt-2 text-xs text-muted-foreground">Complete the checklist to move to the next stage.</p> : null}</div> : null}
      {confirming ? <div role="dialog" aria-modal="true" className="rounded-[var(--radius)] border border-primary bg-surface p-4 shadow-lg"><p className="text-sm font-semibold">Move to {settingFor(confirming)?.label}?</p><p className="mt-1 text-xs text-muted-foreground">This confirms the status change and marks incomplete checklist tasks in skipped stages as complete. The change is recorded in project activity.</p><div className="mt-3 flex gap-2"><Button size="sm" variant="primary" disabled={pending} onClick={() => move(confirming, true)}>Confirm change</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>Cancel</Button></div></div> : null}
    </div>
  );
}
