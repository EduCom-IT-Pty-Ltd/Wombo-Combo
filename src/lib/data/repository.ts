import "server-only";
import * as demo from "./demo-data";
import type {
  Assignment,
  Customer,
  Defect,
  DocumentRecord,
  Inspection,
  LeaveEntry,
  MaterialUse,
  Person,
  ProjectDetail,
  ProjectEvent,
  ProjectSummary,
  QuoteSummary,
  Task,
  TimeEntry,
  Variation,
} from "./types";
import type { ProjectStatus } from "@/lib/db/schema/enums";
import { calculateCosting, entryHours, type CostingResult } from "@/lib/domain/costing";
import { EMPTY_CONTEXT, type TransitionContext } from "@/lib/domain/status";

/**
 * Repository layer. Every screen reads through here, so replacing the demo store
 * with Drizzle queries is a change to these function bodies only.
 *
 * Each function takes `orgId` first — the signature makes an unscoped query
 * awkward to write by accident. In the Drizzle implementation every `where`
 * clause starts `eq(table.orgId, orgId)`.
 */

// TODO(neon): swap each body for a Drizzle query once DATABASE_URL is set.
// The demo store ignores orgId because it holds a single tenant.

export async function listPeople(_orgId: string): Promise<Person[]> {
  return demo.people;
}

export async function getPerson(orgId: string, id: string): Promise<Person | null> {
  return (await listPeople(orgId)).find((p) => p.id === id) ?? null;
}

