import "server-only";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, sites } from "@/lib/db/schema/crm";
import { projectNumberSequences, projects, tasks } from "@/lib/db/schema/projects";
import { defects } from "@/lib/db/schema/qa";
import { assignments } from "@/lib/db/schema/scheduling";
import type { ProjectStatus } from "@/lib/db/schema/enums";
import type { ProjectDetail, ProjectSummary, Site } from "../types";
import { quotes } from "@/lib/db/schema/quoting";
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

/**
 * Did this query fail on a named unique index?
 *
 * Drizzle wraps the driver error, so the SQLSTATE and the constraint name are on
 * the cause, not the message — and the message it does carry is the whole SQL
 * statement with its parameters. Matched on `23505` plus the index name rather
 * than on text, so the check does not depend on how anything is worded.
 */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    const candidate = current as { code?: string; constraint?: string; cause?: unknown };
    if (candidate.code === "23505" && candidate.constraint === constraint) return true;
    current = candidate.cause;
  }
  return false;
}

export interface ProjectFilters {
  status?: ProjectStatus[];
  customerId?: string;
  search?: string;
  assignedTo?: string;
}

export async function listProjects(orgId: string, filters: ProjectFilters = {}): Promise<ProjectSummary[]> {
  // Hand-archived projects are excluded from every active view here rather than
  // at each call site, so archiving a job removes it from the list, the
  // dashboard and the search without anyone having to remember to filter.
  // Finished projects still come through: they show under their own status.
  const conditions = [eq(projects.orgId, orgId), isNull(projects.archivedAt)];
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
 * Two ways in. A project is archived once it has finished, which keeps the
 * common case derived from status rather than needing anyone to tidy up; or
 * because someone archived it by hand, which is what `archived_at` records.
 *
 * The hand-archived case exists because a job can stall at any status — the
 * customer goes quiet, the site is postponed — and parking it is not a status
 * change, since it says nothing about where the work actually got to.
 */
export async function listArchivedProjects(orgId: string): Promise<ProjectSummary[]> {
  const rows = await db()
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.orgId, orgId),
        or(isNotNull(projects.archivedAt), inArray(projects.status, FINISHED_PROJECT_STATUSES))!,
      ),
    )
    .orderBy(desc(projects.updatedAt));
  return enrich(orgId, rows);
}

export async function isProjectArchived(orgId: string, id: string): Promise<boolean> {
  const [row] = await db()
    .select({ status: projects.status, archivedAt: projects.archivedAt })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, id)))
    .limit(1);
  return row ? Boolean(row.archivedAt) || FINISHED_PROJECT_STATUSES.includes(row.status) : false;
}

/**
 * Park a project. Deliberately not a status transition: `transitionProject` owns
 * `projects.status`, and archiving must not pretend to know whether the work was
 * finished, lost or merely postponed.
 *
 * Returns false when nothing matched, so a stale id from another tenant reports
 * a miss rather than silently succeeding.
 */
export async function archiveProject(orgId: string, id: string): Promise<boolean> {
  const rows = await db()
    .update(projects)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(projects.orgId, orgId), eq(projects.id, id), isNull(projects.archivedAt)))
    .returning({ id: projects.id });
  return rows.length > 0;
}

/** Unpark it. The status was never touched, so there is nothing to restore but the flag. */
export async function restoreProject(orgId: string, id: string): Promise<boolean> {
  const rows = await db()
    .update(projects)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(projects.orgId, orgId), eq(projects.id, id)))
    .returning({ id: projects.id });
  return rows.length > 0;
}

/** What a deleted project leaves behind outside Postgres. */
export interface DeletedProject {
  projectNumber: string;
  title: string;
  sharepointDriveId: string | null;
  sharepointFolderItemId: string | null;
}

/**
 * Delete a project and everything hanging off it.
 *
 * A single statement: every child table references `projects.id` with
 * `on delete cascade`, so tasks, quotes, events, assignments, time entries,
 * inspections and documents go with it. That matters more than usual here —
 * `neon-http` has no interactive transaction, so a hand-rolled cascade could
 * strand half a project with no way to roll back.
 *
 * The SharePoint identifiers are returned rather than acted on, because this
 * module talks to Postgres and nothing else. The caller deletes the folder.
 */
export async function deleteProject(orgId: string, id: string): Promise<DeletedProject | null> {
  const [row] = await db()
    .delete(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, id)))
    .returning({
      projectNumber: projects.projectNumber,
      title: projects.title,
      sharepointDriveId: projects.sharepointDriveId,
      sharepointFolderItemId: projects.sharepointFolderItemId,
    });
  return row ?? null;
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

  const [customerRows, siteRows, openTasks, openDefects, assignmentRows, acceptedQuotes] = await Promise.all([
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
    // Margin lives on the accepted quote, not the project. Fetched for the whole
    // page in one query rather than joined, since most projects have none.
    db()
      .select({ projectId: quotes.projectId, marginPct: quotes.marginPct })
      .from(quotes)
      .where(and(eq(quotes.orgId, orgId), inArray(quotes.projectId, ids), eq(quotes.status, "accepted"))),
  ]);

  const customerName = new Map(customerRows.map((row) => [row.id, row.name]));
  const siteById = new Map(siteRows.map((row) => [row.id, row]));
  const tasksBy = new Map(openTasks.map((row) => [row.projectId, row.count]));
  const defectsBy = new Map(openDefects.map((row) => [row.projectId, row.count]));

  const marginBy = new Map(acceptedQuotes.map((row) => [row.projectId, Number(row.marginPct)]));

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
      quotedMarginPct: marginBy.get(row.id) ?? 0,
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

