import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgScoped, timestamps } from "./_shared";
import { defectSeverityEnum, qaResultEnum } from "./enums";
import { projects } from "./projects";

/** Reusable checklist definition, managed in Admin. */
export const checklistTemplates = pgTable(
  "checklist_templates",
  {
    ...orgScoped,
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("checklist_templates_org_idx").on(t.orgId, t.name)],
);

export const checklistTemplateItems = pgTable(
  "checklist_template_items",
  {
    ...orgScoped,
    templateId: uuid("template_id").notNull().references(() => checklistTemplates.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    /** A failed critical item blocks the completion certificate outright. */
    isCritical: boolean("is_critical").notNull().default(false),
    requiresPhoto: boolean("requires_photo").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("checklist_template_items_org_template_idx").on(t.orgId, t.templateId, t.sortOrder)],
);

/** Created automatically when a project hits `installation_complete`. */
export const inspections = pgTable(
  "inspections",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => checklistTemplates.id, { onDelete: "set null" }),
    result: qaResultEnum("result").notNull().default("pending"),
    inspectorUserId: uuid("inspector_user_id"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("inspections_org_project_idx").on(t.orgId, t.projectId)],
);

export const inspectionItems = pgTable(
  "inspection_items",
  {
    ...orgScoped,
    inspectionId: uuid("inspection_id").notNull().references(() => inspections.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    isCritical: boolean("is_critical").notNull().default(false),
    /** null until the inspector answers. */
    passed: boolean("passed"),
    comment: text("comment"),
    photoId: uuid("photo_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("inspection_items_org_inspection_idx").on(t.orgId, t.inspectionId, t.sortOrder)],
);

export const defects = pgTable(
  "defects",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    inspectionId: uuid("inspection_id").references(() => inspections.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    severity: defectSeverityEnum("severity").notNull().default("minor"),
    assigneeUserId: uuid("assignee_user_id"),
    dueOn: timestamp("due_on", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id"),
    ...timestamps,
  },
  (t) => [index("defects_org_project_idx").on(t.orgId, t.projectId, t.severity)],
);

export const completionCertificates = pgTable(
  "completion_certificates",
  {
    ...orgScoped,
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    inspectionId: uuid("inspection_id").references(() => inspections.id, { onDelete: "set null" }),
    reference: text("reference").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    issuedByUserId: uuid("issued_by_user_id"),
    documentId: uuid("document_id"),
    customerSignedAt: timestamp("customer_signed_at", { withTimezone: true }),
    customerSignatureName: text("customer_signature_name"),
    ...timestamps,
  },
  (t) => [index("completion_certificates_org_project_idx").on(t.orgId, t.projectId)],
);
