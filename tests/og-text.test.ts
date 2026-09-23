/**
 * /api/og must never download anything while serving a card.
 *
 * @vercel/og fetches a fallback font (fonts.googleapis.com) or an emoji
 * image (jsdelivr) for any glyph the loaded font lacks, and has no switch
 * to turn that off. The route therefore ships its own font and filters
 * user-supplied titles to what that font can draw (lib/og-text.ts).
 *
 * The route itself is `edge` + JSX, so it cannot be imported by the Node
 * test runner. These tests exercise the same renderer (Next's compiled
 * copy of @vercel/og), the same font file and the same filter, with
 * `fetch` replaced by a recorder that fails every call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { OG_FONT_RANGES, renderableOgText } from '../lib/og-text.ts';
import { PROJECT_TAGLINE, PROJECT_ONE_LINER } from '../lib/project-description.ts';

const require = createRequire(import.meta.url);
const { ImageResponse } = require('next/dist/compiled/@vercel/og/index.node.js');
const font = readFileSync(new URL('../assets/og/Geist-Regular.ttf', import.meta.url));
const routeSource = readFileSync(new URL('../app/api/og/route.tsx', import.meta.url), 'utf8');

/** Render `children` with the bundled font; return every URL fetch() saw. */
async function fetchesWhileRendering(children: unknown): Promise<string[]> {
  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  const realError = console.error;
  globalThis.fetch = (async (input: unknown) => {
    seen.push(String(input));
    throw new Error('network blocked by test');
  }) as typeof fetch;
  console.error = () => {}; // the loader logs its own failures
  try {
    const card = { type: 'div', props: { style: { display: 'flex', fontFamily: 'Geist' }, children } };
    const res = new ImageResponse(card, {
      width: 400,
      height: 100,
      fonts: [{ name: 'Geist', data: font, weight: 400, style: 'normal' }],
    });
    await res.arrayBuffer();
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
  }
  return seen;
}

test('renderableOgText keeps Latin text, punctuation and arrows unchanged', () => {
  const s = 'Spec-driven: it’s “done” — v2.0 → v3 · café';
  assert.equal(renderableOgText(s), s);
});

test('renderableOgText drops emoji, Cyrillic, CJK and symbols the font lacks', () => {
  assert.equal(renderableOgText('Ship it \u{1F680} now'), 'Ship it now');
  assert.equal(renderableOgText('Привет world'), 'world');
  assert.equal(renderableOgText('你好'), '');
  assert.equal(renderableOgText('★ stars'), 'stars');
});

test('renderableOgText collapses whitespace left by removals', () => {
  assert.equal(renderableOgText('a \u{1F680}\u{1F680}   \n\t b'), 'a b');
  assert.equal(renderableOgText(''), '');
});

test('every code point the filter allows renders without a network fetch', async () => {
  for (const [first, last] of OG_FONT_RANGES) {
    let chunk = '';
    for (let cp = first; cp <= last; cp++) chunk += String.fromCodePoint(cp) + ' ';
    const seen = await fetchesWhileRendering(chunk);
    assert.deepEqual(seen, [], `range U+${first.toString(16)}-U+${last.toString(16)} triggered ${seen[0]}`);
  }
});

test('a hostile title, once filtered, renders without a network fetch', async () => {
  const hostile = 'Launch \u{1F680} Привет 你好 ★ ∞ العربية \u{1F468}‍\u{1F469}‍\u{1F467}';
  const seen = await fetchesWhileRendering(renderableOgText(hostile) || 'Bernstein');
  assert.deepEqual(seen, []);
});

test('the fixed card copy renders without a network fetch', async () => {
  const seen = await fetchesWhileRendering([
    PROJECT_TAGLINE,
    PROJECT_ONE_LINER,
    '>_ bernstein.run 690+ stars 48 adapters pipx install bernstein Open source · Apache 2.0',
  ]);
  assert.deepEqual(seen, []);
});

test('the un-filtered inputs do reach the network (guards the probe itself)', async () => {
  const seen = await fetchesWhileRendering('★');
  assert.ok(seen.some((u) => u.includes('fonts.googleapis.com')), 'expected a font fetch for U+2605');
});

test('route passes the bundled font and draws no glyph the font lacks', () => {
  assert.match(routeSource, /fonts:\s*\[\{\s*name:\s*'Geist'/);
  assert.match(routeSource, /assets\/og\/Geist-Regular\.ttf/);
  assert.match(routeSource, /renderableOgText\(/);
  assert.doesNotMatch(routeSource, /★|&#9733;|&#x2605;/, 'star must be an inline SVG');
});
