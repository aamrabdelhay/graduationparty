import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  serial,
  index,
} from "drizzle-orm/pg-core";

export const gradImageStatusEnum = pgEnum("grad_image_status", [
  "PENDING",
  "PROCESSING",
  "READY",
  "FAILED",
]);

export const draftStatusEnum = pgEnum("draft_status", [
  "OPEN",
  "SAVED",
  "DISCARDED",
]);

export const submissionTypeEnum = pgEnum("submission_type", ["SOLO", "GROUP"]);

export const presentationStatusEnum = pgEnum("presentation_status", [
  "IDLE",
  "RUNNING",
  "FINISHED",
]);

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    fullName: text("full_name").notNull(),
    childhoodImageUrl: text("childhood_image_url"),
    adultImageUrl: text("adult_image_url"),
    graduationImageUrl: text("graduation_image_url"),
    gradImageStatus: gradImageStatusEnum("grad_image_status")
      .notNull()
      .default("PENDING"),
    aiError: text("ai_error"),
    submissionType: submissionTypeEnum("submission_type")
      .notNull()
      .default("SOLO"),
    displayOrder: integer("display_order").notNull().default(0),
    skipped: boolean("skipped").notNull().default(false),
    version: integer("version").notNull().default(1),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("participants_order_idx").on(t.displayOrder)],
);

export const adminSessions = pgTable("admin_sessions", {
  id: text("id").primaryKey(),
  ip: text("ip"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    ip: text("ip").notNull(),
    success: boolean("success").notNull().default(false),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("login_attempts_ip_idx").on(t.ip, t.attemptedAt)],
);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id")
      .notNull()
      .references(() => adminSessions.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    previousValue: text("previous_value"),
    newValue: text("new_value"),
    expectedVersion: integer("expected_version").notNull().default(1),
    status: draftStatusEnum("status").notNull().default("OPEN"),
    acknowledged: boolean("acknowledged").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("drafts_session_idx").on(t.sessionId, t.status),
    index("drafts_participant_idx").on(t.participantId, t.status),
  ],
);

export const presentationState = pgTable("presentation_state", {
  id: integer("id").primaryKey(),
  status: presentationStatusEnum("status").notNull().default("IDLE"),
  currentParticipantId: uuid("current_participant_id").references(
    () => participants.id,
    { onDelete: "set null" },
  ),
  nextParticipantId: uuid("next_participant_id").references(
    () => participants.id,
    { onDelete: "set null" },
  ),
  queuePosition: integer("queue_position").notNull().default(0),
  playbackMode: text("playback_mode").notNull().default("manual"),
  isPaused: boolean("is_paused").notNull().default(false),
  sequenceVersion: integer("sequence_version").notNull().default(0),
  phaseStartedAt: timestamp("phase_started_at", { withTimezone: true }),
  childhoodDuration: integer("childhood_duration").notNull().default(2800),
  smokeDuration: integer("smoke_duration").notNull().default(2200),
  adultDuration: integer("adult_duration").notNull().default(2600),
  nameAnimationDuration: integer("name_animation_duration")
    .notNull()
    .default(1800),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const displayTokens = pgTable("display_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  label: text("label"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Participant = typeof participants.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type PresentationState = typeof presentationState.$inferSelect;
export type Group = typeof groups.$inferSelect;
