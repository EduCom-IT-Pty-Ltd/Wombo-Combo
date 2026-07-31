import "server-only";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, sites } from "@/lib/db/schema/crm";
import { projectNumberSequences, projects, tasks } from "@/lib/db/schema/projects";
import { defects } from "@/lib/db/schema/qa";
import { assignments } from "@/lib/db/schema/scheduling";
import type { ProjectStatus } from "@/lib/db/schema/enums";
import type { ProjectDetail, ProjectSummary, Site } from "../types";
import { getCustomer } from "./customers";

/**
 * Postgres reads and writes for projects — the table everything else hangs off.
 *
 * `ProjectSummary` is a joined, denormalised shape: customer name, site label,
 * open task and defect counts, and assigned installers. Those come from grouped
 * queries over the whole result set rather than per row, because the projects
 * list renders every project at once and per-row lookups would be N+1 four times
 * over.
 */

/** A project no longer in flight. Typed so a status rename fails the build. */
const FINISHED_PROJECT_STATUSES: ProjectStatus[] = ["closed", "lost", "cancelled"];

export interface ProjectFilters {
  status?: ProjectStatus[];
  customerId?: string;
  search?: string;
  assignedTo?: string;
}

export async function listProjects(orgId: string, filters: ProjectFilters = {}): Promise<ProjectSummary[]> {
  const conditions = [eq(projects.orgId, orgId)];
  if (filters.status?.length) conditions.push(inArray(projects.status, filters.status));
  if (filters.customerId) conditions.push(eq(projects.customerId, filters.customerId));

  if (filters.search) {
    // Matched in SQL rather than in JS so a long project list is not pulled into
    // memory to be discarded. Customer name needs the join, hence the subquery.
    const term = `%${filters.search}%`;
    const matchingCustomers = db()
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), ilike(customers.name, term)));
    conditions.push(
      or(
        ilike(projects.title, term),
        ilike(projects.projectNumber, term),
        inArray(projects.customerId, matchingCustomers),
      )!,
    );
  }

  if (filters.assignedTo) {
    const assigned = db()
      .select({ id: assignments.projectId })
      .from(assignments)
      .where(and(eq(assignments.orgId, orgId), eq(assignments.userId, filters.assignedTo)));
    conditions.push(inArray(projects.id, assigned));
  }

  const rows = await db()
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.updatedAt));

  return enrich(orgId, rows);
}

/**
 * "Archived" has no column. A project is archived once it has finished, which
 * keeps the concept derived from status rather than a second flag that could
 * disagree with it.
 */
export async function listArchivedProjects(orgId: string): Promise<ProjectSummary[]> {
  const rows = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, orgId), inArray(projects.status, FINISHED_PROJECT_STATUSES)))
    .orderBy(desc(projects.updatedAt));
  return enrich(orgId, rows);
}

export async function isProjectArchived(orgId: string, id: string): Promise<boolean> {
  const [row] = await db()
    .select({ status: projects.status })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, id)))
    .limit(1);
  return row ? FINISHED_PROJECT_STATUSES.includes(row.status) : false;
}

export async function getProject(orgId: string, id: string): Promise<ProjectDetail | null> {
  const [row] = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, id)))
    .limit(1);
  if (!row) return null;

  const [summary] = await enrich(orgId, [row]);
  if (!summary) return null;

  const [site, customer] = await Promise.all([
    row.siteId ? getSite(orgId, row.siteId) : Promise.resolve(null),
    getCustomer(orgId, row.customerId),
  ]);

  // A project cannot exist without its customer — the column is a NOT NULL
  // foreign key — so this is a broken row rather than a missing-data case.
  if (!customer) throw new Error(`Project ${id} references customer ${row.customerId}, which does not exist.`);

  return {
    ...summary,
    scopeOfWorks: row.scopeOfWorks,
    initialNotes: row.initialNotes,
    depositRequiredCents: row.depositRequiredCents,
    depositReceivedAt: iso(row.depositReceivedAt),
    poReceivedAt: iso(row.poReceivedAt),
    requestedStartOn: iso(row.requestedStartOn),
    installationCompletedAt: iso(row.installationCompletedAt),
    site,
    customer,
  };
}

