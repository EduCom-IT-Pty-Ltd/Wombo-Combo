import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { quoteLines, quotes } from "@/lib/db/schema/quoting";
import { projects } from "@/lib/db/schema/projects";
import type { QuoteStatus } from "@/lib/db/schema/enums";
import { calculateQuote, type QuoteLineInput } from "@/lib/domain/quote";
import type { QuoteSummary } from "../types";

/**
 * Postgres reads and writes for quotes.
 *
 * Quotes are versioned rather than edited in place once issued: revising a sent
 * quote creates version N+1 and supersedes N, so what the customer actually saw
 * stays recoverable.
 *
 * Totals are stored on the quote *and* derived from the lines. The stored copy
 * exists so pipeline views do not have to sum lines for every project; it is
 * recomputed from the lines on every write, which is what keeps the two honest.
 * `calculateQuote` in `lib/domain` is the single implementation — money is never
 * summed in SQL, so the numbers on a list page cannot drift from the ones on the
 * quote itself.
 */

export async function listQuotes(orgId: string, projectId: string): Promise<QuoteSummary[]> {
  const rows = await db()
    .select()
    .from(quotes)
    .where(and(eq(quotes.orgId, orgId), eq(quotes.projectId, projectId)))
    .orderBy(desc(quotes.version));
  return withLines(orgId, rows);
}

/**
 * Every quote for a set of projects, in two queries rather than two per project.
 * `withLines` already batches its half, so the only thing that scaled with the
 * number of projects was asking one project at a time.
 */
export async function listQuotesForProjects(orgId: string, projectIds: string[]): Promise<QuoteSummary[]> {
  if (projectIds.length === 0) return [];
  const rows = await db()
    .select()
    .from(quotes)
    .where(and(eq(quotes.orgId, orgId), inArray(quotes.projectId, projectIds)))
    .orderBy(desc(quotes.version));
  return withLines(orgId, rows);
}

export async function getQuote(orgId: string, id: string): Promise<QuoteSummary | null> {
  const [row] = await db()
    .select()
    .from(quotes)
    .where(and(eq(quotes.orgId, orgId), eq(quotes.id, id)))
    .limit(1);
  if (!row) return null;
  const [quote] = await withLines(orgId, [row]);
  return quote ?? null;
}

async function withLines(orgId: string, rows: (typeof quotes.$inferSelect)[]): Promise<QuoteSummary[]> {
  if (rows.length === 0) return [];
  const quoteIds = rows.map((row) => row.id);

  const lines = await db()
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.orgId, orgId), inArray(quoteLines.quoteId, quoteIds)))
    .orderBy(asc(quoteLines.sortOrder));

  const linesBy = new Map<string, QuoteLineInput[]>();
  for (const line of lines) {
    const list = linesBy.get(line.quoteId) ?? [];
    list.push({
      id: line.id,
      kind: line.kind,
      description: line.description,
      quantity: Number(line.quantity),
      unit: line.unit,
      unitCostCents: line.unitCostCents,
      costCurrency: line.costCurrency,
      fxRate: Number(line.fxRate),
      marginPct: Number(line.marginPct),
      // `is_override` records that a human typed the sell price, so margin is
      // derived from it rather than the other way round. Without carrying it
      // back, reopening a quote would silently recompute an overridden price.
      unitSellCentsOverride: line.isOverride ? line.unitSellCents : null,
    });
    linesBy.set(line.quoteId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    reference: row.reference,
    version: row.version,
    status: row.status,
    totalCents: row.totalCents,
    subtotalSellCents: row.subtotalSellCents,
    subtotalCostCents: row.subtotalCostCents,
    marginPct: Number(row.marginPct),
    taxRatePct: Number(row.taxRatePct),
    validUntil: row.validUntil?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    preparedById: row.preparedByUserId,
    lines: linesBy.get(row.id) ?? [],
  }));
}

/**
 * Statuses a new version supersedes: everything still live. `accepted` and
 * `declined` are decisions already taken and `superseded` is already history,
 * so none of them are overwritten.
 *
 * Typed as `QuoteStatus[]` rather than written into raw SQL — Postgres only
 * rejects an unknown enum label at query time, which would surface as an error
 * on the quote page rather than a failed build.
 */
const SUPERSEDABLE_STATUSES: QuoteStatus[] = ["draft", "internal_review", "approved_internally", "sent"];

/**
 * Create the next version of a project's quote and replace its lines.
 *
 * The version number is allocated with `max(version) + 1` inside the insert, so
 * two concurrent saves cannot both claim the same one — the unique index on
 * (orgId, projectId, version) would reject the loser, which is the correct
 * outcome but a confusing error. Computing it in the statement avoids the race
 * entirely, the same reason project numbers use ON CONFLICT.
 */
