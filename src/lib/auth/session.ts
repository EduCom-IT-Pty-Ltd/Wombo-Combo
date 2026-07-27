import { cache } from "react";
import { cookies } from "next/headers";
import type { Role } from "@/lib/db/schema/enums";
import { type Capability, can } from "@/lib/domain/permissions";

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
}

export interface Session {
  user: SessionUser;
  org: SessionOrg;
  role: Role;
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

async function loadSession(): Promise<Session> {
  const jar = await cookies();
  const role = (jar.get(DEMO_ROLE_COOKIE)?.value as Role | undefined) ?? "project_manager";

  return {
    user: DEMO_USER,
    org: DEMO_ORG,
    role,
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
  if (!can(session.role, capability)) throw new ForbiddenError(capability);
  return session;
}

export async function hasCapability(capability: Capability): Promise<boolean> {
  const session = await getSession();
  return can(session.role, capability);
}
