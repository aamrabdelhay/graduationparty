CREATE TYPE "public"."ai_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('OPEN', 'SAVED', 'DISCARDED');--> statement-breakpoint
CREATE TYPE "public"."image_type" AS ENUM('CHILDHOOD', 'ADULT', 'GRADUATION');--> statement-breakpoint
CREATE TYPE "public"."participant_source" AS ENUM('PUBLIC', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."presentation_mode" AS ENUM('AUTOMATIC', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."presentation_playback" AS ENUM('IDLE', 'RUNNING', 'PAUSED', 'FINISHED');--> statement-breakpoint
CREATE TYPE "public"."presentation_status" AS ENUM('QUEUED', 'CURRENT', 'PRESENTED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('INDIVIDUAL', 'GROUP');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"participant_id" uuid,
	"admin_session_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"status" "draft_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_modification_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_at" timestamp with time zone,
	"discarded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin_draft_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"participant_id" uuid,
	"field" text NOT NULL,
	"previous_value" jsonb NOT NULL,
	"new_value" jsonb NOT NULL,
	"participant_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_login_attempt" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'DISCARDED_DRAFTS' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"logged_out_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "image_type" NOT NULL,
	"storage_provider" text DEFAULT 'disk' NOT NULL,
	"storage_key" text NOT NULL,
	"public_url" text NOT NULL,
	"mime_type" text DEFAULT 'image/jpeg' NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"committed" boolean DEFAULT false NOT NULL,
	"participant_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"group_id" uuid,
	"submission_id" uuid NOT NULL,
	"childhood_image_id" uuid NOT NULL,
	"adult_image_id" uuid NOT NULL,
	"graduation_image_id" uuid,
	"ai_status" "ai_status" DEFAULT 'PENDING' NOT NULL,
	"ai_error" text,
	"ai_retry_count" integer DEFAULT 0 NOT NULL,
	"presentation_status" "presentation_status" DEFAULT 'QUEUED' NOT NULL,
	"presentation_order" integer,
	"source" "participant_source" DEFAULT 'PUBLIC' NOT NULL,
	"group_position" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation_display" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"token_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "presentation_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"current_participant_id" uuid,
	"queue_position" integer DEFAULT 0 NOT NULL,
	"mode" "presentation_mode" DEFAULT 'AUTOMATIC' NOT NULL,
	"auto_play" boolean DEFAULT true NOT NULL,
	"is_paused" boolean DEFAULT true NOT NULL,
	"playback" "presentation_playback" DEFAULT 'IDLE' NOT NULL,
	"sequence_version" integer DEFAULT 0 NOT NULL,
	"childhood_duration_ms" integer DEFAULT 2000 NOT NULL,
	"smoke_duration_ms" integer DEFAULT 1200 NOT NULL,
	"adult_duration_ms" integer DEFAULT 5000 NOT NULL,
	"name_reveal_duration_ms" integer DEFAULT 800 NOT NULL,
	"transition_duration_ms" integer DEFAULT 800 NOT NULL,
	"loop_after_queue_end" boolean DEFAULT false NOT NULL,
	"display_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "submission_type" NOT NULL,
	"group_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_admin_session_id_admin_session_id_fk" FOREIGN KEY ("admin_session_id") REFERENCES "public"."admin_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_draft" ADD CONSTRAINT "admin_draft_session_id_admin_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."admin_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_draft_change" ADD CONSTRAINT "admin_draft_change_draft_id_admin_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."admin_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_draft_change" ADD CONSTRAINT "admin_draft_change_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_asset" ADD CONSTRAINT "image_asset_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_childhood_image_id_image_asset_id_fk" FOREIGN KEY ("childhood_image_id") REFERENCES "public"."image_asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_adult_image_id_image_asset_id_fk" FOREIGN KEY ("adult_image_id") REFERENCES "public"."image_asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_graduation_image_id_image_asset_id_fk" FOREIGN KEY ("graduation_image_id") REFERENCES "public"."image_asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_state" ADD CONSTRAINT "presentation_state_current_participant_id_participant_id_fk" FOREIGN KEY ("current_participant_id") REFERENCES "public"."participant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_created_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_log_action_idx" ON "activity_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "draft_change_draft_idx" ON "admin_draft_change" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "draft_change_participant_idx" ON "admin_draft_change" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "login_attempt_ip_idx" ON "admin_login_attempt" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_session_token_hash_uq" ON "admin_session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "group_number_idx" ON "group" USING btree ("number");--> statement-breakpoint
CREATE INDEX "image_asset_participant_idx" ON "image_asset" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "participant_group_idx" ON "participant" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "participant_submission_idx" ON "participant" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "participant_order_idx" ON "participant" USING btree ("presentation_order");--> statement-breakpoint
CREATE INDEX "participant_created_idx" ON "participant" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "participant_name_idx" ON "participant" USING btree ("full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_display_token_uq" ON "presentation_display" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_display_token_hash_uq" ON "presentation_display" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "presentation_state_current_idx" ON "presentation_state" USING btree ("current_participant_id");--> statement-breakpoint
CREATE INDEX "submission_submitted_at_idx" ON "submission" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "submission_group_idx" ON "submission" USING btree ("group_id");