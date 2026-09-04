/**
 * Real-time event bus.
 *
 * Two transport layers:
 *  1. In-process fan-out to the current Next server instance.
 *  2. PostgreSQL LISTEN/NOTIFY so events reach SSE clients connected to other
 *     serverless instances (Vercel compatible — no long-running socket server).
 *
 * Every event carries the PresentationState.sequenceVersion; clients simply
 * refetch the authoritative snapshot when the version changes.
 */
import { randomBytes } from "node:crypto";
import { getPool } from "@/db";
import { logger } from "@/lib/logger";

const nodeId = randomBytes(4).toString("hex");

export interface PresentationEvent {
  type: "presentation";
  version: number;
  action: string;
  at: number;
  node: string;
}

type Listener = (event: PresentationEvent) => void;

const listeners = new Set<Listener>();

export function subscribePresentation(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitLocal(event: PresentationEvent) {
  for (const fn of [...listeners]) {
    try {
      fn(event);
    } catch (err) {
      logger.warn("realtime listener error", { error: (err as Error).message });
    }
  }
}

/** Publish after a committed state change. Never throws. */
export function publishPresentationChange(event: { version: number; action: string }): void {
  const payload: PresentationEvent = {
    type: "presentation",
    version: event.version,
    action: event.action,
    at: Date.now(),
    node: nodeId,
  };
  emitLocal(payload);
  getPool()
    .query("select pg_notify('gp_presentation', $1)", [JSON.stringify(payload)])
    .catch((err) => logger.warn("pg notify failed", { error: (err as Error).message }));
}

/** Feed an event received from another instance into the local bus. */
export function ingestRemoteEvent(raw: string): void {
  try {
    const parsed = JSON.parse(raw) as PresentationEvent;
    if (parsed.node === nodeId) return;
    emitLocal(parsed);
  } catch {
    /* ignore malformed */
  }
}
