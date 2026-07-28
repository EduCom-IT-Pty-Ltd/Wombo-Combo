"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { PROJECT_STATUSES } from "@/lib/db/schema/enums";
import { can } from "@/lib/domain/permissions";
import { checkTransition, type ProjectStatus } from "@/lib/domain/status";
import { runAutomations, type AutomationEffect, type AutomationTrigger } from "@/lib/domain/automation";
import { buildTransitionContext, getProject } from "@/lib/data/repository";
import { applyLocalAutomationEffect, completeWorkflowTasksThrough, persistLocalTransition, saveLocalWorkflowFieldValues, setLocalWorkflowTaskComplete } from "@/lib/data/local-store";
import { isDemoMode } from "@/lib/db";

const transitionSchema = z.object({
  projectId: z.string().min(1),
  to: z.enum(PROJECT_STATUSES),
  /** Required when overriding a soft guard, recorded on the audit event. */
  overrideReason: z.string().trim().min(3).optional(),
  /** Explicit confirmation from the workflow dialog permits a deliberate stage jump. */
  confirmJump: z.boolean().optional(),
  /**
   * Tick-box on that dialog. Off by default: skipping ahead does not imply the
   * work behind you was done, so the earlier checklists stay open unless the
   * person moving the project says otherwise.
   */
  completeSkipped: z.boolean().optional(),
});

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Unmet requirements, so the UI can list exactly what is missing. */
  blockers?: string[];
  warnings?: string[];
}

/**
 * The one way a project changes status. Validates the edge, evaluates the
 * guards, writes the audit event, then fires the matching automations.
 */
export async function transitionProject(input: unknown): Promise<ActionResult> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid request" };
  }
  const { projectId, to, overrideReason, confirmJump, completeSkipped } = parsed.data;

  const session = await requireCapability("project.transition");
  const project = await getProject(session.org.id, projectId);
  if (!project) return { ok: false, message: "Project not found" };

  const context = await buildTransitionContext(session.org.id, project);
  const check = checkTransition(project.status, to, context, project.heldFromStatus);

  if (check.reason && !confirmJump) {
    return { ok: false, message: check.reason };
  }
  if (check.blockers.length > 0 && !confirmJump) {
    return {
      ok: false,
      message: `Cannot move to this status yet`,
      blockers: check.blockers.map((b) => b.requirement),
    };
  }
  if (check.warnings.length > 0 && !overrideReason) {
    return {
      ok: false,
      message: "Confirm the override to continue",
      warnings: check.warnings.map((w) => w.requirement),
    };
  }

  if (confirmJump && completeSkipped) await completeWorkflowTasksThrough(projectId, to);
  if (check.warnings.length > 0 && !can(session.role, "project.transition.override")) {
    return {
      ok: false,
      message: "Your role cannot override these requirements",
      warnings: check.warnings.map((w) => w.requirement),
    };
  }

  // TODO(neon): wrap the status write + event insert in a single statement, then
  // dispatch automations after it commits.
  await persistTransition({
    orgId: session.org.id,
    projectId,
    from: project.status,
    to,
    actorUserId: session.user.id,
    overrideReason,
  });

  const trigger = triggerForStatus(to, projectId);
  if (trigger) {
    await runAutomations(trigger, executeEffect);
  }

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/");

  return { ok: true, message: `Moved to ${to.replaceAll("_", " ")}` };
}

export async function setWorkflowTaskComplete(input: { projectId: string; templateId: string; complete: boolean; completedAt?: string }): Promise<ActionResult> {
  await requireCapability("project.edit");
  if (!input.projectId || !input.templateId || (input.completedAt && Number.isNaN(new Date(input.completedAt).getTime()))) return { ok: false, message: "Invalid workflow task" };
  if (!isDemoMode) throw new Error("Workflow task updates are not implemented against the production database yet");
  await setLocalWorkflowTaskComplete(input);
  revalidatePath(`/projects/${input.projectId}`, "layout");
  return { ok: true, message: input.complete ? "Task completed" : "Task reopened" };
}

export async function saveWorkflowFieldValues(input: { projectId: string; values: Array<{ templateId: string; value: string }> }): Promise<ActionResult> {
  await requireCapability("project.edit");
  if (!input.projectId || !Array.isArray(input.values) || input.values.some((value) => !value.templateId || value.value.length > 500)) return { ok: false, message: "Invalid project details" };
  if (!isDemoMode) throw new Error("Workflow field updates are not implemented against the production database yet");
  await saveLocalWorkflowFieldValues(input.projectId, input.values);
  revalidatePath(`/projects/${input.projectId}`, "layout");
  return { ok: true, message: "Project details saved" };
}

/** Maps an entered status onto the automation trigger the spec attaches to it. */
function triggerForStatus(status: ProjectStatus, projectId: string): AutomationTrigger | null {
  switch (status) {
    case "scheduled":
      return { kind: "project.scheduled", projectId };
    case "installation_complete":
      return { kind: "installation.completed", projectId };
    default:
      return null;
  }
}

async function persistTransition(args: {
  orgId: string;
  projectId: string;
  from: ProjectStatus;
  to: ProjectStatus;
  actorUserId: string;
  overrideReason?: string;
}) {
  if (isDemoMode) {
    await persistLocalTransition(args);
    return;
  }
  throw new Error("Database writes are not wired up yet — set DATABASE_URL and implement persistTransition()");
}

/** Effect executor. Logs in demo mode; becomes real work once the DB is live. */
async function executeEffect(effect: AutomationEffect, trigger: AutomationTrigger) {
  if (isDemoMode) {
    await applyLocalAutomationEffect(effect, trigger);
    return;
  }
  throw new Error(`Automation effect "${effect.type}" is not implemented yet`);
}
