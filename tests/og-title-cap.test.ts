/**
 * Tests for the /api/og ?title= length cap (SEC-2026-05-13).
 *
 * The route is `edge` runtime (uses ImageResponse / satori) so we can't
 * import it in Node test runner. We test the slicing logic directly since
 * it's a pure two-liner that lives in the route.
 *
 * If the route is ever refactored to export a standalone helper, use that
 * instead and remove the inline copy here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Inline copy of the cap logic from app/api/og/route.tsx. */
function capTitle(raw: string | null): string {
  const r = raw ?? '';
  return r.slice(0, 200) || 'Bernstein';
}

test('title under 200 chars is returned unchanged', () => {
  const short = 'Hello world';
  assert.equal(capTitle(short), short);
});

test('title of exactly 200 chars is returned unchanged', () => {
  const exactly200 = 'a'.repeat(200);
  assert.equal(capTitle(exactly200), exactly200);
  assert.equal(capTitle(exactly200).length, 200);
});

test('title over 200 chars is truncated to 200', () => {
  const long = 'a'.repeat(201);
  const result = capTitle(long);
  assert.equal(result.length, 200);
});

test('very long title (1 MB) is truncated to 200', () => {
  const huge = 'x'.repeat(1_000_000);
  const result = capTitle(huge);
  assert.equal(result.length, 200);
});

test('null title falls back to Bernstein', () => {
  assert.equal(capTitle(null), 'Bernstein');
});

test('empty string title falls back to Bernstein', () => {
  assert.equal(capTitle(''), 'Bernstein');
});
