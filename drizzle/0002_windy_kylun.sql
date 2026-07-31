CREATE TABLE "schedule_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"inspection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_phases" ADD CONSTRAINT "schedule_phases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_phases_org_project_idx" ON "schedule_phases" USING btree ("org_id","project_id");--> statement-breakpoint
CREATE INDEX "schedule_phases_org_user_date_idx" ON "schedule_phases" USING btree ("org_id","user_id","date");