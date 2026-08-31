/**
 * Live adapter count for the bernstein landing page.
 *
 * The URLs, the placeholder exclusions and the registry parser live in
 * `lib/adapter-count-core.mjs` so the build step
 * (`scripts/sync-adapter-count.mjs`) resolves the number exactly the way
 * this request-time path does. See that file for how the count is
 * derived from `registry.py` and `capability_profile.py`.
 *
 * Why fetch instead of bake at build time? The bernstein repo ships
 * adapters faster than the landing rebuilds, and ISR (1-hour cache)
 * keeps the request volume to upstream low while the number stays
 * fresh on the marketing surface. Surfaces that cannot fetch (static
 * files, markdown, MDX copy) read the build-baked figure in
 * `data/adapter-count.json` instead, which the build step writes from
 * the same core.
 *
 * Failure mode: every error path returns FALLBACK_COUNT - never throws
 * upward. The pill must always render.
 */

import {
  REGISTRY_URL,
  PROFILES_URL,
  FALLBACK_COUNT,
  countAdapters,
} from './adapter-count-core.mjs';

const REVALIDATE_SECONDS = 3600;
/* Hard upstream timeout. Mirrors the per-request AbortController pattern
   from `app/api/stats/route.ts` (4320057) - a slow raw.githubusercontent
   call must not pin the home-page render handler open until the edge
   times out. 2s is a tight ceiling appropriate for an SSR-blocking
   fetch; raw.githubusercontent normally responds in <300ms. On timeout
   we fall through to FALLBACK_COUNT, same as any other error path. */
const UPSTREAM_TIMEOUT_MS = 2000;

/** Fetch a raw source file from the bernstein repo, or null. */
async function fetchSource(url: string, signal: AbortSignal): Promise<string | null> {
  const r = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    headers: { 'User-Agent': 'bernstein-landing/1.0 (+https://bernstein.run)' },
    signal,
  });
  if (!r.ok) return null;
  return r.text();
}

/**
 * Fetch the live adapter count from the bernstein registry.
 *
 * Counts top-level keys in the `_ADAPTERS: dict[str, ...] = { ... }`
 * dict literal plus the FACTORY-built capability profiles merged into
 * the same dict, excluding the placeholder entries in NON_AGENT_KEYS.
 *
 * Returns FALLBACK_COUNT on any failure - never throws.
 */
export async function fetchAdapterCount(): Promise<number> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    /* Both files are read under the one timeout: they are two halves of
       a single number, and a partial read would publish an undercount
       that looks like a real figure. */
    const [text, profileSource] = await Promise.all([
      fetchSource(REGISTRY_URL, ac.signal),
      fetchSource(PROFILES_URL, ac.signal),
    ]);
    if (text === null || profileSource === null) return FALLBACK_COUNT;
    return countAdapters(text, profileSource) ?? FALLBACK_COUNT;
  } catch {
    /* Network error, DNS, or AbortController firing the 2s ceiling all
       land here. Returning FALLBACK_COUNT keeps the render unblocked. */
    return FALLBACK_COUNT;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Exported for test access. Callers should NOT depend on this; production
 * code should always use `fetchAdapterCount()` so a future tweak to the
 * fallback strategy stays in one place.
 */
export const _FALLBACK_COUNT_FOR_TESTS = FALLBACK_COUNT;
