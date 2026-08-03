ALTER TABLE "memberships" ADD COLUMN "color" text;--> statement-breakpoint
--> Emails are matched lowercased everywhere (getPersonByEmail, sync-org), but
--> rows written before this migration kept whatever case WorkOS returned. Fold
--> them first, or the unique index below would be built over values the
--> application already treats as equal.
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");