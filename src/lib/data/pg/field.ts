import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { materialUsage, timeEntries, variations } from "@/lib/db/schema/field";
import { assignments, leaveRequests, schedulePhases } from "@/lib/db/schema/scheduling";
import { memberships } from "@/lib/db/schema/org";
import { projects } from "@/lib/db/schema/projects";
import { priceListItems } from "@/lib/db/schema/quoting";
import { sites } from "@/lib/db/schema/crm";
import { defects, inspections, inspectionItems } from "@/lib/db/schema/qa";
import { assertUserAvailable } from "./settings";
import { documents } from "@/lib/db/schema/documents";
import type { DocumentKind, LeaveStatus, LeaveType } from "@/lib/db/schema/enums";
import type {
  Assignment,
  Defect,
  DocumentRecord,
  Inspection,
  LeaveEntry,
  MaterialUse,
  TimeEntry,
  Variation,
} from "../types";

/**
 * Field, scheduling, QA and the per-project record lists.
 *
 * Grouped into one module because these are all thin project-scoped reads over
 * their own table — splitting them further would be five files of six lines.
 */

// --- Time -------------------------------------------------------------------

export async function listTimeEntries(
  orgId: string,
  opts: { projectId?: string; userId?: string } = {},
): Promise<TimeEntry[]> {
  const conditions = [eq(timeEntries.orgId, orgId)];
  if (opts.projectId) conditions.push(eq(timeEntries.projectId, opts.projectId));
  if (opts.userId) conditions.push(eq(timeEntries.userId, opts.userId));

  const rows = await db()
    .select()
    .from(timeEntries)
    .where(and(...conditions))
    .orderBy(desc(timeEntries.startedAt));
  return rows.map(toTimeEntry);
}

/**
 * Time entries for a set of projects in one query. The finance table costs every
 * completed job at once, and asking per job made the page cost a query per row.
 */
export async function listTimeEntriesForProjects(orgId: string, projectIds: string[]): Promise<TimeEntry[]> {
  if (projectIds.length === 0) return [];
  const rows = await db()
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.orgId, orgId), inArray(timeEntries.projectId, projectIds)))
    .orderBy(desc(timeEntries.startedAt));
  return rows.map(toTimeEntry);
}

/**
 * The caller's open shift, if any. Open means never checked out — a paused
 * shift is still open, which is what keeps the "on site" indicator showing
 * while someone is on a break.
 */
export async function getOpenTimeEntry(orgId: string, userId: string): Promise<TimeEntry | null> {
  const [row] = await db()
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.orgId, orgId), eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
    .orderBy(desc(timeEntries.startedAt))
    .limit(1);
  return row ? toTimeEntry(row) : null;
}

function toTimeEntry(row: typeof timeEntries.$inferSelect): TimeEntry {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    breakMinutes: row.breakMinutes,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    costRateCentsPerHour: row.costRateCentsPerHour,
    notes: row.notes,
  };
}

export interface AttendanceInput {
  projectId: string;
  userId: string;
  startedAt: string;
  endedAt: string;
  breakMinutes: number;
  notes?: string;
}

/**
 * The hourly cost to snapshot onto a shift.
 *
 * Copied onto the row rather than joined at read time, so raising someone's rate
 * next year does not rewrite what last year's jobs cost. Doubles as the
 * "is this a real employee of this org" check the JSON store did against its
 * people list.
 */
async function costRateFor(orgId: string, userId: string): Promise<number> {
  const [membership] = await db()
    .select({ costRateCents: memberships.costRateCents })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId), eq(memberships.active, true)))
    .limit(1);
  if (!membership) throw new Error("Choose a valid employee");
  // `cost_rate_cents` is a text column, and is null for people who have never
  // had a rate set. Either way an unset rate is zero, not a crash.
  return Number(membership.costRateCents ?? 0) || 0;
}

/**
 * An attendance correction entered from the office.
 *
 * Unlike the field clock this is always a completed shift, recorded for someone
 * else after the fact — so `pausedAt` is explicitly null rather than inherited
 * from whatever the crew's phone last did.
 */
