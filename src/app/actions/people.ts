"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { canAdministerDirectory, inviteToOrganisation, revokeOrganisationAccess, WorkosAdminError } from "@/lib/auth/workos-admin";
import { hasDatabase } from "@/lib/db";
import { LEAVE_STATUSES, LEAVE_TYPES, ROLES } from "@/lib/db/schema/enums";
import { deactivatePerson, updatePersonDetails, upsertPerson } from "@/lib/data/pg/org";
import { getPerson } from "@/lib/data/repository";
import { createLocalLeave, createLocalPerson, deleteLocalLeave, deleteLocalPerson, updateLocalLeave, updateLocalPerson } from "@/lib/data/local-store";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const personSchema = z.object({ name: z.string().trim().min(2), email: z.string().trim().email(), role: z.enum(ROLES), isSchedulable: z.string().optional(), costRatePerHour: z.coerce.number().min(0), color });
const leaveSchema = z.object({ userId: z.string().min(1), type: z.enum(LEAVE_TYPES), status: z.enum(LEAVE_STATUSES), startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().optional() }).refine((data) => data.endsAt >= data.startsAt, { message: "End date must be on or after the start date." });
export type PeopleActionState = { ok: boolean; message?: string };
function refreshPeople() { revalidatePath("/hr"); revalidatePath("/schedule"); revalidatePath("/projects", "layout"); }

function personInput(data: z.infer<typeof personSchema>) {
  return {
    name: data.name,
    email: data.email,
    role: data.role,
    isSchedulable: Boolean(data.isSchedulable),
    costRateCentsPerHour: Math.round(data.costRatePerHour * 100),
    color: data.color,
  };
}

/**
 * Invite someone into the workspace: a membership row here, an email from
 * WorkOS.
 *
 * Postgres first and WorkOS second, deliberately. `neon-http` gives us no
 * transaction spanning the two, so the order decides which way a half-failure
 * falls. This way a failed invitation leaves someone listed but unable to sign
 * in — visible on the page and retryable. The reverse would let them
 * authenticate as far as `/no-access` with nothing on screen explaining why.
 *
 * Both halves are idempotent, so re-submitting the same address is the retry.
 */
export async function addPerson(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> {
  const session = await requireCapability("hr.manage");
  const parsed = personSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the person details." };
  const input = personInput(parsed.data);

  if (!hasDatabase) {
    await createLocalPerson(input);
    refreshPeople();
    return { ok: true, message: "Person added." };
  }

  await upsertPerson(session.org.id, input);
  refreshPeople();

  if (!canAdministerDirectory()) {
    return { ok: true, message: `${input.name} added. WorkOS is not configured, so no invitation was sent.` };
  }

  try {
    const outcome = await inviteToOrganisation(input.email, session.user.workosUserId);
    if (outcome === "already-member") return { ok: true, message: `${input.name} added — they already had sign-in access.` };
    if (outcome === "resent") return { ok: true, message: `Invitation re-sent to ${input.email}.` };
    return { ok: true, message: `Invited ${input.email}. They'll get an email to set a password.` };
  } catch (error) {
    console.error("[people] invitation failed", error);
    const detail = error instanceof WorkosAdminError ? error.message : "WorkOS rejected the invitation.";
    return { ok: false, message: `${input.name} was added but the invitation failed — ${detail} Use "Resend invite" to try again.` };
  }
}

/**
 * Re-send the WorkOS invitation. Covers both the everyday "can you send that
 * again?" and the recovery path when `addPerson` wrote the row but the email
 * never went out.
 */
export async function resendInvite(userId: string): Promise<PeopleActionState> {
  const session = await requireCapability("hr.manage");
  if (!hasDatabase || !canAdministerDirectory()) return { ok: false, message: "WorkOS is not configured, so there is nothing to send." };

  const person = await getPerson(session.org.id, userId);
  if (!person) return { ok: false, message: "Person not found." };

  try {
    const outcome = await inviteToOrganisation(person.email, session.user.workosUserId);
    if (outcome === "already-member") return { ok: true, message: `${person.name} already has sign-in access.` };
    return { ok: true, message: `Invitation sent to ${person.email}.` };
  } catch (error) {
    console.error("[people] resend failed", error);
    return { ok: false, message: `Could not send an invitation to ${person.email}.` };
  }
}

/**
 * Role changes stay in Postgres and are deliberately not pushed to WorkOS. The
 * role here selects capabilities that are administered in-app under Settings,
 * which WorkOS has no view of — `loadWorkosSession` reads the role from the
 * membership for that reason. Mirroring it into WorkOS would create a second,
 * poorer source of truth that nothing reads.
 */
export async function updatePerson(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> {
  const session = await requireCapability("hr.manage");
  const id = String(formData.get("id") ?? "");
  const parsed = personSchema.safeParse(Object.fromEntries(formData));
  if (!id || !parsed.success) return { ok: false, message: "Check the person details." };
  const input = personInput(parsed.data);

  if (hasDatabase) await updatePersonDetails(session.org.id, id, input);
  else await updateLocalPerson(id, input);
  refreshPeople();
  return { ok: true, message: "Person updated." };
}

/**
 * Remove someone's access.
 *
 * The membership goes inactive rather than being deleted, so every project, time
 * entry and QA sign-off that references them stays attributable. Their WorkOS
 * access is revoked as well, so "removed" means removed in both systems rather
 * than leaving a live account pointed at a door that happens to be shut.
 *
 * WorkOS second again: a failure there leaves a revoked person still able to
 * authenticate as far as `/no-access`, which is a closed door, not an open one.
 */
export async function deletePerson(id: string): Promise<PeopleActionState> {
  const session = await requireCapability("hr.manage");

  if (!hasDatabase) {
    await deleteLocalPerson(id);
    refreshPeople();
    return { ok: true, message: "Person removed." };
  }

  const email = await deactivatePerson(session.org.id, id);
  refreshPeople();
  if (!email) return { ok: false, message: "Person not found." };
  if (!canAdministerDirectory()) return { ok: true, message: "Access removed." };

  try {
    await revokeOrganisationAccess(email);
    return { ok: true, message: `${email} can no longer sign in.` };
  } catch (error) {
    console.error("[people] revoke failed", error);
    return { ok: false, message: `Access removed here, but revoking ${email} in WorkOS failed. Remove them in the WorkOS dashboard.` };
  }
}

export async function addLeave(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> { await requireCapability("hr.manage"); const parsed = leaveSchema.safeParse(Object.fromEntries(formData)); if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check leave details." }; await createLocalLeave({ ...parsed.data, reason: parsed.data.reason || null }); refreshPeople(); return { ok: true, message: "Availability saved." }; }
export async function updateLeave(_state: PeopleActionState, formData: FormData): Promise<PeopleActionState> { await requireCapability("hr.manage"); const id = String(formData.get("id") ?? ""); const parsed = leaveSchema.safeParse(Object.fromEntries(formData)); if (!id || !parsed.success) return { ok: false, message: parsed.success ? "Check leave details." : parsed.error.issues[0]?.message }; await updateLocalLeave(id, { ...parsed.data, reason: parsed.data.reason || null }); refreshPeople(); return { ok: true, message: "Availability updated." }; }
export async function deleteLeave(id: string) { await requireCapability("hr.manage"); await deleteLocalLeave(id); refreshPeople(); }
