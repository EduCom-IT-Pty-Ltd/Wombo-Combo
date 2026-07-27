"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/db";
import type { ActionResult } from "./projects";

const clockSchema = z.object({
  projectId: z.string().min(1),
  /** Captured opportunistically — attendance evidence, never a hard requirement. */
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export async function clockOn(input: unknown): Promise<ActionResult> {
  const parsed = clockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request" };

  const session = await requireCapability("field.clock");

  // TODO(neon): reject if the user already has an open entry, then insert.
  if (isDemoMode) {
    console.info("[demo] clock on", { user: session.user.id, ...parsed.data });
    revalidatePath("/field");
    return { ok: true, message: "Clocked on" };
  }
  throw new Error("clockOn is not implemented against the database yet");
}

export async function clockOff(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ entryId: z.string().min(1), breakMinutes: z.number().min(0).max(480) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request" };

  const session = await requireCapability("field.clock");

  if (isDemoMode) {
    console.info("[demo] clock off", { user: session.user.id, ...parsed.data });
    revalidatePath("/field");
    return { ok: true, message: "Clocked off" };
  }
  throw new Error("clockOff is not implemented against the database yet");
}