async function getSite(orgId: string, id: string): Promise<Site | null> {
  const [row] = await db()
    .select()
    .from(sites)
    .where(and(eq(sites.orgId, orgId), eq(sites.id, id)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customerId,
    name: row.name,
    address: [row.addressLine1, row.addressLine2].filter(Boolean).join(", "),
    suburb: row.suburb ?? "",
    state: row.state ?? "",
    postcode: row.postcode ?? "",
    accessNotes: row.accessNotes,
  };
}

async function enrich(orgId: string, rows: (typeof projects.$inferSelect)[]): Promise<ProjectSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const customerIds = [...new Set(rows.map((row) => row.customerId))];
  const siteIds = rows.map((row) => row.siteId).filter((id): id is string => Boolean(id));

  const [customerRows, siteRows, openTasks, openDefects, assignmentRows] = await Promise.all([
    db()
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), inArray(customers.id, customerIds))),
    siteIds.length
      ? db()
          .select({ id: sites.id, name: sites.name, suburb: sites.suburb, state: sites.state })
          .from(sites)
          .where(and(eq(sites.orgId, orgId), inArray(sites.id, siteIds)))
      : Promise.resolve([]),
    db()
      .select({ projectId: tasks.projectId, count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.orgId, orgId), inArray(tasks.projectId, ids), sql`${tasks.status} <> 'done'`))
      .groupBy(tasks.projectId),
    db()
      .select({ projectId: defects.projectId, count: sql<number>`count(*)::int` })
      .from(defects)
      // Open means unresolved: the table records resolution by timestamp rather
      // than carrying a status column.
      .where(and(eq(defects.orgId, orgId), inArray(defects.projectId, ids), isNull(defects.resolvedAt)))
      .groupBy(defects.projectId),
    db()
      .select({ projectId: assignments.projectId, userId: assignments.userId })
      .from(assignments)
      .where(and(eq(assignments.orgId, orgId), inArray(assignments.projectId, ids))),
  ]);

  const customerName = new Map(customerRows.map((row) => [row.id, row.name]));
  const siteById = new Map(siteRows.map((row) => [row.id, row]));
  const tasksBy = new Map(openTasks.map((row) => [row.projectId, row.count]));
  const defectsBy = new Map(openDefects.map((row) => [row.projectId, row.count]));

  const installersBy = new Map<string, string[]>();
  for (const row of assignmentRows) {
    const list = installersBy.get(row.projectId) ?? [];
    if (!list.includes(row.userId)) list.push(row.userId);
    installersBy.set(row.projectId, list);
  }

  return rows.map((row) => {
    const site = row.siteId ? siteById.get(row.siteId) : undefined;
    return {
      id: row.id,
      projectNumber: row.projectNumber,
      title: row.title,
      status: row.status,
      heldFromStatus: row.heldFromStatus,
      customerId: row.customerId,
      customerName: customerName.get(row.customerId) ?? "Unknown customer",
      siteId: row.siteId,
      siteLabel: site ? [site.name, [site.suburb, site.state].filter(Boolean).join(" ")].filter(Boolean).join(" · ") : null,
      contractValueCents: row.contractValueCents,
      // Margin comes from the accepted quote, which is not ported yet.
      quotedMarginPct: 0,
      projectManagerId: row.projectManagerId,
      scheduledStartAt: iso(row.scheduledStartAt),
      scheduledEndAt: iso(row.scheduledEndAt),
      poNumber: row.poNumber,
      updatedAt: iso(row.updatedAt) ?? new Date(0).toISOString(),
      openTasks: tasksBy.get(row.id) ?? 0,
      openDefects: defectsBy.get(row.id) ?? 0,
      assignedInstallerIds: installersBy.get(row.id) ?? [],
    };
  });
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Allocate the next project number for the current year, e.g. `EI-2026-0007`.
 *
 * `neon-http` has no interactive transactions, so this cannot be read-then-write
 * without two clients racing to the same number. It is instead a single
 * `INSERT ... ON CONFLICT DO UPDATE` whose atomicity Postgres guarantees: the
 * row is locked for the duration of the statement and `RETURNING` gives back the
 * value this caller was allocated, not whatever a concurrent caller left behind.
 */
export async function allocateProjectNumber(orgId: string, prefix: string, year: number): Promise<string> {
  const [row] = await db()
    .insert(projectNumberSequences)
    .values({ orgId, year, lastValue: 1 })
    .onConflictDoUpdate({
      target: [projectNumberSequences.orgId, projectNumberSequences.year],
      set: { lastValue: sql`${projectNumberSequences.lastValue} + 1` },
    })
    .returning({ lastValue: projectNumberSequences.lastValue });

  return `${prefix}-${year}-${String(row.lastValue).padStart(4, "0")}`;
}

/**
 * Create the site captured on the new-request form. Only a name is collected
 * there, so the address fields stay empty until someone edits the site.
 */
export async function createSite(orgId: string, customerId: string, name: string): Promise<string> {
  const [row] = await db()
    .insert(sites)
    .values({ orgId, customerId, name })
    .returning({ id: sites.id });
  return row.id;
}

export async function createProject(
  orgId: string,
  input: {
    title: string;
    customerId: string;
    siteId?: string | null;
    scopeOfWorks?: string | null;
    initialNotes?: string | null;
    requestedStartOn?: Date | null;
    projectNumberPrefix: string;
  },
): Promise<ProjectDetail> {
  const projectNumber = await allocateProjectNumber(orgId, input.projectNumberPrefix, new Date().getFullYear());

  const [row] = await db()
    .insert(projects)
    .values({
      orgId,
      projectNumber,
      title: input.title,
      customerId: input.customerId,
      siteId: input.siteId ?? null,
      scopeOfWorks: input.scopeOfWorks ?? null,
      initialNotes: input.initialNotes ?? null,
      requestedStartOn: input.requestedStartOn ?? null,
      status: "new_request",
    })
    .returning();

  const created = await getProject(orgId, row.id);
  if (!created) throw new Error("Project was inserted but could not be read back.");
  return created;
}
