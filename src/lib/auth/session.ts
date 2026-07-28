import { cache } from "react";
import { cookies } from "next/headers";
import type { Role } from "@/lib/db/schema/enums";
import { type Capability, can, type RolePermissionOverrides } from "@/lib/domain/permissions";
import { readLocalStore } from "@/lib/data/local-store";

/**
 * Auth adapter.
 *
 * The app only ever talks to `getSession()` / `requireCapability()`. Swapping in
 * WorkOS AuthKit means replacing the body of `loadSession()` — no call sites
 * change. Until then a dev session is served so the UI is fully explorable, and
 * the role can be switched with the `wc_demo_role` cookie (see the role switcher
 * in the top bar).
 *
 * WorkOS wiring, when you're ready:
 *   1. npm i @workos-inc/authkit-nextjs
 *   2. add middleware.ts -> `export { authkitMiddleware as middleware }`
 *   3. in loadSession(): `const { user, organizationId, role } = await withAuth()`
 *   4. map organizationId -> organizations.workosOrgId to resolve the tenant
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

export const DEMO_ORG: SessionOrg = {
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
    org: { ...DEMO_ORG, ...store.organisation },
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
