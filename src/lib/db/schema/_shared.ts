import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Every tenant-owned row carries `orgId`. Nothing is queried without it —
 * see `src/lib/db/tenant.ts` for the scoping helper that enforces this.
 */
export const orgScoped = {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
};

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Marker so table files stay consistent about the pgTable import. */
export { pgTable };