export async function saveQuote(
  orgId: string,
  input: {
    projectId: string;
    reference?: string;
    lines: QuoteLineInput[];
    taxRatePct?: number;
    preparedByUserId?: string | null;
    validUntil?: Date | null;
    terms?: string | null;
  },
): Promise<QuoteSummary> {
  const taxRatePct = input.taxRatePct ?? 10;
  const totals = calculateQuote(input.lines, taxRatePct);

  // Anything previously issued becomes history the moment a new version exists.
  await db()
    .update(quotes)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(
      and(
        eq(quotes.orgId, orgId),
        eq(quotes.projectId, input.projectId),
        inArray(quotes.status, SUPERSEDABLE_STATUSES),
      ),
    );

  const nextVersion = sql<number>`(
    select coalesce(max(${quotes.version}), 0) + 1
    from ${quotes}
    where ${quotes.orgId} = ${orgId} and ${quotes.projectId} = ${input.projectId}
  )`;

  const [quote] = await db()
    .insert(quotes)
    .values({
      orgId,
      projectId: input.projectId,
      version: nextVersion,
      status: "draft",
      reference: input.reference ?? "",
      subtotalCostCents: totals.subtotalCostCents,
      subtotalSellCents: totals.subtotalSellCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      marginCents: totals.marginCents,
      marginPct: String(totals.marginPct),
      taxRatePct: String(taxRatePct),
      preparedByUserId: input.preparedByUserId ?? null,
      validUntil: input.validUntil ?? null,
      terms: input.terms ?? null,
    })
    .returning();

  // Reference defaults to the project number plus version, which is only
  // knowable after the version has been allocated.
  if (!input.reference) {
    const [project] = await db()
      .select({ projectNumber: projects.projectNumber })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), eq(projects.id, input.projectId)))
      .limit(1);
    const reference = `${project?.projectNumber ?? "QUOTE"}-v${quote.version}`;
    await db().update(quotes).set({ reference }).where(eq(quotes.id, quote.id));
    quote.reference = reference;
  }

  if (totals.lines.length > 0) {
    await db()
      .insert(quoteLines)
      .values(
        totals.lines.map((line, index) => ({
          orgId,
          quoteId: quote.id,
          kind: line.kind,
          description: line.description,
          quantity: String(line.quantity),
          unit: line.unit,
          unitCostCents: line.unitCostCents,
          costCurrency: line.costCurrency,
          fxRate: String(line.fxRate),
          marginPct: String(line.marginPct),
          unitSellCents: line.unitSellCents,
          isOverride: line.isOverride,
          lineCostCents: line.lineCostCents,
          lineSellCents: line.lineSellCents,
          sortOrder: index,
        })),
      );
  }

  const created = await getQuote(orgId, quote.id);
  if (!created) throw new Error("Quote was inserted but could not be read back.");
  return created;
}

/**
 * Move a quote through its lifecycle, and keep the project's denormalised
 * contract value in step when one is accepted.
 */
export async function setQuoteStatus(
  orgId: string,
  quoteId: string,
  status: QuoteStatus,
  actorUserId?: string | null,
): Promise<boolean> {
  const [row] = await db()
    .update(quotes)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === "sent" ? { sentAt: new Date() } : {}),
      ...(status === "accepted" || status === "declined" ? { decidedAt: new Date() } : {}),
      ...(status === "accepted" ? { approvedByUserId: actorUserId ?? null, approvedAt: new Date() } : {}),
    })
    .where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)))
    .returning();

  if (!row) return false;

  if (status === "accepted") {
    // `contractValueCents` and `acceptedQuoteId` are denormalised onto the
    // project so pipeline and revenue views never join through quotes.
    await db()
      .update(projects)
      .set({ contractValueCents: row.totalCents, acceptedQuoteId: row.id, updatedAt: new Date() })
      .where(and(eq(projects.orgId, orgId), eq(projects.id, row.projectId)));
  }

  return true;
}

/** The accepted quote's margin, for the projects list. Null when none accepted. */
export async function getAcceptedMarginPct(orgId: string, projectId: string): Promise<number | null> {
  const [row] = await db()
    .select({ marginPct: quotes.marginPct })
    .from(quotes)
    .where(and(eq(quotes.orgId, orgId), eq(quotes.projectId, projectId), eq(quotes.status, "accepted")))
    .limit(1);
  return row ? Number(row.marginPct) : null;
}
