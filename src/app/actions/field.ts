"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldUserId, requireCapability, type Session } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import * as pgField from "@/lib/data/pg/field";
import { recordEvent } from "@/lib/data/pg/workflow";
import {
  addLocalMaterialUse,
  addLocalSiteNote,
  addLocalVariation,
  endLocalTimeEntry,
  startLocalTimeEntry,
  toggleLocalTimeEntryPause,
  updateLocalTimeEntry,
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
  revalidatePath(`/field/${projectId}`);
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath(`/projects/${projectId}/field`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The signed-in person as a `users` row.
 *
 * Null for the bootstrap administrator, whose session id is
 * `bootstrap:<workos id>` because they deliberately have no row — they exist to
 * get a deployment off the ground before anybody has been invited. Columns that
 * merely attribute a record take that null happily; a time entry cannot, since
 * its cost rate comes from a membership, so the clock actions turn it into a
 * sentence instead of letting Postgres reject the id.
 */
function crewUserId(session: Session): string | null {
  const id = fieldUserId(session);
  return UUID.test(id) ? id : null;
}

const NO_CREW_RECORD =
  "This sign-in has no people record, so it cannot record time on site. Add yourself under People first.";

function failed(error: unknown, fallback: string): ActionResult {
  return { ok: false, message: error instanceof Error ? error.message : fallback };
}

export async function clockOn(input: unknown): Promise<ActionResult> {
  const parsed = clockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request" };

  const session = await requireCapability("field.clock");
  const { projectId } = parsed.data;

  // TODO(neon): store latitude/longitude against the entry as attendance evidence.
  if (!hasDatabase) {
    const entry = await startLocalTimeEntry({ projectId, userId: fieldUserId(session) });
    if (entry.projectId !== projectId) return { ok: false, message: "Clock off your current job before starting another shift" };
    revalidateField(projectId);
    return { ok: true, message: "Clocked on" };
  }

  const userId = crewUserId(session);
  if (!userId) return { ok: false, message: NO_CREW_RECORD };

  try {
    const started = await pgField.startTimeEntry(session.org.id, { projectId, userId });
    if (!started) return { ok: false, message: "Could not start the shift. Try again." };
    if (started.projectId !== projectId) return { ok: false, message: "Clock off your current job before starting another shift" };
    // Only the tap that actually opened the shift is worth an event. A repeat
    // of one already running is the same shift, not a second arrival on site.
    if (started.created) {
      await recordEvent({ orgId: session.org.id, projectId, type: "field.clocked_on", summary: "Clocked on site", actorUserId: userId });
    }
    revalidateField(projectId);
    return { ok: true, message: "Clocked on" };
  } catch (error) {
    return failed(error, "Could not clock on.");
  }
}

export async function clockOff(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ entryId: z.string().min(1), breakMinutes: z.number().min(0).max(480) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request" };

  const session = await requireCapability("field.clock");

  if (!hasDatabase) {
    const entry = await endLocalTimeEntry({ ...parsed.data, userId: fieldUserId(session) });
    if (!entry) return { ok: false, message: "That shift is already closed" };
    revalidateField(entry.projectId);
    return { ok: true, message: "Clocked off" };
  }

  const userId = crewUserId(session);
  if (!userId) return { ok: false, message: NO_CREW_RECORD };

  try {
    const entry = await pgField.endTimeEntry(session.org.id, { ...parsed.data, userId });
    if (!entry) return { ok: false, message: "That shift is already closed" };
    await recordEvent({ orgId: session.org.id, projectId: entry.projectId, type: "field.clocked_off", summary: "Clocked off site", actorUserId: userId });
    revalidateField(entry.projectId);
    return { ok: true, message: "Clocked off" };
  } catch (error) {
    return failed(error, "Could not clock off.");
  }
}

export async function toggleClockPause(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ entryId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid time entry" };
  const session = await requireCapability("field.clock");

  if (!hasDatabase) {
    const entry = await toggleLocalTimeEntryPause({ entryId: parsed.data.entryId, userId: fieldUserId(session) });
    if (!entry) return { ok: false, message: "That shift is already closed" };
    revalidateField(entry.projectId);
    return { ok: true, message: entry.pausedAt ? "Shift paused" : "Shift resumed" };
  }

  const userId = crewUserId(session);
  if (!userId) return { ok: false, message: NO_CREW_RECORD };

  try {
    const entry = await pgField.toggleTimeEntryPause(session.org.id, { entryId: parsed.data.entryId, userId });
    if (!entry) return { ok: false, message: "That shift is already closed" };
    const paused = Boolean(entry.pausedAt);
    await recordEvent({
      orgId: session.org.id,
      projectId: entry.projectId,
      type: paused ? "field.shift_paused" : "field.shift_resumed",
      summary: paused ? "Paused their shift" : "Resumed their shift",
      actorUserId: userId,
    });
    revalidateField(entry.projectId);
    return { ok: true, message: paused ? "Shift paused" : "Shift resumed" };
  } catch (error) {
    return failed(error, "Could not update the shift.");
  }
}

const editTimeSchema = z.object({
  entryId: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  breakMinutes: z.number().min(0).max(480),
});

export async function editTimeEntry(input: unknown): Promise<ActionResult> {
  const parsed = editTimeSchema.safeParse(input);
  if (!parsed.success || new Date(parsed.data.endedAt) <= new Date(parsed.data.startedAt)) return { ok: false, message: "Check the start and finish times" };
  const session = await requireCapability("field.clock");

  if (!hasDatabase) {
    const entry = await updateLocalTimeEntry({ ...parsed.data, userId: fieldUserId(session) });
    if (!entry) return { ok: false, message: "Only completed entries can be edited" };
    revalidateField(entry.projectId);
    return { ok: true, message: "Time entry updated" };
  }

  const userId = crewUserId(session);
  if (!userId) return { ok: false, message: NO_CREW_RECORD };

  try {
    const entry = await pgField.updateOwnTimeEntry(session.org.id, { ...parsed.data, userId });
    if (!entry) return { ok: false, message: "Only completed entries can be edited" };
    await recordEvent({ orgId: session.org.id, projectId: entry.projectId, type: "field.time_edited", summary: "Edited a time entry", actorUserId: userId });
    revalidateField(entry.projectId);
    return { ok: true, message: "Time entry updated" };
  } catch (error) {
    return failed(error, "Could not update the time entry.");
  }
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

  if (!hasDatabase) {
    await addLocalMaterialUse({ ...parsed.data, userId: fieldUserId(session) });
    revalidateField(parsed.data.projectId);
    return { ok: true, message: "Materials recorded" };
  }

  const userId = crewUserId(session);
  try {
    await pgField.addMaterialUse(session.org.id, { ...parsed.data, userId });
    await recordEvent({
      orgId: session.org.id,
      projectId: parsed.data.projectId,
      type: "field.materials_used",
      summary: `Materials used: ${parsed.data.quantity} ${parsed.data.unit} ${parsed.data.description.trim()}`,
      actorUserId: userId,
    });
    revalidateField(parsed.data.projectId);
    return { ok: true, message: "Materials recorded" };
  } catch (error) {
    return failed(error, "Could not record the materials.");
  }
}

const variationSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(4, "Describe the extra work").max(200),
});