export async function createAttendanceEntry(orgId: string, input: AttendanceInput): Promise<void> {
  await db().insert(timeEntries).values({
    orgId,
    projectId: input.projectId,
    userId: input.userId,
    startedAt: new Date(input.startedAt),
    endedAt: new Date(input.endedAt),
    breakMinutes: input.breakMinutes,
    pausedAt: null,
    costRateCentsPerHour: await costRateFor(orgId, input.userId),
    notes: input.notes?.trim() || null,
  });
}

export async function updateAttendanceEntry(
  orgId: string,
  entryId: string,
  input: Omit<AttendanceInput, "projectId">,
): Promise<void> {
  const costRateCentsPerHour = await costRateFor(orgId, input.userId);
  const updated = await db()
    .update(timeEntries)
    .set({
      userId: input.userId,
      startedAt: new Date(input.startedAt),
      endedAt: new Date(input.endedAt),
      breakMinutes: input.breakMinutes,
      pausedAt: null,
      costRateCentsPerHour,
      notes: input.notes?.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(timeEntries.orgId, orgId), eq(timeEntries.id, entryId)))
    .returning({ id: timeEntries.id });
  if (updated.length === 0) throw new Error("Time entry not found");
}

/** Returns the deleted entry, so the caller knows which project to revalidate. */
export async function deleteAttendanceEntry(orgId: string, entryId: string): Promise<{ projectId: string }> {
  const [deleted] = await db()
    .delete(timeEntries)
    .where(and(eq(timeEntries.orgId, orgId), eq(timeEntries.id, entryId)))
    .returning({ projectId: timeEntries.projectId });
  if (!deleted) throw new Error("Time entry not found");
  return deleted;
}

// --- The field clock --------------------------------------------------------

/**
 * Minutes a shift has spent paused, for adding to `break_minutes`. Zero when it
 * is not paused: `greatest` returns 0 rather than null there, which is what
 * keeps resuming and clocking off from blanking the breaks already recorded.
 */
const pausedMinutes = sql`greatest(0, coalesce(round(extract(epoch from (now() - ${timeEntries.pausedAt})) / 60), 0))::int`;

/**
 * Check in. Returns the shift the person is now on, which is not always the one
 * they asked for — see below.
 *
 * One clock at a time per person, and the check is inside the statement rather
 * than a read followed by an insert. `neon-http` has no interactive
 * transactions, and the crew are on phones: a request whose response is lost on
 * a bad signal gets tapped again, and two open shifts on the same job is a mess
 * somebody has to unpick by hand. An empty `returning` means they were already
 * clocked on, so we hand back the shift that won instead — the caller compares
 * the project and tells them to clock off the other job.
 */
export async function startTimeEntry(
  orgId: string,
  input: { projectId: string; userId: string; notes?: string },
): Promise<{ projectId: string; created: boolean } | null> {
  const costRateCentsPerHour = await costRateFor(orgId, input.userId);

  const inserted = await db().execute<{ project_id: string }>(sql`
    insert into ${timeEntries} (org_id, project_id, user_id, started_at, cost_rate_cents_per_hour, notes)
    select ${orgId}::uuid, ${input.projectId}::uuid, ${input.userId}::uuid, now(),
           ${costRateCentsPerHour}::int, ${input.notes?.trim() || null}::text
    where not exists (
      select 1
      from ${timeEntries}
      where ${timeEntries.orgId} = ${orgId}::uuid
        and ${timeEntries.userId} = ${input.userId}::uuid
        and ${timeEntries.endedAt} is null
    )
    returning project_id
  `);

  const created = inserted.rows[0];
  if (created) return { projectId: created.project_id, created: true };

  const open = await getOpenTimeEntry(orgId, input.userId);
  return open ? { projectId: open.projectId, created: false } : null;
}

/**
 * Check out. Guarded on the shift still being open, so a second tap reports
 * "already closed" rather than moving the finish time.
 *
 * A shift ended while paused counts the pause as a break, exactly as resuming
 * first and then checking out would have.
 */
