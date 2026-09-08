import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __cuGradPool?: Pool;
  __cuDbReady?: Promise<void>;
};

const BOOTSTRAP_SQL = `
DO $$ BEGIN CREATE TYPE grad_image_status AS ENUM ('PENDING','PROCESSING','READY','FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE draft_status AS ENUM ('OPEN','SAVED','DISCARDED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE submission_type AS ENUM ('SOLO','GROUP'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE presentation_status AS ENUM ('IDLE','RUNNING','FINISHED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
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
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id text PRIMARY KEY,
  ip text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id serial PRIMARY KEY,
  ip text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drafts (
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
);

CREATE TABLE IF NOT EXISTS presentation_state (
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
);

CREATE TABLE IF NOT EXISTS display_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  label text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO presentation_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
`;

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
    try {
      await p.query(BOOTSTRAP_SQL);
    } catch (e) {
      console.error("Auto-bootstrap warning:", e);
      globalForDb.__cuDbReady = undefined;
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
