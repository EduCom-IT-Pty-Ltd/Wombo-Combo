import "server-only";
import { expectedOrgId, workosConfigured } from "./workos-config";

/**
 * The write side of WorkOS — inviting someone into the organisation and taking
 * that access away again.
 *
 * Everything here is deliberately idempotent and tolerant of the directory
 * already being in the desired state, because the caller has just written to
 * Postgres and `neon-http` gave it no transaction to roll back. Re-inviting
 * someone who already has a pending invitation should succeed quietly rather
 * than leaving the two systems disagreeing over a duplicate-invite error.
 *
 * `src/lib/domain/*` stays pure, so this lives under `auth` with the rest of the
 * code that knows WorkOS exists.
 */

/** Thrown when WorkOS refuses an operation, so the action can surface why. */
export class WorkosAdminError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WorkosAdminError";
  }
}

/**
 * True when this deployment can administer a WorkOS directory at all. Demo mode
 * has no WorkOS, and a deployment without `WORKOS_ORG_ID` has no organisation to
 * invite anyone into — in both cases people management is Postgres-only.
 */
export function canAdministerDirectory(): boolean {
  return workosConfigured() && Boolean(expectedOrgId());
}

async function client() {
  const { getWorkOS } = await import("@workos-inc/authkit-nextjs");
  return getWorkOS().userManagement;
}

function organisation(): string {
  const orgId = expectedOrgId();
  if (!orgId) throw new WorkosAdminError("WORKOS_ORG_ID is not set, so there is no organisation to invite into.");
  return orgId;
}

/**
 * Invite someone into the organisation, sending them the WorkOS email.
 *
 * Returns `already-member` when they can already sign in, so the caller can say
 * so rather than claiming to have sent an email it did not send. A pending
 * invitation is re-sent instead of duplicated — the common case is someone
 * asking "can you send that again?", not wanting a second invitation.
 */
export async function inviteToOrganisation(
  email: string,
  inviterWorkosUserId?: string | null,
): Promise<"invited" | "resent" | "already-member"> {
  const userManagement = await client();
  const organizationId = organisation();
  const normalised = email.trim().toLowerCase();

  const existingUsers = await userManagement.listUsers({ email: normalised, limit: 1 });
  const existingUser = existingUsers.data[0];
  if (existingUser) {
    const memberships = await userManagement.listOrganizationMemberships({
      userId: existingUser.id,
      organizationId,
      statuses: ["active"],
      limit: 1,
    });
    if (memberships.data.length > 0) return "already-member";
  }

  const pending = await userManagement.listInvitations({ email: normalised, organizationId, limit: 10 });
  const outstanding = pending.data.find((invitation) => invitation.state === "pending");
  if (outstanding) {
    await userManagement.resendInvitation(outstanding.id);
    return "resent";
  }

  try {
    await userManagement.sendInvitation({
      email: normalised,
      organizationId,
      // Attribution in the WorkOS audit log and the invitation email, so an
      // invite is traceable to the person who sent it rather than to the app.
      ...(inviterWorkosUserId ? { inviterUserId: inviterWorkosUserId } : {}),
    });
    return "invited";
  } catch (error) {
    throw new WorkosAdminError(`WorkOS refused the invitation for ${normalised}.`, { cause: error });
  }
}

/**
 * Take away every route back in: the active membership if they accepted, and any
 * pending invitation if they have not yet.
 *
 * Both are revoked, not just whichever looks current. An invitation that is
 * still outstanding when the membership is deleted would otherwise let a removed
 * person re-admit themselves by clicking an old email.
 *
 * The WorkOS *user* is left intact so re-inviting is one click and their id
 * stays stable, and because deleting it would be irreversible.
 */
export async function revokeOrganisationAccess(email: string): Promise<void> {
  const userManagement = await client();
  const organizationId = organisation();
  const normalised = email.trim().toLowerCase();

  const invitations = await userManagement.listInvitations({ email: normalised, organizationId, limit: 20 });
  for (const invitation of invitations.data) {
    if (invitation.state === "pending") await userManagement.revokeInvitation(invitation.id);
  }

  const found = await userManagement.listUsers({ email: normalised, limit: 1 });
  const user = found.data[0];
  if (!user) return;

  const memberships = await userManagement.listOrganizationMemberships({
    userId: user.id,
    organizationId,
    limit: 20,
  });
  for (const membership of memberships.data) {
    await userManagement.deleteOrganizationMembership(membership.id);
  }
}
