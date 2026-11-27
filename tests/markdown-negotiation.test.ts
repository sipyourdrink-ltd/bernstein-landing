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

import {
  markdownTargetFor,
  markdownTwinPathFor,
  markdownTwinTargetFor,
  prefersMarkdown,
} from '../lib/markdown-negotiation.ts';
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

test('a client that names markdown at >= html quality gets markdown (including Claude Code / Copilot equal q=1)', () => {
  for (const accept of [
    'text/markdown',
    'text/markdown, text/html, */*',
    'text/markdown, text/html',
    'text/markdown, text/html;q=0.9',
    'text/markdown;q=1.0, text/html;q=0.1',
    'text/x-markdown',
    'application/json;q=0.2, text/markdown;q=0.8',
    'text/markdown;q=0.8, */*;q=0.8',
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

test('markdown weighted below html or q=0 stays HTML', () => {
  for (const accept of [
    'text/html, text/markdown;q=0.9',
    'text/markdown;q=0.5, text/html;q=0.9',
    'text/markdown;q=0.8, */*',
    'text/markdown;q=0',
    'text/markdown;q=0, text/html;q=0.9',
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

test('negotiable routes cover site index, blog posts, canonical Q&A, and static reference pages while excluding unguarded edge-TTL routes', () => {
  assert.deepEqual(markdownTargetFor('/'), { kind: 'site-index' });
  assert.deepEqual(markdownTargetFor(`/blog/${PUBLISHED_SLUG}`), {
    kind: 'blog-post',
    slug: PUBLISHED_SLUG,
  });
  assert.deepEqual(markdownTargetFor(`/blog/${PUBLISHED_SLUG}/`), {
    kind: 'blog-post',
    slug: PUBLISHED_SLUG,
  });
  assert.deepEqual(markdownTargetFor('/q'), { kind: 'qa-index' });
  assert.deepEqual(markdownTargetFor('/q/'), { kind: 'qa-index' });
  assert.deepEqual(markdownTargetFor('/q/what-is-bernstein'), {
    kind: 'qa-item',
    slug: 'what-is-bernstein',
  });
  assert.deepEqual(markdownTargetFor('/about'), { kind: 'static-page', page: 'about' });
  assert.deepEqual(markdownTargetFor('/cli-quickstart'), {
    kind: 'static-page',
    page: 'cli-quickstart',
  });
  assert.deepEqual(markdownTargetFor('/spec-driven'), {
    kind: 'static-page',
    page: 'spec-driven',
  });
  assert.deepEqual(markdownTargetFor('/spec/agent-failure-taxonomy/v0.1'), {
    kind: 'static-page',
    page: 'agent-failure-taxonomy-v0.1',
  });
  assert.deepEqual(markdownTargetFor('/tools/agent-md-bench'), {
    kind: 'static-page',
    page: 'agent-md-bench',
  });

  for (const pathname of ['/blog', '/cost', '/vs/aider', '/docs/cli', '/blog/a/b', '/q/a/b']) {
    assert.equal(markdownTargetFor(pathname), null, `${pathname} must not be negotiable`);
  }
});

test('a slug cannot climb out of content/blog or /q', () => {
  for (const prefix of ['/blog', '/q']) {
    for (const bad of [
      '../../etc/passwd',
      '..',
      '%2e%2e',
      '%2e%2e%2f%2e%2e',
      '.hidden',
      'UPPER',
      '-leading-dash',
      'has_underscore',
      '%ZZ',
    ]) {
      assert.equal(markdownTargetFor(`${prefix}/${bad}`), null, `${prefix}/${bad} must be rejected`);
    }
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

test('every negotiated 200 response carries Content-Signal and X-Markdown-Tokens, and newly negotiable routes render clean markdown', async () => {
  for (const [pathname, expectedSnippet] of [
    ['/q', '# Canonical Answers'],
    ['/q/what-is-bernstein', '# what is bernstein'],
    ['/about', '# about bernstein.run'],
    ['/cli-quickstart', '# cli quickstart'],
    ['/spec-driven', '# Spec-driven development with Bernstein'],
    ['/spec/agent-failure-taxonomy/v0.1', '# CLI Coding Agent Failure Taxonomy v0.1'],
    ['/tools/agent-md-bench', '# agent-md-bench'],
  ] as const) {
    const res = await callMarkdownRoute(pathname);
    assert.equal(res.status, 200, `${pathname} should return 200 markdown`);
    assert.match(res.headers.get('content-type') ?? '', /text\/markdown/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('vary'), 'Accept');
    assert.equal(
      res.headers.get('content-signal'),
      'search=yes, ai-input=yes, ai-train=yes',
      `${pathname} markdown response must declare Content-Signal`,
    );
    const tokens = Number.parseInt(res.headers.get('x-markdown-tokens') ?? '', 10);
    assert.ok(Number.isInteger(tokens) && tokens > 10, `${pathname} must emit X-Markdown-Tokens > 10`);
    const body = await res.text();
    assert.ok(body.includes(expectedSnippet), `${pathname} markdown missing "${expectedSnippet}"`);
  }

  const missingQ = await callMarkdownRoute('/q/no-such-question-slug');
  assert.equal(missingQ.status, 404);
});

test('explicit /*.md URL twins serve markdown unconditionally with X-Robots-Tag: noindex, follow and canonical Link, leaving /auth.md and /AGENTS.md untouched', async () => {
  assert.equal(markdownTwinTargetFor('/auth.md'), null, '/auth.md has its own route');
  assert.equal(markdownTwinTargetFor('/AGENTS.md'), null, '/AGENTS.md is a public file');
  assert.equal(
    markdownTwinTargetFor('/spec/agent-failure-taxonomy/CHANGELOG.md'),
    null,
    'CHANGELOG.md in public/ must not be intercepted',
  );

  const expectedPairs: ReadonlyArray<[string, string, string]> = [
    ['/index.md', '/', '# stub site index'],
    ['/about.md', '/about', '# about bernstein.run'],
    ['/cli-quickstart.md', '/cli-quickstart', '# cli quickstart'],
    ['/cost.md', '/cost', '# cost'],
    ['/spec-driven.md', '/spec-driven', '# Spec-driven development with Bernstein'],
    [
      '/spec/agent-failure-taxonomy/v0.1.md',
      '/spec/agent-failure-taxonomy/v0.1',
      '# CLI Coding Agent Failure Taxonomy v0.1',
    ],
    ['/tools/agent-md-bench.md', '/tools/agent-md-bench', '# agent-md-bench'],
    ['/q.md', '/q', '# Canonical Answers'],
    ['/q/what-is-bernstein.md', '/q/what-is-bernstein', '# what is bernstein'],
    [`/blog/${PUBLISHED_SLUG}.md`, `/blog/${PUBLISHED_SLUG}`, '---'],
  ];

  for (const [mdPath, htmlPath, snippet] of expectedPairs) {
    assert.equal(markdownTwinPathFor(htmlPath), mdPath, `HTML path ${htmlPath} must map to ${mdPath}`);
    const twin = markdownTwinTargetFor(mdPath);
    assert.ok(twin?.target, `${mdPath} must resolve as a valid .md twin`);
    assert.equal(twin.canonicalPath, htmlPath);

    const res = await callMarkdownRoute(mdPath);
    assert.equal(res.status, 200, `${mdPath} must return 200`);
    assert.match(res.headers.get('content-type') ?? '', /text\/markdown/);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, follow', `${mdPath} must be noindex, follow`);
    assert.equal(
      res.headers.get('link'),
      `<https://bernstein.run${htmlPath}>; rel="canonical"`,
      `${mdPath} must point canonical Link at ${htmlPath}`,
    );
    const text = await res.text();
    assert.ok(text.includes(snippet), `${mdPath} missing "${snippet}"`);
  }

  /* /cost.md voice & honesty invariants: suggests + heuristic mandatory, no em/en dashes */
  const costBody = await (await callMarkdownRoute('/cost.md')).text();
  assert.match(costBody, /\bsuggests\b/i, '/cost.md must include "suggests"');
  assert.match(costBody, /\bheuristic\b/i, '/cost.md must include "heuristic"');
  assert.ok(!/[\u2013\u2014\u2015]/.test(costBody), '/cost.md must not use en/em dashes');

  /* Unknown or malformed .md slugs return 404 with X-Robots-Tag: noindex */
  for (const badMd of ['/blog/no-such-post.md', '/q/no-such-question.md', '/blog/UPPER.md', '/q/..%2fsecret.md']) {
    const res = await callMarkdownRoute(badMd);
    assert.equal(res.status, 404, `${badMd} must 404`);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', `${badMd} 404 must carry X-Robots-Tag: noindex`);
  }
});

test('no negotiable route overlaps an unguarded shared-cache rule in next.config.mjs', async () => {
  const rules = await headerRules();
  const unguardedCacheSources = rules
    .filter(
      (r) =>
        r.headers.some((h) => h.key === 'Cache-Control' && /s-maxage|[^-]public/.test(h.value)) &&
        !matchesAcceptHeader(r.missing),
    )
    .map((r) => r.source);

  /* Exact/prefix check against every negotiable sample route so a future
     next.config cache rule cannot silently turn a markdown response into
     a shared-cache poisoning bug. */
  const negotiableSamples = [
    '/',
    `/blog/${PUBLISHED_SLUG}`,
    '/q',
    '/q/what-is-bernstein',
    '/about',
    '/cli-quickstart',
    '/spec-driven',
    '/spec/agent-failure-taxonomy/v0.1',
    '/tools/agent-md-bench',
  ];

  for (const sample of negotiableSamples) {
    assert.ok(markdownTargetFor(sample) !== null, `${sample} expected negotiable`);
    for (const source of unguardedCacheSources) {
      const regexStr =
        '^' +
        source
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\:slug/g, '[^/]+')
          .replace(/\\:path\\\*/g, '.*')
          .replace(/\\:path\\\+/g, '.+') +
        '$';
      assert.ok(
        !new RegExp(regexStr).test(sample),
        `negotiable route "${sample}" matches unguarded shared-cache rule "${source}" in next.config.mjs`,
      );
    }
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
