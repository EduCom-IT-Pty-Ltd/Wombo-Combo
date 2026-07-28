import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Canonical project status flow.
 *
 * The spec lists 14 "lifecycle stages" and 13 "statuses". They disagree, so we
 * treat the *Project Status Flow* section as canonical and the extra lifecycle
 * entries as surfaces rather than states:
 *   - "Project Workspace" and "Field Execution" -> collapsed into `in_progress`
 *     (they are UI modules available from `scheduled` onwards, not states)
 *   - "Completion Certificate" -> an artefact generated when QA passes, not a state
 *
 * `lost`, `cancelled` and `on_hold` are off-ramps the spec omits but every real
 * pipeline needs — a quote that is never approved has to go somewhere.
 */
export const PROJECT_STATUSES = [
  "new_request",
  "quoting",
  "quote_sent",
  "awaiting_approval",
  "approved",
  "waiting_for_scheduling",
  "scheduled",
  "in_progress",
  "installation_complete",
  "qa",
  "final_costing",
  "ready_for_invoice",
  "closed",
  "on_hold",
  "lost",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projectStatusEnum = pgEnum("project_status", PROJECT_STATUSES);

export const ROLES = [
  "owner",
  "admin",
  "manager",
  "finance",
  "staff",
] as const;
export type Role = (typeof ROLES)[number];
export const roleEnum = pgEnum("role", ROLES);

export const QUOTE_STATUSES = [
  "draft",
  "internal_review",
  "approved_internally",
  "sent",
  "accepted",
  "declined",
  "superseded",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const quoteStatusEnum = pgEnum("quote_status", QUOTE_STATUSES);

export const LINE_KINDS = ["labour", "material", "supplier", "freight", "subcontract", "other"] as const;
export type LineKind = (typeof LINE_KINDS)[number];
export const lineKindEnum = pgEnum("line_kind", LINE_KINDS);

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);

export const TASK_KINDS = ["general", "install", "qa", "procurement", "admin", "defect"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const taskKindEnum = pgEnum("task_kind", TASK_KINDS);

export const DOCUMENT_KINDS = [
  "drawing",
  "swms",
  "permit",
  "certificate",
  "photo",
  "purchase_order",
  "quote_pdf",
  "completion_certificate",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const documentKindEnum = pgEnum("document_kind", DOCUMENT_KINDS);

export const QA_RESULTS = ["pending", "pass", "pass_with_defects", "fail"] as const;
export type QaResult = (typeof QA_RESULTS)[number];
export const qaResultEnum = pgEnum("qa_result", QA_RESULTS);

export const DEFECT_SEVERITIES = ["minor", "major", "critical"] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];
export const defectSeverityEnum = pgEnum("defect_severity", DEFECT_SEVERITIES);

export const LEAVE_TYPES = ["annual", "sick", "unpaid", "public_holiday", "unavailable", "training"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const leaveTypeEnum = pgEnum("leave_type", LEAVE_TYPES);

export const LEAVE_STATUSES = ["requested", "approved", "declined", "cancelled"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const leaveStatusEnum = pgEnum("leave_status", LEAVE_STATUSES);

export const ASSIGNMENT_STATUSES = ["tentative", "confirmed", "declined", "completed", "cancelled"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export const assignmentStatusEnum = pgEnum("assignment_status", ASSIGNMENT_STATUSES);

export const VARIATION_STATUSES = ["draft", "submitted", "approved", "rejected", "invoiced"] as const;
export type VariationStatus = (typeof VARIATION_STATUSES)[number];
export const variationStatusEnum = pgEnum("variation_status", VARIATION_STATUSES);

export const INVOICE_STATUSES = ["pending_export", "exported", "paid", "failed"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const invoiceStatusEnum = pgEnum("invoice_status", INVOICE_STATUSES);
