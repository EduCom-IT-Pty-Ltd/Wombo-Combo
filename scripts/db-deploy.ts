/**
 * Applies pending migrations, and is wired into the Vercel build command so a
 * deploy can never again land code that names a column production does not have.
 *
 *   npm run db:deploy                              # whatever .env.local points at
 *   DATABASE_URL="postgres://..." npm run db:deploy # a specific deployment
 *
 * Two deliberate no-ops, both of which exit 0 so the build carries on:
 *
 * - No DATABASE_URL. That is demo mode, which has no database to migrate.
 * - A Vercel *preview* deployment. Preview normally inherits production's
 *   DATABASE_URL, so migrating there would apply a branch's unmerged migrations
 *   to production days before the code that needs them ships. Set
 *   ALLOW_PREVIEW_MIGRATIONS="true" on a preview that has a database branch of
 *   its own.
 *
 * The connection string is never printed; the host and database name are, which
 * is what you need to tell two deployments apart.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("db:deploy — no DATABASE_URL, nothing to migrate.");
    return;
  }

  if (process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_MIGRATIONS !== "true") {
    console.log("db:deploy — preview deployment, skipping (set ALLOW_PREVIEW_MIGRATIONS to override).");
    return;
  }

  const { hostname, pathname } = new URL(url);
  console.log(`db:deploy — migrating ${hostname}${pathname}`);

  await migrate(drizzle(neon(url)), { migrationsFolder: "drizzle" });
  console.log("db:deploy — up to date.");
}

main().catch((error) => {
  console.error("db:deploy — failed, so the build is being stopped before it can ship against a stale schema.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
