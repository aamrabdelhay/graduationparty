import { NextRequest } from "next/server";
import { getPool } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`,
  `DO $$ BEGIN CREATE TYPE grad_image_status AS ENUM ('PENDING','PROCESSING','READY','FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE draft_status AS ENUM ('OPEN','SAVED','DISCARDED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE submission_type AS ENUM ('SOLO','GROUP'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE presentation_status AS ENUM ('IDLE','RUNNING','FINISHED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `CREATE TABLE IF NOT EXISTS groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now()
  );`,
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
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    id text PRIMARY KEY,
    ip text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
  );`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id serial PRIMARY KEY,
    ip text NOT NULL,
    success boolean NOT NULL DEFAULT false,
    attempted_at timestamptz NOT NULL DEFAULT now()
  );`,
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
  `CREATE TABLE IF NOT EXISTS display_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL UNIQUE,
    label text,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );`,
  `INSERT INTO presentation_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`,
];

export async function GET(_req: NextRequest) {
  const results: { statement: number; ok: boolean; error?: string }[] = [];
  try {
    const pool = getPool();
    for (let i = 0; i < STATEMENTS.length; i++) {
      const sql = STATEMENTS[i];
      try {
        await pool.query(sql);
        results.push({ statement: i, ok: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ statement: i, ok: false, error: msg });
      }
    }
    const allOk = results.every((r) => r.ok);
    return Response.json({ ok: allOk, results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, fatal: msg, results });
  }
}
