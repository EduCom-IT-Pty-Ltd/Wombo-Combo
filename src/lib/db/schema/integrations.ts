import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orgScoped, timestamps } from "./_shared";

/**
 * OAuth connections to external systems that cannot be configured from env.
 *
 * Xero's Web App flow issues a refresh token that rotates on every use, so it
 * has to be written back on each refresh — an env var would be stale after the
 * first one. It also expires after 60 days unused, at which point a human has to
 * re-authorise in a browser.
 *
 * Both tokens are stored encrypted (see `integrations/xero/crypto.ts`). They
 * grant write access to the customer's accounting system, so a database dump on
 * its own should not be enough to use them.
 */
export const xeroConnections = pgTable(
  "xero_connections",
  {
    ...orgScoped,
    /** The Xero organisation this connection is authorised against. */
    tenantId: text("tenant_id").notNull(),
    tenantName: text("tenant_name"),
    /** AES-256-GCM, keyed from XERO_TOKEN_KEY. Never plaintext. */
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    /** When the access token expires — refreshed proactively before this. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /**
     * Xero invalidates a refresh token 60 days after its last use. Recorded so
     * the Finance screen can warn before a connection silently dies.
     */
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }).notNull().defaultNow(),
    connectedByUserId: uuid("connected_by_user_id"),
    /** Set when a refresh fails terminally; cleared on the next success. */
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    // One connection per org: this is a single-tenant deployment, and a second
    // row would make "which one do we use" ambiguous at every call site.
    uniqueIndex("xero_connections_org_idx").on(t.orgId),
    index("xero_connections_tenant_idx").on(t.tenantId),
  ],
);
