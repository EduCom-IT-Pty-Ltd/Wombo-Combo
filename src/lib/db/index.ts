import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export { schema };

/**
 * Neon HTTP driver — the right choice for Vercel's serverless/edge runtimes,
 * where holding a TCP pool open across invocations is the wrong shape.
 *
 * Caveat: `neon-http` does not support interactive transactions. The two places
 * that need one (project-number allocation and quote total recalculation) are
 * written as single statements / `db.batch` — see `src/lib/data/`.
 */
let cached: ReturnType<typeof createClient> | null = null;

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Neon branch, " +
        "or leave DEMO_MODE=true to run against the in-memory demo dataset.",
    );
  }
  return drizzle(neon(url), { schema, casing: "snake_case" });
}

export function db() {
  cached ??= createClient();
  return cached;
}

/** True when no database is configured and the app should serve demo data. */
export const isDemoMode = !process.env.DATABASE_URL || process.env.DEMO_MODE === "true";

/**
 * Whether a database exists at all, regardless of `DEMO_MODE`.
 *
 * The two differ only during the migration. A domain that has been ported reads
 * from Postgres as soon as there is a database to read from, and checks this;
 * a domain still on the JSON store checks `isDemoMode`, which `DEMO_MODE="true"`
 * holds open until its port lands.
 *
 * Without the distinction the migration is all-or-nothing: `DEMO_MODE` would
 * have to stay on until the last function is converted, so nothing could be
 * verified against real data until everything was.
 *
 * When the port is finished this collapses back into `isDemoMode` and both go.
 */
export const hasDatabase = Boolean(process.env.DATABASE_URL);
