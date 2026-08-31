/**
 * Markdown content negotiation.
 *
 * Two things are being protected here, and only one of them is the
 * feature.
 *
 * The feature: a client that asks for `text/markdown` on `/` or on a
 * blog post gets markdown. That is the easy half.
 *
 * The thing that would actually hurt: a browser negotiating into
 * markdown, or a markdown body reaching a browser through a shared
 * cache. This site is behind a CDN, and CDNs generally ignore `Vary`
 * for everything except Accept-Encoding, so `Vary: Accept` alone does
 * not keep the two apart - the markdown responses have to be
 * uncacheable. Both halves are pinned below, including a test that
 * feeds in the literal Accept headers Chrome, Firefox and Safari send.
 *
 * Two things are not imported here. The middleware pulls in
 * `next/server`, and the route file sits in a `%5F` folder that Node's
 * ESM resolver decodes back to `_` - the same reason
 * `tests/signals-route.test.ts` gives for testing its lib instead. Both
 * are thin: middleware calls the two decision functions below, and the
 * route is a one-line wrapper over `serveMarkdown`. The wiring between
 * them is verified against a running server; everything with a decision
 * in it is here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { markdownTargetFor, prefersMarkdown } from '../lib/markdown-negotiation.ts';
import { isPublished, serveMarkdown } from '../lib/markdown-view.ts';

const BLOG_DIR = path.resolve(process.cwd(), 'content', 'blog');

/* The site index is llms.txt, whose builder drags in the MDX pipeline
   and the blog components. The strip-types harness cannot parse those,
   so the branch is exercised with a stub - what is under test here is
   the routing and the headers, not the llms.txt text, which
   tests/ai-txt.test.ts and lib/seo already cover. */
const STUB_INDEX = '# stub site index\n';
const stubSiteIndex = async (): Promise<string> => STUB_INDEX;

/** A slug that really has an index.mdx, so the test moves with the content. */
function aRealPublishedSlug(): string {
  for (const entry of fs.readdirSync(BLOG_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(BLOG_DIR, entry.name, 'index.mdx');
    if (fs.existsSync(file) && isPublished(fs.readFileSync(file, 'utf8'))) {
      return entry.name;
    }
  }
  throw new Error('no published post found under content/blog');
}

const PUBLISHED_SLUG = aRealPublishedSlug();

function callMarkdownRoute(pathname: string): Promise<Response> {
  return serveMarkdown(pathname, stubSiteIndex);
}

/* Minimal shape of a next.config headers() entry. Narrower than Next's
   own type (which allows host matchers with no key) and enough for the
   two assertions below. */
interface RouteCondition {
  type: string;
  key?: string;
  value?: string;
}
interface HeaderRule {
  source: string;
  has?: RouteCondition[];
  missing?: RouteCondition[];
  headers: Array<{ key: string; value: string }>;
}

async function headerRules(): Promise<HeaderRule[]> {
  const { default: config } = await import('../next.config.mjs');
  return (await config.headers!()) as unknown as HeaderRule[];
}

/** Does this has/missing list condition on the Accept request header? */
function matchesAcceptHeader(conditions: RouteCondition[] | undefined): boolean {
  return (conditions ?? []).some((c) => c.type === 'header' && c.key === 'accept');
}

/* ---------- who gets markdown ---------- */

test('a client that names markdown and outranks html gets it', () => {
  for (const accept of [
    'text/markdown',
    'text/markdown, text/html;q=0.9',
    'text/markdown;q=1.0, text/html;q=0.1',
    'text/x-markdown',
    'application/json;q=0.2, text/markdown;q=0.8',
    'TEXT/MARKDOWN',
    'text/markdown; charset=utf-8',
  ]) {
    assert.equal(prefersMarkdown(accept), true, `should prefer markdown: ${accept}`);
  }
});

test('a real browser never negotiates into markdown', () => {
  /* Verbatim Accept headers from the three engines. The wildcard at the
     end of each would match text/markdown if wildcards counted as
     naming a type, which is exactly why they do not. */
  const browsers = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  ];
  for (const accept of browsers) {
    assert.equal(prefersMarkdown(accept), false, `browser must get HTML: ${accept}`);
  }
});

test('markdown must outrank html, not merely appear alongside it', () => {
  for (const accept of [
    'text/markdown, text/html',
    'text/html, text/markdown',
    'text/markdown;q=0.5, text/html;q=0.9',
    'text/markdown;q=0.8, */*',
    'text/html',
    '*/*',
    'application/json',
    '',
  ]) {
    assert.equal(prefersMarkdown(accept), false, `should not prefer markdown: ${accept}`);
  }
  assert.equal(prefersMarkdown(null), false);
  assert.equal(prefersMarkdown(undefined), false);
});

