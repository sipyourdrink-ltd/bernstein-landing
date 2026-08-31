/**
 * The root layout must not render a `<head>` element of its own.
 *
 * A `<head>` written as a host element in the tree is reconciled by
 * React the way any other element's children are: by position. The
 * elements it lands among are not ours - Next emits the font preloads,
 * the stylesheets and the chunk preloads into the same list - so the
 * ordering our hydration depends on is an ordering we do not control the
 * front of.
 *
 * Anything that inserts a node into `<head>` ahead of those shifts every
 * following node by one and the document fails to hydrate. That is not a
 * hypothetical: the edge in front of this site began injecting a
 * `<script type="module">` immediately after the viewport meta, and every
 * page threw React error #418 and ended up with two copies of the
 * analytics tag - one from the server, one React re-inserted after
 * giving up on the match.
 *
 * The measurement that identified the cause: injecting the identical node
 * at the END of `<head>` hydrated cleanly, and injecting a node whose
 * `src` 404s - present in the DOM, never executed - reproduced the error.
 * So it is the position of a node, not the script it loads, and no
 * amount of care inside our own markup can absorb it.
 *
 * Rendered from `<body>`, the `<link>`s are hoistable resources: React
 * lifts them into `<head>` and matches them by identity rather than by
 * index, which makes a foreign sibling simply a node React does not own.
 *
 * This test pins the decision rather than the symptom, because the
 * symptom only appears behind a CDN and the obvious tidy-up - "these are
 * head tags, they belong in a <head>" - reintroduces it silently.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const layout = fs.readFileSync(path.join(process.cwd(), 'app', 'layout.tsx'), 'utf8');

/* Strip comments first: the explanation above this test is mirrored in
   the layout, and it necessarily says the word it is forbidding. */
const code = layout
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('the root layout renders no <head> element', () => {
  assert.ok(
    !/<head[\s>]/.test(code),
    'app/layout.tsx renders a <head> host element again. Its children are ' +
      'then hydrated by position, among Next-emitted nodes, and any tag a CDN ' +
      'or extension inserts ahead of them breaks hydration site-wide. Render ' +
      'them from <body> and let React hoist them.',
  );
});

test('the tags that moved are still emitted', () => {
  /* The failure mode this guards is a future fix that satisfies the test
     above by deleting the markup rather than relocating it. */
  for (const [what, pattern] of [
    ['the analytics preconnect', /rel="preconnect"[\s\S]{0,120}?analytics\.bernstein\.run/],
    ['the rel=me identity links', /rel="me"/],
    ['the llms-full.txt alternate', /href="\/llms-full\.txt"/],
    ['the operator-exclusion inline script', /OPERATOR_EXCLUDE_INLINE_SCRIPT/],
    ['the analytics tracker', /analytics\.bernstein\.run\/script\.js/],
  ] as const) {
    assert.match(layout, pattern, `${what} is gone from app/layout.tsx`);
  }
});

test('the tracker still follows the exclusion script', () => {
  /* The inline script installs a no-op `window.umami` when the operator
     flag is set; it only wins if it parses before the deferred tracker
     boots. Their relative order is the whole mechanism, and moving both
     out of <head> is exactly the kind of edit that reverses it. */
  const exclusion = layout.indexOf('OPERATOR_EXCLUDE_INLINE_SCRIPT');
  const tracker = layout.indexOf('analytics.bernstein.run/script.js');
  assert.ok(exclusion > 0 && tracker > 0, 'one of the two scripts is missing');
  assert.ok(
    exclusion < tracker,
    'the deferred tracker is now emitted before the exclusion script, so the ' +
      'operator flag can no longer install its stub in time',
  );
});
