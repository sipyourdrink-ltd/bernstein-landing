/**
 * IndexNow client helper.
 *
 * IndexNow (https://www.indexnow.org/documentation) is a URL-submission
 * protocol: a single POST notifies every participating engine through a
 * federated relay (Bing/Copilot, Yandex, Naver, Seznam, Yep). Google
 * does not participate. The participant list this site allows by name
 * lives in `lib/seo/ai-bots.ts`.
 *
 * Protocol mechanics implemented here:
 *
 *   1. Ownership proof. The submitting host must serve the key as plain
 *      text at `https://<host>/<key>.txt` (the `keyLocation`). The engine
 *      fetches that file and confirms its body equals the `key` field in
 *      the POST before accepting the submission. bernstein.run serves the
 *      file as a static asset from `public/<key>.txt`; INDEXNOW_KEY below
 *      is the canonical hex key and MUST match that file's name + content.
 *   2. Submission. POST JSON `{ host, key, keyLocation, urlList }` to the
 *      relay. Every URL in `urlList` must be on `host` (same-origin rule)
 *      or the engine rejects the whole batch with 422.
 *   3. Accepted responses are 200 or 202. Anything else is logged and
 *      swallowed - a failed submission must never throw into a caller
 *      (build step, publish route) because indexing is best-effort.
 *
 * The key is a public verification token, not a secret: anyone can read
 * it at the keyLocation URL. It is hardcoded rather than env-injected so
 * the value is identical across the build script, the route handler, and
 * the static file with no configuration drift.
 *
 * This module is deliberately free of React / next imports so it can be
 * unit-tested under `node --test --experimental-strip-types`.
 */

export const INDEXNOW_HOST = 'bernstein.run';

/**
 * Canonical IndexNow key. 32 lowercase hex chars (the spec allows
 * 8-128 hex chars). MUST equal the name and contents of the static file
 * served at `public/<key>.txt`, i.e.
 * `public/8ea034eabcf341b28ce27fc1ca510018.txt`. If you rotate the key,
 * rename that file, replace its body with the new key, and update this
 * constant in the same change.
 */
export const INDEXNOW_KEY = '8ea034eabcf341b28ce27fc1ca510018';

/** Where the engine fetches the ownership-proof file. */
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;

/**
 * The relay forwards to all participating engines, so one POST is
 * normally enough. Bing's own endpoint is kept as a backup channel;
 * both honour the identical payload shape.
 */
export const INDEXNOW_ENDPOINTS: readonly string[] = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
] as const;

/**
 * Extract `<loc>` URLs from a sitemap XML string. The publish trigger
 * reuses the rendered `/sitemap.xml` as the single source of truth for
 * the URL set (so blog posts and `/q/<slug>` answer pages are included
 * automatically without re-deriving the list here). Pure: no IO.
 */
export function extractSitemapLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

/** A single endpoint POST result. */
export interface IndexNowSubmitResult {
  endpoint: string;
  /** HTTP status, or 0 when the request never completed (network error). */
  status: number;
  /** True for 200/202; the engine accepted the batch. */
  ok: boolean;
  /** Populated only on a thrown/network failure. */
  error?: string;
}

export interface SubmitUrlsOptions {
  /** Override the endpoint list (used by tests). Defaults to the relay + Bing. */
  endpoints?: readonly string[];
  /** Override the fetch implementation (used by tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Build the IndexNow POST body for a batch of URLs. Pure: no IO. Kept
 * separate so the route handler and the build script can assert the
 * exact wire shape without a network round-trip.
 */
export function buildIndexNowPayload(urls: string[]): {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
} {
  return {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList: urls,
  };
}

/**
 * Submit a list of new or changed URLs to IndexNow.
 *
 * Every URL must live on `INDEXNOW_HOST` (same-origin rule); off-host
 * URLs are dropped before the POST so one stray entry cannot get the
 * whole batch rejected. An empty list (after filtering) is a no-op.
 *
 * Never throws: non-200 responses and network errors are logged and
 * returned as result entries with `ok: false`. Callers (the publish
 * route, the build step) can fire-and-forget.
 */
export async function submitUrls(
  urls: string[],
  options: SubmitUrlsOptions = {},
): Promise<IndexNowSubmitResult[]> {
  const endpoints = options.endpoints ?? INDEXNOW_ENDPOINTS;
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  /* Same-origin rule: IndexNow rejects (422) a batch that contains any
     URL not on `host`. Filter defensively rather than trusting callers. */
  const onHost = urls.filter((u) => {
    try {
      return new URL(u).host === INDEXNOW_HOST;
    } catch {
      return false;
    }
  });

  if (onHost.length === 0) {
    return [];
  }

  const body = JSON.stringify(buildIndexNowPayload(onHost));
  const results: IndexNowSubmitResult[] = [];

  for (const endpoint of endpoints) {
    try {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body,
      });
      const ok = res.status === 200 || res.status === 202;
      if (!ok) {
        // eslint-disable-next-line no-console
        console.warn(
          `[indexnow] ${endpoint} returned ${res.status} ${res.statusText} for ${onHost.length} url(s)`,
        );
      }
      results.push({ endpoint, status: res.status, ok });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(`[indexnow] ${endpoint} request failed: ${message}`);
      results.push({ endpoint, status: 0, ok: false, error: message });
    }
  }

  return results;
}
