"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { PROJECT_STATUSES } from "@/lib/db/schema/enums";
import { can } from "@/lib/domain/permissions";
import { checkTransition, type ProjectStatus } from "@/lib/domain/status";
import { runAutomations, type AutomationEffect, type AutomationTrigger } from "@/lib/domain/automation";
import { buildTransitionContext, getProject } from "@/lib/data/repository";
import { forgetReads } from "@/lib/data/request-scope";
import { applyLocalAutomationEffect, completeWorkflowTasksThrough, persistLocalTransition, saveLocalWorkflowFieldValues, setLocalWorkflowTaskComplete } from "@/lib/data/local-store";
import { hasDatabase } from "@/lib/db";
import * as pgWorkflow from "@/lib/data/pg/workflow";
import * as pgSettings from "@/lib/data/pg/settings";
import { getStatusSettings, getStatusTaskTemplates, listWorkflowTasks } from "@/lib/data/repository";

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

  if (check.warnings.length > 0 && !can(session.role, "project.transition.override", session.permissionOverrides)) {
    return {
      ok: false,
      message: "Your role cannot override these requirements",
      warnings: check.warnings.map((w) => w.requirement),
    };
  }

  const moved = await persistTransition({
    orgId: session.org.id,
    projectId,
    from: project.status,
    to,
    actorUserId: session.user.id,
    overrideReason,
  });

  // The write is conditional on the project still being in the status we
  // validated against. If it is not, someone else moved it while this request
  // was in flight — report that rather than claiming a move that did not happen.
  if (!moved) {
    return { ok: false, message: "Someone else changed this project's status. Reload and try again." };
  }

  // The tick-box on the jump dialog, applied only once the jump has actually
  // happened. Doing it before the write meant a move that was then refused —
  // for want of the override permission, or because someone else had already
  // moved the project — still closed every checklist it claimed to be skipping.
  //
  // Reported rather than thrown: the move is already committed, so failing the
  // whole action would show an error for something that did work, and the
  // checklists can be ticked by hand.
  let checklistWarning: string | null = null;
  if (confirmJump && completeSkipped) {
    try {
      await completeSkippedChecklists(session.org.id, projectId, to);
    } catch (error) {
      console.error("[projects] closing skipped checklists failed", error);
      checklistWarning = " The earlier checklists could not be ticked off — do it by hand.";
    }
  }

  // Automations run only after the transition has committed. A rule that reads
  // the project must see the new status, and a rule that fails must not be able
  // to leave the status unwritten.
  //
  // Reads are deduplicated per request, and this request already read the
  // project — at its old status. Dropping that is what makes the guarantee above
  // true rather than merely intended.
  forgetReads();
  const trigger = triggerForStatus(to, projectId);
  if (trigger) {
    await runAutomations(trigger, (effect, firedBy) => executeEffect(effect, firedBy, session.org.id));
  }

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/");

  return { ok: true, message: `Moved to ${to.replaceAll("_", " ")}${checklistWarning ?? ""}` };
}

export async function setWorkflowTaskComplete(input: { projectId: string; templateId: string; complete: boolean; completedAt?: string }): Promise<ActionResult> {
  await requireCapability("project.edit");
  if (!input.projectId || !input.templateId || (input.completedAt && Number.isNaN(new Date(input.completedAt).getTime()))) return { ok: false, message: "Invalid workflow task" };
  if (hasDatabase) {
    const session = await requireCapability("project.edit");
    const project = await getProject(session.org.id, input.projectId);
    if (!project) return { ok: false, message: "Project not found" };

    // The title comes from the template, not the client: a checklist row is
    // identified by its template id, and letting the caller supply the text
    // would let two people record different names for the same item.
    const template = (await listWorkflowTasks(session.org.id, input.projectId, project.status)).find(
      (task) => task.workflowTemplateId === input.templateId,
    );
    if (!template) return { ok: false, message: "That checklist item is no longer part of this stage." };

    await pgSettings.setWorkflowTaskComplete(session.org.id, {
      projectId: input.projectId,
      templateId: input.templateId,
      title: template.title,
      status: project.status,
      complete: input.complete,
      completedAt: input.completedAt ? new Date(input.completedAt) : undefined,
    });
    revalidatePath(`/projects/${input.projectId}`, "layout");
    return { ok: true, message: input.complete ? "Task completed" : "Task reopened" };
  }

  await setLocalWorkflowTaskComplete(input);
  revalidatePath(`/projects/${input.projectId}`, "layout");
  return { ok: true, message: input.complete ? "Task completed" : "Task reopened" };
}

