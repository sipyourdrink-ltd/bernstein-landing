/**
 * Tests for the `buildMarkdown` helper that powers the copy-as-markdown
 * button. The helper is pure; we test it directly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkdown } from '../components/docs-bot/build-markdown.ts';
import type { Citation } from '../components/docs-bot/types.ts';

function mkCitation(n: number, title: string, url: string, chunkId?: string): Citation {
  return { n, title, url, excerpt: 'excerpt', chunkId };
}

test('plain text without markers returns text unchanged', () => {
  const out = buildMarkdown('plain text', new Map());
  assert.equal(out, 'plain text');
});

test('text with markers gets reference-style links appended', () => {
  const cites = new Map<number, Citation>([
    [1, mkCitation(1, 'state files', 'https://bernstein.run/blog/state-files')],
    [2, mkCitation(2, 'cost-aware', 'https://bernstein.run/blog/cost-aware')],
  ]);
  const out = buildMarkdown('tasks live in `.sdd` [1] and routes by cost [2].', cites);
  assert.match(out, /\[1\]: https:\/\/bernstein\.run\/blog\/state-files/);
  assert.match(out, /\[2\]: https:\/\/bernstein\.run\/blog\/cost-aware/);
  /* Body precedes links. */
  assert.ok(out.indexOf('[1]:') > out.indexOf('tasks live in'));
});

test('chunkId is appended as URL fragment in reference links', () => {
  const cites = new Map<number, Citation>([
    [1, mkCitation(1, 't', 'https://example.com/a', 'chunk-3')],
  ]);
  const out = buildMarkdown('see [1].', cites);
  assert.match(out, /\[1\]: https:\/\/example\.com\/a#chunk-3/);
});

test('markers without matching citations are kept literal but not linked', () => {
  /* Edge case: gateway emitted [3] but never sent the citation event
     for it. We still want the user's copy to look clean: don't add
     a stray `[3]: undefined` line, and leave the literal `[3]` in
     the body. */
  const cites = new Map<number, Citation>([
    [1, mkCitation(1, 't', 'https://example.com/a')],
  ]);
  const out = buildMarkdown('referenced [1] and unknown [3].', cites);
  assert.match(out, /\[1\]: https:\/\/example\.com\/a/);
  assert.ok(!out.includes('[3]: '));
  assert.ok(out.includes('[3]'));
});

test('duplicate markers do not produce duplicate reference rows', () => {
  /* If the answer says "see [1] and again [1]", we still only want
     one `[1]: <url>` row at the bottom. */
  const cites = new Map<number, Citation>([
    [1, mkCitation(1, 't', 'https://example.com/a')],
  ]);
  const out = buildMarkdown('see [1] and again [1].', cites);
  const matches = out.match(/\[1\]: /g) ?? [];
  assert.equal(matches.length, 1);
});
