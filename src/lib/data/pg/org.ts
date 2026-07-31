import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { memberships, organizations, users } from "@/lib/db/schema/org";
import type { Person } from "../types";
import type { OrganisationSettings } from "../types";
import type { Role } from "@/lib/db/schema/enums";

/**
 * Postgres reads for the organisation and its people — the first slice of the
 * migration off the JSON store.
 *
 * Every function takes `orgId` first, and every `where` starts with it. The
 * signature is the point: an unscoped query is awkward to write by accident.
 */

export interface OrganisationRecord extends OrganisationSettings {
  id: string;
  workosOrgId: string | null;
}

/** Resolves the tenant from the WorkOS organisation id on the session. */
export async function getOrganisationByWorkosId(workosOrgId: string): Promise<OrganisationRecord | null> {
  const [row] = await db()
    .select()
    .from(organizations)
    .where(eq(organizations.workosOrgId, workosOrgId))
    .limit(1);
  return row ? toOrganisation(row) : null;
}

export async function getOrganisation(orgId: string): Promise<OrganisationRecord | null> {
  const [row] = await db().select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return row ? toOrganisation(row) : null;
}

function toOrganisation(row: typeof organizations.$inferSelect): OrganisationRecord {
  const settings = row.settings as { logoUrl?: string | null };
  return {
    id: row.id,
    workosOrgId: row.workosOrgId,
    name: row.name,
    slug: row.slug,
    currency: row.currency,
    timezone: row.timezone,
    projectNumberPrefix: row.projectNumberPrefix,
    // Not a column: the schema keeps presentation-only fields in `settings`
    // rather than growing the table for each one.
    logoUrl: settings?.logoUrl ?? null,
  };
}

export async function listPeople(orgId: string): Promise<Person[]> {
  const rows = await db()
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: memberships.role,
      isSchedulable: memberships.isSchedulable,
      costRateCents: memberships.costRateCents,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.active, true)))
    .orderBy(asc(users.firstName), asc(users.email));

  return rows.map(toPerson);
}

/**
 * The membership lookup behind the invite-only gate. Matching is on a lowercased
 * email because WorkOS preserves whatever case the user typed, and an address
 * that differs only in case is the same person.
 */
export async function getPersonByEmail(orgId: string, email: string): Promise<Person | null> {
  const normalised = email.trim().toLowerCase();
  const rows = await db()
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: memberships.role,
      isSchedulable: memberships.isSchedulable,
      costRateCents: memberships.costRateCents,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.active, true)));

  return rows.map(toPerson).find((person) => person.email.trim().toLowerCase() === normalised) ?? null;
}

type PersonRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  isSchedulable: boolean;
  costRateCents: string | null;
};

function toPerson(row: PersonRow): Person {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.email;
  return {
    id: row.id,
    name,
    initials: initialsFor(row.firstName, row.lastName, row.email),
    role: row.role,
    email: row.email,
    isSchedulable: row.isSchedulable,
    // `cost_rate_cents` is a text column. Parsed rather than trusted: a null or
    // a non-numeric value becomes 0 instead of poisoning a costing calculation
    // with NaN, which would silently propagate through every total on the page.
    costRateCentsPerHour: Number.parseInt(row.costRateCents ?? "", 10) || 0,
    color: null,
  };
}

function initialsFor(firstName: string | null, lastName: string | null, email: string): string {
  const letters = [firstName?.[0], lastName?.[0]].filter(Boolean).join("");
  return (letters || email[0] || "?").toUpperCase();
}
