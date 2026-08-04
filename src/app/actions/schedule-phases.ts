"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import * as pgSettings from "@/lib/data/pg/settings";
import { createLocalSchedulePhase, deleteLocalSchedulePhase, updateLocalSchedulePhase } from "@/lib/data/local-store";

const phaseSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type SchedulePhaseActionState = { ok: boolean; message?: string };

function revalidateSchedule(projectId: string) { revalidatePath(`/projects/${projectId}/schedule`); revalidatePath("/schedule"); }

export async function addSchedulePhase(_state: SchedulePhaseActionState, formData: FormData): Promise<SchedulePhaseActionState> {
  const session = await requireCapability("schedule.manage");
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = phaseSchema.safeParse(Object.fromEntries(formData));
  if (!projectId || !parsed.success) return { ok: false, message: "Enter a Call-Up, assign a user, and choose a date." };
  const value = { ...parsed.data, description: parsed.data.description || null };
  try {
    if (hasDatabase) await pgSettings.createSchedulePhase(session.org.id, { projectId, ...value });
    else await createLocalSchedulePhase({ projectId, ...value });
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
    if (hasDatabase) await pgSettings.updateSchedulePhase(session.org.id, id, value);
    else await updateLocalSchedulePhase(id, value);
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not update phase." }; }
  revalidateSchedule(projectId); return { ok: true, message: "Call-Up updated." };
}

export async function deleteSchedulePhase(id: string, projectId: string) {
  const session = await requireCapability("schedule.manage");
  if (hasDatabase) await pgSettings.deleteSchedulePhase(session.org.id, id);
  else await deleteLocalSchedulePhase(id);
  revalidateSchedule(projectId);
}
