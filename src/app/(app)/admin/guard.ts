import "server-only";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";

/**
 * Settings is admin-only. The nav already hides it, but hiding a link is not a
 * permission check — every route under `/admin` calls this, not just the layout,
 * because a client-side navigation can re-render the page without the layout.
 *
 * Returns the session so the tenant id comes from the same call, the way
 * `requireCapability` does for the write actions.
 */
export async function requireSettingsAccess() {
  const session = await getSession();
  if (!can(session.role, "admin.manage", session.permissionOverrides)) notFound();
  return session;
}
