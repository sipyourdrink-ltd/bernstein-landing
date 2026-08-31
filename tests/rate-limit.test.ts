/**
 * Tests for lib/rate-limit.ts.
 *
 * The limiter is the cheap insurance layer behind /api/ask + /api/rag
 * after we declined to ship Cloudflare Turnstile (recon-2026-05-09).
 * Three guarantees:
 *   1. First N requests inside the window pass; the (N+1)th is denied.
 *   2. Denials do NOT extend the window — once the oldest stamp ages
 *      out, the next call is allowed.
 *   3. Null IP = pass-through (we never deny on missing identity).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRateLimiter } from '../lib/rate-limit.ts';

test('first N requests pass, (N+1)th is denied with retry-after', () => {
  const rl = makeRateLimiter({ limit: 3, windowMs: 60_000 });
  for (let i = 0; i < 3; i += 1) {
    const d = rl.check('1.2.3.4');
    assert.equal(d.allowed, true);
    assert.equal(d.count, i + 1);
  }
  const denied = rl.check('1.2.3.4');
  assert.equal(denied.allowed, false);
  assert.ok(typeof denied.retryAfterSec === 'number' && denied.retryAfterSec > 0);
  assert.equal(denied.limit, 3);
});

test('denials do not consume bucket slots', () => {
  const rl = makeRateLimiter({ limit: 2, windowMs: 60_000 });
  rl.check('a'); // 1
  rl.check('a'); // 2
  /* 5 denials in a row — after the bucket clears we still want 2 fresh
     allowed calls, not 0. If denials counted, the bucket would always
     stay at "full" and a script could pin the user out forever. */
  for (let i = 0; i < 5; i += 1) {
    assert.equal(rl.check('a').allowed, false);
  }
  /* Trick: rebuild the limiter with a tiny window and assert two
     allowed calls. We can't time-travel without manipulating Date —
     this test instead verifies that the bucket does not GROW past the
     limit on denials by reading the count. */
  const d = rl.check('a');
  assert.equal(d.allowed, false);
  assert.equal(d.count, 2);
});

test('different IPs have isolated buckets', () => {
  const rl = makeRateLimiter({ limit: 1, windowMs: 60_000 });
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('a').allowed, false);
  assert.equal(rl.check('b').allowed, true);
  assert.equal(rl.check('b').allowed, false);
});

test('null/undefined IP always passes', () => {
  const rl = makeRateLimiter({ limit: 1, windowMs: 60_000 });
  assert.equal(rl.check(null).allowed, true);
  assert.equal(rl.check(undefined).allowed, true);
  assert.equal(rl.check('').allowed, true);
  /* All three should NOT consume any bucket slot. */
  assert.equal(rl.check(null).allowed, true);
});

test('expired stamps free up the bucket', async () => {
  /* 10ms window so the test runs in milliseconds. Real-world windows
     are an hour but the algorithm is the same. */
  const rl = makeRateLimiter({ limit: 1, windowMs: 10 });
  assert.equal(rl.check('x').allowed, true);
  assert.equal(rl.check('x').allowed, false);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(rl.check('x').allowed, true);
});