test('a malformed Accept header is a no, not a throw', () => {
  for (const accept of ['text/markdown;q=', 'text/markdown;q=bogus', ';;;', 'text/markdown;;q']) {
    assert.doesNotThrow(() => prefersMarkdown(accept));
  }
  /* An unreadable q falls back to the default of 1, which still beats
     an html weight of 0 - the header did name markdown. */
  assert.equal(prefersMarkdown('text/markdown;q=bogus'), true);
});

/* ---------- which paths have a markdown view ---------- */

test('only the site index and a blog post are negotiable', () => {
  assert.deepEqual(markdownTargetFor('/'), { kind: 'site-index' });
  assert.deepEqual(markdownTargetFor(`/blog/${PUBLISHED_SLUG}`), {
    kind: 'blog-post',
    slug: PUBLISHED_SLUG,
  });
  assert.deepEqual(markdownTargetFor(`/blog/${PUBLISHED_SLUG}/`), {
    kind: 'blog-post',
    slug: PUBLISHED_SLUG,
  });

  for (const pathname of ['/blog', '/cost', '/vs/aider', '/q/what-is-bernstein', '/blog/a/b']) {
    assert.equal(markdownTargetFor(pathname), null, `${pathname} must not be negotiable`);
  }
});

test('a slug cannot climb out of content/blog', () => {
  for (const pathname of [
    '/blog/../../etc/passwd',
    '/blog/..',
    '/blog/%2e%2e',
    '/blog/%2e%2e%2f%2e%2e',
    '/blog/.hidden',
    '/blog/UPPER',
    '/blog/-leading-dash',
    '/blog/has_underscore',
    '/blog/%ZZ',
  ]) {
    assert.equal(markdownTargetFor(pathname), null, `${pathname} must be rejected`);
  }
});

/* ---------- what the route returns ---------- */

