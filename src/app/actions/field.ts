"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldUserId, requireCapability } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/db";
import {
  addLocalMaterialUse,
  addLocalSiteNote,
  addLocalVariation,
  endLocalTimeEntry,
  startLocalTimeEntry,
} from "@/lib/data/local-store";
import type { ActionResult } from "./projects";

const clockSchema = z.object({
  projectId: z.string().min(1),
  /** Captured opportunistically — attendance evidence, never a hard requirement. */
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

/** Every field write shows up on the crew's own screen and on the project. */
function revalidateField(projectId: string) {
  revalidatePath("/field");
  revalidatePath(`/projects/${projectId}`, "layout");
}

export async function clockOn(input: unknown): Promise<ActionResult> {
  const parsed = clockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request" };

  const session = await requireCapability("field.clock");

  // TODO(neon): store latitude/longitude against the entry as attendance evidence.
  if (isDemoMode) {
    await startLocalTimeEntry({ projectId: parsed.data.projectId, userId: fieldUserId(session) });
    revalidateField(parsed.data.projectId);
    return { ok: true, message: "Clocked on" };
  }
  throw new Error("clockOn is not implemented against the database yet");
}

export async function clockOff(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ entryId: z.string().min(1), breakMinutes: z.number().min(0).max(480) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request" };

  const session = await requireCapability("field.clock");

  if (isDemoMode) {
    const entry = await endLocalTimeEntry({ ...parsed.data, userId: fieldUserId(session) });
    if (!entry) return { ok: false, message: "That shift is already closed" };
    revalidateField(entry.projectId);
    return { ok: true, message: "Clocked off" };
  }
  throw new Error("clockOff is not implemented against the database yet");
}

const materialSchema = z.object({
  projectId: z.string().min(1),
  description: z.string().trim().min(2, "Say what you used").max(200),
  quantity: z.number().positive("Enter how much").max(1_000_000),
  unit: z.string().trim().min(1).max(12),
});

export async function logMaterialUse(input: unknown): Promise<ActionResult> {
  const parsed = materialSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details" };

  const session = await requireCapability("field.record");

  if (isDemoMode) {
    await addLocalMaterialUse({ ...parsed.data, userId: fieldUserId(session) });
    revalidateField(parsed.data.projectId);
    return { ok: true, message: "Materials recorded" };
  }
  throw new Error("logMaterialUse is not implemented against the database yet");
}

const variationSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(4, "Describe the extra work").max(200),
});

export async function raiseVariation(input: unknown): Promise<ActionResult> {
  const parsed = variationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details" };

  const session = await requireCapability("field.record");

  if (isDemoMode) {
    const variation = await addLocalVariation({ ...parsed.data, userId: fieldUserId(session) });
    revalidateField(parsed.data.projectId);
    return { ok: true, message: `${variation.reference} sent to the office` };
  }
  throw new Error("raiseVariation is not implemented against the database yet");
}

const noteSchema = z.object({
  projectId: z.string().min(1),
  note: z.string().trim().min(2, "Add a note").max(1000),
});

export async function addSiteNote(input: unknown): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details" };

  const session = await requireCapability("field.record");

  if (isDemoMode) {
    await addLocalSiteNote({ ...parsed.data, userId: fieldUserId(session) });
    revalidateField(parsed.data.projectId);
    return { ok: true, message: "Note added" };
  }
  throw new Error("addSiteNote is not implemented against the database yet");
}