export async function saveWorkflowFieldValues(input: { projectId: string; values: Array<{ templateId: string; value: string }> }): Promise<ActionResult> {
  await requireCapability("project.edit");
  if (!input.projectId || !Array.isArray(input.values) || input.values.some((value) => !value.templateId || value.value.length > 500)) return { ok: false, message: "Invalid project details" };
  if (hasDatabase) {
    const session = await requireCapability("project.edit");
    await pgSettings.saveWorkflowFieldValues(session.org.id, input.projectId, input.values);
    revalidatePath(`/projects/${input.projectId}`, "layout");
    return { ok: true, message: "Project details saved" };
  }

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
}): Promise<boolean> {
  if (hasDatabase) return pgWorkflow.persistTransition(args);
  await persistLocalTransition(args);
  return true;
}

/**
 * Close every checklist item belonging to the stages `target` was jumped over.
 *
 * Works from the templates rather than from the rows that exist, because an
 * untouched checklist item has no row yet — and an untouched checklist is
 * precisely what a project skipping four stages is carrying.
 */
async function completeSkippedChecklists(orgId: string, projectId: string, target: ProjectStatus): Promise<void> {
  if (!hasDatabase) {
    await completeWorkflowTasksThrough(projectId, target);
    return;
  }

  const flow = (await getStatusSettings(orgId))
    .filter((setting) => setting.inProgressFlow)
    .sort((a, b) => a.position - b.position);
  const targetIndex = flow.findIndex((setting) => setting.status === target);
  if (targetIndex < 1) return;

  const skipped = new Set(flow.slice(0, targetIndex).map((setting) => setting.status));
  const templates = (await getStatusTaskTemplates(orgId)).filter((template) => skipped.has(template.status));
  await pgSettings.completeWorkflowTasks(orgId, projectId, templates);
}

/**
 * Applies one automation effect.
 *
 * Effects that depend on unported slices are recorded on the timeline rather
 * than thrown away or thrown on. Throwing would abort the remaining effects of
 * a transition that has already committed; silence would leave no trace that
 * something the workflow promised did not happen. An event says plainly what
 * was skipped and why.
 */
async function executeEffect(effect: AutomationEffect, trigger: AutomationTrigger, orgId: string) {
  if (!hasDatabase) {
    await applyLocalAutomationEffect(effect, trigger);
    return;
  }

  const projectId = trigger.projectId;

  switch (effect.type) {
    case "create_task":
      await pgWorkflow.createAutomationTask({
        orgId,
        projectId,
        title: effect.title,
        kind: effect.kind,
        dueInDays: effect.dueInDays,
        automationId: `${trigger.kind}:${effect.title}`,
      });
      return;

    case "assign_project_number":
      // Allocated at creation; nothing to do on a later trigger.
      return;

    case "create_document_folder":
      await pgWorkflow.recordEvent({
        orgId,
        projectId,
        type: "automation.pending",
        summary: "SharePoint folder provisioning is not wired to project creation yet.",
        payload: { effect: effect.type, trigger: trigger.kind },
      });
      return;

    default:
      await pgWorkflow.recordEvent({
        orgId,
        projectId,
        type: "automation.pending",
        summary: `Automation "${effect.type}" is not implemented against the database yet.`,
        payload: { effect: effect.type, trigger: trigger.kind },
      });
  }
}
