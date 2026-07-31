import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgScoped, timestamps } from "./_shared";
import { assignmentStatusEnum, leaveStatusEnum, leaveTypeEnum } from "./enums";
import { projects } from "./projects";

/** A named crew that can be allocated as a unit instead of person-by-person. */
export const crews = pgTable(
  "crews",
  {
    ...orgScoped,
    name: text("name").notNull(),
    leadUserId: uuid("lead_user_id"),
    ...timestamps,
  },
  (t) => [index("crews_org_idx").on(t.orgId, t.name)],
);

export const crewMembers = pgTable(
  "crew_members",
  {
    ...orgScoped,
    crewId: uuid("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    ...timestamps,
  },
  (t) => [index("crew_members_org_crew_idx").on(t.orgId, t.crewId)],
);

/**
 * A block of booked time for one installer on one project. Conflict detection
 * (double-booking, approved leave) runs against this table plus `leaveRequests`
 * — see `src/lib/domain/scheduling.ts`.
 */
export const assignments = pgTable(
  "assignments",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    crewId: uuid("crew_id").references(() => crews.id, { onDelete: "set null" }),
    status: assignmentStatusEnum("status").notNull().default("tentative"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    role: text("role"),
    notes: text("notes"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("assignments_org_user_window_idx").on(t.orgId, t.userId, t.startsAt, t.endsAt),
    index("assignments_org_project_idx").on(t.orgId, t.projectId),
  ],
);

/** HR module: annual/sick leave and general unavailability. Blocks scheduling. */
export const leaveRequests = pgTable(
  "leave_requests",
  {
    ...orgScoped,
    userId: uuid("user_id").notNull(),
    type: leaveTypeEnum("type").notNull().default("annual"),
    status: leaveStatusEnum("status").notNull().default("requested"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    decidedByUserId: uuid("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("leave_requests_org_user_window_idx").on(t.orgId, t.userId, t.startsAt, t.endsAt)],
);

/**
 * Call-Ups: a named piece of work assigned to one person on one day.
 *
 * Distinct from `milestones`, which is a target date with no assignee, and from
 * `assignments`, which books a person across a time range. A Call-Up is the
 * day-level unit the field calendar is built from.
 */
export const schedulePhases = pgTable(
  "schedule_phases",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    userId: uuid("user_id").notNull(),
    /** Date only — a Call-Up is a day's work, not a time range. */
    date: date("date").notNull(),
    /** Set when created by the QA inspection scheduler. */
    inspectionId: uuid("inspection_id"),
    ...timestamps,
  },
  (t) => [
    index("schedule_phases_org_project_idx").on(t.orgId, t.projectId),
    index("schedule_phases_org_user_date_idx").on(t.orgId, t.userId, t.date),
  ],
);
