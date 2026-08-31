/**
 * POST /api/indexnow - internal-only on-demand IndexNow submission.
 *
 * Triggers an IndexNow submission of the current sitemap URL set
 * (blog posts + /q/ answer pages + every other indexable surface). Call
 * it after publishing new or changed content so participating engines
 * (Bing/Copilot, Yandex, Naver, Seznam, Yep) are notified immediately
 * rather than on their next scheduled crawl.
 *
 * Source of truth for the URL set: the rendered `/sitemap.xml`. We fetch
 * it same-origin and extract `<loc>` entries rather than re-deriving the
 * list, so the route never drifts from the sitemap (which already
 * excludes noindex surfaces and includes every blog/q leaf).
 *
 * Auth: bearer-gated like the other internal routes. The token is
 * `INDEXNOW_TRIGGER_TOKEN`; without it the route refuses in production
 * (503 NOT_CONFIGURED) so it cannot be left wide open by accident. A
 * caller (deploy step, cron) sends `Authorization: Bearer <token>`.
 *
 * Note: the `<key>.txt` ownership-proof file is served statically from
 * `public/` (see `lib/seo/indexnow.ts`); this route does not serve it.
 *
 * Status codes:
 *   200 - submission attempted; body reports per-endpoint results
 *   401 - missing/incorrect bearer token
 *   502 - could not read the sitemap to build the URL set
 *   503 - INDEXNOW_TRIGGER_TOKEN unset in production (route disabled)
 *
 * The submission itself never throws (see `submitUrls`); a downstream
 * engine being unreachable is reported as `ok: false`, not a 5xx.
 */
import { errorResponse, successResponse } from '../../../lib/api/errors.ts';
import { extractSitemapLocs, indexNowKey, submitUrls } from '../../../lib/seo/indexnow.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_ORIGIN =
  process.env.BERNSTEIN_PUBLIC_ORIGIN ?? 'https://bernstein.run';

/** Read `Authorization: Bearer <token>` and compare to the configured token. */
function isAuthorized(request: Request): boolean {
  const expected = (process.env.INDEXNOW_TRIGGER_TOKEN ?? '').trim();
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return match[1].trim() === expected;
}

async function fetchSitemapUrls(): Promise<string[]> {
  const res = await fetch(`${SITE_ORIGIN}/sitemap.xml`, {
    headers: { 'User-Agent': 'bernstein-landing-indexnow/1.0' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`sitemap fetch returned ${res.status}`);
  }
  return extractSitemapLocs(await res.text());
}

export async function POST(request: Request): Promise<Response> {
  const expected = (process.env.INDEXNOW_TRIGGER_TOKEN ?? '').trim();
  const isProd = process.env.NODE_ENV === 'production';

  /* In production, refuse unless a token is configured: an unset token
     would otherwise leave the trigger open to anyone. In dev we allow
     the call through so it can be exercised locally. */
  if (!expected) {
    if (isProd) {
      return errorResponse(
        'NOT_CONFIGURED',
        'INDEXNOW_TRIGGER_TOKEN unset',
        503,
      );
    }
  } else if (!isAuthorized(request)) {
    return errorResponse('UNAUTHORIZED', 'invalid or missing bearer token', 401);
  }

  /* The ownership key is what makes a submission mean anything: the
     engine fetches /<key>.txt to confirm the caller speaks for this
     host. Without one there is nothing to submit under, so say so
     rather than reporting a batch that went nowhere. */
  if (indexNowKey() === '') {
    return errorResponse('NOT_CONFIGURED', 'INDEXNOW_KEY unset', 503);
  }

  let urls: string[];
  try {
    urls = await fetchSitemapUrls();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[indexnow] could not read sitemap:', message);
    return errorResponse('UPSTREAM_FAILED', 'could not read sitemap', 502);
  }

  const results = await submitUrls(urls);
  return successResponse({
    submitted: urls.length,
    results,
  });
}

/** Defensive 405 for non-POST, matching the other internal routes. */
export async function GET(): Promise<Response> {
  return new Response('use POST', { status: 405, headers: { Allow: 'POST' } });
}
