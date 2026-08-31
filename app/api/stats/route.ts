import { NextResponse } from 'next/server';

/* This route deliberately does NOT use the lib/api/errors envelope. It
   is consumed by SSR components (Nav, Stats, RightRail) that read the
   payload at the top level - switching to { ok, data: { ... } } would
   break the homepage star count. The route has no error envelope path
   to migrate (no input validation, no 4xx) so the deepbh-06 envelope
   work has nothing to migrate here. Future write-paths under /api/stats
   should use the envelope. */

const PYPI_URL = 'https://pypistats.org/api/packages/bernstein/recent';
const GITHUB_URL = 'https://api.github.com/repos/sipyourdrink-ltd/bernstein';
const UA = 'bernstein-landing/1.0 (+https://bernstein.run)';
const REVALIDATE_SECONDS = 30 * 60; // 30 minutes - tighter during launch period
const FAILURE_RETRY_SECONDS = 60;   // retry sooner if upstream is broken
/* Hard upstream timeout. Without this, a slow pypi/github call can keep the
   route handler open until CF's 100s edge timeout fires → 504. We'd rather
   serve last-known-good (or a sentinel) than hang. Keep it short: both APIs
   normally respond in <500ms; 5s is already a generous ceiling. */
const UPSTREAM_TIMEOUT_MS = 5000;

interface CachedStats {
  monthly_downloads: number;
  stars: number;
  fetched_at: string;
}

interface FetchResult {
  monthly?: number;
  stars?: number;
}

let cache: CachedStats | null = null;
let cacheTime = 0;
/* When the last fetch was partial (one upstream returned data but the other
   didn't), we keep the merged response in `cache` so the route can still
   answer - but we MUST NOT honour the full REVALIDATE_SECONDS window for
   the in-memory short-circuit on line 86, otherwise a single bad cycle
   (e.g. GitHub IP rate-limit at 60/h unauth) pins a stale star count for
   30 minutes regardless of the short HTTP s-maxage we emit. We track the
   partial flag so the early-return path uses FAILURE_RETRY_SECONDS instead,
   matching the cache-control we already advertise. */
let cachePartial = false;

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
     for the full revalidate window - which means the in-memory cache
     gets refreshed on schedule but with the same stale body. When we're
     in a recovery cycle (`bypassDataCache`) we force a real network hit
     so the upstream value can move forward. */
  const fetchInit = bypassDataCache
    ? ({ cache: 'no-store' } as const)
    : ({ next: { revalidate: REVALIDATE_SECONDS } } as const);

  /* Per-request AbortController so a stuck upstream can't pin the route
     handler open. One controller per fetch - sharing one would cancel both
     when either timer fires. We clear the timer in `finally` so a fast
     response doesn't leak a pending Timeout into the event loop. */
  const fetchWithTimeout = async (url: string, init: RequestInit) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: ac.signal });
    } finally {
      clearTimeout(t);
    }
  };

  const [pypiRes, ghRes] = await Promise.allSettled([
    fetchWithTimeout(PYPI_URL, {
      ...fetchInit,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    }),
    fetchWithTimeout(GITHUB_URL, {
      ...fetchInit,
      headers: ghHeaders,
    }),
  ]);

  const out: FetchResult = {};

  if (pypiRes.status === 'fulfilled' && pypiRes.value.ok) {
    try {
      const data = await pypiRes.value.json();
      if (typeof data?.data?.last_month === 'number') out.monthly = data.data.last_month;
    } catch (e) {
      console.error('[stats] pypi parse failed:', e);
    }
  } else {
    const why = pypiRes.status === 'rejected'
      ? pypiRes.reason
      : `HTTP ${pypiRes.value.status}`;
    console.error('[stats] pypi fetch failed:', why);
  }

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
     short-circuit so a fresh GitHub/pypi cycle runs immediately. Cache-
     Control headers downstream still apply; this only nudges the process
     cache. Cheap because we already gate on the same rate-limited APIs. */
  const force = (() => {
    try {
      return new URL(req.url).searchParams.get('force') !== null;
    } catch {
      return false;
    }
  })();
  const effectiveTtlMs =
    (cachePartial ? FAILURE_RETRY_SECONDS : REVALIDATE_SECONDS) * 1000;
  if (!force && cache && now - cacheTime < effectiveTtlMs) {
    const ttlSec = cachePartial ? FAILURE_RETRY_SECONDS : REVALIDATE_SECONDS;
    return NextResponse.json(cache, {
      headers: {
        'Cache-Control': `public, s-maxage=${ttlSec}, stale-while-revalidate=${
          cachePartial ? 300 : 3600
        }`,
      },
    });
  }

  /* Bypass the Next.js fetch-data-cache when the operator forced a refresh
     OR when the previous cycle was partial - in both cases the cached
     fetch body is suspect and we want a live read. Normal cycles use
     `next.revalidate` so we still get dedupe + edge-cache friendliness. */
  const fresh = await fetchFresh(force || cachePartial);

  // Merge fresh data over last-known-good. If we got at least one number fresh,
  // cache the merged result; otherwise back off with a short retry window.
  // We use a SHORT cache TTL when either upstream is missing so partial
  // freshness (e.g. pypi ok, gh rate-limited) doesn't pin a zero/stale
  // value for the full 30-minute revalidate window.
  if (fresh.monthly !== undefined || fresh.stars !== undefined) {
    const merged: CachedStats = {
      monthly_downloads: fresh.monthly ?? cache?.monthly_downloads ?? 0,
      /* Prefer fresh > positive cached > 0. The `> 0` guard prevents a
         zero from a prior partial fetch from cementing in cache.stars
         and blocking the next live value. Symptom we're fixing:
         /api/stats returning stars=0 after gh rate-limit on cold boot. */
      stars:
        fresh.stars && fresh.stars > 0
          ? fresh.stars
          : cache?.stars && cache.stars > 0
            ? cache.stars
            : 0,
      fetched_at: new Date().toISOString(),
    };
    const partial = fresh.monthly === undefined || fresh.stars === undefined;
    cache = merged;
    cacheTime = now;
    cachePartial = partial;
    const ttl = partial ? FAILURE_RETRY_SECONDS : REVALIDATE_SECONDS;
    return NextResponse.json(merged, {
      headers: { 'Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate=${partial ? 300 : 3600}` },
    });
  }

  // Both upstreams failed (or timed out). Serve last-known cache if we have
  // it, otherwise a sentinel the client can detect. We return 200 in both
  // cases so CF doesn't propagate a 5xx for what is effectively a planned
  // graceful degradation - the client checks `fallback`/zero values.
  console.warn('[stats] upstream fetch failed or timed out; serving fallback');
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
      monthly_downloads: 0,
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
