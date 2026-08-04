ALTER TABLE "price_list_items" ADD COLUMN "unit_sell_cents" integer;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD COLUMN "xero_item_id" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "xero_quote_id" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "xero_quote_number" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "xero_quote_status" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "xero_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "xero_last_error" text;--> statement-breakpoint
ALTER TABLE "invoice_exports" ADD COLUMN "quote_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_exports" ADD CONSTRAINT "invoice_exports_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;