export async function endTimeEntry(
  orgId: string,
  input: { entryId: string; userId: string; breakMinutes: number },
): Promise<{ projectId: string } | null> {
  const [row] = await db()
    .update(timeEntries)
    .set({
      endedAt: new Date(),
      pausedAt: null,
      breakMinutes: sql`${timeEntries.breakMinutes} + ${input.breakMinutes} + ${pausedMinutes}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(timeEntries.orgId, orgId),
        eq(timeEntries.id, input.entryId),
        eq(timeEntries.userId, input.userId),
        isNull(timeEntries.endedAt),
      ),
    )
    .returning({ projectId: timeEntries.projectId });
  return row ?? null;
}

/**
 * Pause or resume, decided from the row rather than from the client — the phone
 * that sent this may be showing a state two taps out of date.
 *
 * Both branches are one statement: every expression in `set` sees the row as it
 * was before the update, so the resume can bank the elapsed pause in the same
 * breath as clearing it. `returning` gives back the new value, which is how the
 * caller knows which of the two just happened.
 */
export async function toggleTimeEntryPause(
  orgId: string,
  input: { entryId: string; userId: string },
): Promise<{ projectId: string; pausedAt: string | null } | null> {
  const [row] = await db()
    .update(timeEntries)
    .set({
      pausedAt: sql`case when ${timeEntries.pausedAt} is null then now() else null end`,
      breakMinutes: sql`case when ${timeEntries.pausedAt} is null then ${timeEntries.breakMinutes} else ${timeEntries.breakMinutes} + ${pausedMinutes} end`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(timeEntries.orgId, orgId),
        eq(timeEntries.id, input.entryId),
        eq(timeEntries.userId, input.userId),
        isNull(timeEntries.endedAt),
      ),
    )
    .returning({ projectId: timeEntries.projectId, pausedAt: timeEntries.pausedAt });

  return row ? { projectId: row.projectId, pausedAt: row.pausedAt?.toISOString() ?? null } : null;
}

/**
 * A crew member correcting their own finished shift. Only their own, and only a
 * finished one — a running clock is changed by pausing or checking out, not by
 * typing a different start time into it.
 */
export async function updateOwnTimeEntry(
  orgId: string,
  input: { entryId: string; userId: string; startedAt: string; endedAt: string; breakMinutes: number },
): Promise<{ projectId: string } | null> {
  const [row] = await db()
    .update(timeEntries)
    .set({
      startedAt: new Date(input.startedAt),
      endedAt: new Date(input.endedAt),
      breakMinutes: input.breakMinutes,
      pausedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(timeEntries.orgId, orgId),
        eq(timeEntries.id, input.entryId),
        eq(timeEntries.userId, input.userId),
        isNotNull(timeEntries.endedAt),
      ),
    )
    .returning({ projectId: timeEntries.projectId });
  return row ?? null;
}

/**
 * Materials consumed, logged from site.
 *
 * The unit cost comes from the catalogue when the description names a line we
 * already price, so nobody standing on a roof is ever asked to type a figure.
 * An unrecognised description still records — what was used matters more than
 * what it cost, and the office can price it later.
 */
export async function addMaterialUse(
  orgId: string,
  input: { projectId: string; description: string; quantity: number; unit: string; userId: string | null },
): Promise<void> {
  const description = input.description.trim();
  const [catalogue] = await db()
    .select({ id: priceListItems.id, unitCostCents: priceListItems.unitCostCents })
    .from(priceListItems)
    .where(
      and(
        eq(priceListItems.orgId, orgId),
        eq(priceListItems.active, true),
        sql`lower(${priceListItems.name}) = lower(${description})`,
      ),
    )
    .limit(1);

  await db().insert(materialUsage).values({
    orgId,
    projectId: input.projectId,
    priceListItemId: catalogue?.id ?? null,
    description,
    quantity: String(input.quantity),
    unit: input.unit,
    unitCostCents: catalogue?.unitCostCents ?? 0,
    recordedByUserId: input.userId,
  });
}

/**
 * A scope change flagged from site. Raised as a draft with no money on it: the
 * crew are saying "this is extra", and the office prices it before it goes out.
 *
 * The sequence is counted inside the insert for the same reason quote versions
 * are — two people raising a variation on the same job at once would otherwise
 * both read the same count and claim the same reference.
 */
export async function addVariation(
  orgId: string,
  input: { projectId: string; title: string; userId: string | null },
): Promise<{ reference: string }> {
  const [project] = await db()
    .select({ projectNumber: projects.projectNumber })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, input.projectId)))
    .limit(1);
  if (!project) throw new Error("Project not found");

  const prefix = `VO-${project.projectNumber.split("-").pop() ?? "0000"}-`;
  const [row] = await db()
    .insert(variations)
    .values({
      orgId,
      projectId: input.projectId,
      reference: sql`${prefix}::text || lpad(((
        select count(*) from ${variations}
        where ${variations.orgId} = ${orgId} and ${variations.projectId} = ${input.projectId}
      ) + 1)::text, 2, '0')`,
      title: input.title.trim(),
      status: "draft",
      raisedByUserId: input.userId,
    })
    .returning({ reference: variations.reference });
  return row;
}

// --- Scheduling -------------------------------------------------------------

export async function listAssignments(
  orgId: string,
  opts: { projectId?: string; userId?: string; from?: Date; to?: Date } = {},
): Promise<Assignment[]> {
  const conditions = [eq(assignments.orgId, orgId)];
  if (opts.projectId) conditions.push(eq(assignments.projectId, opts.projectId));
  if (opts.userId) conditions.push(eq(assignments.userId, opts.userId));
  // Overlap, not containment: an assignment spanning the window boundary is in
  // the window. Testing startsAt alone would hide a multi-day job from every
  // day of the calendar except the one it began on.
  if (opts.from) conditions.push(gte(assignments.endsAt, opts.from));
  if (opts.to) conditions.push(lte(assignments.startsAt, opts.to));

  const rows = await db()
    .select({
      assignment: assignments,
      projectNumber: projects.projectNumber,
      projectTitle: projects.title,
      siteName: sites.name,
      siteSuburb: sites.suburb,
      siteState: sites.state,
    })
    .from(assignments)
    .innerJoin(projects, eq(projects.id, assignments.projectId))
    // Left join: a project may have no site yet, and its assignments should
    // still appear on the calendar rather than silently vanishing.
    .leftJoin(sites, eq(sites.id, projects.siteId))
    .where(and(...conditions))
    .orderBy(asc(assignments.startsAt));

  return rows.map((row) => ({
    id: row.assignment.id,
    projectId: row.assignment.projectId,
    projectNumber: row.projectNumber,
    projectTitle: row.projectTitle,
    siteLabel: row.siteName
      ? [row.siteName, [row.siteSuburb, row.siteState].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
      : null,
    userId: row.assignment.userId,
    status: row.assignment.status,
    startsAt: row.assignment.startsAt.toISOString(),
    endsAt: row.assignment.endsAt.toISOString(),
    role: row.assignment.role,
  }));
}

export async function listLeave(orgId: string): Promise<LeaveEntry[]> {
  const rows = await db()
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.orgId, orgId))
    .orderBy(asc(leaveRequests.startsAt));

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    type: row.type,
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    reason: row.reason,
  }));
}

export interface LeaveInput {
  userId: string;
  type: LeaveType;
  status: LeaveStatus;
  /** `YYYY-MM-DD`. Leave is booked in whole days. */
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

/**
 * Both ends pinned to UTC midnight, the same convention `assertUserAvailable`
 * and `scheduleInspection` compare against. Storing local midnight would read
 * back as the day before in some timezones, which for leave means somebody gets
 * scheduled on a day they are away.
 */
function leaveValues(input: LeaveInput) {
  return {
    userId: input.userId,
    type: input.type,
    status: input.status,
    startsAt: new Date(`${input.startsAt}T00:00:00.000Z`),
    endsAt: new Date(`${input.endsAt}T00:00:00.000Z`),
    reason: input.reason?.trim() || null,
  };
}

/** Recorded against a membership, so an unknown or revoked person is refused. */
async function assertMember(orgId: string, userId: string): Promise<void> {
  const [membership] = await db()
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId), eq(memberships.active, true)))
    .limit(1);
  if (!membership) throw new Error("Choose a valid employee");
}

export async function createLeave(orgId: string, input: LeaveInput): Promise<void> {
  await assertMember(orgId, input.userId);
  await db().insert(leaveRequests).values({ orgId, ...leaveValues(input) });
}

export async function updateLeave(orgId: string, id: string, input: LeaveInput): Promise<void> {
  await assertMember(orgId, input.userId);
  const updated = await db()
    .update(leaveRequests)
    .set({ ...leaveValues(input), updatedAt: new Date() })
    .where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.id, id)))
    .returning({ id: leaveRequests.id });
  if (updated.length === 0) throw new Error("Leave record not found");
}

/**
 * Returns false when nothing matched rather than throwing. Removing a record
 * that has already gone is the outcome the caller wanted, and the delete button
 * has nowhere to put an error — throwing would crash the page over a no-op.
 */
export async function deleteLeave(orgId: string, id: string): Promise<boolean> {
  const deleted = await db()
    .delete(leaveRequests)
    .where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.id, id)))
    .returning({ id: leaveRequests.id });
  return deleted.length > 0;
}

// --- Materials, variations, documents ---------------------------------------

export async function listMaterials(orgId: string, projectId: string): Promise<MaterialUse[]> {
  const rows = await db()
    .select()
    .from(materialUsage)
    .where(and(eq(materialUsage.orgId, orgId), eq(materialUsage.projectId, projectId)))
    .orderBy(desc(materialUsage.recordedAt));

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    unitCostCents: row.unitCostCents,
    recordedById: row.recordedByUserId,
    recordedAt: row.recordedAt.toISOString(),
  }));
}

export async function listVariations(orgId: string, projectId: string): Promise<Variation[]> {
  const rows = await db()
    .select()
    .from(variations)
    .where(and(eq(variations.orgId, orgId), eq(variations.projectId, projectId)))
    .orderBy(asc(variations.reference));

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    reference: row.reference,
    title: row.title,
    status: row.status,
    estimatedCostCents: row.estimatedCostCents,
    quotedSellCents: row.quotedSellCents,
  }));
}

export async function listDocuments(orgId: string, projectId: string): Promise<DocumentRecord[]> {
  const rows = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.projectId, projectId)))
    .orderBy(desc(documents.createdAt));

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    kind: row.kind,
    sizeBytes: row.sizeBytes ?? 0,
    version: row.version,
    requiresAcknowledgement: row.requiresAcknowledgement,
    uploadedAt: row.createdAt.toISOString(),
    uploadedById: row.uploadedByUserId,
    // Our own route, not the SharePoint one. A Graph download URL lasts minutes,
    // so a stored one would be dead by the time anyone clicked it — and going
    // through us means access is checked against the caller's org on every read
    // rather than being whoever holds the link.
    url: `/api/documents/${row.id}`,
    note: null,
  }));
}

/**
 * Record an uploaded file against a project.
 *
 * Same name in the same project is treated as a new revision rather than a
 * second document: the version continues the sequence and points back at what
 * it replaced, which is what `supersedesDocumentId` is for. SharePoint keeps
 * both sets of bytes, so nothing is lost by saying so.
 */
export async function createDocument(
  orgId: string,
  input: {
    projectId: string;
    name: string;
    kind: DocumentKind;
    storageKey: string;
    mimeType: string | null;
    sizeBytes: number;
    requiresAcknowledgement: boolean;
    uploadedByUserId: string | null;
  },
): Promise<{ id: string; version: number }> {
  const [previous] = await db()
    .select({ id: documents.id, version: documents.version })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, orgId),
        eq(documents.projectId, input.projectId),
        eq(documents.name, input.name),
      ),
    )
    .orderBy(desc(documents.version))
    .limit(1);

  const version = (previous?.version ?? 0) + 1;
  const [row] = await db()
    .insert(documents)
    .values({
      orgId,
      projectId: input.projectId,
      name: input.name,
      kind: input.kind,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      version,
      supersedesDocumentId: previous?.id ?? null,
      requiresAcknowledgement: input.requiresAcknowledgement,
      uploadedByUserId: input.uploadedByUserId,
    })
    .returning({ id: documents.id });

  return { id: row.id, version };
}

/** Where the bytes live, for the route that resolves a download URL. */
export async function getDocumentLocation(
  orgId: string,
  documentId: string,
): Promise<{ name: string; storageKey: string; driveId: string | null } | null> {
  const [row] = await db()
    .select({
      name: documents.name,
      storageKey: documents.storageKey,
      driveId: projects.sharepointDriveId,
    })
    .from(documents)
    .leftJoin(projects, and(eq(projects.id, documents.projectId), eq(projects.orgId, documents.orgId)))
    .where(and(eq(documents.orgId, orgId), eq(documents.id, documentId)))
    .limit(1);

  return row ?? null;
}

// --- QA ---------------------------------------------------------------------

export async function listInspections(orgId: string, projectId: string): Promise<Inspection[]> {
  const rows = await db()
    .select()
    .from(inspections)
    .where(and(eq(inspections.orgId, orgId), eq(inspections.projectId, projectId)))
    .orderBy(desc(inspections.createdAt));
  if (rows.length === 0) return [];

  const items = await db()
    .select()
    .from(inspectionItems)
    .where(
      and(
        eq(inspectionItems.orgId, orgId),
        inArray(
          inspectionItems.inspectionId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(inspectionItems.sortOrder));

  const itemsBy = new Map<string, Inspection["items"]>();
  for (const item of items) {
    const list = itemsBy.get(item.inspectionId) ?? [];
    list.push({
      id: item.id,
      prompt: item.prompt,
      isCritical: item.isCritical,
      passed: item.passed,
      comment: item.comment,
    });
    itemsBy.set(item.inspectionId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    result: row.result,
    inspectorId: row.inspectorUserId,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    items: itemsBy.get(row.id) ?? [],
  }));
}

/**
 * The checklist a brand-new inspection starts with.
 *
 * A deliberate two-line default rather than nothing: an inspection with no items
 * cannot be passed or failed, and asking someone to build a checklist before
 * they can book a date is the wrong order to do the work in.
 */
const DEFAULT_INSPECTION_ITEMS = [
  { prompt: "Workmanship meets approved scope", isCritical: true },
  { prompt: "Site is clean and safe", isCritical: false },
];

/**
 * Schedule — or reschedule — the QA inspection, and mirror it onto the calendar.
 *
 * The mirrored Call-Up is what puts the inspection in front of the inspector at
 * all; the QA screen is not somewhere people look daily. It is matched on
 * `inspectionId` so rescheduling moves the existing entry rather than leaving a
 * trail of stale ones on the old dates.
 */
export async function scheduleInspection(
  orgId: string,
  input: { inspectionId?: string | null; projectId: string; inspectorId: string; date: string },
): Promise<void> {
  await assertUserAvailable(orgId, input.inspectorId, input.date);

  // Date only, pinned to UTC midnight: an inspection is booked for a day, and
  // storing local midnight would read back as the day before in some timezones.
  const scheduledFor = new Date(`${input.date}T00:00:00.000Z`);

  const [existing] = input.inspectionId
    ? await db()
        .select({ id: inspections.id })
        .from(inspections)
        .where(
          and(
            eq(inspections.orgId, orgId),
            eq(inspections.id, input.inspectionId),
            eq(inspections.projectId, input.projectId),
          ),
        )
        .limit(1)
    : [];

  let inspectionId = existing?.id;

  if (inspectionId) {
    await db()
      .update(inspections)
      .set({ inspectorUserId: input.inspectorId, scheduledFor, updatedAt: new Date() })
      .where(and(eq(inspections.orgId, orgId), eq(inspections.id, inspectionId)));
  } else {
    const [created] = await db()
      .insert(inspections)
      .values({
        orgId,
        projectId: input.projectId,
        result: "pending",
        inspectorUserId: input.inspectorId,
        scheduledFor,
      })
      .returning({ id: inspections.id });
    inspectionId = created.id;

    await db()
      .insert(inspectionItems)
      .values(
        DEFAULT_INSPECTION_ITEMS.map((item, sortOrder) => ({ orgId, inspectionId: created.id, ...item, sortOrder })),
      );
  }

  const phase = {
    title: "QA inspection",
    description: "Scheduled QA inspection",
    userId: input.inspectorId,
    date: input.date,
  };

  const moved = await db()
    .update(schedulePhases)
    .set({ ...phase, updatedAt: new Date() })
    .where(and(eq(schedulePhases.orgId, orgId), eq(schedulePhases.inspectionId, inspectionId)))
    .returning({ id: schedulePhases.id });

  if (moved.length === 0) {
    await db().insert(schedulePhases).values({ orgId, projectId: input.projectId, inspectionId, ...phase });
  }
}

export async function listDefects(orgId: string, opts: { projectId?: string } = {}): Promise<Defect[]> {
  const conditions = [eq(defects.orgId, orgId)];
  if (opts.projectId) conditions.push(eq(defects.projectId, opts.projectId));
  const rows = await db()
    .select()
    .from(defects)
    .where(and(...conditions))
    // Unresolved first, then most recently raised — the list is a worklist.
    .orderBy(sql`${defects.resolvedAt} nulls first`, desc(defects.createdAt));

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    severity: row.severity,
    assigneeId: row.assigneeUserId,
    dueOn: row.dueOn?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  }));
}
