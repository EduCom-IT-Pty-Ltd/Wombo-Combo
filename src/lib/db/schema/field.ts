import { index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgScoped, timestamps } from "./_shared";
import { variationStatusEnum } from "./enums";
import { projects } from "./projects";
import { priceListItems } from "./quoting";

/**
 * Clock on / clock off. `endedAt` null means the installer is currently on site.
 * Location is captured at both ends for attendance evidence.
 */
export const timeEntries = pgTable(
  "time_entries",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    breakMinutes: integer("break_minutes").notNull().default(0),
    /**
     * Set while a shift is paused, cleared on resume with the elapsed pause
     * added to `breakMinutes`. Nullable rather than a boolean so the resume can
     * work out how long the pause lasted without a second column.
     */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    startLatitude: text("start_latitude"),
    startLongitude: text("start_longitude"),
    endLatitude: text("end_latitude"),
    endLongitude: text("end_longitude"),
    notes: text("notes"),
    /** Snapshotted from the membership so a later rate change can't rewrite history. */
    costRateCentsPerHour: integer("cost_rate_cents_per_hour").notNull().default(0),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("time_entries_org_project_idx").on(t.orgId, t.projectId),
    index("time_entries_org_user_open_idx").on(t.orgId, t.userId, t.endedAt),
  ],
);

/** Materials actually consumed on site — the counterpart to the quoted estimate. */
export const materialUsage = pgTable(
  "material_usage",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    priceListItemId: uuid("price_list_item_id").references(() => priceListItems.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("ea"),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    recordedByUserId: uuid("recorded_by_user_id"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("material_usage_org_project_idx").on(t.orgId, t.projectId)],
);

/** Scope changes raised from the field. Approved variations feed final costing. */
export const variations = pgTable(
  "variations",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: variationStatusEnum("status").notNull().default("draft"),
    estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
    quotedSellCents: integer("quoted_sell_cents").notNull().default(0),
    raisedByUserId: uuid("raised_by_user_id"),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("variations_org_project_idx").on(t.orgId, t.projectId, t.status)],
);
