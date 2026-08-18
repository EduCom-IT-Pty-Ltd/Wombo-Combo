"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import * as pgSettings from "@/lib/data/pg/settings";
import { getProject, listPeople, listSchedulePhases } from "@/lib/data/repository";
import { forgetReads } from "@/lib/data/request-scope";
import { recordEvent } from "@/lib/data/pg/workflow";
import { createLocalSchedulePhase, deleteLocalSchedulePhase, updateLocalSchedulePhase } from "@/lib/data/local-store";
import { sendCallUpNotification } from "@/lib/integrations/graph/mail";

const phaseSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type SchedulePhaseActionState = { ok: boolean; message?: string };

const isUuid = (value: string) => z.uuid().safeParse(value).success;

function actorUserId(userId: string) {
  // The WorkOS bootstrap recovery user intentionally has a synthetic id, which
  // cannot be written to the people foreign key. Everyone else is a person row.
  return isUuid(userId) ? userId : null;
}

function callUpSummary(action: "created" | "updated" | "deleted", phase: { title: string; date: string; userId: string }, people: Awaited<ReturnType<typeof listPeople>>) {
  const assignee = people.find((person) => person.id === phase.userId);
  const assignment = assignee ? ` · assigned to ${assignee.name}` : "";
  return `Call-Up ${action}: ${phase.title} · ${phase.date}${assignment}`;
}

async function recordCallUpNotification(args: {
  orgId: string;
  projectId: string;
  action: "created" | "updated" | "deleted";
  phase: { title: string; description: string | null; date: string; userId: string };
  people: Awaited<ReturnType<typeof listPeople>>;
}) {
  const [project, assignee] = await Promise.all([
    getProject(args.orgId, args.projectId),
    Promise.resolve(args.people.find((person) => person.id === args.phase.userId)),
  ]);
  if (!project) return { suffix: "" };

  const result = await sendCallUpNotification({
    action: args.action === "deleted" ? "cancelled" : args.action,
    project,
    phase: args.phase,
    assignee,
  });
  const actionLabel = args.action === "deleted" ? "cancellation" : args.action;
  if (result.status === "sent") {
    await recordEvent({
      orgId: args.orgId,
      projectId: args.projectId,
      type: "notification.call_up_sent",
      summary: `Call-Up ${actionLabel} email sent to ${result.recipientCount} recipient${result.recipientCount === 1 ? "" : "s"}`,
      payload: { action: args.action, recipientCount: result.recipientCount },
    });
    return { suffix: " Notification sent." };
  }
  const message = result.status === "skipped"
    ? result.reason === "not_configured"
      ? "Email notifications are not configured."
      : "No recipient email address is available."
    : "The Call-Up saved, but the email could not be sent.";
  await recordEvent({
    orgId: args.orgId,
    projectId: args.projectId,
    type: result.status === "failed" ? "notification.call_up_failed" : "notification.call_up_skipped",
    summary: `Call-Up ${actionLabel} email not sent: ${message}`,
    payload: { action: args.action, reason: result.status === "skipped" ? result.reason : result.message },
  });
  return { suffix: ` ${message}` };
}

function revalidateSchedule(projectId: string) {
  forgetReads();
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath(`/field/${projectId}`, "layout");
  revalidatePath("/calendar");
  revalidatePath("/field");
}

export async function addSchedulePhase(_state: SchedulePhaseActionState, formData: FormData): Promise<SchedulePhaseActionState> {
  const session = await requireCapability("schedule.manage");
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = phaseSchema.safeParse(Object.fromEntries(formData));
  if (!projectId || !parsed.success) return { ok: false, message: "Enter a Call-Up, assign a user, and choose a date." };
  const value = { ...parsed.data, description: parsed.data.description || null };
  try {
    if (hasDatabase) {
      const people = await listPeople(session.org.id);
      await pgSettings.createSchedulePhase(session.org.id, { projectId, ...value });
      await recordEvent({
        orgId: session.org.id,
        projectId,
        type: "schedule.call_up_created",
        summary: callUpSummary("created", value, people),
        actorUserId: actorUserId(session.user.id),
        payload: { title: value.title, date: value.date, assignedUserId: value.userId },
      });
      const notification = await recordCallUpNotification({ orgId: session.org.id, projectId, action: "created", phase: value, people });
      revalidateSchedule(projectId); return { ok: true, message: `Call-Up added.${notification.suffix}` };
    } else {
      await createLocalSchedulePhase({ projectId, ...value });
    }
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not add phase." }; }
  revalidateSchedule(projectId); return { ok: true, message: "Call-Up added." };
}

export async function updateSchedulePhase(_state: SchedulePhaseActionState, formData: FormData): Promise<SchedulePhaseActionState> {
  const session = await requireCapability("schedule.manage");
  const projectId = String(formData.get("projectId") ?? ""); const id = String(formData.get("id") ?? "");
  const parsed = phaseSchema.safeParse(Object.fromEntries(formData));
  if (!projectId || !id || !parsed.success) return { ok: false, message: "Check the Call-Up details." };
  const value = { ...parsed.data, description: parsed.data.description || null };
  try {
    const [existing, people] = await Promise.all([
      listSchedulePhases(session.org.id, { projectId }).then((phases) => phases.find((phase) => phase.id === id) ?? null),
      hasDatabase ? listPeople(session.org.id) : Promise.resolve([]),
    ]);
    if (!existing) return { ok: false, message: "That Call-Up no longer exists on this project." };

    if (hasDatabase) {
      await pgSettings.updateSchedulePhase(session.org.id, id, value);
      await recordEvent({
        orgId: session.org.id,
        projectId,
        type: "schedule.call_up_updated",
        summary: callUpSummary("updated", value, people),
        actorUserId: actorUserId(session.user.id),
        payload: { title: value.title, date: value.date, assignedUserId: value.userId, previous: { title: existing.title, date: existing.date, assignedUserId: existing.userId } },
      });
      const notification = await recordCallUpNotification({ orgId: session.org.id, projectId, action: "updated", phase: value, people });
      revalidateSchedule(projectId); return { ok: true, message: `Call-Up updated.${notification.suffix}` };
    } else {
      await updateLocalSchedulePhase(id, value);
    }
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not update phase." }; }
  revalidateSchedule(projectId); return { ok: true, message: "Call-Up updated." };
}

export async function deleteSchedulePhase(id: string, projectId: string): Promise<SchedulePhaseActionState> {
  const session = await requireCapability("schedule.manage");
  if (!id || !projectId) return { ok: false, message: "That Call-Up could not be found." };

  try {
    const existing = (await listSchedulePhases(session.org.id, { projectId })).find((phase) => phase.id === id);
    if (!existing) return { ok: false, message: "That Call-Up no longer exists on this project." };

    if (hasDatabase) {
      const people = await listPeople(session.org.id);
      await pgSettings.deleteSchedulePhase(session.org.id, id);
      await recordEvent({
        orgId: session.org.id,
        projectId,
        type: "schedule.call_up_deleted",
        summary: callUpSummary("deleted", existing, people),
        actorUserId: actorUserId(session.user.id),
        payload: { title: existing.title, date: existing.date, assignedUserId: existing.userId },
      });
      const notification = await recordCallUpNotification({ orgId: session.org.id, projectId, action: "deleted", phase: existing, people });
      revalidateSchedule(projectId); return { ok: true, message: `Call-Up deleted.${notification.suffix}` };
    } else {
      await deleteLocalSchedulePhase(id);
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not delete Call-Up." };
  }

  revalidateSchedule(projectId);
  return { ok: true, message: "Call-Up deleted." };
}
