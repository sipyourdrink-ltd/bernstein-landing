/**
 * BetaNotice behaviour tests — copy, dismiss logic, pre-paint script.
 *
 * The runner is `node --test --experimental-strip-types`, no jsdom.
 * Per the established pattern (SponsorWall, sse-reducer, CitationChip),
 * the load-bearing logic lives in a sister `.ts`
 * (beta-notice-data.ts); the JSX shell is verified manually with
 * `next dev` / `next build`.
 *
 * Cases covered:
 *   - copy is voice-correct: lowercase, one calm line, no exclamation,
 *     no banned marketing words.
 *   - link targets: /sponsors and the GitHub contributing page.
 *   - isBetaNoticeDismissed treats only the literal '1' as dismissed.
 *   - the pre-paint hide script is throw-safe outside a browser, hides
 *     the strip when the flag is set, and leaves it alone otherwise.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BETA_NOTICE_DISMISS_KEY,
  BETA_NOTICE_HIDE_SCRIPT,
  BETA_NOTICE_ID,
  CONTRIBUTING_URL,
  SPONSORS_PATH,
  betaNoticeLine,
  isBetaNoticeDismissed,
} from '../components/landing/beta-notice-data.ts';

/* -------------------------------------------------------------------- */
/* copy / voice                                                         */
/* -------------------------------------------------------------------- */

test('notice copy is all lowercase (voice rule)', () => {
  const line = betaNoticeLine();
  assert.equal(line, line.toLowerCase());
});

test('notice copy is understated: no exclamation marks', () => {
  assert.ok(!betaNoticeLine().includes('!'));
});

test('notice copy stays a single short line', () => {
  const line = betaNoticeLine();
  assert.ok(line.length <= 140, `too long (${line.length} chars): ${line}`);
  assert.ok(!line.includes('\n'));
});

test('notice copy says beta and mentions the single maintainer', () => {
  const line = betaNoticeLine();
  assert.match(line, /\bbeta\b/);
  assert.match(line, /one maintainer/);
});

test('notice copy avoids banned marketing words', () => {
  const banned = [
    'delve',
    'leverage',
    'empower',
    'seamless',
    'unlock',
    'transform',
    'robust',
    'comprehensive',
    'engagement',
    '10x',
    'roi',
    'thrilled',
    'support us', /* begging register — the strip asks, it never pleads */
  ];
  const lc = betaNoticeLine().toLowerCase();
  for (const word of banned) {
    assert.ok(
      !new RegExp(`\\b${word.replace(/ /g, '\\s+')}\\b`).test(lc),
      `notice copy uses banned word "${word}": ${betaNoticeLine()}`,
    );
  }
});

/* -------------------------------------------------------------------- */
/* link targets                                                         */
/* -------------------------------------------------------------------- */

test('sponsor link points at the on-site sponsors page', () => {
  assert.equal(SPONSORS_PATH, '/sponsors');
});

test('code link points at the bernstein contributing page', () => {
  assert.match(
    CONTRIBUTING_URL,
    /^https:\/\/github\.com\/sipyourdrink-ltd\/bernstein\//,
  );
  assert.match(CONTRIBUTING_URL, /CONTRIBUTING\.md$/);
});

/* -------------------------------------------------------------------- */
/* dismiss logic                                                        */
/* -------------------------------------------------------------------- */

test('isBetaNoticeDismissed: only the literal "1" dismisses', () => {
  assert.equal(isBetaNoticeDismissed('1'), true);
  assert.equal(isBetaNoticeDismissed(null), false);
  assert.equal(isBetaNoticeDismissed(''), false);
  assert.equal(isBetaNoticeDismissed('0'), false);
  assert.equal(isBetaNoticeDismissed('true'), false);
});

/* -------------------------------------------------------------------- */
/* pre-paint hide script                                                */
/* -------------------------------------------------------------------- */

test('hide script embeds the storage key and the element id', () => {
  assert.ok(BETA_NOTICE_HIDE_SCRIPT.includes(BETA_NOTICE_DISMISS_KEY));
  assert.ok(BETA_NOTICE_HIDE_SCRIPT.includes(BETA_NOTICE_ID));
});

test('hide script is throw-safe outside a browser', () => {
  /* No localStorage, no document in node — the try/catch must swallow
     the ReferenceError instead of breaking page parse. */
  assert.doesNotThrow(() => new Function(BETA_NOTICE_HIDE_SCRIPT)());
});

interface StubElement {
  style: { display: string };
}

function runHideScript(stored: string | null): StubElement {
  const el: StubElement = { style: { display: '' } };
  const localStorage = {
    getItem: (key: string) => (key === BETA_NOTICE_DISMISS_KEY ? stored : null),
  };
  const document = {
    getElementById: (id: string) => (id === BETA_NOTICE_ID ? el : null),
  };
  new Function('localStorage', 'document', BETA_NOTICE_HIDE_SCRIPT)(
    localStorage,
    document,
  );
  return el;
}

test('hide script hides the strip when the dismiss flag is set', () => {
  assert.equal(runHideScript('1').style.display, 'none');
});

test('hide script leaves the strip visible when the flag is unset', () => {
  assert.equal(runHideScript(null).style.display, '');
  assert.equal(runHideScript('0').style.display, '');
});
