import "server-only";
import { hasDatabase } from "@/lib/db";
import { listPeople as pgListPeople } from "./pg/org";
import * as pgCustomers from "./pg/customers";
import * as pgProjects from "./pg/projects";
import * as pgWorkflow from "./pg/workflow";
import * as pgQuotes from "./pg/quotes";
import * as pgField from "./pg/field";
import * as pgSettings from "./pg/settings";
import { readLocalStore, readStatusFieldTemplates, readStatusSettings as readLocalStatusSettings, readStatusTaskTemplates } from "./local-store";
import type {
  Assignment,
  Customer,
  CatalogueMaterial,
  CustomerPriceList,
  LabourSettings,
  ProjectCostingOptions,
  QuoteDocumentTemplateSettings,
  ProductionTemplate,
  ProjectTemplate,
  SchedulePhaseView,
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
  WorkflowField,
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

/**
 * PORTED. Reads from Postgres whenever a database exists, rather than waiting
 * for `DEMO_MODE` to be cleared — see the note on `hasDatabase`. People must
 * come from the same place the auth gate reads, or the list of who can sign in
 * and the list the app displays drift apart.
 */
export async function listPeople(orgId: string): Promise<Person[]> {
  if (hasDatabase) return pgListPeople(orgId);
  return (await readLocalStore()).people;
}

/** PORTED by derivation — reads through listPeople. */
export async function getPerson(orgId: string, id: string): Promise<Person | null> {
  return (await listPeople(orgId)).find((p) => p.id === id) ?? null;
}

/** PORTED. */
export async function listCustomers(orgId: string): Promise<Customer[]> {
  if (hasDatabase) return pgCustomers.listCustomers(orgId);
  return [...(await readLocalStore()).customers].sort((a, b) => a.name.localeCompare(b.name));
}

/** PORTED. Archived is `active = false`, not a separate table. */
export async function listArchivedCustomers(orgId: string): Promise<Customer[]> {
  if (hasDatabase) return pgCustomers.listArchivedCustomers(orgId);
  return [...(await readLocalStore()).archivedCustomers].sort((a, b) => a.name.localeCompare(b.name));
}

/** PORTED. */
export async function isCustomerArchived(orgId: string, id: string): Promise<boolean> {
  if (hasDatabase) return pgCustomers.isCustomerArchived(orgId, id);
  return (await readLocalStore()).archivedCustomers.some((customer) => customer.id === id);
}

/** PORTED. */
export async function listCatalogueMaterials(orgId: string): Promise<CatalogueMaterial[]> {
  if (hasDatabase) return pgSettings.listCatalogueMaterials(orgId);
  return [...(await readLocalStore()).catalogueMaterials].sort((a, b) => a.name.localeCompare(b.name));
}

/** PORTED. */
export async function listCustomerPriceLists(orgId: string): Promise<CustomerPriceList[]> {
  if (hasDatabase) return pgSettings.listCustomerPriceLists(orgId);
  return [...(await readLocalStore()).customerPriceLists].sort((a, b) => a.name.localeCompare(b.name));
}

/** PORTED. */
export async function getLabourSettings(orgId: string): Promise<LabourSettings> {
  if (hasDatabase) return pgSettings.getLabourSettings(orgId);
  return (await readLocalStore()).labourSettings;
}

/** PORTED. */
export async function getProjectCostingOptions(orgId: string, projectId: string): Promise<ProjectCostingOptions> {
  if (hasDatabase) return pgSettings.getProjectCostingOptions(orgId, projectId);
  return (await readLocalStore()).projectCostingOptions[projectId] ?? { standardLabourEnabled: false, employeeCount: 0, includeSubcontractorMaterialCosts: false };
}

/** PORTED. Falls back to the packaged default until an admin saves one. */
export async function getQuoteDocumentTemplateSettings(orgId: string): Promise<QuoteDocumentTemplateSettings> {
  if (hasDatabase) {
    const saved = await pgSettings.getQuoteDocumentTemplateSettings(orgId);
    if (saved) return saved;
  }
  return (await readLocalStore()).quoteDocumentTemplate;
}

/** PORTED. */
export async function listProductionTemplates(orgId: string): Promise<ProductionTemplate[]> {
  if (hasDatabase) return pgSettings.listProductionTemplates(orgId);
  return [...(await readLocalStore()).productionTemplates].sort((a, b) => a.name.localeCompare(b.name));
}

/** PORTED. */
export async function listProjectTemplates(orgId: string): Promise<ProjectTemplate[]> {
  if (hasDatabase) return pgSettings.listProjectTemplates(orgId);
  return [...(await readLocalStore()).projectTemplates].sort((a, b) => a.name.localeCompare(b.name));
}

/** PORTED. */
export async function getCustomer(orgId: string, id: string): Promise<Customer | null> {
  if (hasDatabase) return pgCustomers.getCustomer(orgId, id);
  const store = await readLocalStore();
  return store.customers.find((customer) => customer.id === id) ?? store.archivedCustomers.find((customer) => customer.id === id) ?? null;
}

export interface ProjectFilters {
  status?: ProjectStatus[];
  customerId?: string;
  search?: string;
  assignedTo?: string;
}

/** PORTED. Filtering happens in SQL rather than after loading every row. */
export async function listProjects(orgId: string, filters: ProjectFilters = {}): Promise<ProjectSummary[]> {
  if (hasDatabase) return pgProjects.listProjects(orgId, filters);
  let rows: ProjectSummary[] = (await readLocalStore()).projects;

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

/** PORTED. Archived is derived from status, not a separate flag. */
export async function listArchivedProjects(orgId: string): Promise<ProjectSummary[]> {
  if (hasDatabase) return pgProjects.listArchivedProjects(orgId);
  return [...(await readLocalStore()).archivedProjects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** PORTED. */
export async function isProjectArchived(orgId: string, id: string): Promise<boolean> {
  if (hasDatabase) return pgProjects.isProjectArchived(orgId, id);
  return (await readLocalStore()).archivedProjects.some((project) => project.id === id);
}

/** PORTED. */
export async function getProject(orgId: string, id: string): Promise<ProjectDetail | null> {
  if (hasDatabase) return pgProjects.getProject(orgId, id);
  const store = await readLocalStore();
  return store.projects.find((p) => p.id === id) ?? store.archivedProjects.find((p) => p.id === id) ?? null;
}

/** PORTED. */
export async function listQuotes(orgId: string, projectId: string): Promise<QuoteSummary[]> {
  if (hasDatabase) return pgQuotes.listQuotes(orgId, projectId);
  return (await readLocalStore()).quotes.filter((q) => q.projectId === projectId).sort((a, b) => b.version - a.version);
}

/** PORTED. */
export async function getQuote(orgId: string, id: string): Promise<QuoteSummary | null> {
  if (hasDatabase) return pgQuotes.getQuote(orgId, id);
  return (await readLocalStore()).quotes.find((quote) => quote.id === id) ?? null;
}

/**
 * PORTED. Checklist tasks for one workflow stage.
 *
 * Templates render immediately as virtual rows; a real task row exists only
 * once an item has been completed. That keeps an untouched checklist from
 * writing a dozen rows per project, and means changing a template does not
 * orphan anything.
 */
export async function listWorkflowTasks(orgId: string, projectId: string, status: ProjectStatus): Promise<Task[]> {
  const templates = hasDatabase
    ? (await pgSettings.getStatusTaskTemplates(orgId)) ?? (await readStatusTaskTemplates())
    : await readStatusTaskTemplates();

  const existing = hasDatabase
    ? await pgSettings.listWorkflowTaskRows(orgId, projectId)
    : (await readLocalStore()).tasks;

  return templates
    .filter((template) => template.status === status)
    .sort((a, b) => a.position - b.position)
    .map((template) => {
      const row = existing.find(
        (task) => task.projectId === projectId && task.workflowTemplateId === template.id,
      );
      if (row) {
        return {
          id: row.id,
          projectId,
          title: row.title,
          kind: row.kind as Task["kind"],
          status: row.status as Task["status"],
          assigneeId: "assigneeUserId" in row ? row.assigneeUserId : (row as Task).assigneeId,
          dueOn: row.dueOn instanceof Date ? row.dueOn.toISOString() : (row.dueOn ?? null),
          createdByAutomation: row.createdByAutomation ?? null,
          workflowStatus: status,
          workflowTemplateId: template.id,
          completedAt: row.completedAt instanceof Date ? row.completedAt.toISOString() : (row.completedAt ?? null),
        };
      }
      return {
        id: `virtual-${projectId}-${template.id}`,
        projectId,
        title: template.title,
        kind: "admin" as const,
        status: "todo" as const,
        assigneeId: null,
        dueOn: null,
        createdByAutomation: null,
        workflowStatus: status,
        workflowTemplateId: template.id,
        completedAt: null,
      };
    });
}

/** PORTED. */
export async function listWorkflowFields(orgId: string, projectId: string, status: ProjectStatus): Promise<WorkflowField[]> {
  const templates = hasDatabase
    ? (await pgSettings.getStatusFieldTemplates(orgId)) ?? (await readStatusFieldTemplates())
    : await readStatusFieldTemplates();

  const values = hasDatabase
    ? await pgSettings.getWorkflowFieldValues(orgId, projectId)
    : Object.fromEntries(
        (await readLocalStore()).workflowFieldValues
          .filter((entry) => entry.projectId === projectId)
          .map((entry) => [entry.templateId, { value: entry.value, updatedAt: entry.updatedAt }]),
      );

  return templates
    .filter((template) => template.status === status)
    .sort((a, b) => a.position - b.position)
    .map((template) => ({
      id: template.id,
      label: template.label,
      required: template.required ?? false,
      value: values[template.id]?.value ?? "",
      updatedAt: values[template.id]?.updatedAt ?? null,
    }));
}

/** PORTED. */
export async function listAssignments(
  orgId: string,
  opts: { projectId?: string; userId?: string; from?: Date; to?: Date } = {},
): Promise<Assignment[]> {
  if (hasDatabase) return pgField.listAssignments(orgId, opts);
  return (await readLocalStore()).assignments
    .filter((a) => {
      if (opts.projectId && a.projectId !== opts.projectId) return false;
      if (opts.userId && a.userId !== opts.userId) return false;
      if (opts.from && new Date(a.endsAt) < opts.from) return false;
      if (opts.to && new Date(a.startsAt) > opts.to) return false;
      return true;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** PORTED. */
export async function listSchedulePhases(orgId: string, opts: { projectId?: string; userId?: string } = {}): Promise<SchedulePhaseView[]> {
  if (hasDatabase) return pgSettings.listSchedulePhases(orgId, opts);
  const store = await readLocalStore();
  return store.schedulePhases
    .filter((phase) => (!opts.projectId || phase.projectId === opts.projectId) && (!opts.userId || phase.userId === opts.userId))
    .map((phase) => {
      const project = store.projects.find((item) => item.id === phase.projectId) ?? store.archivedProjects.find((item) => item.id === phase.projectId);
      return project ? { ...phase, projectNumber: project.projectNumber, projectTitle: project.title, siteLabel: project.siteLabel } : null;
    })
    .filter((phase): phase is SchedulePhaseView => phase !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.projectTitle.localeCompare(b.projectTitle));
}

/** PORTED. */
export async function listLeave(orgId: string, opts: { userId?: string } = {}): Promise<LeaveEntry[]> {
  if (hasDatabase) return pgField.listLeave(orgId);
  return (await readLocalStore()).leave.filter((l) => !opts.userId || l.userId === opts.userId);
}

/** PORTED. */
export async function listTimeEntries(
  orgId: string,
  opts: { projectId?: string; userId?: string } = {},
): Promise<TimeEntry[]> {
  if (hasDatabase) return pgField.listTimeEntries(orgId, opts);
  return (await readLocalStore()).timeEntries.filter(
    (t) => (!opts.projectId || t.projectId === opts.projectId) && (!opts.userId || t.userId === opts.userId),
  );
}

/** PORTED. */
export async function getOpenTimeEntry(orgId: string, userId: string): Promise<TimeEntry | null> {
  if (hasDatabase) return pgField.getOpenTimeEntry(orgId, userId);
  const entries = await listTimeEntries(orgId, { userId });
  return entries.find((t) => t.endedAt === null) ?? null;
}

/** PORTED. */
export async function listMaterials(orgId: string, projectId: string): Promise<MaterialUse[]> {
  if (hasDatabase) return pgField.listMaterials(orgId, projectId);
  return (await readLocalStore()).materials.filter((m) => m.projectId === projectId);
}

/** PORTED. */
export async function listVariations(orgId: string, projectId: string): Promise<Variation[]> {
  if (hasDatabase) return pgField.listVariations(orgId, projectId);
  return (await readLocalStore()).variations.filter((v) => v.projectId === projectId);
}

/** PORTED. */
export async function listDocuments(orgId: string, projectId: string): Promise<DocumentRecord[]> {
  if (hasDatabase) return pgField.listDocuments(orgId, projectId);
  return (await readLocalStore()).documents.filter((d) => d.projectId === projectId);
}

/** PORTED. */
export async function listInspections(orgId: string, projectId: string): Promise<Inspection[]> {
  if (hasDatabase) return pgField.listInspections(orgId, projectId);
  return (await readLocalStore()).inspections.filter((i) => i.projectId === projectId);
}

/** PORTED. */
export async function listDefects(orgId: string, opts: { projectId?: string } = {}): Promise<Defect[]> {
  if (hasDatabase) return pgField.listDefects(orgId, opts);
  return (await readLocalStore()).defects.filter((d) => !opts.projectId || d.projectId === opts.projectId);
}

/** PORTED. */
export async function listEvents(orgId: string, projectId: string): Promise<ProjectEvent[]> {
  if (hasDatabase) return pgWorkflow.listEvents(orgId, projectId);
  return (await readLocalStore()).events
    .filter((e) => e.projectId === projectId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/**
 * Assembles the facts the status machine's guards evaluate against. Kept here
 * rather than in the domain layer so `status.ts` stays free of data access.
 */
/** PORTED by derivation — composes ported reads only. */
export async function buildTransitionContext(orgId: string, project: ProjectDetail): Promise<TransitionContext> {
  const [quotes, assignments, inspections, defects] = await Promise.all([
    listQuotes(orgId, project.id),
    listAssignments(orgId, { projectId: project.id }),
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
    // Project progression is controlled by the status checklist, not a
    // separate legacy task board.
    allInstallTasksDone: true,
    qaPassed: latestInspection?.result === "pass" || latestInspection?.result === "pass_with_defects",
    openCriticalDefects: defects.filter((d) => !d.resolvedAt && d.severity === "critical").length,
    costingFinalised: project.status === "ready_for_invoice" || project.status === "closed",
    invoicePaid: project.status === "closed",
  };
}

/** PORTED by derivation — composes ported reads only. */
export async function getCosting(orgId: string, project: ProjectDetail): Promise<CostingResult> {
  const [quotes, entries, labourSettings, costingOptions] = await Promise.all([
    listQuotes(orgId, project.id),
    listTimeEntries(orgId, { projectId: project.id }),
    getLabourSettings(orgId),
    getProjectCostingOptions(orgId, project.id),
  ]);
  const quote = quotes[0];
  const subcontractorRates = new Map(labourSettings.subcontractorMaterialRates.map((rate) => [rate.materialId, rate.costCentsPerM2]));
  const subcontractorMaterialCostCents = costingOptions.includeSubcontractorMaterialCosts ? (quote?.lines ?? []).reduce((sum, line) => sum + Math.round(line.quantity * (line.catalogueMaterialId ? subcontractorRates.get(line.catalogueMaterialId) ?? 0 : 0)), 0) : 0;
  const budgetedLabourCostCents = labourSettings.standardLabourEnabled && costingOptions.standardLabourEnabled ? labourSettings.standardLabourCostCentsPerEmployee * costingOptions.employeeCount : 0;
  return calculateCosting({
    quotedSellCents: quote?.subtotalSellCents ?? 0,
    quotedCostCents: quote?.subtotalCostCents ?? 0,
    labour: entries.map((entry) => ({
      hours: entryHours(new Date(entry.startedAt), entry.endedAt ? new Date(entry.endedAt) : null, entry.breakMinutes),
      costRateCentsPerHour: entry.costRateCentsPerHour,
    })),
    materials: (quote?.lines ?? []).map((line) => ({ quantity: line.quantity, unitCostCents: line.unitCostCents })),
    budgetedLabourCostCents,
    subcontractorMaterialCostCents,
    variations: [],
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
}

/** PORTED by derivation — composes ported reads only. */
export async function getDashboardMetrics(orgId: string): Promise<DashboardMetrics> {
  const [projects, defects] = await Promise.all([
    listProjects(orgId),
    listDefects(orgId),
  ]);
  // Was reading readLocalStore() directly, which bypassed the repository and
  // would have reported JSON-store shifts on a database-backed deployment.
  const openEntries = (await listTimeEntries(orgId)).filter((t) => t.endedAt === null);

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
  };
}


/**
 * Search index for the top bar. Deliberately not `listProjects` /
 * `listCustomers`: those run six and three extra aggregate queries respectively,
 * and the top bar renders on every page, so using them multiplied the cost of
 * the whole application.
 */
export async function listSearchIndex(orgId: string, includeCustomers: boolean) {
  if (!hasDatabase) {
    const store = await readLocalStore();
    return {
      projects: store.projects.map(({ id, title, projectNumber, customerName, siteLabel }) => ({ id, title, projectNumber, customerName, siteLabel })),
      customers: includeCustomers ? store.customers.map(({ id, name, primaryContactName }) => ({ id, name, primaryContactName })) : [],
    };
  }
  const [projects, customers] = await Promise.all([
    pgProjects.listProjectsForSearch(orgId),
    includeCustomers ? pgCustomers.listCustomersForSearch(orgId) : Promise.resolve([]),
  ]);
  return { projects, customers };
}

/**
 * PORTED. The layout previously imported `readStatusSettings` from the JSON
 * store directly, so a status flow edited in Settings was saved to Postgres and
 * then never read back.
 */
export async function getStatusSettings(orgId: string) {
  if (hasDatabase) {
    const saved = await pgSettings.getStatusSettings(orgId);
    if (saved) return saved;
  }
  return readLocalStatusSettings();
}
