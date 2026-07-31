import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectEvents, projects, tasks } from "@/lib/db/schema/projects";
import type { ProjectStatus, TaskKind } from "@/lib/db/schema/enums";
import type { ProjectEvent } from "../types";

/**
 * Status transitions, the activity feed, and the automation effects that fire
 * off the back of them.
 *
 * `transitionProject` is the only place `projects.status` is written — the rule
 * that keeps guards, the audit trail and automations from being bypassed by a
 * stray update elsewhere.
 */

export async function listEvents(orgId: string, projectId: string): Promise<ProjectEvent[]> {
  const rows = await db()
    .select()
    .from(projectEvents)
    .where(and(eq(projectEvents.orgId, orgId), eq(projectEvents.projectId, projectId)))
    .orderBy(desc(projectEvents.occurredAt));

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    summary: row.summary,
    actorId: row.actorUserId,
    occurredAt: row.occurredAt.toISOString(),
  }));
}

/**
 * Write the new status and its audit event.
 *
 * The status update is guarded by `from` — it only applies if the row is still
 * in the status the caller validated against. Two people moving the same project
 * at once would otherwise both pass their guard checks and the second would
 * silently overwrite the first, leaving an audit trail claiming a transition
 * that never happened from a status the project was never in.
 *
 * Returns false when the guard did not match, so the caller can report the
 * conflict instead of announcing a move that did not occur.
 */
export async function persistTransition(args: {
  orgId: string;
  projectId: string;
  from: ProjectStatus;
  to: ProjectStatus;
  actorUserId: string | null;
  overrideReason?: string;
}): Promise<boolean> {
  const updated = await db()
    .update(projects)
    .set({
      status: args.to,
      updatedAt: new Date(),
      // Entering a hold records where to come back to; leaving one clears it.
      ...(args.to === "on_hold"
        ? { heldFromStatus: args.from }
        : args.from === "on_hold"
          ? { heldFromStatus: null }
          : {}),
      ...(args.to === "installation_complete" ? { installationCompletedAt: new Date() } : {}),
      ...(args.to === "closed" ? { closedAt: new Date() } : {}),
    })
    .where(and(eq(projects.orgId, args.orgId), eq(projects.id, args.projectId), eq(projects.status, args.from)))
    .returning({ id: projects.id });

  if (updated.length === 0) return false;

  await db().insert(projectEvents).values({
    orgId: args.orgId,
    projectId: args.projectId,
    type: "status.changed",
    summary: args.overrideReason
      ? `${label(args.from)} → ${label(args.to)} (override: ${args.overrideReason})`
      : `${label(args.from)} → ${label(args.to)}`,
    fromStatus: args.from,
    toStatus: args.to,
    actorUserId: args.actorUserId,
    payload: args.overrideReason ? { overrideReason: args.overrideReason } : {},
  });

  return true;
}

/** Records something that happened to a project without changing its status. */
export async function recordEvent(args: {
  orgId: string;
  projectId: string;
  type: string;
  summary: string;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await db().insert(projectEvents).values({
    orgId: args.orgId,
    projectId: args.projectId,
    type: args.type,
    summary: args.summary,
    // null actor means the automation engine rather than a person.
    actorUserId: args.actorUserId ?? null,
    payload: args.payload ?? {},
  });
}

/**
 * Create a task on behalf of an automation rule.
 *
 * `createdByAutomation` carries the rule id and is checked first, so re-entering
 * a status — which happens whenever someone moves a project back and forth —
 * does not stack up duplicate copies of the same checklist item.
 */
export async function createAutomationTask(args: {
  orgId: string;
  projectId: string;
  title: string;
  kind: TaskKind;
  dueInDays?: number;
  automationId: string;
}): Promise<{ created: boolean }> {
  const [existing] = await db()
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, args.orgId),
        eq(tasks.projectId, args.projectId),
        eq(tasks.createdByAutomation, args.automationId),
        eq(tasks.title, args.title),
      ),
    )
    .limit(1);
  if (existing) return { created: false };

  await db().insert(tasks).values({
    orgId: args.orgId,
    projectId: args.projectId,
    title: args.title,
    kind: args.kind,
    status: "todo",
    dueOn: args.dueInDays == null ? null : new Date(Date.now() + args.dueInDays * 86_400_000),
    createdByAutomation: args.automationId,
  });
  return { created: true };
}

export async function listOpenTasks(orgId: string, projectId: string) {
  return db()
    .select()
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.projectId, projectId), sql`${tasks.status} <> 'done'`))
    .orderBy(tasks.sortOrder);
}

function label(status: ProjectStatus): string {
  return status.replaceAll("_", " ");
}