test('a published post serves its own MDX as markdown', async () => {
  const res = await callMarkdownRoute(`/blog/${PUBLISHED_SLUG}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/markdown/);
  assert.match(res.headers.get('content-type') ?? '', /charset=utf-8/i);

  const body = await res.text();
  const onDisk = fs.readFileSync(path.join(BLOG_DIR, PUBLISHED_SLUG, 'index.mdx'), 'utf8');
  assert.equal(body, onDisk, 'the body must be the MDX source, unmodified');
});

test('the site index serves the llms.txt body as markdown', async () => {
  const res = await callMarkdownRoute('/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/markdown/);
  assert.equal(await res.text(), STUB_INDEX);
});

test('the site index really is llms.txt, not a second copy of it', async () => {
  /* The stub above proves the routing. This proves the default builder
     is the llms.txt one, so the markdown view of `/` cannot drift into
     being separately-maintained text. Asserted on the source because
     calling it would load the MDX pipeline. */
  const source = fs.readFileSync(path.resolve(process.cwd(), 'lib', 'markdown-view.ts'), 'utf8');
  assert.match(
    source,
    /buildLlmsTxt/,
    'the site-index branch must build from buildLlmsTxt so / and /llms.txt cannot diverge',
  );
});

test('every negotiated response carries Vary: Accept', async () => {
  for (const pathname of [`/blog/${PUBLISHED_SLUG}`, '/blog/no-such-post', '/not-negotiable']) {
    const res = await callMarkdownRoute(pathname);
    assert.equal(
      res.headers.get('vary'),
      'Accept',
      `${pathname} must send Vary: Accept so a cache that honours it keeps HTML and ` +
        'markdown apart',
    );
  }
});

test('markdown responses can never enter a shared cache', async () => {
  /* The load-bearing assertion. This site is behind a CDN, and CDNs
     generally ignore Vary; a cacheable markdown body could then be
     replayed to a browser asking for the same URL. `no-store` removes
     that possibility regardless of what the CDN does with Vary. If this
     ever relaxes to a public TTL, the next person gets to explain how
     the edge is keying on Accept. */
  for (const pathname of [`/blog/${PUBLISHED_SLUG}`, '/', '/blog/no-such-post']) {
    const res = await callMarkdownRoute(pathname);
    const cc = res.headers.get('cache-control') ?? '';
    assert.match(cc, /no-store/, `${pathname} must be no-store, got "${cc}"`);
    assert.ok(!/\bpublic\b/.test(cc), `${pathname} must not be publicly cacheable`);
    assert.ok(!/s-maxage/.test(cc), `${pathname} must not set a shared-cache TTL`);
  }
});

test('an unknown slug 404s rather than inventing a page', async () => {
  const res = await callMarkdownRoute('/blog/no-such-post');
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type') ?? '', /text\/markdown/);
});

test('a draft post is refused, exactly as the HTML view refuses it', async () => {
  /* getAllPosts filters draft: true out of the site, so the HTML 404s
     while the file sits on disk. Serving it here would publish through
     the markdown view what the HTML view hides. */
  assert.equal(isPublished('---\ntitle: x\ndraft: true\n---\n\nbody'), false);
  assert.equal(isPublished('---\ntitle: x\ndraft: false\n---\n\nbody'), true);
  assert.equal(isPublished('---\ntitle: x\n---\n\nbody'), true);
  /* No frontmatter at all is not a post we understand. Refuse. */
  assert.equal(isPublished('just a body'), false);
});

test('the route refuses a path that has no markdown view', async () => {
  for (const pathname of ['/cost', '/blog', '', '/blog/../secrets']) {
    const res = await callMarkdownRoute(pathname);
    assert.equal(res.status, 404, `${pathname} must 404`);
  }
});

/* ---------- where the protection actually lives ---------- */

test('next.config does not stamp an edge TTL on a markdown-negotiated request', async () => {
  /* The headers() entries in next.config.mjs are matched against the
     INCOMING path, so they still apply after middleware rewrites to
     /api/_markdown, and they overwrite what the handler set. Before the
     has/missing split, `/` and `/blog/:slug` were putting
     `public, s-maxage=600` on markdown bodies - verified against a
     running server, not deduced. That is a CDN replaying markdown to
     the next browser that asks for the same URL.

     So the assertion is on the config itself: for each negotiable path,
     there is exactly one rule that fires when Accept names markdown, it
     is no-store, and every rule granting a shared TTL is guarded by a
     `missing` on the same header. */
  const rules = await headerRules();

  for (const source of ['/', '/blog/:slug']) {
    const forSource = rules.filter((r) => r.source === source);

    const cacheable = forSource.filter((r) =>
      r.headers.some((h) => h.key === 'Cache-Control' && /s-maxage|[^-]public/.test(h.value)),
    );
    assert.ok(cacheable.length > 0, `${source} has no cache rule at all any more`);
    for (const rule of cacheable) {
      assert.ok(
        matchesAcceptHeader(rule.missing),
        `${source} grants a shared-cache TTL without excluding markdown-negotiated ` +
          'requests. A CDN that ignores Vary will serve that body to a browser.',
      );
    }

    const negotiated = forSource.filter((r) => matchesAcceptHeader(r.has));
    assert.equal(
      negotiated.length,
      1,
      `${source} must have exactly one Accept-conditioned rule, found ${negotiated.length}`,
    );
    const rule = negotiated[0]!;
    assert.equal(
      rule.headers.find((h) => h.key === 'Cache-Control')?.value,
      'no-store',
      `${source} markdown responses must be no-store`,
    );
    assert.ok(
      rule.headers.some((h) => h.key === 'Vary' && h.value === 'Accept'),
      `${source} markdown responses must send Vary: Accept`,
    );
  }
});

test('the markdown Accept matcher recognises the headers we negotiate on', async () => {
  /* Next anchors a has/missing `value` regex, so the pattern has to
     match a whole real Accept header, not just the token. Getting that
     wrong fails open: the rule never fires and the edge TTL comes back. */
  const rules = await headerRules();
  const rule = rules.find((r) => r.source === '/' && matchesAcceptHeader(r.has));
  assert.ok(rule, 'the Accept-conditioned rule for / is gone');

  const accepts = (rule.has ?? []).find((h) => h.type === 'header' && h.key === 'accept');
  assert.ok(accepts?.value, 'the Accept matcher for / has no value regex');
  const pattern = new RegExp(`^${accepts.value}$`);

  for (const accept of ['text/markdown', 'text/markdown, text/html;q=0.9', 'text/x-markdown']) {
    assert.ok(pattern.test(accept), `matcher must fire for "${accept}"`);
  }
  for (const accept of [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'text/html',
    '*/*',
  ]) {
    assert.ok(!pattern.test(accept), `matcher must not fire for "${accept}"`);
  }
});

test('the internal route is not advertised as a public surface', async () => {
  /* It is a rewrite target, not an endpoint. If it ever shows up in the
     skills index or the catalog, that is a promise nobody meant to make. */
  const { MACHINE_ENDPOINTS } = await import('../lib/machine-surfaces.ts');
  for (const endpoint of MACHINE_ENDPOINTS) {
    assert.ok(
      !endpoint.path.includes('_markdown'),
      'the internal markdown route must stay out of the published surface list',
    );
  }
});
