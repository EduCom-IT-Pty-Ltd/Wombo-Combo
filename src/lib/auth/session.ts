import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLES, type Role } from "@/lib/db/schema/enums";
import { type Capability, can, type RolePermissionOverrides } from "@/lib/domain/permissions";
import { readLocalStore } from "@/lib/data/local-store";
import { bootstrapEmail, expectedOrgId, workosConfigured } from "./workos-config";

/**
 * Auth adapter.
 *
 * The app only ever talks to `getSession()` / `requireCapability()`, so which of
 * the two backings is in play below is invisible to every call site.
 *
 * With `WORKOS_API_KEY` and `WORKOS_CLIENT_ID` set, sessions come from WorkOS
 * AuthKit. Without them the app serves a demo session so `npm run dev` works
 * against demo data with no configuration, and the role can be switched from the
 * top bar via the `wc_demo_role` cookie.
 *
 * Authentication is not authorisation here. WorkOS proves *who* someone is; the
 * `people` list decides whether they get in at all and with what role. A user who
 * authenticates successfully but has no matching person record is turned away —
 * which is what makes this invite-only rather than merely login-gated.
 */

export interface SessionUser {
  id: string;
  workosUserId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

export interface SessionOrg {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  projectNumberPrefix: string;
  logoUrl: string | null;
}

export interface Session {
  user: SessionUser;
  org: SessionOrg;
  role: Role;
  permissionOverrides: RolePermissionOverrides;
  /** True when running against demo data rather than a real WorkOS session. */
  isDemo: boolean;
}

/**
 * Defaults for the single organisation this deployment serves. `store.organisation`
 * is spread over the top, so anything the admin screen has edited wins and only
 * the id is genuinely fixed here.
 *
 * TODO(neon): resolve the org by `organizations.workosOrgId` instead, once the
 * repository reads from Postgres and more than one tenant is possible.
 */
const BASE_ORG: SessionOrg = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Northline Interiors",
  slug: "northline",
  currency: "AUD",
  timezone: "Australia/Sydney",
  projectNumberPrefix: "NLI",
  logoUrl: null,
};

export const DEMO_USER: SessionUser = {
  id: "00000000-0000-4000-8000-0000000000a1",
  workosUserId: null,
  email: "sam.rivera@northline.example",
  firstName: "Sam",
  lastName: "Rivera",
  avatarUrl: null,
};

export const DEMO_ROLE_COOKIE = "wc_demo_role";
export const DEMO_USER_COOKIE = "wc_demo_user";

/**
 * The demo user is selectable from the top bar, so field screens use the same
 * identity as the rest of the application. With WorkOS this remains simply the
 * signed-in user's id.
 */
export function fieldUserId(session: Session): string {
  return session.user.id;
}

async function loadSession(): Promise<Session> {
  return workosConfigured() ? loadWorkosSession() : loadDemoSession();
}

/**
 * A real session. `withAuth({ ensureSignedIn: true })` is belt-and-braces —
 * `middleware.ts` already redirects signed-out traffic, so reaching here without
 * a session means the middleware matcher missed a path.
 */
async function loadWorkosSession(): Promise<Session> {
  // Imported lazily so demo mode never loads a module that expects WorkOS
  // environment variables to exist.
  const { withAuth } = await import("@workos-inc/authkit-nextjs");
  const { user, organizationId } = await withAuth({ ensureSignedIn: true });

  const email = user.email.trim().toLowerCase();
  // The escape hatch deliberately sits in front of the organisation check as
  // well as the people check. Both are recoverable states you could lock
  // yourself out of — a revoked membership no less than a deleted person record
  // — and a recovery route that the lockout can disable is not one.
  const isBootstrap = Boolean(bootstrapEmail()) && email === bootstrapEmail();

  if (!isBootstrap) await assertOrganisationMember(user.id, organizationId);

  const store = await readLocalStore();
  const person = store.people.find((item) => item.email.trim().toLowerCase() === email);

  const identity = {
    workosUserId: user.id,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    avatarUrl: user.profilePictureUrl ?? null,
  };
  const org = { ...BASE_ORG, ...store.organisation };

  if (!person) {
    // The invite-only gate. Authenticating with WorkOS is not enough; someone
    // has to exist in this organisation's people list — unless they are the
    // bootstrap administrator, who has to get in before anyone can be added.
    if (!isBootstrap) redirect("/no-access?reason=membership");
    return {
      user: { id: `bootstrap:${user.id}`, ...identity },
      org,
      role: "owner",
      permissionOverrides: store.rolePermissions,
      isDemo: false,
    };
  }

  return {
    user: { id: person.id, ...identity },
    org,
    // Deliberately the person's role, not the WorkOS role: roles and their
    // capability overrides are administered in-app (see admin -> permissions),
    // and WorkOS has no knowledge of them.
    role: normaliseRole(person.role, person.email),
    permissionOverrides: store.rolePermissions,
    isDemo: false,
  };
}

