import "server-only";
import { hasDatabase } from "@/lib/db";
import { once } from "./request-scope";
import * as pgOrg from "./pg/org";
import * as pgCustomers from "./pg/customers";
import * as pgProjects from "./pg/projects";
import * as pgWorkflow from "./pg/workflow";
import * as pgQuotes from "./pg/quotes";
import * as pgField from "./pg/field";
import * as pgSettings from "./pg/settings";
import { getLocalProjectType, getLocalRetroScope, readLocalStore, readStatusFieldTemplates, readStatusSettings as readLocalStatusSettings, readStatusTaskTemplates } from "./local-store";
import type {
  Assignment,
  Customer,
  CatalogueMaterial,
  CustomerPriceList,
  LabourSettings,
  OrganisationSettings,
  ProjectCostingOptions,
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
  SwmsRecord,
  SwmsTemplate,
  ProjectType,
  RetroScopeRecord,
} from "./types";
import type { ProjectStatus } from "@/lib/db/schema/enums";
import type { RolePermissionOverrides } from "@/lib/domain/permissions";
import type { StatusFieldTemplate, StatusTaskTemplate } from "@/lib/domain/status-settings";
import { calculateCosting, entryHours, type CostingResult } from "@/lib/domain/costing";
import { EMPTY_CONTEXT, type TransitionContext } from "@/lib/domain/status";

/**
 * Repository layer. Every screen reads through here, so replacing the demo store
 * with Drizzle queries is a change to these function bodies only.
 *
 * Each function takes `orgId` first — the signature makes an unscoped query
 * awkward to write by accident. In the Drizzle implementation every `where`
 * clause starts `eq(table.orgId, orgId)`.
 *
 * Reads are deduplicated per request through `once` — see `request-scope.ts`.
 * That is what lets a layout and the page it wraps both ask for the project
 * without paying for it twice, so no screen has to thread data it did not want.
 * The key must capture every argument that changes the result, or two different
 * questions get one answer.
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
  return once(`people:${orgId}`, async () => {
    if (hasDatabase) return pgOrg.listPeople(orgId);
    return (await readLocalStore()).people;
  });
}

/** PORTED by derivation — reads through listPeople. */
export async function getPerson(orgId: string, id: string): Promise<Person | null> {
  return (await listPeople(orgId)).find((p) => p.id === id) ?? null;
}

/** PORTED. */
export async function listCustomers(orgId: string): Promise<Customer[]> {
  return once(`customers:${orgId}`, async () => {
    if (hasDatabase) return pgCustomers.listCustomers(orgId);
    return [...(await readLocalStore()).customers].sort((a, b) => a.name.localeCompare(b.name));
  });
}

export interface CustomerOption {
  id: string;
  name: string;
  defaultProjectTemplateId: string | null;
}

/**
 * Customers as a picker sees them. `listCustomers` costs four queries because it
 * enriches each row with a contact, a site count and lifetime value; a dropdown
 * needs none of that.
 */
export async function listCustomerOptions(orgId: string): Promise<CustomerOption[]> {
  return once(`customerOptions:${orgId}`, async () => {
    if (hasDatabase) return pgCustomers.listCustomerOptions(orgId);
    return (await listCustomers(orgId)).map(({ id, name, defaultProjectTemplateId }) => ({
      id,
      name,
      defaultProjectTemplateId: defaultProjectTemplateId ?? null,
    }));
  });
}

