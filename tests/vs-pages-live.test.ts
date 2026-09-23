/**
 * Drift guard for the /vs pages, read from the host that serves them.
 *
 * Why this suite exists
 * ---------------------
 * `tests/project-description.test.ts` guards every surface that
 * describes the project by reading its source out of this checkout.
 * The /vs hub and the per-adapter pages under /vs/<slug> cannot be
 * guarded that way: they are generated and deployed straight to the
 * host, outside this git tree, so `app/vs/page.tsx` and
 * `app/vs/[slug]/page.tsx` have never existed in a checkout and a
 * source-text read of them can only ENOENT. They were listed among the
 * literal surfaces anyway, which failed every CI run until the entry
 * was removed; removing it also removed the only guard those pages had.
 *
 * They are still real surfaces: /vs and /vs/<slug> are advertised in the
 * production sitemap and carry a full description of the project, in
 * prose and in JSON-LD. So this suite re-applies the same three
 * assertions to the deployed HTML instead of to source text:
 *
 *   1. no retired project description (`RETIRED_DESCRIPTION_PHRASES`)
 *   2. no overstated receipt claim (`OVERSTATED_RECEIPT_CLAIM`)
 *   3. the canonical tagline (`PROJECT_TAGLINE_LOWER`) is present
 *
 * The vocabulary comes from `lib/project-description.ts`, the same
 * module the source-text suite reads, so the two guards cannot disagree
 * about what counts as retired.
 *
 * Why opt-in
 * ----------
 * `.github/workflows/ci.yml` sends nothing outbound - that is why
 * `scripts/submit-indexnow.mjs` returns early under GITHUB_ACTIONS. A
 * suite that fetched a live host on every `npm test` would break that
 * rule and would make the unit run depend on the network besides. So
 * these tests run only when `VS_LIVE_CHECK` is set, and skip otherwise
 * with a reason that names the URLs left unguarded - the same way
 * `scripts/prebuild.mjs` announces the host-supplied steps it skips,
 * so an absent check is visible in the output rather than silent.
 *
 *   npm run test:vs-live                        # against production
 *   VS_LIVE_CHECK=1 VS_LIVE_ORIGIN=http://localhost:3000 npm test
 *
 * What counts as a failure
 * ------------------------
 * A page that answers with copy violating one of the three rules fails,
 * and so does a published URL the host answers 4xx for, because the
 * sitemap advertises it. A host that cannot be reached at all, or that
 * answers 5xx, does not fail: that is a network or deploy condition,
 * not description drift, and this suite is not an uptime monitor. Those
 * URLs are dropped from the run and named in the output, and if none of
 * them can be read the tests skip rather than pass on an empty set.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { SITE_URL } from '../lib/machine-surfaces.ts';
import {
  OVERSTATED_RECEIPT_CLAIM,
  PROJECT_TAGLINE_LOWER,
  RETIRED_DESCRIPTION_PHRASES,
} from '../lib/project-description.ts';

const ENABLED = /^(1|true|yes)$/i.test(process.env.VS_LIVE_CHECK ?? '');

/** Trailing slashes are stripped so `${ORIGIN}${pathname}` is always well formed. */
const ORIGIN = (process.env.VS_LIVE_ORIGIN ?? SITE_URL).replace(/\/+$/, '');

const REQUEST_TIMEOUT_MS = 15_000;

/** Matches the other outbound callers in `lib/`. */
const USER_AGENT = 'bernstein-landing/1.0 (+https://bernstein.run)';

/**
 * The published /vs URLs, derived the way the sitemap derives them:
 * `data/adapters.json` carries every adapter the extractor found, and
 * the `ready` flag is the publication gate (see `data/adapters-ready.json`).
 * Reading the same input means a slug going live adds itself here.
 */
function publishedPaths(): string[] {
  const file = path.resolve(process.cwd(), 'data', 'adapters.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    adapters: Array<{ slug: string; ready?: boolean }>;
  };
  const slugs = data.adapters
    .filter((a) => a.ready)
    .map((a) => a.slug)
    .sort();
  return ['/vs', ...slugs.map((s) => `/vs/${s}`)];
}

/** A page that was read, or one that could not be and why. */
type Page = { pathname: string; url: string; haystack: string };
type Unread = { pathname: string; url: string; reason: string };
type Gone = { pathname: string; url: string; status: number };
type Run = { pages: Page[]; unread: Unread[]; gone: Gone[] };

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref.startsWith('#x') || ref.startsWith('#X')) {
      return String.fromCodePoint(parseInt(ref.slice(2), 16));
    }
    if (ref.startsWith('#')) {
      return String.fromCodePoint(parseInt(ref.slice(1), 10));
    }
    return ENTITIES[ref.toLowerCase()] ?? whole;
  });
}

