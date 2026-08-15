ALTER TABLE "admin_audit_log" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD COLUMN "flag_note" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "can_audit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "flag_reason" text;--> statement-breakpoint
CREATE INDEX "admin_audit_log_flagged_idx" ON "admin_audit_log" USING btree ("flagged");