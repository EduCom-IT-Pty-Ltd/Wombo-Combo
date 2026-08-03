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
      color: memberships.color,
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
      color: memberships.color,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.active, true)));

  return rows.map(toPerson).find((person) => person.email.trim().toLowerCase() === normalised) ?? null;
}

export interface PersonInput {
  name: string;
  email: string;
  role: Role;
  isSchedulable: boolean;
  costRateCentsPerHour: number;
  color: string | null;
}

/**
 * Create or re-admit a person, returning their row.
 *
 * Two statements, because `neon-http` has no interactive transactions. Both are
 * upserts rather than inserts, so a retry after a partial failure converges on
 * the same state instead of erroring on the half that already landed — which is
 * the only rollback available here.
 *
 * Re-inviting someone previously removed finds their existing row by email and
 * flips `active` back on, so their history reattaches rather than being stranded
 * behind a second row for the same person.
 */
export async function upsertPerson(orgId: string, input: PersonInput): Promise<Person> {
  const email = input.email.trim().toLowerCase();
  const { firstName, lastName } = splitName(input.name);

  const [user] = await db()
    .insert(users)
    .values({ email, firstName, lastName })
    .onConflictDoUpdate({
      target: users.email,
      set: { firstName, lastName, updatedAt: new Date() },
    })
    .returning({ id: users.id });

  const [membership] = await db()
    .insert(memberships)
    .values({
      orgId,
      userId: user.id,
      role: input.role,
      isSchedulable: input.isSchedulable,
      costRateCents: String(input.costRateCentsPerHour),
      color: input.color,
      active: true,
    })
    .onConflictDoUpdate({
      target: [memberships.orgId, memberships.userId],
      set: {
        role: input.role,
        isSchedulable: input.isSchedulable,
        costRateCents: String(input.costRateCentsPerHour),
        color: input.color,
        active: true,
        updatedAt: new Date(),
      },
    })
    .returning({ role: memberships.role, isSchedulable: memberships.isSchedulable, costRateCents: memberships.costRateCents, color: memberships.color });

  return toPerson({ id: user.id, email, firstName, lastName, ...membership });
}

/**
 * Edit an existing person. `userId` is the `users.id` the UI already holds, and
 * the membership half is scoped by `orgId` so an id from another tenant updates
 * nothing rather than someone else's row.
 */
export async function updatePersonDetails(orgId: string, userId: string, input: PersonInput): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const { firstName, lastName } = splitName(input.name);

  await db().update(users).set({ email, firstName, lastName, updatedAt: new Date() }).where(eq(users.id, userId));
  await db()
    .update(memberships)
    .set({
      role: input.role,
      isSchedulable: input.isSchedulable,
      costRateCents: String(input.costRateCentsPerHour),
      color: input.color,
      updatedAt: new Date(),
    })
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
}

/**
 * Revoke access without deleting anything. Returns the email so the caller can
 * revoke the matching WorkOS access, or null when there was no such membership
 * in this organisation — which is what stops a stray id from triggering a
 * WorkOS revocation for someone else.
 */
export async function deactivatePerson(orgId: string, userId: string): Promise<string | null> {
  const [row] = await db()
    .update(memberships)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .returning({ userId: memberships.userId });
  if (!row) return null;

  const [user] = await db().select({ email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1);
  return user?.email ?? null;
}

/**
 * WorkOS stores a given and family name; this application asks for one "Full
 * name" field, because a fitout crew is not a directory. The first token is the
 * given name and the remainder the family name, which is wrong for some names
 * and recoverable for all of them — the two are only ever joined back together
 * for display.
 */
function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") || null };
}

type PersonRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  isSchedulable: boolean;
  costRateCents: string | null;
  color: string | null;
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
    color: row.color,
  };
}

function initialsFor(firstName: string | null, lastName: string | null, email: string): string {
  const letters = [firstName?.[0], lastName?.[0]].filter(Boolean).join("");
  return (letters || email[0] || "?").toUpperCase();
}