/**
 * The body in the two forms a phrase can survive in, lowercased and
 * whitespace-collapsed, concatenated so one `includes` covers both.
 *
 * The raw markup is kept because the JSON-LD blocks carry a description
 * of the project and must be searched as they are served. The
 * tag-stripped form is added because visible copy can be interrupted by
 * markup - `<strong>governance</strong> layer` reads as one phrase to a
 * human and as two to a substring search. Searching both makes the
 * retired-phrase rules stricter and the tagline rule less brittle,
 * which is the direction each one wants.
 */
function haystackOf(body: string): string {
  const text = decodeEntities(body.replace(/<[^>]*>/g, ' '));
  return `${body}\n${text}`.toLowerCase().replace(/\s+/g, ' ');
}

async function fetchPage(pathname: string): Promise<Page | Unread | Gone> {
  const url = `${ORIGIN}${pathname}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    return { pathname, url, reason: (e as Error).message || String(e) };
  }
  /* 5xx is the host being unwell, not the copy being wrong. */
  if (res.status >= 500) {
    return { pathname, url, reason: `HTTP ${res.status}` };
  }
  if (!res.ok) {
    return { pathname, url, status: res.status };
  }
  return { pathname, url, haystack: haystackOf(await res.text()) };
}

let run: Promise<Run> | null = null;

/** One fetch of each page for the whole file; the tests share the result. */
function load(): Promise<Run> {
  run ??= (async () => {
    const settled = await Promise.all(publishedPaths().map(fetchPage));
    const out: Run = { pages: [], unread: [], gone: [] };
    for (const r of settled) {
      if ('haystack' in r) out.pages.push(r);
      else if ('status' in r) out.gone.push(r);
      else out.unread.push(r);
    }
    return out;
  })();
  return run;
}

const disabledReason = (): string =>
  `VS_LIVE_CHECK is not set, so ${publishedPaths()
    .map((p) => `${ORIGIN}${p}`)
    .join(', ')} are UNGUARDED in this run. These pages are deployed ` +
  'outside this git tree and no source-text test can reach them. Run ' +
  '`npm run test:vs-live` to check them.';

const unreachableReason = (r: Run): string =>
  `no /vs page could be read from ${ORIGIN}, so all of them are ` +
  `UNGUARDED in this run: ${r.unread
    .map((u) => `${u.pathname} (${u.reason})`)
    .join(', ')}`;

/** Names the pages that were read, and any that were not, on every failure. */
function coverage(r: Run): string {
  const read = r.pages.map((p) => p.pathname).join(', ') || 'none';
  const missed = r.unread.map((u) => `${u.pathname} (${u.reason})`).join(', ');
  return `read: ${read}${missed ? `; unread, so unguarded: ${missed}` : ''}`;
}

test('every published /vs URL is still served', async (t) => {
  if (!ENABLED) return t.skip(disabledReason());
  const r = await load();
  if (r.pages.length === 0 && r.gone.length === 0) {
    return t.skip(unreachableReason(r));
  }
  assert.deepEqual(
    r.gone.map((g) => `${g.pathname} -> HTTP ${g.status}`),
    [],
    'the sitemap advertises these URLs and the host does not serve them',
  );
});

test('no live /vs page reintroduces the retired project description', async (t) => {
  if (!ENABLED) return t.skip(disabledReason());
  const r = await load();
  if (r.pages.length === 0) return t.skip(unreachableReason(r));
  for (const page of r.pages) {
    for (const phrase of RETIRED_DESCRIPTION_PHRASES) {
      assert.ok(
        !page.haystack.includes(phrase.toLowerCase()),
        `${page.url} carries the retired phrase "${phrase}" (${coverage(r)})`,
      );
    }
  }
});

test('no live /vs page overstates the receipt guarantee', async (t) => {
  if (!ENABLED) return t.skip(disabledReason());
  const r = await load();
  if (r.pages.length === 0) return t.skip(unreachableReason(r));
  for (const page of r.pages) {
    assert.ok(
      !page.haystack.includes(OVERSTATED_RECEIPT_CLAIM),
      `${page.url} overstates the receipt guarantee; receipts are ` +
        `offline-verifiable, and it is the run that replays ` +
        `byte-identically (${coverage(r)})`,
    );
  }
});

test('every live /vs page names the governance layer', async (t) => {
  if (!ENABLED) return t.skip(disabledReason());
  const r = await load();
  if (r.pages.length === 0) return t.skip(unreachableReason(r));
  for (const page of r.pages) {
    assert.ok(
      page.haystack.includes(PROJECT_TAGLINE_LOWER),
      `${page.url} describes the project without naming it as ` +
        `${PROJECT_TAGLINE_LOWER} (${coverage(r)})`,
    );
  }
});
