/**
 * Graduation Party — database schema (Drizzle ORM / PostgreSQL)
 *
 * Design notes (mapping to the product requirements):
 *  - A `Submission` is a form submission (INDIVIDUAL or GROUP). A group
 *    submission has exactly one Submission row + one Group row; each member is
 *    an independent Participant row sharing submissionId + groupId.
 *  - `Participant.presentationOrder` is the admin-controlled queue order.
 *    `Submission.submittedAt` is the immutable server timestamp (order of the
 *    participants table). The two concepts never interfere.
 *  - `Participant.version` is an optimistic-lock counter used to detect
 *    concurrent admin edits (never silently overwrite).
 *  - `AdminDraft` / `AdminDraftChange` persist the "unsaved changes" system
 *    server-side so it survives browsers, devices and refreshes.
 *  - `PresentationState` is a singleton row holding playback + timing settings.
 *  - `PresentationDisplay` stores active projector display tokens (raw token to
 *    let the admin copy the link anytime + hash for lookups).
 *  - `ImageAsset.committed=false` marks temporary/staged assets (uploaded for a
 *    preview, or staged by an admin draft that was not saved yet). They are
 *    attached (committed=true) on final save/submission or deleted on discard.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  serial,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const submissionTypeEnum = pgEnum("submission_type", ["INDIVIDUAL", "GROUP"]);
export const aiStatusEnum = pgEnum("ai_status", ["PENDING", "PROCESSING", "COMPLETED", "FAILED"]);
export const presentationStatusEnum = pgEnum("presentation_status", [
  "QUEUED",
  "CURRENT",
  "PRESENTED",
  "SKIPPED",
]);
export const imageTypeEnum = pgEnum("image_type", ["CHILDHOOD", "ADULT", "GRADUATION"]);
export const participantSourceEnum = pgEnum("participant_source", ["PUBLIC", "ADMIN"]);
export const presentationModeEnum = pgEnum("presentation_mode", ["AUTOMATIC", "MANUAL"]);
export const presentationPlaybackEnum = pgEnum("presentation_playback", [
  "IDLE",
  "RUNNING",
  "PAUSED",
  "FINISHED",
]);
export const draftStatusEnum = pgEnum("draft_status", ["OPEN", "SAVED", "DISCARDED"]);

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

export const imageAsset = pgTable(
  "image_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: imageTypeEnum("kind").notNull(),
    storageProvider: text("storage_provider").notNull().default("disk"),
    storageKey: text("storage_key").notNull(),
    publicUrl: text("public_url").notNull(),
    mimeType: text("mime_type").notNull().default("image/jpeg"),
    fileSize: integer("file_size").notNull().default(0),
    width: integer("width").notNull().default(0),
    height: integer("height").notNull().default(0),
    /** committed=false => staged/temporary asset (preview draft or unsaved admin replacement) */
    committed: boolean("committed").notNull().default(false),
    /**
     * informational: which participant this asset is attached to once committed.
     * No DB-level FK on purpose (avoids a schema definition cycle); the app
     * manages the link + staged-asset cleanup, see lib/assets + drafts service.
     */
    participantId: uuid("participant_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("image_asset_participant_idx").on(t.participantId)],
);

export const group = pgTable(
  "group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human friendly sequential number, rendered as "Group #014". */
    number: integer("number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("group_number_idx").on(t.number)],
);

export const submission = pgTable(
  "submission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: submissionTypeEnum("type").notNull(),
    groupId: uuid("group_id").references(() => group.id, { onDelete: "set null" }),
    /** Authoritative server timestamp — never taken from the client clock. */
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("submission_submitted_at_idx").on(t.submittedAt), index("submission_group_idx").on(t.groupId)],
);

export const participant = pgTable(
  "participant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    groupId: uuid("group_id").references(() => group.id, { onDelete: "set null" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submission.id, { onDelete: "restrict" }),
    childhoodImageId: uuid("childhood_image_id")
      .notNull()
      .references(() => imageAsset.id),
    adultImageId: uuid("adult_image_id")
      .notNull()
      .references(() => imageAsset.id),
    graduationImageId: uuid("graduation_image_id").references(() => imageAsset.id),
    aiStatus: aiStatusEnum("ai_status").notNull().default("PENDING"),
    aiError: text("ai_error"),
    aiRetryCount: integer("ai_retry_count").notNull().default(0),
    presentationStatus: presentationStatusEnum("presentation_status").notNull().default("QUEUED"),
    /** 1-based index used by the slideshow. Null only when never queued. */
    presentationOrder: integer("presentation_order"),
    source: participantSourceEnum("source").notNull().default("PUBLIC"),
    /** Position inside its group submission (1..n), null for individuals. */
    groupPosition: integer("group_position"),
    /** Optimistic lock — bumped on every successful server-side update. */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("participant_group_idx").on(t.groupId),
    index("participant_submission_idx").on(t.submissionId),
    index("participant_order_idx").on(t.presentationOrder),
    index("participant_created_idx").on(t.createdAt),
    index("participant_name_idx").on(t.fullName),
  ],
);

