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
