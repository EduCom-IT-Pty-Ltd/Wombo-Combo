ALTER TABLE "customers" ADD COLUMN "portal_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "portal_color" text;--> statement-breakpoint
UPDATE "customers"
SET "portal_visible" = false
WHERE "xero_contact_id" IS NOT NULL;
