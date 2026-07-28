import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { roleEnum } from "./enums";
import { timestamps } from "./_shared";

/** One row per customer of *ours*. Maps 1:1 to a WorkOS Organization. */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workosOrgId: text("workos_org_id").unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Prefix for generated project numbers, e.g. "WC" -> WC-2026-0041. */
  projectNumberPrefix: text("project_number_prefix").notNull().default("PRJ"),
  timezone: text("timezone").notNull().default("Australia/Sydney"),
  currency: text("currency").notNull().default("AUD"),
  /** Feature flags / tunables so we avoid a settings table per module. */
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

/** Mirrors the WorkOS user directory; WorkOS remains the source of truth. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  workosUserId: text("workos_user_id").unique(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  avatarUrl: text("avatar_url"),
  phone: text("phone"),
  ...timestamps,
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("staff"),
    /** Installers are schedulable resources; office staff are not. */
    isSchedulable: boolean("is_schedulable").notNull().default(false),
    /** Cost rate used for job costing, in cents per hour. */
    costRateCents: text("cost_rate_cents"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_org_user_idx").on(t.orgId, t.userId),
    index("memberships_org_role_idx").on(t.orgId, t.role),
  ],
);

/** Trade/licence certifications — spec: HR module. */
export const certifications = pgTable(
  "certifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    identifier: text("identifier"),
    issuedOn: timestamp("issued_on", { withTimezone: true }),
    expiresOn: timestamp("expires_on", { withTimezone: true }),
    documentId: uuid("document_id"),
    ...timestamps,
  },
  (t) => [index("certifications_org_expiry_idx").on(t.orgId, t.expiresOn)],
);