/**
 * Edit a project from the record form.
 *
 * The site is edited by name here rather than picked, so the three cases are:
 * renaming the one attached, attaching a new one, and clearing it. A cleared
 * site is detached and deleted — it only ever held the name typed on this form,
 * and leaving orphans behind would fill the customer's site count with rows
 * nobody can reach.
 *
 * The project number is unique per org, and is checked before any of the site
 * work rather than being left to the constraint. Letting the insert go first
 * meant a clash aborted the update with a freshly created site already on the
 * customer, attached to nothing. The constraint is still caught underneath, for
 * the case where someone else claims the number in between.
 */
export async function updateProjectRecord(
  orgId: string,
  input: {
    id: string;
    projectNumber: string;
    title: string;
    customerId: string;
    siteName?: string;
    contactName?: string;
    requestedStartOn?: string;
    scopeOfWorks?: string;
    initialNotes?: string;
    poNumber?: string;
  },
): Promise<void> {
  const [existing] = await db()
    .select({ siteId: projects.siteId, poReceivedAt: projects.poReceivedAt })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, input.id)))
    .limit(1);
  if (!existing) throw new Error("Project not found");

  const [customer] = await db()
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, input.customerId)))
    .limit(1);
  if (!customer) throw new Error("Customer not found");

  const projectNumber = input.projectNumber.trim();
  const [clash] = await db()
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.projectNumber, projectNumber), ne(projects.id, input.id)))
    .limit(1);
  if (clash) throw new Error("Project ID already exists");

  const siteName = input.siteName?.trim() || "";
  const accessNotes = input.contactName?.trim() ? `Site contact: ${input.contactName.trim()}` : null;
  let siteId = existing.siteId;

  if (siteName && existing.siteId) {
    await db()
      .update(sites)
      .set({ name: siteName, accessNotes, customerId: customer.id, updatedAt: new Date() })
      .where(and(eq(sites.orgId, orgId), eq(sites.id, existing.siteId)));
  } else if (siteName) {
    const [site] = await db()
      .insert(sites)
      .values({ orgId, customerId: customer.id, name: siteName, accessNotes })
      .returning({ id: sites.id });
    siteId = site.id;
  } else {
    siteId = null;
  }

  const poNumber = input.poNumber?.trim() || null;
  try {
    await db()
      .update(projects)
      .set({
        projectNumber,
        title: input.title.trim(),
        customerId: customer.id,
        siteId,
        scopeOfWorks: input.scopeOfWorks?.trim() || null,
        initialNotes: input.initialNotes?.trim() || null,
        requestedStartOn: input.requestedStartOn ? new Date(input.requestedStartOn) : null,
        poNumber,
        // First time a PO number appears is when it was received. Re-saving the
        // form must not move that date, and clearing the number clears it.
        poReceivedAt: poNumber ? (existing.poReceivedAt ?? new Date()) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.orgId, orgId), eq(projects.id, input.id)));
  } catch (error) {
    if (isUniqueViolation(error, "projects_org_number_idx")) throw new Error("Project ID already exists");
    throw error;
  }

  // Detached last: the project has to stop pointing at it before the row can go.
  if (!siteName && existing.siteId) {
    await db().delete(sites).where(and(eq(sites.orgId, orgId), eq(sites.id, existing.siteId)));
  }
}

/**
 * The global search index: one query, no aggregates.
 *
 * `listProjects` runs six extra queries per call to build open-task and defect
 * counts, assigned installers and accepted-quote margins. The search box in the
 * top bar needs none of that, and it renders on every page — so paying for the
 * full enrich there multiplied the cost of the entire application by seven.
 */
export async function listProjectsForSearch(
  orgId: string,
  limit = 500,
): Promise<Array<{ id: string; title: string; projectNumber: string; customerName: string; siteLabel: string | null }>> {
  const rows = await db()
    .select({
      id: projects.id,
      title: projects.title,
      projectNumber: projects.projectNumber,
      customerName: customers.name,
      siteName: sites.name,
      siteSuburb: sites.suburb,
      siteState: sites.state,
    })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .leftJoin(sites, eq(sites.id, projects.siteId))
    .where(eq(projects.orgId, orgId))
    .orderBy(desc(projects.updatedAt))
    // Bounded so the top bar cannot become slower as the business grows. Once
    // this is reached, search needs to move server-side rather than the cap
    // being raised.
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    projectNumber: row.projectNumber,
    customerName: row.customerName,
    siteLabel: row.siteName
      ? [row.siteName, [row.siteSuburb, row.siteState].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
      : null,
  }));
}
