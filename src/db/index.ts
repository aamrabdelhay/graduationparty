import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __cuGradPool?: Pool;
  __cuDbReady?: Promise<void>;
};

/**
 * Non-destructive database bootstrap/migration.
 *
 * The app may be connected to a database created by an older revision of the
 * project. Never drop tables, types, or rows here. Instead, create missing
 * objects and add missing columns while preserving anything already present.
 */
const STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`,

  // Create missing enum types, then add required values to legacy enums.
  `DO $$ BEGIN
     CREATE TYPE grad_image_status AS ENUM ('PENDING','PROCESSING','READY','FAILED');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$;`,
  `DO $$ BEGIN ALTER TYPE grad_image_status ADD VALUE IF NOT EXISTS 'PENDING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TYPE grad_image_status ADD VALUE IF NOT EXISTS 'PROCESSING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TYPE grad_image_status ADD VALUE IF NOT EXISTS 'READY'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TYPE grad_image_status ADD VALUE IF NOT EXISTS 'FAILED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  `DO $$ BEGIN
     CREATE TYPE draft_status AS ENUM ('OPEN','SAVED','DISCARDED');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$;`,
  `DO $$ BEGIN ALTER TYPE draft_status ADD VALUE IF NOT EXISTS 'OPEN'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TYPE draft_status ADD VALUE IF NOT EXISTS 'SAVED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TYPE draft_status ADD VALUE IF NOT EXISTS 'DISCARDED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  `DO $$ BEGIN
     CREATE TYPE submission_type AS ENUM ('SOLO','GROUP');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$;`,
  `DO $$ BEGIN ALTER TYPE submission_type ADD VALUE IF NOT EXISTS 'SOLO'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TYPE submission_type ADD VALUE IF NOT EXISTS 'GROUP'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  `DO $$ BEGIN
     CREATE TYPE presentation_status AS ENUM ('IDLE','RUNNING','FINISHED');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$;`,
  `DO $$ BEGIN ALTER TYPE presentation_status ADD VALUE IF NOT EXISTS 'IDLE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TYPE presentation_status ADD VALUE IF NOT EXISTS 'RUNNING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN ALTER TYPE presentation_status ADD VALUE IF NOT EXISTS 'FINISHED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  `CREATE TABLE IF NOT EXISTS groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now()
  );`,
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();`,

  `CREATE TABLE IF NOT EXISTS participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
    full_name text NOT NULL,
    childhood_image_url text,
    adult_image_url text,
    graduation_image_url text,
    grad_image_status grad_image_status NOT NULL DEFAULT 'PENDING',
    ai_error text,
    submission_type submission_type NOT NULL DEFAULT 'SOLO',
    display_order integer NOT NULL DEFAULT 0,
    skipped boolean NOT NULL DEFAULT false,
    version integer NOT NULL DEFAULT 1,
    submitted_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE CASCADE;`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS full_name text;`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS childhood_image_url text;`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS adult_image_url text;`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS graduation_image_url text;`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS grad_image_status grad_image_status NOT NULL DEFAULT 'PENDING';`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS ai_error text;`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS submission_type submission_type NOT NULL DEFAULT 'SOLO';`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS skipped boolean NOT NULL DEFAULT false;`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now();`,
  `ALTER TABLE participants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();`,
  `CREATE INDEX IF NOT EXISTS participants_order_idx ON participants(display_order);`,

  `CREATE TABLE IF NOT EXISTS admin_sessions (
    id text PRIMARY KEY,
    ip text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
  );`,
  `ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS ip text;`,
  `ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;`,
  `ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();`,
  `ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();`,

  `CREATE TABLE IF NOT EXISTS login_attempts (
    id serial PRIMARY KEY,
    ip text NOT NULL,
    success boolean NOT NULL DEFAULT false,
    attempted_at timestamptz NOT NULL DEFAULT now()
  );`,
  `ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS ip text;`,
  `ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS success boolean NOT NULL DEFAULT false;`,
  `ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS attempted_at timestamptz NOT NULL DEFAULT now();`,
  `CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts(ip, attempted_at);`,

  `CREATE TABLE IF NOT EXISTS drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id text NOT NULL REFERENCES admin_sessions(id) ON DELETE CASCADE,
    participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    field text NOT NULL,
    previous_value text,
    new_value text,
    expected_version integer NOT NULL DEFAULT 1,
    status draft_status NOT NULL DEFAULT 'OPEN',
    acknowledged boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );`,
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS session_id text;`,
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS participant_id uuid;`,
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS field text;`,
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS previous_value text;`,
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS new_value text;`,
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS expected_version integer NOT NULL DEFAULT 1;`,
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS status draft_status NOT NULL DEFAULT 'OPEN';`,
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS acknowledged boolean NOT NULL DEFAULT false;`,
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();`,
  `ALTER TABLE drafts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();`,
  `CREATE INDEX IF NOT EXISTS drafts_session_idx ON drafts(session_id, status);`,
  `CREATE INDEX IF NOT EXISTS drafts_participant_idx ON drafts(participant_id, status);`,

  `CREATE TABLE IF NOT EXISTS presentation_state (
    id integer PRIMARY KEY,
    status presentation_status NOT NULL DEFAULT 'IDLE',
    current_participant_id uuid,
    next_participant_id uuid,
    queue_position integer NOT NULL DEFAULT 0,
    playback_mode text NOT NULL DEFAULT 'manual',
    is_paused boolean NOT NULL DEFAULT false,
    sequence_version integer NOT NULL DEFAULT 0,
    phase_started_at timestamptz,
    childhood_duration integer NOT NULL DEFAULT 2800,
    smoke_duration integer NOT NULL DEFAULT 2200,
    adult_duration integer NOT NULL DEFAULT 2600,
    name_animation_duration integer NOT NULL DEFAULT 1800,
    updated_at timestamptz NOT NULL DEFAULT now()
  );`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS status presentation_status NOT NULL DEFAULT 'IDLE';`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS current_participant_id uuid;`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS next_participant_id uuid;`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS queue_position integer NOT NULL DEFAULT 0;`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS playback_mode text NOT NULL DEFAULT 'manual';`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS sequence_version integer NOT NULL DEFAULT 0;`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS phase_started_at timestamptz;`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS childhood_duration integer NOT NULL DEFAULT 2800;`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS smoke_duration integer NOT NULL DEFAULT 2200;`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS adult_duration integer NOT NULL DEFAULT 2600;`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS name_animation_duration integer NOT NULL DEFAULT 1800;`,
  `ALTER TABLE presentation_state ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();`,

  `CREATE TABLE IF NOT EXISTS display_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL UNIQUE,
    label text,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );`,
  `ALTER TABLE display_tokens ADD COLUMN IF NOT EXISTS label text;`,
  `ALTER TABLE display_tokens ADD COLUMN IF NOT EXISTS revoked_at timestamptz;`,
  `ALTER TABLE display_tokens ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();`,

  `INSERT INTO presentation_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`,
];

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured — set it in your environment variables",
    );
  }
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    ssl:
      process.env.NODE_ENV === "production" && !databaseUrl.includes("127.0.0.1")
        ? { rejectUnauthorized: false }
        : undefined,
  });
}

export function getPool(): Pool {
  globalForDb.__cuGradPool = globalForDb.__cuGradPool ?? createPool();
  return globalForDb.__cuGradPool;
}

export async function ensureDbReady(): Promise<void> {
  if (globalForDb.__cuDbReady) return globalForDb.__cuDbReady;
  const p = getPool();
  globalForDb.__cuDbReady = (async () => {
    for (const sql of STATEMENTS) {
      try {
        await p.query(sql);
      } catch (e) {
        console.error("Auto-bootstrap statement warning:", e);
      }
    }
  })();
  return globalForDb.__cuDbReady;
}

function getDb(): NodePgDatabase {
  return drizzle(getPool());
}

export const db = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop as string | symbol];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});
