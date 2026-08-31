/**
 * Crawler-UA single-source-of-truth tests.
 *
 * `lib/seo/ai-bots.ts` exports the named crawler list that
 * `app/robots.txt/route.ts` renders verbatim and that
 * `lib/analytics/bot-filter.ts` compiles into the case-insensitive
 * regex consulted by the analytics emitter. This test asserts the
 * regex actually matches every entry in the shared list (so the
 * two sites cannot silently drift again) and still classifies real
 * browser UAs as `human`.
 *
 * Runs under `node --test --experimental-strip-types`. We import the
 * regex source directly rather than going through `events.ts`, which
 * has an extensionless local import that the strip-types harness
 * cannot resolve.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AI_BOTS } from '../lib/seo/ai-bots.ts';
import { isLikelyBot, __resetForTesting, __markInputForTesting } from '../lib/analytics/bot-filter.ts';

interface NavigatorStub {
  userAgent: string;
  webdriver: boolean;
}

interface WindowStub {
  addEventListener: () => void;
  removeEventListener: () => void;
}

function setUa(ua: string): void {
  const nav: NavigatorStub = { userAgent: ua, webdriver: false };
  const win: WindowStub = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  /* `globalThis.navigator` is a read-only accessor in modern Node, so
     a plain assignment throws. `defineProperty` replaces the descriptor
     wholesale, which is what the bot-filter consults at call time. */
  Object.defineProperty(globalThis, 'navigator', {
    value: nav,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: win,
    configurable: true,
    writable: true,
  });
}

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

test('bot-filter regex matches every AI_BOTS entry', () => {
  __resetForTesting();
  /* Mark input as observed so the bot-filter does not return
     `suspected` on the zero-input heuristic — we want to isolate the
     UA-match path. */
  __markInputForTesting();

  for (const bot of AI_BOTS) {
    /* Wrap the bare token in a plausible UA framing so the regex sees
       the same shape it would on a real crawler request. */
    const ua = `Mozilla/5.0 (compatible; ${bot}/1.0; +https://example.com/bot)`;
    setUa(ua);
    const verdict = isLikelyBot();
    assert.equal(
      verdict,
      'bot',
      `expected '${bot}' UA to classify as bot, got '${verdict}'`,
    );
  }
});

test('real Chrome 122 UA classifies as human', () => {
  __resetForTesting();
  __markInputForTesting();
  /* Stable Chrome 122 desktop UA string — a representative real-human
     desktop UA. */
  const chromeUa =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  setUa(chromeUa);
  assert.equal(isLikelyBot(), 'human');
});

test('real Firefox UA classifies as human', () => {
  __resetForTesting();
  __markInputForTesting();
  const firefoxUa =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0';
  setUa(firefoxUa);
  assert.equal(isLikelyBot(), 'human');
});
