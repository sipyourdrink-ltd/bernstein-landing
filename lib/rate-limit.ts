/**
 * In-process per-IP rate limiter for the assistant API routes.
 *
 * Why a hand-rolled limiter rather than express-rate-limit / Redis:
 *
 *   1. The Next.js app is a single Node process per container; an
 *      in-memory Map covers all requests landing on this proxy. We
 *      run one container behind Caddy, so per-process state is also
 *      per-host state.
 *   2. The bots are docs-RAG: a real human runs <30 queries / hour.
 *      The cap is friction-free for that, painful for a script.
 *   3. Zero new dependencies. The /api/ask + /api/rag handlers stay
 *      inside the same module graph, no external store, no startup
 *      health-check.
 *
 * Policy:
 *   - Sliding window: keep up to N timestamps per IP, drop entries
 *     older than the window.
 *   - When the request arrives and the kept-list size ≥ N, the
 *     limiter returns `{ allowed: false, retryAfterSec }`.
 *   - The IP is taken from `cf-connecting-ip` first (Cloudflare stamps
 *     it on every edge hit), then `x-forwarded-for` head, then the
 *     socket peer. Without an IP we fall through to "allowed" - never
 *     deny when we can't identify the caller.
 *
 * Memory:
 *   - Bounded: stored entries decay with the window; idle IPs garbage-
 *     collect on the next call from the same IP. We do NOT run a
 *     periodic janitor - at the docs-bot's traffic levels this would
 *     burn more cycles than it saves.
 *   - The Map is intentionally ungrown beyond active IPs in the last
 *     window. Even a worst-case 100 unique IPs per minute = 6000
 *     entries with up to N timestamps each ≈ trivial memory. If this
 *     ever becomes a hotspot we can swap it for a fixed-cap LRU.
 */

interface BucketEntry {
  /** Sorted ASC list of recent request timestamps in ms. */
  timestamps: number[];
}

export interface RateLimitDecision {
  allowed: boolean;
  /** When `allowed=false`, hint to the caller for the Retry-After header. */
  retryAfterSec?: number;
  /** Diagnostic: hits in the current window after this call. */
  count: number;
  /** Diagnostic: cap that was applied. */
  limit: number;
}

export interface RateLimiterOptions {
  /** Max requests allowed per IP per window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

/**
 * Build a stateful sliding-window rate limiter. Returns a `check` fn
 * the routes call once per request. The closure-scoped Map is the
 * per-process store - module-level singletons (one per route) keep
 * the buckets isolated so /api/ask traffic can't share counters with
 * unrelated future routes.
 */
export function makeRateLimiter(opts: RateLimiterOptions) {
  const buckets = new Map<string, BucketEntry>();
  const { limit, windowMs } = opts;

  return {
    /** Decide whether to allow this request. Mutates the bucket on allow. */
    check(ip: string | null | undefined): RateLimitDecision {
      if (!ip) return { allowed: true, count: 0, limit };

      const now = Date.now();
      const cutoff = now - windowMs;
      const bucket = buckets.get(ip) ?? { timestamps: [] };

      /* Drop everything older than the window. The list is sorted ASC
         so we slice off the head; O(k) where k = number of expired
         entries. Under steady-state traffic k stays small. */
      let firstFresh = 0;
      while (firstFresh < bucket.timestamps.length && bucket.timestamps[firstFresh] < cutoff) {
        firstFresh += 1;
      }
      if (firstFresh > 0) {
        bucket.timestamps = bucket.timestamps.slice(firstFresh);
      }

      if (bucket.timestamps.length >= limit) {
        /* Calculate retry-after from the OLDEST timestamp still in the
           window - that's when the bucket will free a slot. */
        const oldest = bucket.timestamps[0]!;
        const retryAfterMs = Math.max(0, oldest + windowMs - now);
        const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
        /* Don't write the request to the bucket - denied requests do
           NOT count against the cap, otherwise a script could keep the
           bucket pinned at "full" forever. */
        return {
          allowed: false,
          retryAfterSec,
          count: bucket.timestamps.length,
          limit,
        };
      }

      bucket.timestamps.push(now);
      buckets.set(ip, bucket);
      return { allowed: true, count: bucket.timestamps.length, limit };
    },

    /** Test-only helper: drop all state. Never call in production. */
    _reset(): void {
      buckets.clear();
    },
  };
}

/* Default limiter for the assistants. 30 turns / hour matches the
   "real human" budget the operator described. The window is rolling,
   not bucketed-by-clock-hour, so nobody gets a free 60-request burst
   right at the top of the hour.

   Override via env: ASSISTANT_RATE_LIMIT, ASSISTANT_RATE_WINDOW_MS.
   Reading at module-init time keeps the hot-path branch-free. */
const limit = Number.parseInt(process.env.ASSISTANT_RATE_LIMIT ?? '30', 10);
const windowMs = Number.parseInt(process.env.ASSISTANT_RATE_WINDOW_MS ?? '3600000', 10);

export const assistantRateLimiter = makeRateLimiter({
  limit: Number.isFinite(limit) && limit > 0 ? limit : 30,
  windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 3_600_000,
});
