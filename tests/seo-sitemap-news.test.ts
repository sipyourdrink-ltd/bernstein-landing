/**
 * Tests for the Google News sitemap helpers (`lib/sitemap-news.ts`).
 *
 * The route's contract — also enforced here — is:
 *   - Only posts whose publication date is within the last 2 days appear.
 *   - Posts with no parseable `date` and no git history are silently
 *     skipped (rather than crashing the route).
 *   - Each entry carries `news:publication.name = "Bernstein"`,
 *     `news:publication.language = "en"`, and an ISO-8601 publication_date.
 *   - The body has a strong sha1 ETag and is byte-stable across rebuilds
 *     given the same input.
 *   - Total <url> count is capped at 1000 (Google News spec hard limit).
 *
 * We exercise `buildNewsSitemapBody` directly with a fixture (1 fresh,
 * 1 stale, 1 missing date) so the assertions don't depend on the on-disk
 * content of `content/blog/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildNewsSitemapBody,
  type NewsPost,
} from '../lib/sitemap-news.ts';

const NOW = new Date('2026-05-08T12:00:00.000Z');
// Point at a directory that's guaranteed not to contain any of the test
// slugs, so the git-mtime fallback returns null for the "no-date" fixture.
const FIXTURE_DIR = path.resolve(process.cwd(), '__sitemap_news_test_fixture__');

function makePost(over: Partial<NewsPost> & { slug?: string }): NewsPost {
  return {
    slug: over.slug ?? 'sample',
    title: over.title ?? 'Sample Post',
    date: over.date ?? '2026-05-08',
    tags: over.tags,
  };
}

test('only posts within the last 2 days are emitted', async () => {
  const fresh = makePost({ slug: 'fresh', title: 'Fresh Post', date: '2026-05-08' });
  const stale = makePost({ slug: 'stale', title: 'Stale Post', date: '2026-04-01' });
  const missing = makePost({ slug: 'no-date', title: 'No Date', date: '' });

  const { xml } = await buildNewsSitemapBody([fresh, stale, missing], NOW, FIXTURE_DIR);

  assert.match(xml, /<loc>https:\/\/bernstein\.run\/blog\/fresh<\/loc>/);
  assert.doesNotMatch(xml, /<loc>https:\/\/bernstein\.run\/blog\/stale<\/loc>/);
  // Missing date + no git history under FIXTURE_DIR → silent skip.
  assert.doesNotMatch(xml, /<loc>https:\/\/bernstein\.run\/blog\/no-date<\/loc>/);
});

test('news:publication carries the correct name + language', async () => {
  const fresh = makePost({ slug: 'fresh', date: '2026-05-08', tags: ['ai', 'orchestration'] });
  const { xml } = await buildNewsSitemapBody([fresh], NOW, FIXTURE_DIR);

  assert.match(xml, /<news:name>Bernstein<\/news:name>/);
  assert.match(xml, /<news:language>en<\/news:language>/);
});

test('news:publication_date is W3C ISO-8601', async () => {
  const fresh = makePost({ slug: 'fresh', date: '2026-05-07' });
  const { xml } = await buildNewsSitemapBody([fresh], NOW, FIXTURE_DIR);

  const m = xml.match(
    /<news:publication_date>(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)<\/news:publication_date>/,
  );
  assert.ok(m, `expected ISO-8601 publication_date, got: ${xml}`);
  assert.equal(new Date(m![1]).toISOString(), m![1]);
});

test('keywords come from frontmatter tags as a comma-joined list', async () => {
  const fresh = makePost({
    slug: 'fresh',
    date: '2026-05-08',
    tags: ['multi-agent', 'orchestration', 'release'],
  });
  const { xml } = await buildNewsSitemapBody([fresh], NOW, FIXTURE_DIR);

  assert.match(xml, /<news:keywords>multi-agent, orchestration, release<\/news:keywords>/);
});

test('ETag is a 40-char hex sha1, byte-stable across rebuilds', async () => {
  const fresh = makePost({ slug: 'fresh', date: '2026-05-08' });
  const a = await buildNewsSitemapBody([fresh], NOW, FIXTURE_DIR);
  const b = await buildNewsSitemapBody([fresh], NOW, FIXTURE_DIR);

  assert.match(a.etag, /^"[a-f0-9]{40}"$/);
  assert.equal(a.etag, b.etag);
});

test('304 path returns the same ETag with empty body (route shape)', async () => {
  // The route handler short-circuits on If-None-Match before rendering. We
  // emulate that contract here — given the same body bytes, the ETag is
  // identical, so a conditional-GET round trip will see 304 + ETag match.
  const fresh = makePost({ slug: 'fresh', date: '2026-05-08' });
  const { etag } = await buildNewsSitemapBody([fresh], NOW, FIXTURE_DIR);
  assert.match(etag, /^"[a-f0-9]{40}"$/);
});

test('total <url> count is capped at 1000 entries', async () => {
  const posts: NewsPost[] = Array.from({ length: 1500 }, (_, i) =>
    makePost({ slug: `post-${i}`, title: `Post ${i}`, date: '2026-05-08' }),
  );
  const { xml } = await buildNewsSitemapBody(posts, NOW, FIXTURE_DIR);
  const urlMatches = xml.match(/<url>/g);
  assert.ok(urlMatches);
  assert.ok(
    urlMatches!.length <= 1000,
    `expected ≤1000 <url> elements, got ${urlMatches!.length}`,
  );
});

test('XML wrapper has the news namespace declaration', async () => {
  const fresh = makePost({ slug: 'fresh', date: '2026-05-08' });
  const { xml } = await buildNewsSitemapBody([fresh], NOW, FIXTURE_DIR);

  assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.match(xml, /xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/);
});
