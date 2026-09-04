/**
 * Lightweight in-memory sliding-window limiter for public endpoints
 * (image uploads / AI generation). Login brute-force protection uses the
 * durable DB-backed limiter in lib/auth/rate-limit.ts.
 */

interface Bucket {
  hits: number[];
}

export interface MemoryLimiter {
  check(key: string): { allowed: boolean; remaining: number; retryAfterSeconds: number };
}

export function createSlidingWindowLimiter(windowMs: number, maxHits: number): MemoryLimiter {
  const buckets = new Map<string, Bucket>();
  // Opportunistic cleanup
  const interval = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, b] of buckets) {
      b.hits = b.hits.filter((t) => t > cutoff);
      if (b.hits.length === 0) buckets.delete(key);
    }
  }, Math.max(windowMs, 60_000));
  interval.unref?.();

  return {
    check(key: string) {
      const now = Date.now();
      const cutoff = now - windowMs;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { hits: [] };
        buckets.set(key, bucket);
      }
      bucket.hits = bucket.hits.filter((t) => t > cutoff);
      if (bucket.hits.length >= maxHits) {
        const oldest = bucket.hits[0] ?? now;
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
      }
      bucket.hits.push(now);
      return { allowed: true, remaining: maxHits - bucket.hits.length, retryAfterSeconds: 0 };
    },
  };
}
