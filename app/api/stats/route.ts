import { NextResponse } from 'next/server';

/* This route deliberately does NOT use the lib/api/errors envelope. It
   is consumed by SSR components (Nav, Stats, RightRail) that read the
   payload at the top level - switching to { ok, data: { ... } } would
   break the homepage star count. The route has no error envelope path
   to migrate (no input validation, no 4xx) so the deepbh-06 envelope
   work has nothing to migrate here. Future write-paths under /api/stats
   should use the envelope. */

const GITHUB_URL = 'https://api.github.com/repos/sipyourdrink-ltd/bernstein';
const UA = 'bernstein-landing/1.0 (+https://bernstein.run)';
const REVALIDATE_SECONDS = 30 * 60; // 30 minutes - tighter during launch period
const FAILURE_RETRY_SECONDS = 60;   // retry sooner if upstream is broken
/* Hard upstream timeout. Without this, a slow GitHub call can keep the
   route handler open until CF's 100s edge timeout fires → 504. We'd rather
   serve last-known-good (or a sentinel) than hang. The API normally
   responds in <500ms; 5s is already a generous ceiling. */
const UPSTREAM_TIMEOUT_MS = 5000;

interface CachedStats {
  stars: number;
  fetched_at: string;
}

interface FetchResult {
  stars?: number;
}

let cache: CachedStats | null = null;
let cacheTime = 0;
/* Set after a failed cycle. The Next.js fetch-data-cache may hold the bad
   upstream body (e.g. a 200 with zero stars) for the full revalidate
   window, so the next cycle must bypass it to recover. */
let lastFailed = false;

async function fetchFresh(bypassDataCache: boolean): Promise<FetchResult> {
  /* Authorise the GitHub call when GITHUB_TOKEN (or GH_TOKEN) is set.
     Unauthenticated lifts the rate limit from 60/h-per-IP to 5000/h -
     under multi-instance Next workers and proxy fan-out the unauth ceiling
     is too easy to blow, which manifests as `stars: 0` zero-cementing. */
  const ghToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const ghHeaders: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/vnd.github.v3+json',
  };
  if (ghToken) ghHeaders.Authorization = `Bearer ${ghToken}`;

  /* The Next.js fetch-data-cache lives between our in-memory `cache` and
     the network. Without bypass, a cached fetch body keeps coming back
     for the full revalidate window. When the operator forces a refresh
     (`bypassDataCache`) we force a real network hit so the upstream value
     can move forward. */
  const fetchInit = bypassDataCache
    ? ({ cache: 'no-store' } as const)
    : ({ next: { revalidate: REVALIDATE_SECONDS } } as const);

  /* Per-request AbortController so a stuck upstream can't pin the route
     handler open. We clear the timer in `finally` so a fast response
     doesn't leak a pending Timeout into the event loop. */
  const fetchWithTimeout = async (url: string, init: RequestInit) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: ac.signal });
    } finally {
      clearTimeout(t);
    }
  };

  const [ghRes] = await Promise.allSettled([
    fetchWithTimeout(GITHUB_URL, {
      ...fetchInit,
      headers: ghHeaders,
    }),
  ]);

  const out: FetchResult = {};

  if (ghRes.status === 'fulfilled' && ghRes.value.ok) {
    try {
      const data = await ghRes.value.json();
      /* Reject 0/non-positive - a public repo with 0 stars on a launched
         site is a bug shape, not a real value. Treat it as no-data so
         we don't poison the cache. */
      if (typeof data?.stargazers_count === 'number' && data.stargazers_count > 0) {
        out.stars = data.stargazers_count;
      }
    } catch (e) {
      console.error('[stats] github parse failed:', e);
    }
  } else {
    const why = ghRes.status === 'rejected'
      ? ghRes.reason
      : `HTTP ${ghRes.value.status}`;
    console.error('[stats] github fetch failed:', why);
  }

  return out;
}

export async function GET(req: Request) {
  const now = Date.now();
  /* Operator escape hatch: `/api/stats?force=1` bypasses the in-memory
     short-circuit so a fresh GitHub cycle runs immediately. Cache-Control
     headers downstream still apply; this only nudges the process cache. */
  const force = (() => {
    try {
      return new URL(req.url).searchParams.get('force') !== null;
    } catch {
      return false;
    }
  })();
  if (!force && cache && now - cacheTime < REVALIDATE_SECONDS * 1000) {
    return NextResponse.json(cache, {
      headers: {
        'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=3600`,
      },
    });
  }

  const fresh = await fetchFresh(force || lastFailed);

  // Cache a fresh positive star count for the full revalidation window.
  if (fresh.stars !== undefined) {
    const merged: CachedStats = {
      stars: fresh.stars,
      fetched_at: new Date().toISOString(),
    };
    cache = merged;
    cacheTime = now;
    lastFailed = false;
    return NextResponse.json(merged, {
      headers: { 'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=3600` },
    });
  }

  // The upstream failed (or timed out). Serve last-known cache if we have
  // it, otherwise a sentinel the client can detect. We return 200 in both
  // cases so CF doesn't propagate a 5xx for what is effectively a planned
  // graceful degradation - the client checks `fallback`/zero values.
  console.warn('[stats] upstream fetch failed or timed out; serving fallback');
  lastFailed = true;
  if (cache) {
    return NextResponse.json(cache, {
      headers: {
        'Cache-Control': `public, s-maxage=${FAILURE_RETRY_SECONDS}, stale-while-revalidate=300`,
        'X-Cache-Source': 'stale-fallback',
      },
    });
  }

  return NextResponse.json(
    {
      stars: 0,
      fetched_at: new Date(0).toISOString(),
      fallback: true,
    },
    {
      headers: {
        'Cache-Control': `public, s-maxage=${FAILURE_RETRY_SECONDS}, stale-while-revalidate=300`,
        'X-Cache-Source': 'stale-fallback',
      },
    },
  );
}
