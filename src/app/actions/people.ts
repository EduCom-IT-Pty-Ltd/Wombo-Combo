"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { LEAVE_STATUSES, LEAVE_TYPES, ROLES } from "@/lib/db/schema/enums";
import { createLocalLeave, createLocalPerson, deleteLocalLeave, deleteLocalPerson, updateLocalLeave, updateLocalPerson } from "@/lib/data/local-store";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const personSchema = z.object({ name: z.string().trim().min(2), email: z.string().trim().email(), role: z.enum(ROLES), isSchedulable: z.string().optional(), costRatePerHour: z.coerce.number().min(0), color });
const leaveSchema = z.object({ userId: z.string().min(1), type: z.enum(LEAVE_TYPES), status: z.enum(LEAVE_STATUSES), startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().optional() }).refine((data) => data.endsAt >= data.startsAt, { message: "End date must be on or after the start date." });
export type PeopleActionState = { ok: boolean; message?: string };
function refreshPeople() { revalidatePath("/hr"); revalidatePath("/schedule"); revalidatePath("/projects", "layout"); }

export async function addPerson(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> { await requireCapability("hr.manage"); const parsed = personSchema.safeParse(Object.fromEntries(formData)); if (!parsed.success) return { ok: false, message: "Check the person details." }; await createLocalPerson({ name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, isSchedulable: Boolean(parsed.data.isSchedulable), costRateCentsPerHour: Math.round(parsed.data.costRatePerHour * 100), color: parsed.data.color }); refreshPeople(); return { ok: true, message: "Person added." }; }
export async function updatePerson(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> { await requireCapability("hr.manage"); const id = String(formData.get("id") ?? ""); const parsed = personSchema.safeParse(Object.fromEntries(formData)); if (!id || !parsed.success) return { ok: false, message: "Check the person details." }; await updateLocalPerson(id, { name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, isSchedulable: Boolean(parsed.data.isSchedulable), costRateCentsPerHour: Math.round(parsed.data.costRatePerHour * 100), color: parsed.data.color }); refreshPeople(); return { ok: true, message: "Person updated." }; }
export async function deletePerson(id: string) { await requireCapability("hr.manage"); await deleteLocalPerson(id); refreshPeople(); }
export async function addLeave(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> { await requireCapability("hr.manage"); const parsed = leaveSchema.safeParse(Object.fromEntries(formData)); if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check leave details." }; await createLocalLeave({ ...parsed.data, reason: parsed.data.reason || null }); refreshPeople(); return { ok: true, message: "Availability saved." }; }
export async function updateLeave(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> { await requireCapability("hr.manage"); const id = String(formData.get("id") ?? ""); const parsed = leaveSchema.safeParse(Object.fromEntries(formData)); if (!id || !parsed.success) return { ok: false, message: parsed.success ? "Check leave details." : parsed.error.issues[0]?.message }; await updateLocalLeave(id, { ...parsed.data, reason: parsed.data.reason || null }); refreshPeople(); return { ok: true, message: "Availability updated." }; }
export async function deleteLeave(id: string) { await requireCapability("hr.manage"); await deleteLocalLeave(id); refreshPeople(); }
