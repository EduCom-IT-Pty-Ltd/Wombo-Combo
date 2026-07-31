import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit runs outside Next, so it does not inherit Next's env loading —
 * and bare `dotenv/config` reads only `.env`, which is not where the connection
 * string lives. Load `.env.local` first so it wins, since dotenv does not
 * overwrite a variable that is already set.
 */
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
