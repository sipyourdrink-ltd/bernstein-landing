/**
 * `/ask` was a standalone search page; it was replaced by the ask-first
 * hero (DocsBot mounted on `/`) and the pre-rendered `/q/[slug]`
 * leaves. Guards that it stays gone from the three places a removed
 * route keeps reappearing in: the route tree itself, the sitemap, and
 * the nav links a visitor can click.
 *
 * `/#ask` is not this route - it is an in-page anchor to the hero's ask
 * heading (`app/page.tsx` renders `<h2 id="ask">`) and is explicitly
 * allowed below.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const read = (file: string): string =>
  fs.readFileSync(path.resolve(REPO_ROOT, file), 'utf8');

test('app/ask has no route (page.tsx removed)', () => {
  assert.ok(
    !fs.existsSync(path.resolve(REPO_ROOT, 'app/ask/page.tsx')),
    'app/ask/page.tsx must not exist - /ask was removed in favor of the ask-first hero and /q/[slug]',
  );
});

test('the sitemap route never emits a literal /ask <loc>', () => {
  const src = read('app/sitemap.xml/route.ts');
  assert.doesNotMatch(
    src,
    /['"`]\/ask['"`]/,
    'app/sitemap.xml/route.ts must not add a literal "/ask" path to the sitemap',
  );
});

test('nav links point at the #ask anchor, never a standalone /ask page', () => {
  const src = read('components/landing/Nav.tsx');
  const hrefs = [...src.matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1]);
  for (const href of hrefs) {
    assert.notEqual(
      href,
      '/ask',
      'Nav.tsx must not link to a standalone /ask page - use the "/#ask" in-page anchor instead',
    );
  }
  assert.ok(
    hrefs.includes('/#ask'),
    'Nav.tsx should still link to the "/#ask" in-page anchor for the ask-first hero',
  );
});
