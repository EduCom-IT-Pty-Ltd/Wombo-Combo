import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orgScoped, timestamps } from "./_shared";
import { projectStatusEnum, taskKindEnum, taskStatusEnum } from "./enums";
import { customers, sites } from "./crm";

/**
 * The spine of the platform. Everything else hangs off a project — the status
 * column is the single source of truth for where a job sits in the workflow.
 */
export const projects = pgTable(
  "projects",
  {
    ...orgScoped,
    /** Human-facing, generated on create: `${prefix}-${year}-${seq}`. */
    projectNumber: text("project_number").notNull(),
    title: text("title").notNull(),
    status: projectStatusEnum("status").notNull().default("new_request"),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    siteId: uuid("site_id").references(() => sites.id),
    primaryContactId: uuid("primary_contact_id"),

    scopeOfWorks: text("scope_of_works"),
    initialNotes: text("initial_notes"),

    projectManagerId: uuid("project_manager_id"),
    estimatorId: uuid("estimator_id"),

    /** Set when the customer approves; drives the PO chase automation. */
    poNumber: text("po_number"),
    poReceivedAt: timestamp("po_received_at", { withTimezone: true }),
    depositRequiredCents: integer("deposit_required_cents"),
    depositReceivedAt: timestamp("deposit_received_at", { withTimezone: true }),

    /** Denormalised from the accepted quote so pipeline views stay cheap. */
    contractValueCents: integer("contract_value_cents").notNull().default(0),
    acceptedQuoteId: uuid("accepted_quote_id"),

    requestedStartOn: timestamp("requested_start_on", { withTimezone: true }),
    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
    scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
    installationCompletedAt: timestamp("installation_completed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),

    /** Where to resume when a hold is lifted. Set on entering `on_hold`. */
    heldFromStatus: projectStatusEnum("held_from_status"),
    holdReason: text("hold_reason"),

    /** Free-form extension point: custom fields per org without migrations. */
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("projects_org_number_idx").on(t.orgId, t.projectNumber),
    index("projects_org_status_idx").on(t.orgId, t.status),
    index("projects_org_customer_idx").on(t.orgId, t.customerId),
    index("projects_org_scheduled_idx").on(t.orgId, t.scheduledStartAt),
  ],
);

/** Per-org, per-year counter backing `projectNumber`. Incremented in a txn. */
export const projectNumberSequences = pgTable(
  "project_number_sequences",
  {
    orgId: uuid("org_id").notNull(),
    year: integer("year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (t) => [uniqueIndex("project_number_sequences_pk").on(t.orgId, t.year)],
);

/**
 * Append-only audit + activity feed. Every status transition, automation run and
 * notable mutation lands here; the project timeline reads straight off it.
 */
export const projectEvents = pgTable(
  "project_events",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    /** e.g. `status.changed`, `quote.sent`, `automation.qa_task_created`. */
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    fromStatus: projectStatusEnum("from_status"),
    toStatus: projectStatusEnum("to_status"),
    /** null = performed by the automation engine rather than a person. */
    actorUserId: uuid("actor_user_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_events_org_project_idx").on(t.orgId, t.projectId, t.occurredAt)],
);

export const tasks = pgTable(
  "tasks",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    kind: taskKindEnum("kind").notNull().default("general"),
    status: taskStatusEnum("status").notNull().default("todo"),
    assigneeUserId: uuid("assignee_user_id"),
    dueOn: timestamp("due_on", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Set when created by the automation engine, so we never double-create. */
    createdByAutomation: text("created_by_automation"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("tasks_org_project_idx").on(t.orgId, t.projectId),
    index("tasks_org_assignee_idx").on(t.orgId, t.assigneeUserId, t.status),
  ],
);

export const milestones = pgTable(
  "milestones",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetOn: timestamp("target_on", { withTimezone: true }),
    achievedAt: timestamp("achieved_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("milestones_org_project_idx").on(t.orgId, t.projectId)],
);

export const notes = pgTable(
  "notes",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorUserId: uuid("author_user_id"),
    /** Internal notes never appear on customer-facing exports. */
    visibility: text("visibility").notNull().default("internal"),
    ...timestamps,
  },
  (t) => [index("notes_org_project_idx").on(t.orgId, t.projectId, t.createdAt)],
);
