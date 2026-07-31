/**
 * Create the organisation in Postgres and sync its people from WorkOS.
 *
 *   npm run sync:org                              # sync
 *   npm run sync:org -- --dry-run                 # show what would change
 *   npm run sync:org -- --owner=you@example.com   # who becomes owner
 *
 * `--owner` applies only when creating a membership, so it cannot demote or
 * promote anyone on a later run. Falls back to WORKOS_BOOTSTRAP_EMAIL.
 *
 * WorkOS stays the source of truth for who exists; Postgres holds the role and
 * the costing data it knows nothing about. Re-runnable: existing users keep
 * their role, new ones arrive as `staff`.
 *
 * Run this after inviting someone in WorkOS. Until their row exists here they
 * authenticate successfully and are then turned away at /no-access, because
 * membership — not authentication — is what grants access.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

interface WorkosUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

async function workos<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.workos.com${path}`, {
    headers: { authorization: `Bearer ${process.env.WORKOS_API_KEY}` },
  });
  if (!response.ok) {
    throw new Error(`WorkOS ${path} -> ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const workosOrgId = process.env.WORKOS_ORG_ID;
  const ownerEmail = (
    process.argv.find((arg) => arg.startsWith("--owner="))?.slice("--owner=".length) ??
    process.env.WORKOS_BOOTSTRAP_EMAIL ??
    ""
  )
    .trim()
    .toLowerCase() || undefined;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  if (!process.env.WORKOS_API_KEY || !workosOrgId) {
    throw new Error("WORKOS_API_KEY and WORKOS_ORG_ID must both be set.");
  }

  const { db } = await import("../src/lib/db");
  const { organizations, users, memberships } = await import("../src/lib/db/schema/org");
  const { eq, and } = await import("drizzle-orm");

  // 1. The organisation, named from WorkOS so the two cannot drift.
  const workosOrg = await workos<{ id: string; name: string }>(`/organizations/${workosOrgId}`);
  console.log(`WorkOS organisation: ${workosOrg.name}`);

  const [existingOrg] = await db()
    .select()
    .from(organizations)
    .where(eq(organizations.workosOrgId, workosOrgId))
    .limit(1);

  let orgId: string;
  if (existingOrg) {
    orgId = existingOrg.id;
    console.log(`  exists in Postgres (${orgId})`);
  } else if (dryRun) {
    orgId = "<would be created>";
    console.log("  would CREATE");
  } else {
    const slug = workosOrg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const [created] = await db()
      .insert(organizations)
      .values({
        workosOrgId,
        name: workosOrg.name,
        slug,
        // Initials of the organisation name, so project numbers read as
        // EI-2026-0001 rather than the PRJ- default.
        projectNumberPrefix: workosOrg.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 4).toUpperCase() || "PRJ",
        timezone: "Australia/Sydney",
        currency: "AUD",
      })
      .returning();
    orgId = created.id;
    console.log(`  CREATED (${orgId})`);
  }

  // 2. People. Only active memberships — `pending` is an unaccepted invitation
  //    and `inactive` is a revoked one, and neither should be able to sign in.
  const workosMembers = await workos<{ data: Array<{ user_id: string; status: string }> }>(
    `/user_management/organization_memberships?organization_id=${workosOrgId}&statuses=active&limit=100`,
  );
  console.log(`\nActive WorkOS memberships: ${workosMembers.data.length}`);

  if (workosMembers.data.length === 0) {
    console.log("  None. Invite people into the organisation in WorkOS, then re-run.");
  }

  for (const membership of workosMembers.data) {
    const user = await workos<WorkosUser>(`/user_management/users/${membership.user_id}`);
    const email = user.email.trim().toLowerCase();

    const [existingUser] = await db()
      .select()
      .from(users)
      .where(eq(users.workosUserId, user.id))
      .limit(1);

    if (dryRun) {
      console.log(`  ${existingUser ? "exists" : "would CREATE"}  ${user.email}`);
      continue;
    }

    let userId: string;
    if (existingUser) {
      await db()
        .update(users)
        .set({ email: user.email, firstName: user.first_name, lastName: user.last_name, updatedAt: new Date() })
        .where(eq(users.id, existingUser.id));
      userId = existingUser.id;
    } else {
      const [created] = await db()
        .insert(users)
        .values({
          workosUserId: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        })
        .returning();
      userId = created.id;
    }

    const [existingMembership] = await db()
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
      .limit(1);

    if (existingMembership) {
      // Role is not overwritten. It is administered in-app and WorkOS has no
      // view of it, so syncing would silently undo every role change.
      await db().update(memberships).set({ active: true, updatedAt: new Date() }).where(eq(memberships.id, existingMembership.id));
      console.log(`  updated  ${user.email} (role ${existingMembership.role}, unchanged)`);
    } else {
      const role = ownerEmail && email === ownerEmail ? "owner" : "staff";
      await db().insert(memberships).values({ orgId, userId, role, isSchedulable: false, active: true });
      console.log(`  CREATED  ${user.email} as ${role}`);
    }
  }

  if (dryRun) {
    console.log("\nDry run — nothing was written.");
    return;
  }

  const finalPeople = await db()
    .select({ email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.active, true)));

  console.log(`\nOrganisation ${orgId} now has ${finalPeople.length} active people:`);
  for (const person of finalPeople) console.log(`  ${person.role.padEnd(8)} ${person.email}`);

  const hasOwner = finalPeople.some((p) => p.role === "owner");
  if (!hasOwner) {
    console.log("\nWARNING: nobody has the owner role. Set WORKOS_BOOTSTRAP_EMAIL to your");
    console.log("address and re-run, or promote someone directly, or nobody can administer this.");
  }
}

main().catch((error) => {
  console.error("\nFAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