/**
 * This deployment serves exactly one organisation, so membership of it is a
 * condition of entry rather than a way of picking a tenant.
 *
 * Two paths, because the organisation claim is not always on the access token —
 * a user created through "Create user" rather than invited into an organisation
 * has no membership to put there. Trusting the claim alone would let exactly
 * that user in, which is the case this is meant to stop, so its absence falls
 * through to asking WorkOS directly instead of being treated as permission.
 *
 * Fails closed: an error from the WorkOS API propagates rather than being
 * swallowed into a pass, since a membership we could not confirm is not one we
 * should honour.
 */
async function assertOrganisationMember(userId: string, organizationIdFromToken: string | undefined): Promise<void> {
  const expected = expectedOrgId();
  if (!expected) return;

  if (organizationIdFromToken) {
    if (organizationIdFromToken !== expected) redirect("/no-access?reason=organisation");
    return;
  }

  const { getWorkOS } = await import("@workos-inc/authkit-nextjs");
  const memberships = await getWorkOS().userManagement.listOrganizationMemberships({
    userId,
    organizationId: expected,
    // `pending` is an invitation not yet accepted and `inactive` is a revoked
    // membership. Neither is access.
    statuses: ["active"],
    limit: 1,
  });
  if (memberships.data.length === 0) redirect("/no-access?reason=organisation");
}

/**
 * Guards against role values that predate the current five-role model — the
 * stored people list still carries `project_manager`, `estimator`, `scheduler`,
 * `installer` and `qa_inspector`.
 *
 * This matters because `capabilitiesFor` returns `[]` for an unrecognised role,
 * so the failure mode is not an error but an empty application: no navigation,
 * and every server action throwing `ForbiddenError`. Falling back to `staff`
 * keeps the person usable at the lowest privilege and makes the cause visible
 * in the server log instead of looking like a rendering bug.
 */
function normaliseRole(role: Role, email: string): Role {
  if ((ROLES as readonly string[]).includes(role)) return role;
  console.warn(
    `[auth] ${email} has role "${role}", which is not one of ${ROLES.join(", ")}. ` +
      `Falling back to "staff" — reassign this person under Settings.`,
  );
  return "staff";
}

async function loadDemoSession(): Promise<Session> {
  const jar = await cookies();
  const store = await readLocalStore();
  const requestedUserId = jar.get(DEMO_USER_COOKIE)?.value;
  const person = store.people.find((item) => item.id === requestedUserId)
    ?? store.people.find((item) => item.id === "u-sam")
    ?? store.people[0];
  const roleFromCookie = jar.get(DEMO_ROLE_COOKIE)?.value;
  const role = (["owner", "admin", "manager", "finance", "staff"] as const).includes(roleFromCookie as Role)
    ? roleFromCookie as Role
    : person?.role ?? "manager";
  const nameParts = (person?.name ?? "Sam Rivera").trim().split(/\s+/);

  return {
    user: {
      id: person?.id ?? DEMO_USER.id,
      workosUserId: null,
      email: person?.email ?? DEMO_USER.email,
      firstName: nameParts[0] ?? null,
      lastName: nameParts.slice(1).join(" ") || null,
      avatarUrl: null,
    },
    org: { ...BASE_ORG, ...store.organisation },
    role,
    permissionOverrides: store.rolePermissions,
    isDemo: true,
  };
}

/** Deduped per request, so a page can call it from many components for free. */
export const getSession = cache(loadSession);

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}

export class ForbiddenError extends Error {
  constructor(public readonly capability: Capability) {
    super(`Missing required permission: ${capability}`);
    this.name = "ForbiddenError";
  }
}

/**
 * Guard for server actions and route handlers. Returns the session so callers
 * get the tenant id in the same step — the pattern that makes it hard to forget
 * to scope a query.
 */
export async function requireCapability(capability: Capability): Promise<Session> {
  const session = await requireSession();
  if (!can(session.role, capability, session.permissionOverrides)) throw new ForbiddenError(capability);
  return session;
}

export async function hasCapability(capability: Capability): Promise<boolean> {
  const session = await getSession();
  return can(session.role, capability, session.permissionOverrides);
}