export async function listCustomers(_orgId: string): Promise<Customer[]> {
  return [...demo.customers].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCustomer(orgId: string, id: string): Promise<Customer | null> {
  return (await listCustomers(orgId)).find((c) => c.id === id) ?? null;
}

export interface ProjectFilters {
  status?: ProjectStatus[];
  customerId?: string;
  search?: string;
  assignedTo?: string;
}

export async function listProjects(_orgId: string, filters: ProjectFilters = {}): Promise<ProjectSummary[]> {
  let rows: ProjectSummary[] = demo.projects;

  if (filters.status?.length) {
    rows = rows.filter((p) => filters.status!.includes(p.status));
  }
  if (filters.customerId) {
    rows = rows.filter((p) => p.customerId === filters.customerId);
  }
  if (filters.assignedTo) {
    rows = rows.filter((p) => p.assignedInstallerIds.includes(filters.assignedTo!));
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.projectNumber.toLowerCase().includes(q) ||
        p.customerName.toLowerCase().includes(q),
    );
  }
  return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(_orgId: string, id: string): Promise<ProjectDetail | null> {
  return demo.projects.find((p) => p.id === id) ?? null;
}

export async function listQuotes(_orgId: string, projectId: string): Promise<QuoteSummary[]> {
  return demo.quotes.filter((q) => q.projectId === projectId).sort((a, b) => b.version - a.version);
}

export async function listTasks(_orgId: string, opts: { projectId?: string; assigneeId?: string } = {}): Promise<Task[]> {
  return demo.tasks.filter(
    (t) =>
      (!opts.projectId || t.projectId === opts.projectId) &&
      (!opts.assigneeId || t.assigneeId === opts.assigneeId),
  );
}

export async function listAssignments(
  _orgId: string,
  opts: { projectId?: string; userId?: string; from?: Date; to?: Date } = {},
): Promise<Assignment[]> {
  return demo.assignments
    .filter((a) => {
      if (opts.projectId && a.projectId !== opts.projectId) return false;
      if (opts.userId && a.userId !== opts.userId) return false;
      if (opts.from && new Date(a.endsAt) < opts.from) return false;
      if (opts.to && new Date(a.startsAt) > opts.to) return false;
      return true;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function listLeave(_orgId: string, opts: { userId?: string } = {}): Promise<LeaveEntry[]> {
  return demo.leave.filter((l) => !opts.userId || l.userId === opts.userId);
}

export async function listTimeEntries(
  _orgId: string,
  opts: { projectId?: string; userId?: string } = {},
): Promise<TimeEntry[]> {
  return demo.timeEntries.filter(
    (t) => (!opts.projectId || t.projectId === opts.projectId) && (!opts.userId || t.userId === opts.userId),
  );
}

export async function getOpenTimeEntry(orgId: string, userId: string): Promise<TimeEntry | null> {
  const entries = await listTimeEntries(orgId, { userId });
  return entries.find((t) => t.endedAt === null) ?? null;
}

export async function listMaterials(_orgId: string, projectId: string): Promise<MaterialUse[]> {
  return demo.materials.filter((m) => m.projectId === projectId);
}

export async function listVariations(_orgId: string, projectId: string): Promise<Variation[]> {
  return demo.variations.filter((v) => v.projectId === projectId);
}

export async function listDocuments(_orgId: string, projectId: string): Promise<DocumentRecord[]> {
  return demo.documents.filter((d) => d.projectId === projectId);
}

export async function listInspections(_orgId: string, projectId: string): Promise<Inspection[]> {
  return demo.inspections.filter((i) => i.projectId === projectId);
}

export async function listDefects(_orgId: string, opts: { projectId?: string } = {}): Promise<Defect[]> {
  return demo.defects.filter((d) => !opts.projectId || d.projectId === opts.projectId);
}

export async function listEvents(_orgId: string, projectId: string): Promise<ProjectEvent[]> {
  return demo.events
    .filter((e) => e.projectId === projectId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/**
 * Assembles the facts the status machine's guards evaluate against. Kept here
 * rather than in the domain layer so `status.ts` stays free of data access.
 */
export async function buildTransitionContext(orgId: string, project: ProjectDetail): Promise<TransitionContext> {
  const [quotes, assignments, tasks, inspections, defects] = await Promise.all([
    listQuotes(orgId, project.id),
    listAssignments(orgId, { projectId: project.id }),
    listTasks(orgId, { projectId: project.id }),
    listInspections(orgId, project.id),
    listDefects(orgId, { projectId: project.id }),
  ]);

  const latestInspection = inspections.at(-1);

  return {
    ...EMPTY_CONTEXT,
    hasInternallyApprovedQuote: quotes.some((q) =>
      ["approved_internally", "sent", "accepted"].includes(q.status),
    ),
    hasAcceptedQuote: quotes.some((q) => q.status === "accepted"),
    hasPurchaseOrder: Boolean(project.poNumber && project.poReceivedAt),
    depositSatisfied: !project.depositRequiredCents || Boolean(project.depositReceivedAt),
    hasConfirmedAssignment: assignments.some((a) => a.status === "confirmed"),
    hasScheduledDates: Boolean(project.scheduledStartAt && project.scheduledEndAt),
    allInstallTasksDone: tasks
      .filter((t) => t.kind === "install")
      .every((t) => t.status === "done" || t.status === "cancelled"),
    qaPassed: latestInspection?.result === "pass" || latestInspection?.result === "pass_with_defects",
    openCriticalDefects: defects.filter((d) => !d.resolvedAt && d.severity === "critical").length,
    costingFinalised: project.status === "ready_for_invoice" || project.status === "closed",
    invoicePaid: project.status === "closed",
  };
}

export async function getCosting(orgId: string, project: ProjectDetail): Promise<CostingResult> {
  const [entries, materials, variations, quotes] = await Promise.all([
    listTimeEntries(orgId, { projectId: project.id }),
    listMaterials(orgId, project.id),
    listVariations(orgId, project.id),
    listQuotes(orgId, project.id),
  ]);

  const accepted = quotes.find((q) => q.status === "accepted");

  return calculateCosting({
    quotedSellCents: accepted?.subtotalSellCents ?? project.contractValueCents,
    quotedCostCents: accepted?.subtotalCostCents ?? Math.round(project.contractValueCents * 0.7),
    labour: entries.map((e) => ({
      hours: entryHours(new Date(e.startedAt), e.endedAt ? new Date(e.endedAt) : null, e.breakMinutes),
      costRateCentsPerHour: e.costRateCentsPerHour,
    })),
    materials: materials.map((m) => ({ quantity: m.quantity, unitCostCents: m.unitCostCents })),
    variations: variations.map((v) => ({
      status: v.status,
      quotedSellCents: v.quotedSellCents,
      estimatedCostCents: v.estimatedCostCents,
    })),
  });
}

export interface DashboardMetrics {
  activeProjects: number;
  onSiteNow: number;
  awaitingScheduling: number;
  quotesOutstandingCents: number;
  quotesOutstandingCount: number;
  wipValueCents: number;
  readyToInvoiceCents: number;
  openDefects: number;
  overdueTasks: number;
}

export async function getDashboardMetrics(orgId: string): Promise<DashboardMetrics> {
  const [projects, tasks, defects] = await Promise.all([
    listProjects(orgId),
    listTasks(orgId),
    listDefects(orgId),
  ]);
  const openEntries = demo.timeEntries.filter((t) => t.endedAt === null);
  const now = new Date();

  const pending: ProjectStatus[] = ["quote_sent", "awaiting_approval"];
  const wip: ProjectStatus[] = ["scheduled", "in_progress", "installation_complete", "qa"];

  return {
    activeProjects: projects.filter((p) => !["closed", "lost", "cancelled"].includes(p.status)).length,
    onSiteNow: openEntries.length,
    awaitingScheduling: projects.filter((p) => p.status === "waiting_for_scheduling").length,
    quotesOutstandingCents: projects
      .filter((p) => pending.includes(p.status))
      .reduce((s, p) => s + p.contractValueCents, 0),
    quotesOutstandingCount: projects.filter((p) => pending.includes(p.status)).length,
    wipValueCents: projects.filter((p) => wip.includes(p.status)).reduce((s, p) => s + p.contractValueCents, 0),
    readyToInvoiceCents: projects
      .filter((p) => p.status === "ready_for_invoice")
      .reduce((s, p) => s + p.contractValueCents, 0),
    openDefects: defects.filter((d) => !d.resolvedAt).length,
    overdueTasks: tasks.filter(
      (t) => t.dueOn && new Date(t.dueOn) < now && t.status !== "done" && t.status !== "cancelled",
    ).length,
  };
}