/** PORTED. Archived is `active = false`, not a separate table. */
export async function listArchivedCustomers(orgId: string): Promise<Customer[]> {
  return once(`customers.archived:${orgId}`, async () => {
    if (hasDatabase) return pgCustomers.listArchivedCustomers(orgId);
    return [...(await readLocalStore()).archivedCustomers].sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** PORTED. */
export async function isCustomerArchived(orgId: string, id: string): Promise<boolean> {
  return once(`customer.archived:${orgId}:${id}`, async () => {
    if (hasDatabase) return pgCustomers.isCustomerArchived(orgId, id);
    return (await readLocalStore()).archivedCustomers.some((customer) => customer.id === id);
  });
}

/** PORTED. */
export async function listCatalogueMaterials(orgId: string): Promise<CatalogueMaterial[]> {
  return once(`catalogueMaterials:${orgId}`, async () => {
    if (hasDatabase) return pgSettings.listCatalogueMaterials(orgId);
    return [...(await readLocalStore()).catalogueMaterials].sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** Platform-only catalogue grouping and visibility. Material data remains Xero-owned. */
export async function getMaterialCataloguePresentation(orgId: string): Promise<import("./types").MaterialCataloguePresentation> {
  return once(`cataloguePresentation:${orgId}`, async () => {
    if (hasDatabase) return pgSettings.getMaterialCataloguePresentation(orgId);
    return (await readLocalStore()).materialCataloguePresentation;
  });
}

/** PORTED. */
export async function listCustomerPriceLists(orgId: string): Promise<CustomerPriceList[]> {
  return once(`customerPriceLists:${orgId}`, async () => {
    if (hasDatabase) return pgSettings.listCustomerPriceLists(orgId);
    return [...(await readLocalStore()).customerPriceLists].sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** PORTED. */
export async function getLabourSettings(orgId: string): Promise<LabourSettings> {
  return once(`labourSettings:${orgId}`, async () => {
    if (hasDatabase) return pgSettings.getLabourSettings(orgId);
    return (await readLocalStore()).labourSettings;
  });
}

/** PORTED. */
export async function getProjectCostingOptions(orgId: string, projectId: string): Promise<ProjectCostingOptions> {
  return once(`costingOptions:${orgId}:${projectId}`, async () => {
    if (hasDatabase) return pgSettings.getProjectCostingOptions(orgId, projectId);
    return (await readLocalStore()).projectCostingOptions[projectId] ?? { standardLabourEnabled: false, employeeCount: 0, includeSubcontractorMaterialCosts: false };
  });
}

/**
 * PORTED. The connected Xero organisation's short code, or null.
 *
 * Lives here rather than being imported straight from `integrations/xero` so
 * pages keep to the one read path, and so demo mode answers null without any
 * page having to know that Xero is a database-only concern. Memoised per
 * request: several quotes on one screen must not each provoke a lookup.
 */
export async function getXeroShortCode(orgId: string): Promise<string | null> {
  if (!hasDatabase) return null;
  return once(`xeroShortCode:${orgId}`, async () => {
    const { getXeroShortCode: read } = await import("@/lib/integrations/xero/links");
    return read(orgId);
  });
}

/** PORTED. */
export async function listProductionTemplates(orgId: string): Promise<ProductionTemplate[]> {
  return once(`productionTemplates:${orgId}`, async () => {
    if (hasDatabase) return pgSettings.listProductionTemplates(orgId);
    return [...(await readLocalStore()).productionTemplates].sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** PORTED. */
export async function listProjectTemplates(orgId: string): Promise<ProjectTemplate[]> {
  return once(`projectTemplates:${orgId}`, async () => {
    if (hasDatabase) return pgSettings.listProjectTemplates(orgId);
    return [...(await readLocalStore()).projectTemplates].sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function getSwmsTemplate(orgId: string): Promise<SwmsTemplate> {
  return once(`swmsTemplate:${orgId}`, async () => {
    if (hasDatabase) return pgSettings.getSwmsTemplate(orgId);
    const { DEFAULT_SWMS_TEMPLATE } = await import("@/lib/domain/swms");
    return structuredClone(DEFAULT_SWMS_TEMPLATE);
  });
}

export async function getProjectSwms(orgId: string, projectId: string): Promise<SwmsRecord | null> {
  return once(`projectSwms:${orgId}:${projectId}`, async () => hasDatabase ? pgSettings.getProjectSwms(orgId, projectId) : null);
}

export async function getProjectType(orgId: string, projectId: string): Promise<ProjectType> {
  return once(`projectType:${orgId}:${projectId}`, async () => hasDatabase ? pgSettings.getProjectType(orgId, projectId) : getLocalProjectType(projectId));
}

export async function getProjectRetroScope(orgId: string, projectId: string): Promise<RetroScopeRecord | null> {
  return once(`retroScope:${orgId}:${projectId}`, async () => hasDatabase ? pgSettings.getProjectRetroScope(orgId, projectId) : getLocalRetroScope(projectId));
}

/** PORTED. */
export async function getCustomer(orgId: string, id: string): Promise<Customer | null> {
  return once(`customer:${orgId}:${id}`, async () => {
    if (hasDatabase) return pgCustomers.getCustomer(orgId, id);
    const store = await readLocalStore();
    return store.customers.find((customer) => customer.id === id) ?? store.archivedCustomers.find((customer) => customer.id === id) ?? null;
  });
}

export interface ProjectFilters {
  status?: ProjectStatus[];
  customerId?: string;
  search?: string;
  assignedTo?: string;
}

/**
 * Spelled out rather than `JSON.stringify`d, so a filter added to the interface
 * without being added here is a missing property rather than a silently shared
 * cache entry.
 */
function filterKey(filters: ProjectFilters): string {
  return [filters.status?.join("+") ?? "", filters.customerId ?? "", filters.search ?? "", filters.assignedTo ?? ""].join("/");
}

/** PORTED. Filtering happens in SQL rather than after loading every row. */
export async function listProjects(orgId: string, filters: ProjectFilters = {}): Promise<ProjectSummary[]> {
  return once(`projects:${orgId}:${filterKey(filters)}`, () => loadProjects(orgId, filters));
}

async function loadProjects(orgId: string, filters: ProjectFilters): Promise<ProjectSummary[]> {
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
  return once(`projects.archived:${orgId}`, async () => {
    if (hasDatabase) return pgProjects.listArchivedProjects(orgId);
    return [...(await readLocalStore()).archivedProjects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}

/** PORTED. */
export async function isProjectArchived(orgId: string, id: string): Promise<boolean> {
  return once(`project.archived:${orgId}:${id}`, async () => {
    if (hasDatabase) return pgProjects.isProjectArchived(orgId, id);
    return (await readLocalStore()).archivedProjects.some((project) => project.id === id);
  });
}

/** PORTED. */
export async function getProject(orgId: string, id: string): Promise<ProjectDetail | null> {
  return once(`project:${orgId}:${id}`, async () => {
    if (hasDatabase) return pgProjects.getProject(orgId, id);
    const store = await readLocalStore();
    return store.projects.find((p) => p.id === id) ?? store.archivedProjects.find((p) => p.id === id) ?? null;
  });
}

/** PORTED. */
export async function listQuotes(orgId: string, projectId: string): Promise<QuoteSummary[]> {
  return once(`quotes:${orgId}:${projectId}`, async () => {
    if (hasDatabase) return pgQuotes.listQuotes(orgId, projectId);
    return (await readLocalStore()).quotes.filter((q) => q.projectId === projectId).sort((a, b) => b.version - a.version);
  });
}

/**
 * Quotes for many projects in one query, for the screens that show a row per
 * project. Called per project instead, a customer with thirty jobs cost sixty
 * queries to render one table.
 */
export async function listQuotesByProject(orgId: string, projectIds: string[]): Promise<Map<string, QuoteSummary[]>> {
  if (projectIds.length === 0) return new Map();
  const quotes = hasDatabase
    ? await pgQuotes.listQuotesForProjects(orgId, projectIds)
    : (await readLocalStore()).quotes.filter((quote) => projectIds.includes(quote.projectId));

  const byProject = new Map<string, QuoteSummary[]>();
  for (const quote of quotes) {
    const list = byProject.get(quote.projectId) ?? [];
    list.push(quote);
    byProject.set(quote.projectId, list);
  }
  for (const list of byProject.values()) list.sort((a, b) => b.version - a.version);
  return byProject;
}

/** PORTED. */
export async function getQuote(orgId: string, id: string): Promise<QuoteSummary | null> {
  return once(`quote:${orgId}:${id}`, async () => {
    if (hasDatabase) return pgQuotes.getQuote(orgId, id);
    return (await readLocalStore()).quotes.find((quote) => quote.id === id) ?? null;
  });
}

/**
 * PORTED. Checklist tasks for one workflow stage.
 *
 * Templates render immediately as virtual rows; a real task row exists only
 * once an item has been completed. That keeps an untouched checklist from
 * writing a dozen rows per project, and means changing a template does not
 * orphan anything.
 */
/**
 * The checklist is asked for one stage at a time, but neither the templates nor
 * the project's rows are stage-specific — so both are read once per request and
 * filtered per call. A project with fourteen stages in its flow used to issue
 * fifty-six queries to render one stepper.
 */
export function getStatusTaskTemplates(orgId: string): Promise<StatusTaskTemplate[]> {
  return once(`workflowTaskTemplates:${orgId}`, async () =>
    hasDatabase ? (await pgSettings.getStatusTaskTemplates(orgId)) ?? (await readStatusTaskTemplates()) : readStatusTaskTemplates(),
  );
}

function workflowTaskRows(orgId: string, projectId: string) {
  return once(`workflowTaskRows:${orgId}:${projectId}`, async () =>
    hasDatabase ? pgSettings.listWorkflowTaskRows(orgId, projectId) : (await readLocalStore()).tasks,
  );
}

export async function listWorkflowTasks(orgId: string, projectId: string, status: ProjectStatus): Promise<Task[]> {
  const [templates, existing] = await Promise.all([
    getStatusTaskTemplates(orgId),
    workflowTaskRows(orgId, projectId),
  ]);

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
/** Same shape as the checklist above, and read once per request for the same reason. */
export function getStatusFieldTemplates(orgId: string): Promise<StatusFieldTemplate[]> {
  return once(`workflowFieldTemplates:${orgId}`, async () =>
    hasDatabase ? (await pgSettings.getStatusFieldTemplates(orgId)) ?? (await readStatusFieldTemplates()) : readStatusFieldTemplates(),
  );
}

function workflowFieldValues(orgId: string, projectId: string) {
  return once(`workflowFieldValues:${orgId}:${projectId}`, async () =>
    hasDatabase
      ? pgSettings.getWorkflowFieldValues(orgId, projectId)
      : Object.fromEntries(
          (await readLocalStore()).workflowFieldValues
            .filter((entry) => entry.projectId === projectId)
            .map((entry) => [entry.templateId, { value: entry.value, updatedAt: entry.updatedAt }]),
        ),
  );
}

export async function listWorkflowFields(orgId: string, projectId: string, status: ProjectStatus): Promise<WorkflowField[]> {
  const [templates, values] = await Promise.all([
    getStatusFieldTemplates(orgId),
    workflowFieldValues(orgId, projectId),
  ]);

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
  const key = `assignments:${orgId}:${opts.projectId ?? ""}:${opts.userId ?? ""}:${opts.from?.getTime() ?? ""}:${opts.to?.getTime() ?? ""}`;
  return once(key, () => loadAssignments(orgId, opts));
}

async function loadAssignments(
  orgId: string,
  opts: { projectId?: string; userId?: string; from?: Date; to?: Date },
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
  return once(`schedulePhases:${orgId}:${opts.projectId ?? ""}:${opts.userId ?? ""}`, () => loadSchedulePhases(orgId, opts));
}

async function loadSchedulePhases(orgId: string, opts: { projectId?: string; userId?: string }): Promise<SchedulePhaseView[]> {
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
  return once(`leave:${orgId}:${opts.userId ?? ""}`, async () => {
    if (hasDatabase) return pgField.listLeave(orgId);
    return (await readLocalStore()).leave.filter((l) => !opts.userId || l.userId === opts.userId);
  });
}

/** PORTED. */
export async function listTimeEntries(
  orgId: string,
  opts: { projectId?: string; userId?: string } = {},
): Promise<TimeEntry[]> {
  return once(`timeEntries:${orgId}:${opts.projectId ?? ""}:${opts.userId ?? ""}`, async () => {
    if (hasDatabase) return pgField.listTimeEntries(orgId, opts);
    return (await readLocalStore()).timeEntries.filter(
      (t) => (!opts.projectId || t.projectId === opts.projectId) && (!opts.userId || t.userId === opts.userId),
    );
  });
}

/** PORTED. */
export async function getOpenTimeEntry(orgId: string, userId: string): Promise<TimeEntry | null> {
  return once(`timeEntry.open:${orgId}:${userId}`, async () => {
    if (hasDatabase) return pgField.getOpenTimeEntry(orgId, userId);
    const entries = await listTimeEntries(orgId, { userId });
    return entries.find((t) => t.endedAt === null) ?? null;
  });
}

/** PORTED. */
export async function listMaterials(orgId: string, projectId: string): Promise<MaterialUse[]> {
  return once(`materials:${orgId}:${projectId}`, async () => {
    if (hasDatabase) return pgField.listMaterials(orgId, projectId);
    return (await readLocalStore()).materials.filter((m) => m.projectId === projectId);
  });
}

/** PORTED. */
export async function listVariations(orgId: string, projectId: string): Promise<Variation[]> {
  return once(`variations:${orgId}:${projectId}`, async () => {
    if (hasDatabase) return pgField.listVariations(orgId, projectId);
    return (await readLocalStore()).variations.filter((v) => v.projectId === projectId);
  });
}

/** PORTED. */
export async function listDocuments(orgId: string, projectId: string): Promise<DocumentRecord[]> {
  return once(`documents:${orgId}:${projectId}`, async () => {
    if (hasDatabase) return pgField.listDocuments(orgId, projectId);
    return (await readLocalStore()).documents.filter((d) => d.projectId === projectId);
  });
}

/** PORTED. */
export async function listInspections(orgId: string, projectId: string): Promise<Inspection[]> {
  return once(`inspections:${orgId}:${projectId}`, async () => {
    if (hasDatabase) return pgField.listInspections(orgId, projectId);
    return (await readLocalStore()).inspections.filter((i) => i.projectId === projectId);
  });
}

/** PORTED. */
export async function listDefects(orgId: string, opts: { projectId?: string } = {}): Promise<Defect[]> {
  return once(`defects:${orgId}:${opts.projectId ?? ""}`, async () => {
    if (hasDatabase) return pgField.listDefects(orgId, opts);
    return (await readLocalStore()).defects.filter((d) => !opts.projectId || d.projectId === opts.projectId);
  });
}

/** PORTED. */
export async function listEvents(orgId: string, projectId: string): Promise<ProjectEvent[]> {
  return once(`events:${orgId}:${projectId}`, () => loadEvents(orgId, projectId));
}

async function loadEvents(orgId: string, projectId: string): Promise<ProjectEvent[]> {
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
  return costingFrom({ quote: quotes[0], entries, labourSettings, costingOptions });
}

/**
 * Costing for many projects in four queries, however many projects there are.
 *
 * The finance table costs every completed job. Done through `getCosting` that
 * was four queries per row on top of the nine each project cost to read — a
 * page whose price grew with the business, for a table nobody paginates.
 */
export async function getCostingByProject(orgId: string, projectIds: string[]): Promise<Map<string, CostingResult>> {
  if (projectIds.length === 0) return new Map();

  const [quotesByProject, entries, labourSettings, costingOptions] = await Promise.all([
    listQuotesByProject(orgId, projectIds),
    hasDatabase
      ? pgField.listTimeEntriesForProjects(orgId, projectIds)
      : listTimeEntries(orgId).then((all) => all.filter((entry) => projectIds.includes(entry.projectId))),
    getLabourSettings(orgId),
    hasDatabase
      ? pgSettings.getProjectCostingOptionsForProjects(orgId, projectIds)
      : costingOptionsFromStore(projectIds),
  ]);

  const entriesByProject = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const list = entriesByProject.get(entry.projectId) ?? [];
    list.push(entry);
    entriesByProject.set(entry.projectId, list);
  }

  return new Map(
    projectIds.map((projectId) => [
      projectId,
      costingFrom({
        quote: quotesByProject.get(projectId)?.[0],
        entries: entriesByProject.get(projectId) ?? [],
        labourSettings,
        costingOptions: costingOptions.get(projectId) ?? DEFAULT_COSTING_OPTIONS,
      }),
    ]),
  );
}

const DEFAULT_COSTING_OPTIONS: ProjectCostingOptions = {
  standardLabourEnabled: false,
  employeeCount: 0,
  includeSubcontractorMaterialCosts: false,
};

async function costingOptionsFromStore(projectIds: string[]): Promise<Map<string, ProjectCostingOptions>> {
  const saved = (await readLocalStore()).projectCostingOptions;
  return new Map(projectIds.map((id) => [id, saved[id] ?? DEFAULT_COSTING_OPTIONS]));
}

/** The arithmetic, once, so the single and batched paths cannot disagree. */
function costingFrom(input: {
  quote: QuoteSummary | undefined;
  entries: TimeEntry[];
  labourSettings: LabourSettings;
  costingOptions: ProjectCostingOptions;
}): CostingResult {
  const { quote, entries, labourSettings, costingOptions } = input;
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
}

/**
 * PORTED by derivation — composes ported reads only.
 *
 * `listProjects` here is the same read the dashboard and finance pages make for
 * themselves; per-request deduplication is what stops that costing twice.
 *
 * There was an `openDefects` count too, which neither caller ever displayed —
 * the QA page counts its own. It cost a query on two pages to be thrown away.
 */
export async function getDashboardMetrics(orgId: string): Promise<DashboardMetrics> {
  const projects = await listProjects(orgId);
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
  };
}


/**
 * Search index for the top bar. Deliberately not `listProjects` /
 * `listCustomers`: those run six and three extra aggregate queries respectively,
 * and the top bar renders on every page, so using them multiplied the cost of
 * the whole application.
 */
export async function listSearchIndex(orgId: string, includeCustomers: boolean) {
  return once(`searchIndex:${orgId}:${includeCustomers}`, () => loadSearchIndex(orgId, includeCustomers));
}

async function loadSearchIndex(orgId: string, includeCustomers: boolean) {
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
  return once(`statusSettings:${orgId}`, async () => {
    if (hasDatabase) {
      const saved = await pgSettings.getStatusSettings(orgId);
      if (saved) return saved;
    }
    return readLocalStatusSettings();
  });
}

/**
 * PORTED. Same story: the Settings screen read the JSON store directly, so an
 * organisation saved to Postgres rendered as the demo organisation the moment
 * the page came back.
 */
export async function getOrganisationSettings(orgId: string): Promise<OrganisationSettings> {
  return once(`organisationSettings:${orgId}`, async () => {
    if (hasDatabase) {
      const saved = await pgOrg.getOrganisation(orgId);
      if (saved) return saved;
    }
    return (await readLocalStore()).organisation;
  });
}

/** Stable SharePoint location for the organisation logo, if it has one. */
export async function getOrganisationLogoLocation(orgId: string) {
  return once(`organisationLogoLocation:${orgId}`, async () => {
    if (!hasDatabase) return null;
    return pgSettings.getOrganisationLogoLocation(orgId);
  });
}

/** Stable SharePoint location for the compliance-certificate header, if configured. */
export async function getOrganisationCertificateHeaderLocation(orgId: string) {
  return once(`organisationCertificateHeaderLocation:${orgId}`, async () => {
    if (!hasDatabase) return null;
    return pgSettings.getOrganisationCertificateHeaderLocation(orgId);
  });
}

/** PORTED. */
export async function getRolePermissions(orgId: string): Promise<RolePermissionOverrides> {
  return once(`rolePermissions:${orgId}`, async () => {
    if (hasDatabase) return pgSettings.getRolePermissions(orgId);
    return (await readLocalStore()).rolePermissions;
  });
}
