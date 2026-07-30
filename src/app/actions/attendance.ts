"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { createLocalAttendanceEntry, deleteLocalAttendanceEntry, updateLocalAttendanceEntry } from "@/lib/data/local-store";

export type AttendanceActionState = { ok: boolean; message?: string };

const attendanceSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startedTime: z.string().regex(/^\d{2}:\d{2}$/),
  endedTime: z.string().regex(/^\d{2}:\d{2}$/),
  breakMinutes: z.coerce.number().int().min(0).max(480),
  notes: z.string().trim().max(500).optional(),
});

function asIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function revalidateAttendance(projectId: string) {
  revalidatePath("/schedule");
  revalidatePath("/field");
  revalidatePath(`/field/${projectId}`);
  revalidatePath(`/field/${projectId}/schedule`);
  revalidatePath(`/field/${projectId}/costing`);
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath(`/projects/${projectId}/schedule`);
  revalidatePath(`/projects/${projectId}/costing`);
}

function parseEntry(formData: FormData) {
  const parsed = attendanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return null;
  const startedAt = asIso(`${parsed.data.date}T${parsed.data.startedTime}`);
  const endedAt = asIso(`${parsed.data.date}T${parsed.data.endedTime}`);
  if (!startedAt || !endedAt || new Date(endedAt) <= new Date(startedAt)) return null;
  return { ...parsed.data, startedAt, endedAt };
}

export async function addAttendanceEntry(_state: AttendanceActionState, formData: FormData): Promise<AttendanceActionState> {
  await requireCapability("schedule.manage");
  const input = parseEntry(formData);
  if (!input) return { ok: false, message: "Choose an employee and valid clock-in and clock-out times." };
  try {
    await createLocalAttendanceEntry(input);
    revalidateAttendance(input.projectId);
    return { ok: true, message: "Attendance entry added." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not add attendance." };
  }
}

export async function updateAttendanceEntry(_state: AttendanceActionState, formData: FormData): Promise<AttendanceActionState> {
  await requireCapability("schedule.manage");
  const input = parseEntry(formData);
  const entryId = String(formData.get("entryId") ?? "");
  if (!input || !entryId) return { ok: false, message: "Check the attendance details." };
  try {
    await updateLocalAttendanceEntry({ ...input, entryId });
    revalidateAttendance(input.projectId);
    return { ok: true, message: "Attendance entry updated." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update attendance." };
  }
}

export async function deleteAttendanceEntry(entryId: string) {
  await requireCapability("schedule.manage");
  const entry = await deleteLocalAttendanceEntry(entryId);
  revalidateAttendance(entry.projectId);
}
