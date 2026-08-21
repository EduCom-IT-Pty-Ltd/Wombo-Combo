/**
 * What state is a database in, relative to the migrations in this repo?
 *
 *   npm run db:status                              # whatever .env.local points at
 *   DATABASE_URL="postgres://..." npm run db:status # a specific deployment
 *
 * Nothing here writes. Deploys apply migrations themselves — `db:deploy` runs in
 * the Vercel build command — so this is the read-only way to ask what state a
 * database is actually in: one that was created or branched outside that path,
 * or a preview whose migrations were skipped, is missing whatever landed since,
 * and the app fails at the first query that names a new column.
 *
 * The connection string is never printed; the host and database name are, which
 * is what you need to tell two deployments apart.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

interface Journal {
  entries: Array<{ idx: number; tag: string; when: number }>;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Pass one on the command line or put it in .env.local.");
    process.exit(1);
  }

  const { hostname, pathname } = new URL(url);
  console.log(`Database: ${hostname}${pathname}\n`);

  const sql = neon(url);
  const journal = JSON.parse(await readFile(join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8")) as Journal;

  let applied: Array<{ hash: string; created_at: string }> = [];
  try {
    applied = (await sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`) as typeof applied;
  } catch {
    console.log("No drizzle.__drizzle_migrations table — this database has never been migrated.\n");
  }

  // drizzle records a hash of each migration's SQL, not its tag, so the tags are
  // matched back by position: the journal is ordered, and so is the table.
  const expected = journal.entries.sort((a, b) => a.idx - b.idx);
  const missing = expected.slice(applied.length);

  console.log(`Migrations: ${applied.length} of ${expected.length} applied`);
  for (const entry of expected.slice(0, applied.length)) console.log(`  applied  ${entry.tag}`);
  for (const entry of missing) console.log(`  MISSING  ${entry.tag}`);

  // A migration count can look right while the schema is not — a database
  // restored from a dump carries the table but not necessarily the columns. So
  // check the ones the application actually names.
  const checks: Array<[string, string]> = [
    ["projects", "archived_at"],
    ["projects", "sharepoint_drive_id"],
    ["projects", "sharepoint_folder_item_id"],
    ["projects", "sharepoint_folder_url"],
    ["projects", "custom_fields"],
    ["memberships", "color"],
    ["customers", "portal_visible"],
    ["customers", "portal_color"],
    ["xero_connections", "org_id"],
    ["xero_connections", "short_code"],
  ];

  const present = new Set(
    (
      (await sql`
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'`) as Array<{ table_name: string; column_name: string }>
    ).map((row) => `${row.table_name}.${row.column_name}`),
  );

  const absent = checks.filter(([table, column]) => !present.has(`${table}.${column}`));
  console.log(`\nColumns the application reads:`);
  if (absent.length === 0) {
    console.log("  all present");
  } else {
    for (const [table, column] of absent) console.log(`  MISSING  ${table}.${column}`);
  }

  if (missing.length || absent.length) {
    console.log(`\nThis database is behind the code. Apply the migrations to it:`);
    console.log(`  DATABASE_URL="<this database's connection string>" npm run db:migrate`);
    process.exit(1);
  }
  console.log("\nUp to date.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
