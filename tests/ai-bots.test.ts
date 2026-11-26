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

test('AI_BOTS contains the full 2026 robots.txt allow-list with no duplicates', () => {
  assert.ok(
    AI_BOTS.length >= 50,
    `expected at least 50 named crawlers in 2026 allow-list, got ${AI_BOTS.length}`,
  );
  assert.equal(new Set(AI_BOTS).size, AI_BOTS.length, 'AI_BOTS must not contain duplicate tokens');
  for (const bot of AI_BOTS) {
    assert.match(bot, /^\S+$/, `crawler token must be non-empty without whitespace: "${bot}"`);
  }

  for (const required of [
    'GPTBot',
    'OAI-SearchBot',
    'ClaudeBot',
    'Claude-SearchBot',
    'Google-Extended',
    'Google-CloudVertexBot',
    'PerplexityBot',
    'Perplexity-User',
    'Ai2Bot-Dolma',
    'ExaBot',
    'ExaSearchBot',
    'PhindBot',
    'DeepSeekBot',
    'GrokBot',
  ]) {
    assert.ok(AI_BOTS.includes(required), `AI_BOTS must include 2026 crawler "${required}"`);
  }
});
