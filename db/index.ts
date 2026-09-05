import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { getDatabaseUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Single shared connection pool. On serverless (Vercel) each function instance
 * creates one pool; the pool is kept small and released when the instance is
 * recycled. `pg` is the node-postgres driver (pure JS, serverless friendly).
 */

const globalForDb = globalThis as unknown as {
  __gpPool?: Pool;
  __gpDrizzle?: ReturnType<typeof createDrizzle>;
};

function runtimeDatabaseUrl(): string {
  const raw = process.env.DIRECT_URL || getDatabaseUrl();
  try {
    const url = new URL(raw);
    // Neon rejects startup `options` values such as statement_timeout on
    // pooled connections. Prefer DIRECT_URL and strip that unsupported option
    // if the host still supplies a pooled DATABASE_URL.
    url.searchParams.delete("options");
    return url.toString();
  } catch {
    return raw;
  }
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: runtimeDatabaseUrl(),
    max: Number(process.env.PG_POOL_SIZE ?? "5"),
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err) => {
    logger.error("pg pool error", { error: err.message });
  });
  return pool;
}

function createDrizzle() {
  const pool = globalForDb.__gpPool ?? createPool();
  globalForDb.__gpPool = pool;
  return drizzle(pool, { schema });
}

export function getDb() {
  const db = globalForDb.__gpDrizzle ?? createDrizzle();
  globalForDb.__gpDrizzle = db;
  return db;
}

/** Access to the raw pool (used by the realtime LISTEN subscriber). */
export function getPool(): Pool {
  const pool = globalForDb.__gpPool ?? createPool();
  globalForDb.__gpPool = pool;
  return pool;
}

export type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
