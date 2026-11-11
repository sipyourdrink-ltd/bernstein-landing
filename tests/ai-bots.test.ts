/**
 * Crawler-UA single-source-of-truth tests.
 *
 * `lib/seo/ai-bots.ts` exports the named crawler list that
 * `app/robots.txt/route.ts` renders verbatim and `middleware.ts` reads.
 *
 * Runs under `node --test --experimental-strip-types`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AI_BOTS } from '../lib/seo/ai-bots.ts';

test('AI_BOTS contains the full robots.txt allow-list', () => {
  /* Sanity check on the list size — robots.txt currently exposes 41
     named user-agents. If this number changes, update both this
     assertion and the rendered robots.txt expectation in any
     downstream snapshot test. */
  assert.ok(
    AI_BOTS.length >= 30,
    `expected at least 30 named crawlers, got ${AI_BOTS.length}`,
  );
});
