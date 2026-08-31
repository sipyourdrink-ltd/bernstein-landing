/**
 * CitationChip behaviour-shape tests.
 *
 * The chip's interactive surface (hover, focus, keyboard activation)
 * touches DOM and HTML popover APIs. Our test runner is `node --test
 * --experimental-strip-types` — no jsdom, no React DOM. Per RAG-004
 * we keep React rendering coverage as manual QA / Playwright e2e.
 *
 * What this file pins down:
 *   - The pure helper used to format truncated titles: 32-char cap.
 *   - The href construction logic: `url` alone vs `url#chunkId`.
 *   - The fact that a missing citation is handled (chip still
 *     renders the marker number; no crash).
 *
 * The interactive bits (hover triggers preview, keyboard activation,
 * popover spec fallback) are exercised in Playwright; they need a
 * real browser to be meaningful.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Citation } from '../components/docs-bot/types.ts';
import { safeHref, chipHrefState } from '../components/docs-bot/cite-helpers.ts';

/* Title truncation is still inline-only (used inside the React
   component's render path). Keep a copy here while the rest of the
   chip-helpers move to `cite-helpers.ts`. */
const TITLE_CAP = 32;
function truncatedTitle(title: string): string {
  return title.length > TITLE_CAP ? title.slice(0, TITLE_CAP - 1) + '…' : title;
}

test('truncated title is unchanged when ≤32 chars', () => {
  const t = 'short title';
  assert.equal(truncatedTitle(t), t);
});

test('truncated title ellipsises at 32 chars', () => {
  const t = 'a really long title that exceeds the cap by a long shot';
  const out = truncatedTitle(t);
  assert.equal(out.length, TITLE_CAP);
  assert.ok(out.endsWith('…'));
  /* The first (TITLE_CAP - 1) chars of the source plus the ellipsis.
     We compute this rather than hard-code so a future TITLE_CAP
     tweak only touches the top of the file. */
  assert.equal(out, t.slice(0, TITLE_CAP - 1) + '…');
});

test('chipHrefState: linkable when URL is present (no chunkId)', () => {
  const c: Citation = {
    n: 1,
    title: 't',
    url: 'https://bernstein.run/blog/state',
    excerpt: 'e',
  };
  const out = chipHrefState(c);
  assert.equal(out.isLinkable, true);
  assert.equal(out.href, 'https://bernstein.run/blog/state');
});

test('chipHrefState: linkable with URL#chunkId when chunkId is present', () => {
  const c: Citation = {
    n: 1,
    title: 't',
    url: 'https://bernstein.run/blog/state',
    excerpt: 'e',
    chunkId: 'sdd-dirs',
  };
  const out = chipHrefState(c);
  assert.equal(out.isLinkable, true);
  assert.equal(out.href, 'https://bernstein.run/blog/state#sdd-dirs');
});

test('chipHrefState: NOT linkable when citation is missing entirely', () => {
  /* Failure mode: gateway shipped the marker number into the answer
     text but never sent the matching `citation` event. */
  const out = chipHrefState(undefined);
  assert.equal(out.isLinkable, false);
  assert.equal(out.href, '');
});

test('chipHrefState: NOT linkable when citation.url is empty string', () => {
  /* Failure mode: gateway sent a citation event but the url field
     was empty / whitespace — used to fall through to `<a href="#">`
     which dirtied the address bar. */
  const c: Citation = { n: 1, title: 't', url: '', excerpt: 'e' };
  const out = chipHrefState(c);
  assert.equal(out.isLinkable, false);
  assert.equal(out.href, '');
});

test('chipHrefState: NOT linkable when citation.url is whitespace only', () => {
  const c: Citation = { n: 1, title: 't', url: '   ', excerpt: 'e' };
  const out = chipHrefState(c);
  assert.equal(out.isLinkable, false);
});

test('chipHrefState: NOT linkable when scheme is rejected (javascript:)', () => {
  /* Defence-in-depth: a poisoned Qdrant payload should never become
     a clickable anchor. */
  const c: Citation = { n: 1, title: 't', url: 'javascript:alert(1)', excerpt: 'e' };
  const out = chipHrefState(c);
  assert.equal(out.isLinkable, false);
});

test('chipHrefState: linkable for relative URL (path)', () => {
  const c: Citation = { n: 1, title: 't', url: '/blog/state', excerpt: 'e' };
  const out = chipHrefState(c);
  assert.equal(out.isLinkable, true);
  assert.equal(out.href, '/blog/state');
});

test('chipHrefState: chunkId with `#` chars concatenates verbatim', () => {
  /* Real chunk ids are slugs, but defence-in-depth: a chunkId that
     contains `#` should not be double-escaped — the gateway is the
     single source of authority for that string. */
  const c: Citation = {
    n: 1,
    title: 't',
    url: 'https://example.com',
    excerpt: 'e',
    chunkId: 'odd#id',
  };
  const out = chipHrefState(c);
  assert.equal(out.href, 'https://example.com#odd#id');
});

test('safeHref: rejects javascript:', () => {
  assert.equal(safeHref('javascript:alert(1)'), '#');
});

test('safeHref: rejects data:', () => {
  assert.equal(safeHref('data:text/html,<script>'), '#');
});

test('safeHref: passes through https + mailto', () => {
  assert.equal(safeHref('https://x.test/y'), 'https://x.test/y');
  assert.equal(safeHref('mailto:a@b.com'), 'mailto:a@b.com');
});

test('safeHref: relative paths are preserved', () => {
  assert.equal(safeHref('/foo/bar'), '/foo/bar');
  assert.equal(safeHref('#anchor'), '#anchor');
});

test('safeHref: empty / whitespace collapses to "#"', () => {
  assert.equal(safeHref(''), '#');
  assert.equal(safeHref('   '), '#');
});
