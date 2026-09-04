/**
 * Dedicated PostgreSQL LISTEN connection so SSE clients on this instance
 * receive events that were published by *other* instances.
 */
import pg from "pg";
import { getDatabaseUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ingestRemoteEvent } from "./bus";

let client: pg.Client | null = null;
let starting: Promise<void> | null = null;
let retryTimer: NodeJS.Timeout | null = null;

export async function ensureRealtimeListener(): Promise<void> {
  if (client) return;
  if (starting) return starting;
  starting = (async () => {
    const c = new pg.Client({ connectionString: getDatabaseUrl() });
    c.on("notification", (msg) => {
      if (msg.channel === "gp_presentation" && msg.payload) {
        ingestRemoteEvent(msg.payload);
      }
    });
    c.on("error", (err) => {
      logger.warn("realtime listener error", { error: err.message });
      client = null;
      scheduleRetry();
    });
    c.on("end", () => {
      client = null;
      scheduleRetry();
    });
    try {
      await c.connect();
      await c.query("listen gp_presentation");
      client = c;
      logger.info("realtime listener ready");
    } catch (err) {
      logger.warn("realtime listener connect failed", { error: (err as Error).message });
      await c.end().catch(() => undefined);
      scheduleRetry();
    }
  })();
  try {
    await starting;
  } finally {
    starting = null;
  }
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    ensureRealtimeListener().catch(() => undefined);
  }, 5_000);
}
