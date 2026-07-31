/**
 * Is WorkOS configured?
 *
 * Deliberately dependency-free: this module is imported by `middleware.ts`,
 * which runs in the edge runtime and cannot pull in `server-only`, `node:fs`,
 * or anything else the rest of `src/lib/auth` reaches for.
 *
 * Both values are required. Half a configuration is treated as none, so a
 * partial paste into `.env.local` drops back to demo mode rather than producing
 * a login screen that cannot succeed.
 */
export function workosConfigured(): boolean {
  return Boolean(process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID);
}

/**
 * The single tenant this deployment serves. When set, a signed-in user whose
 * WorkOS organization differs is refused — a cheap guard against a stray user
 * created in the wrong organization seeing this customer's projects.
 */
export function expectedOrgId(): string | undefined {
  return process.env.WORKOS_ORG_ID || undefined;
}

/**
 * Chicken-and-egg escape hatch: access requires a matching person record, but
 * creating person records requires access. This email gets in as an owner
 * without one, so the first administrator can sign in and invite everyone else.
 *
 * Clear it once real people exist. While set, anyone who can authenticate to
 * WorkOS as this address has full control of the workspace.
 */
export function bootstrapEmail(): string | undefined {
  return process.env.WORKOS_BOOTSTRAP_EMAIL?.trim().toLowerCase() || undefined;
}
