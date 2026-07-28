"use client";

import { type ProjectStatus } from "@/lib/domain/status";
import { useStatusSettings } from "@/components/status-settings-provider";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/data/types";
import type { WorkflowField } from "@/lib/data/types";
import { saveWorkflowFieldValues, setWorkflowTaskComplete, transitionProject } from "@/app/actions/projects";
import { Button } from "@/components/ui";
import { type CSSProperties, useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";

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
 * PROJECT WORKFLOW VISUAL CONTRACT
 *
 * This is the primary project interaction surface: coloured status tiles,
 * a clear Current indicator, and green radio-tick checklist controls. Do not
 * change its visual hierarchy or control styling unless the user explicitly
 * asks to change this workflow UI. Settings may change labels, colours, tasks
 * and order only.
 */
export function StatusStepper({ status, projectId, tasks, fields, canEdit }: { status: ProjectStatus; projectId?: string; tasks?: Task[]; fields?: WorkflowField[]; canEdit?: boolean }) {
  const { flow: configuredFlow, settingFor, settings } = useStatusSettings();
  // A project can retain a legacy/deleted stage. Keep the complete workflow
  // UI available for it instead of falling back to an unstyled status label.
  const currentSetting = settingFor(status);
  const flow = configuredFlow.some((setting) => setting.status === status)
    ? configuredFlow
    : [...configuredFlow, { status, label: currentSetting?.label ?? status.replaceAll("_", " "), color: currentSetting?.color ?? "#64748b", position: configuredFlow.length + 1, inProgressFlow: true }];
  const index = flow.findIndex((setting) => setting.status === status);
  const offPipeline = index === -1;
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<ProjectStatus | null>(null);
  const [editingTimestamp, setEditingTimestamp] = useState<string | null>(null);
  const [timestampValue, setTimestampValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => Object.fromEntries((fields ?? []).map((field) => [field.id, field.value])));
  const router = useRouter();
  const incomplete = (tasks ?? []).filter((task) => task.status !== "done" && task.status !== "cancelled");
  const next = index >= 0 ? flow[index + 1] : undefined;

  const offRampStatuses = settings.filter((setting) => setting.status === "lost" || setting.status === "cancelled");

  function completeTask(task: Task, complete: boolean, completedAt?: string) {
    if (!projectId || !task.workflowTemplateId) {
      setActionError("This checklist item is not connected to a saved workflow task.");
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const result = await setWorkflowTaskComplete({ projectId, templateId: task.workflowTemplateId!, complete, completedAt });
      if (result.ok) router.refresh();
      else setActionError(result.message);
    });
  }

  function beginTimestampEdit(task: Task) {
    setEditingTimestamp(task.id);
    setTimestampValue(toDateTimeLocal(task.completedAt));
  }

  function saveFields() {
    if (!projectId) return;
    startTransition(async () => {
      const result = await saveWorkflowFieldValues({ projectId, values: Object.entries(fieldValues).map(([templateId, value]) => ({ templateId, value })) });
      if (result.ok) router.refresh();
    });
  }

  function move(to: ProjectStatus, completeSkipped = false) {
    if (!projectId) return;
    setActionError(null);
    startTransition(async () => {
      const result = await transitionProject({ projectId, to, confirmJump: true, completeSkipped, overrideReason: "Workflow stage confirmed" });
      if (result.ok) {
        setConfirming(null);
        router.refresh();
      } else setActionError(result.message);
    });
  }

  const confirmingIndex = confirming ? flow.findIndex((setting) => setting.status === confirming) : -1;
  // Stages whose checklists a forward move would step over, current one included.
  // Naming them is the whole point: the person moving the job should see exactly
  // what is being left behind before deciding to tick it off.
  const skippedStages =
    confirming && !offPipeline && confirmingIndex > index ? flow.slice(index, confirmingIndex).map((setting) => setting.label) : [];

  return (
    <section className="rounded-xl border-2 border-border-strong bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">Project workflow</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight">{settingFor(status)?.label ?? "Current stage"}</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!offPipeline ? <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Stage {index + 1} of {flow.length}</span> : null}
          {offRampStatuses.map((setting) => <button key={setting.status} type="button" onClick={() => canEdit && setConfirming(setting.status)} disabled={!canEdit || pending} className="h-8 rounded-full border px-3 text-xs font-bold transition-colors enabled:hover:bg-surface-muted" style={{ borderColor: setting.color, color: setting.color }}>{setting.label}</button>)}
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="flex min-w-max items-start gap-1">
          {flow.map((setting, i) => {
            const completed = !offPipeline && i < index;
            const current = !offPipeline && i === index;
            const active = completed || current;
            return (
              <button
                key={setting.status}
                type="button"
                title={`Move to ${setting.label}`}
                onClick={() => canEdit && setting.status !== status && setConfirming(setting.status)}
                disabled={!canEdit || pending}
                className={cn(
                  "workflow-tile-glow relative flex w-24 shrink-0 flex-col overflow-hidden rounded-lg border text-left transition-all",
                  current ? "border-foreground shadow-md" : "border-border-subtle",
                  active ? "bg-surface" : "bg-surface-muted opacity-80",
                )}
                style={{ borderTopWidth: "6px", borderTopColor: active ? setting.color : "var(--border)", "--tile-accent": active ? setting.color : "var(--border)" } as CSSProperties}
              >
                <span className="flex min-h-[4.75rem] flex-1 flex-col justify-between p-2">
                  <span className={cn("line-clamp-2 text-xs leading-tight", active ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>{setting.label}</span>
                  {current ? <span className="mt-2 inline-flex w-fit rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase" style={{ backgroundColor: setting.color }}>Current</span> : completed ? <span className="mt-2 text-[10px] font-bold uppercase" style={{ color: setting.color }}>Complete</span> : <span className="mt-2 text-[10px] font-semibold text-muted-foreground uppercase">Upcoming</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {projectId && !offPipeline ? (
        <div className="mt-4 rounded-lg border border-border-strong bg-surface-muted p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">Stage checklist</p>
              <p className="mt-1 text-base font-bold">Complete these tasks to progress</p>
            </div>
            {next ? <Button size="md" variant="primary" disabled={!canEdit || pending} onClick={() => incomplete.length > 0 ? setConfirming(next.status) : move(next.status)}>Move to {next.label}</Button> : null}
          </div>

          {fields?.length ? <div className="mt-4 rounded-lg border border-border-strong bg-surface p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">Project details</p><p className="mt-0.5 text-sm font-semibold">Information required at this stage</p></div><Button size="sm" variant="secondary" disabled={!canEdit || pending} onClick={saveFields}>Save details</Button></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{fields.map((field) => <label key={field.id} className="block"><span className="mb-1 block text-xs font-bold text-muted-foreground">{field.label}</span><input value={fieldValues[field.id] ?? ""} onChange={(event) => setFieldValues((current) => ({ ...current, [field.id]: event.target.value }))} disabled={!canEdit || pending} className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground" placeholder={`Enter ${field.label.toLowerCase()}`} />{field.updatedAt ? <span className="mt-1 block text-[10px] text-muted-foreground">Updated {formatCompletionTime(field.updatedAt)}</span> : null}</label>)}</div></div> : null}
          {tasks?.length ? (
            <ul className="mt-4 space-y-2">
              {tasks.map((task) => {
                const done = task.status === "done";
                return (
                  <li key={task.id} className={cn("flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2.5", done ? "border-emerald-500/40 bg-emerald-500/10" : "border-border-strong bg-surface")}>
                    <button
                      type="button"
                      onClick={() => completeTask(task, !done)}
                      disabled={!canEdit || pending}
                      aria-label={`${done ? "Reopen" : "Complete"} ${task.title}`}
                      className="grid size-10 shrink-0 place-items-center rounded-full border-2 transition-colors enabled:hover:scale-105"
                      style={done ? { borderColor: "#22c55e", backgroundColor: "#22c55e", color: "#ffffff", boxShadow: "0 1px 3px rgb(34 197 94 / 0.35)" } : { borderColor: "#94a3b8", backgroundColor: "transparent", color: "transparent" }}
                    >
                      {done ? <Check className="task-check-pop size-5" strokeWidth={3} /> : null}
                    </button>
                    <span className={cn("min-w-0 flex-1 text-base font-semibold", done && "text-muted-foreground line-through")}>{task.title}</span>
                    <span className={done ? "text-right text-[11px] font-bold text-emerald-600" : "text-xs font-bold text-muted-foreground"}>
                      {done ? editingTimestamp === task.id ? <span className="flex items-center gap-1"><input type="datetime-local" value={timestampValue} onChange={(event) => setTimestampValue(event.target.value)} className="h-8 rounded border border-border-strong bg-surface px-1 text-[11px] text-foreground" /><button type="button" onClick={() => { completeTask(task, true, timestampValue); setEditingTimestamp(null); }} className="h-8 rounded bg-emerald-600 px-2 text-[10px] font-bold text-white">Save</button><button type="button" onClick={() => setEditingTimestamp(null)} aria-label="Cancel timestamp edit" className="grid size-8 place-items-center rounded border border-border-strong text-muted-foreground"><X className="size-3.5" /></button></span> : <><span>Done</span><span className="block text-[10px] font-medium text-muted-foreground">{formatCompletionTime(task.completedAt)}</span><button type="button" onClick={() => beginTimestampEdit(task)} className="mt-0.5 text-[10px] font-bold text-primary underline">Edit time</button></> : "To do"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-4 text-sm text-muted-foreground">No checklist tasks configured for this stage.</p>}
          {incomplete.length > 0 && next ? <p className="mt-3 text-sm font-medium text-muted-foreground">Mark every task complete to unlock the next stage.</p> : null}
          {actionError ? <p className="mt-3 text-sm font-semibold text-[var(--tone-rose-fg)]">{actionError}</p> : null}
        </div>
      ) : null}

      {confirming ? <StatusMoveDialog currentIndex={index} targetIndex={confirmingIndex} targetLabel={settingFor(confirming)?.label ?? confirming} incompleteTaskCount={incomplete.length} skippedStages={skippedStages} pending={pending} onConfirm={(completeSkipped) => move(confirming, completeSkipped)} onCancel={() => setConfirming(null)} /> : null}
    </section>
  );
}

/**
 * Moving forward never silently ticks off work that was not done. Any move that
 * would step over an open checklist offers it as an explicit, unticked choice,
 * and names the stages involved.
 */
function StatusMoveDialog({ currentIndex, targetIndex, targetLabel, incompleteTaskCount, skippedStages, pending, onConfirm, onCancel }: { currentIndex: number; targetIndex: number; targetLabel: string; incompleteTaskCount: number; skippedStages: string[]; pending: boolean; onConfirm: (completeSkipped: boolean) => void; onCancel: () => void }) {
  const [completeSkipped, setCompleteSkipped] = useState(false);
  const direction = targetIndex === -1 ? "off-ramp" : targetIndex < currentIndex ? "backward" : targetIndex > currentIndex + 1 ? "skip" : "forward";
  const message = direction === "backward"
    ? "This moves the project backward. Its previous checklist history and completion timestamps will remain available to review and edit."
    : direction === "off-ramp"
      ? "This marks the project as an off-ramp outcome. You can still review its workflow history."
      : direction === "skip"
        ? `This skips ${skippedStages.length} ${skippedStages.length === 1 ? "stage" : "stages"} — ${skippedStages.join(", ")}. Their checklist tasks stay open so you can come back and tick them off.`
        : incompleteTaskCount > 0
          ? `This stage still has ${incompleteTaskCount} incomplete ${incompleteTaskCount === 1 ? "task" : "tasks"}. They stay open after the move unless you tick the box below.`
          : "This moves the project forward to the next stage.";
  const offerComplete = (direction === "skip" || direction === "forward") && (skippedStages.length > 0 || incompleteTaskCount > 0);
  return <><button type="button" aria-label="Close confirmation" onClick={onCancel} className="fixed inset-0 z-40 bg-black/45" /><div role="dialog" aria-modal="true" aria-labelledby="move-status-title" className="fixed top-1/2 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-primary bg-surface p-5 shadow-2xl"><p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">Confirm status change</p><h3 id="move-status-title" className="mt-1 text-lg font-bold">Move to {targetLabel}?</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>{offerComplete ? <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border-strong bg-surface-muted px-3 py-2.5"><input type="checkbox" checked={completeSkipped} onChange={(event) => setCompleteSkipped(event.target.checked)} className="size-5 shrink-0 accent-[var(--primary)]" /><span className="text-sm font-semibold">Mark every checklist task before {targetLabel} as complete</span></label> : null}<div className="mt-5 flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button><Button size="sm" variant="primary" disabled={pending} onClick={() => onConfirm(completeSkipped)}>Confirm move</Button></div></div></>;
}

function formatCompletionTime(value: string | null | undefined) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function toDateTimeLocal(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
