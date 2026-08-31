/**
 * CostCalc behaviour-shape tests.
 *
 * The component itself imports React + uses hooks; our test runner is
 * `node --test --experimental-strip-types` (no jsdom, no React DOM
 * renderer), so we test the pure helpers exported alongside the
 * component. This mirrors the AnswerStream / CitationChip pattern in
 * this codebase: pull the load-bearing math into pure functions, test
 * those, and let Playwright cover the interactive surface separately.
 *
 * What this file pins down:
 *   - `computeSavingBand` produces the expected band at the operator's
 *     anchor inputs (claude=$400, codex=$200, cursor=$0). The band must
 *     fall inside [180, 480] usd.
 *   - `computeSavingBand` does not throw and does not divide-by-zero on
 *     {0, 0, 0} input; it returns zeros for both the band and the
 *     fractions.
 *   - `sponsorUrl()` includes `metadata_source=token_calc` (research
 *     §1.2 falsifier — the calculator is judged by sponsor checkouts
 *     correlated via this query param).
 *   - Negative or NaN inputs are sanitised to zero rather than
 *     producing nonsense.
 *   - The band is monotonically increasing with total spend.
 *
 * Filename note: the runner rejects `.tsx` extensions ("Unknown file
 * extension .tsx") — see the AnswerStream comment for the same
 * convention. Tests import from `cost-math.ts` (pure helpers, no jsx)
 * which CostCalc.tsx also re-exports for component-side callers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSavingBand,
  sanitizeNumber,
  formatUsd,
  formatPct,
  sponsorUrl,
} from '../components/cost/cost-math.ts';

test('default operator inputs (claude=400, codex=200, cursor=0) produce a band inside [180, 480]', () => {
  const band = computeSavingBand(400, 200, 0);
  assert.equal(band.totalSpend, 600);
  /* Lower bound and upper bound both fall inside the spec band. The
     plan says the band must be inside [180, 480] usd. With our
     constants that's
       low  = 600 * 0.4 * 0.75 = 180
       high = 600 * 0.8 * 0.75 = 360
     180 sits exactly on the lower edge and 360 sits inside. */
  assert.ok(band.savingLow >= 180, `savingLow ${band.savingLow} must be ≥ 180`);
  assert.ok(band.savingHigh <= 480, `savingHigh ${band.savingHigh} must be ≤ 480`);
  assert.ok(
    band.savingLow <= band.savingHigh,
    'savingLow must be ≤ savingHigh',
  );
});

test('zero inputs do not divide by zero and return a zero band', () => {
  const band = computeSavingBand(0, 0, 0);
  assert.equal(band.totalSpend, 0);
  assert.equal(band.savingLow, 0);
  assert.equal(band.savingHigh, 0);
  /* Fraction lines must short-circuit to zero, not NaN, when total is 0. */
  assert.equal(band.fractionLow, 0);
  assert.equal(band.fractionHigh, 0);
  /* Confirm no NaN slipped in. */
  assert.ok(Number.isFinite(band.savingLow));
  assert.ok(Number.isFinite(band.savingHigh));
  assert.ok(Number.isFinite(band.fractionLow));
  assert.ok(Number.isFinite(band.fractionHigh));
});

test('negative and NaN inputs are sanitised to zero', () => {
  assert.equal(sanitizeNumber(-50), 0);
  assert.equal(sanitizeNumber(NaN), 0);
  assert.equal(sanitizeNumber(Infinity), 0);
  assert.equal(sanitizeNumber(-Infinity), 0);
  assert.equal(sanitizeNumber(0), 0);
  assert.equal(sanitizeNumber(100), 100);

  /* And computeSavingBand uses sanitizeNumber internally, so negative
     inputs do not skew the total downward. */
  const band = computeSavingBand(-100, 100, 0);
  assert.equal(band.totalSpend, 100);
});

test('sponsor URL includes the metadata_source=token_calc query param', () => {
  const url = sponsorUrl();
  /* Sponsorships arriving from /cost carry this param, so a link that
     drops it makes them indistinguishable from the rest. */
  assert.match(url, /metadata_source=token_calc/);
  assert.match(url, /^https:\/\/github\.com\/sponsors\/chernistry/);
});

test('band scales monotonically with total spend', () => {
  const small = computeSavingBand(100, 0, 0);
  const medium = computeSavingBand(500, 0, 0);
  const large = computeSavingBand(2000, 500, 100);
  assert.ok(small.savingLow < medium.savingLow);
  assert.ok(medium.savingLow < large.savingLow);
  assert.ok(small.savingHigh < medium.savingHigh);
  assert.ok(medium.savingHigh < large.savingHigh);
});

test('formatUsd yields a $-prefixed integer with thousands separators', () => {
  assert.equal(formatUsd(0), '$0');
  assert.equal(formatUsd(123), '$123');
  assert.equal(formatUsd(1234), '$1,234');
  /* Rounded to nearest dollar; no decimals shown. */
  assert.equal(formatUsd(123.4), '$123');
  assert.equal(formatUsd(123.7), '$124');
});

test('formatPct rounds to a whole percent', () => {
  assert.equal(formatPct(0), '0%');
  assert.equal(formatPct(0.5), '50%');
  assert.equal(formatPct(0.123), '12%');
  assert.equal(formatPct(0.999), '100%');
});

test('claude=400 codex=200 cursor=0 default renders a CTA URL with the tracking source', () => {
  /* Sanity check the cta link assembly: the component renders
     `sponsorUrl()` directly, so the assertion mirrors what the rendered
     html would contain. */
  const url = sponsorUrl();
  const band = computeSavingBand(400, 200, 0);
  /* Plan-specified band check: at the default inputs, the calculator
     output is in the band [180-480] for the savings line AND the cta
     URL includes metadata_source=token_calc. Both must hold. */
  assert.ok(band.savingLow >= 180 && band.savingHigh <= 480);
  assert.match(url, /metadata_source=token_calc/);
});
