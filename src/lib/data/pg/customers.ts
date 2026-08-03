import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, customers, sites } from "@/lib/db/schema/crm";
import { projects } from "@/lib/db/schema/projects";
import type { ProjectStatus } from "@/lib/db/schema/enums";
import type { Customer } from "../types";

/**
 * Postgres reads and writes for customers.
 *
 * The `Customer` view model carries three aggregates the table does not hold —
 * `siteCount`, `activeProjects` and `lifetimeValueCents` — plus the primary
 * contact, which lives in its own table. They are gathered in grouped queries
 * rather than per row, so listing N customers stays four round trips instead
 * of 3N + 1.
 */

/**
 * Statuses that do not count towards "active projects" on a customer card.
 *
 * Typed as `ProjectStatus[]` rather than a bare string list so a future rename
 * of a status fails the build here. Postgres rejects an unknown enum label at
 * runtime, which is a query-time error on a page rather than a caught mistake.
 */
const FINISHED_PROJECT_STATUSES: ProjectStatus[] = ["closed", "lost", "cancelled"];

export async function listCustomers(orgId: string): Promise<Customer[]> {
  return loadCustomers(orgId, true);
}

export async function listArchivedCustomers(orgId: string): Promise<Customer[]> {
  return loadCustomers(orgId, false);
}

export async function getCustomer(orgId: string, id: string): Promise<Customer | null> {
  const [row] = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, id)))
    .limit(1);
  if (!row) return null;
  const [enriched] = await enrich(orgId, [row]);
  return enriched ?? null;
}

export async function isCustomerArchived(orgId: string, id: string): Promise<boolean> {
  const [row] = await db()
    .select({ active: customers.active })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, id)))
    .limit(1);
  // Absent is not archived — the caller distinguishes "gone" via getCustomer.
  return row ? !row.active : false;
}

async function loadCustomers(orgId: string, active: boolean): Promise<Customer[]> {
  const rows = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.active, active)))
    .orderBy(asc(customers.name));
  return enrich(orgId, rows);
}

async function enrich(orgId: string, rows: (typeof customers.$inferSelect)[]): Promise<Customer[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [primaryContacts, siteCounts, projectStats] = await Promise.all([
    db()
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), inArray(contacts.customerId, ids), eq(contacts.isPrimary, true))),
    db()
      .select({ customerId: sites.customerId, count: sql<number>`count(*)::int` })
      .from(sites)
      .where(and(eq(sites.orgId, orgId), inArray(sites.customerId, ids)))
      .groupBy(sites.customerId),
    db()
      .select({
        customerId: projects.customerId,
        // Lifetime value counts every project regardless of status; active
        // counts only those still in flight. Two aggregates, one scan.
        lifetimeValueCents: sql<number>`coalesce(sum(${projects.contractValueCents}), 0)::int`,
        activeProjects: sql<number>`count(*) filter (where ${projects.status} not in ${FINISHED_PROJECT_STATUSES})::int`,
      })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), inArray(projects.customerId, ids)))
      .groupBy(projects.customerId),
  ]);

  const contactBy = new Map(primaryContacts.map((c) => [c.customerId, c]));
  const sitesBy = new Map(siteCounts.map((s) => [s.customerId, s.count]));
  const projectsBy = new Map(projectStats.map((p) => [p.customerId, p]));

  return rows.map((row) => {
    const contact = contactBy.get(row.id);
    const stats = projectsBy.get(row.id);
    return {
      id: row.id,
      name: row.name,
      accountType: row.accountType,
      abn: row.abn,
      // `payment_terms_days` is a text column. Parsed with a 30-day default
      // rather than 0, because 0 would silently mean "due immediately".
      paymentTermsDays: Number.parseInt(row.paymentTermsDays ?? "", 10) || 30,
      primaryContactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : null,
      primaryContactEmail: contact?.email ?? null,
      primaryContactPhone: contact?.phone ?? null,
      siteCount: sitesBy.get(row.id) ?? 0,
      activeProjects: stats?.activeProjects ?? 0,
      lifetimeValueCents: stats?.lifetimeValueCents ?? 0,
      priceListId: row.priceListId,
      defaultProjectTemplateId: row.defaultProjectTemplateId,
    };
  });
}

/**
 * Create a customer and, when contact details were given, its primary contact.
 *
 * Two inserts rather than one, and `neon-http` has no interactive transactions,
 * so a failure between them leaves a customer with no contact. That is the
 * benign direction to fail in — a contactless customer is editable, whereas an
 * orphaned contact would not be reachable at all.
 */
export async function createCustomer(
  orgId: string,
  input: {
    name: string;
    accountType?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    paymentTermsDays: number;
  },
): Promise<Customer> {
  const [row] = await db()
    .insert(customers)
    .values({
      orgId,
      name: input.name,
      accountType: input.accountType || null,
      paymentTermsDays: String(input.paymentTermsDays),
      active: true,
    })
    .returning();

  const contactName = input.contactName?.trim();
  if (contactName || input.contactEmail || input.contactPhone) {
    const [firstName, ...rest] = (contactName || input.contactEmail || "Contact").split(/\s+/);
    await db().insert(contacts).values({
      orgId,
      customerId: row.id,
      firstName,
      lastName: rest.join(" ") || null,
      email: input.contactEmail || null,
      phone: input.contactPhone || null,
      isPrimary: true,
    });
  }

  const created = await getCustomer(orgId, row.id);
  if (!created) throw new Error("Customer was inserted but could not be read back.");
  return created;
}

/** Search index for the top bar: one query, none of the list-page aggregates. */
export async function listCustomersForSearch(
  orgId: string,
  limit = 500,
): Promise<Array<{ id: string; name: string; primaryContactName: string | null }>> {
  const rows = await db()
    .select({
      id: customers.id,
      name: customers.name,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(customers)
    .leftJoin(
      contacts,
      and(eq(contacts.customerId, customers.id), eq(contacts.isPrimary, true)),
    )
    .where(and(eq(customers.orgId, orgId), eq(customers.active, true)))
    .orderBy(asc(customers.name))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    primaryContactName: row.firstName ? [row.firstName, row.lastName].filter(Boolean).join(" ") : null,
  }));
}
