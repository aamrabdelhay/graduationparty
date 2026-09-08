import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __cuGradPool?: Pool;
};

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    // Thrown lazily at first query — never at import time — so the
    // production build succeeds before env vars are configured.
    throw new Error(
      "DATABASE_URL is not configured — set it in your environment variables",
    );
  }
  return new Pool({ connectionString: databaseUrl });
}

function getPool(): Pool {
  globalForDb.__cuGradPool = globalForDb.__cuGradPool ?? createPool();
  return globalForDb.__cuGradPool;
}

function getDb(): NodePgDatabase {
  return drizzle(getPool());
}

/**
 * Lazily-initialized Drizzle client. Importing this module is side-effect
 * free; the pool is created on the first actual database call.
 */
export const db = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop as string | symbol];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});