export const adminSession = pgTable(
  "admin_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** sha256 hex of the cookie value. The raw token only ever lives in the browser cookie. */
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** null => session never expires (admin stays logged in until explicit logout). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    loggedOutAt: timestamp("logged_out_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("admin_session_token_hash_uq").on(t.tokenHash)],
);

export const adminLoginAttempt = pgTable(
  "admin_login_attempt",
  {
    id: serial("id").primaryKey(),
    ipHash: text("ip_hash").notNull(),
    success: boolean("success").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempt_ip_idx").on(t.ipHash, t.createdAt)],
);

export const adminDraft = pgTable("admin_draft", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => adminSession.id, { onDelete: "cascade" }),
  status: draftStatusEnum("status").notNull().default("OPEN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastModificationAt: timestamp("last_modification_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  savedAt: timestamp("saved_at", { withTimezone: true }),
  discardedAt: timestamp("discarded_at", { withTimezone: true }),
});

export const adminDraftChange = pgTable(
  "admin_draft_change",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => adminDraft.id, { onDelete: "cascade" }),
    /** null for non-participant scoped changes (e.g. settings, queue reorder). */
    participantId: uuid("participant_id").references(() => participant.id, { onDelete: "set null" }),
    /** Field being changed: participant columns ("fullName","adultImageId", "_delete")
     *  or scoped pseudo-fields ("settings.childhoodDurationMs", "queue.presentationOrder"). */
    field: text("field").notNull(),
    previousValue: jsonb("previous_value").notNull(),
    newValue: jsonb("new_value").notNull(),
    /** Optimistic-lock value captured when the change was recorded. */
    participantVersion: integer("participant_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("draft_change_draft_idx").on(t.draftId),
    index("draft_change_participant_idx").on(t.participantId),
  ],
);

export const presentationState = pgTable(
  "presentation_state",
  {
    id: text("id").primaryKey().default("singleton"),
    currentParticipantId: uuid("current_participant_id").references(() => participant.id, {
      onDelete: "set null",
    }),
    /** 0-based index into the current queue of the current participant. */
    queuePosition: integer("queue_position").notNull().default(0),
    mode: presentationModeEnum("mode").notNull().default("AUTOMATIC"),
    autoPlay: boolean("auto_play").notNull().default(true),
    isPaused: boolean("is_paused").notNull().default(true),
    playback: presentationPlaybackEnum("playback").notNull().default("IDLE"),
    /** Incremented on every control command so clients can detect changes. */
    sequenceVersion: integer("sequence_version").notNull().default(0),
    childhoodDurationMs: integer("childhood_duration_ms").notNull().default(2000),
    smokeDurationMs: integer("smoke_duration_ms").notNull().default(1200),
    adultDurationMs: integer("adult_duration_ms").notNull().default(5000),
    nameRevealDurationMs: integer("name_reveal_duration_ms").notNull().default(800),
    transitionDurationMs: integer("transition_duration_ms").notNull().default(800),
    loopAfterQueueEnd: boolean("loop_after_queue_end").notNull().default(false),
    displaySettings: jsonb("display_settings").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("presentation_state_current_idx").on(t.currentParticipantId)],
);

export const presentationDisplay = pgTable(
  "presentation_display",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Raw random token (server-side only; exposed to admins so they can copy the link). */
    token: text("token").notNull(),
    /** sha256 of token for safe lookups. */
    tokenHash: text("token_hash").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("presentation_display_token_uq").on(t.token), uniqueIndex("presentation_display_token_hash_uq").on(t.tokenHash)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    action: text("action").notNull(),
    participantId: uuid("participant_id").references(() => participant.id, { onDelete: "set null" }),
    adminSessionId: uuid("admin_session_id").references(() => adminSession.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_log_created_idx").on(t.createdAt), index("activity_log_action_idx").on(t.action)],
);

export const adminNotice = pgTable("admin_notice", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull().default("DISCARDED_DRAFTS"),
  count: integer("count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Types re-exported for convenience                                   */
/* ------------------------------------------------------------------ */

export type SubmissionType = (typeof submissionTypeEnum.enumValues)[number];
export type AiStatus = (typeof aiStatusEnum.enumValues)[number];
export type PresentationStatus = (typeof presentationStatusEnum.enumValues)[number];
export type ImageKind = (typeof imageTypeEnum.enumValues)[number];
export type ParticipantSource = (typeof participantSourceEnum.enumValues)[number];
export type PresentationMode = (typeof presentationModeEnum.enumValues)[number];
export type PresentationPlayback = (typeof presentationPlaybackEnum.enumValues)[number];
export type DraftStatus = (typeof draftStatusEnum.enumValues)[number];

export type ParticipantRow = typeof participant.$inferSelect;
export type NewParticipantRow = typeof participant.$inferInsert;
export type SubmissionRow = typeof submission.$inferSelect;
export type ImageAssetRow = typeof imageAsset.$inferSelect;
export type GroupRow = typeof group.$inferSelect;
export type AdminSessionRow = typeof adminSession.$inferSelect;
export type AdminDraftRow = typeof adminDraft.$inferSelect;
export type AdminDraftChangeRow = typeof adminDraftChange.$inferSelect;
export type PresentationStateRow = typeof presentationState.$inferSelect;
export type PresentationDisplayRow = typeof presentationDisplay.$inferSelect;
export type ActivityLogRow = typeof activityLog.$inferSelect;
