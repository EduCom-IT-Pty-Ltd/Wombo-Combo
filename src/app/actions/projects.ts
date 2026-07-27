"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { PROJECT_STATUSES } from "@/lib/db/schema/enums";
import { can } from "@/lib/domain/permissions";
import { checkTransition, type ProjectStatus } from "@/lib/domain/status";
import { runAutomations, type AutomationEffect, type AutomationTrigger } from "@/lib/domain/automation";
import { buildTransitionContext, getProject } from "@/lib/data/repository";
import { isDemoMode } from "@/lib/db";

const transitionSchema = z.object({
  projectId: z.string().min(1),
  to: z.enum(PROJECT_STATUSES),
  /** Required when overriding a soft guard, recorded on the audit event. */
  overrideReason: z.string().trim().min(3).optional(),
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
  const { projectId, to, overrideReason } = parsed.data;

  const session = await requireCapability("project.transition");
  const project = await getProject(session.org.id, projectId);
  if (!project) return { ok: false, message: "Project not found" };

  const context = await buildTransitionContext(session.org.id, project);
  const check = checkTransition(project.status, to, context, project.heldFromStatus);

  if (check.reason) {
    return { ok: false, message: check.reason };
  }
  if (check.blockers.length > 0) {
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
    // Demo data is module-scoped and read-only; log the intent instead so the
    // flow is observable without pretending the write happened.
    console.info("[demo] transition", args);
    return;
  }
  throw new Error("Database writes are not wired up yet — set DATABASE_URL and implement persistTransition()");
}

/** Effect executor. Logs in demo mode; becomes real work once the DB is live. */
async function executeEffect(effect: AutomationEffect, trigger: AutomationTrigger) {
  if (isDemoMode) {
    console.info("[demo] automation effect", { trigger: trigger.kind, effect });
    return;
  }
  throw new Error(`Automation effect "${effect.type}" is not implemented yet`);
}