export async function raiseVariation(input: unknown): Promise<ActionResult> {
  const parsed = variationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details" };

  const session = await requireCapability("field.record");

  if (!hasDatabase) {
    const variation = await addLocalVariation({ ...parsed.data, userId: fieldUserId(session) });
    revalidateField(parsed.data.projectId);
    return { ok: true, message: `${variation.reference} sent to the office` };
  }

  const userId = crewUserId(session);
  try {
    const variation = await pgField.addVariation(session.org.id, { ...parsed.data, userId });
    await recordEvent({
      orgId: session.org.id,
      projectId: parsed.data.projectId,
      type: "field.variation_raised",
      summary: `Variation raised on site: ${variation.reference} — ${parsed.data.title.trim()}`,
      actorUserId: userId,
    });
    revalidateField(parsed.data.projectId);
    return { ok: true, message: `${variation.reference} sent to the office` };
  } catch (error) {
    return failed(error, "Could not raise the variation.");
  }
}

const noteSchema = z.object({
  projectId: z.string().min(1),
  note: z.string().trim().min(2, "Add a note").max(1000),
});

export async function addSiteNote(input: unknown): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details" };

  const session = await requireCapability("field.record");

  if (!hasDatabase) {
    await addLocalSiteNote({ ...parsed.data, userId: fieldUserId(session) });
    revalidateField(parsed.data.projectId);
    return { ok: true, message: "Note added" };
  }

  try {
    // A note has nowhere to live but the activity feed, which is the point of
    // it: the office reads what happened on site without anyone phoning it in.
    await recordEvent({
      orgId: session.org.id,
      projectId: parsed.data.projectId,
      type: "field.note",
      summary: `Site note: ${parsed.data.note.trim()}`,
      actorUserId: crewUserId(session),
    });
    revalidateField(parsed.data.projectId);
    return { ok: true, message: "Note added" };
  } catch (error) {
    return failed(error, "Could not add the note.");
  }
}
