/**
 * Pure math + formatters for the /cost token-bill calculator.
 *
 * This module has no React dependency, so the test runner
 * (`node --test --experimental-strip-types`) can import it without a
 * jsx pipeline. The component file (CostCalc.tsx) re-exports these
 * helpers for convenience callers; tests should import them from here.
 *
 * Heuristic constants are exported so a future evidence-grade
 * recalibration can update them in one place. Voice rule: this file
 * carries the load-bearing numbers, not marketing copy.
 *
 * Calibration of the saving band:
 *   - ROUTABLE_FRACTION_LOW  = 0.4 - lower bound of "tasks routable
 *     to a cheaper model that still passes tests" in steady state.
 *   - ROUTABLE_FRACTION_HIGH = 0.8 - upper bound of same.
 *   - PER_TASK_DISCOUNT      = 0.75 - saving on the routable tasks
 *     when the cheaper model is one of gemini 2.5 flash-lite ($0.10/m
 *     input) / gpt-5.4-nano ($0.20/m input) / claude haiku 4.5 ($1/m
 *     input) against premium claude opus 4.7 ($5/m input). the 75%
 *     figure is the band-weighted blend across task types; on pure
 *     mechanical tasks the cheaper model can save 95%+ on input. see
 *     the /cost page model-prices table for the per-million-token
 *     ratios that back this number.
 *
 * Saving band formula:
 *   total = sanitizeNumber(claude) + sanitizeNumber(codex) + sanitizeNumber(cursor)
 *   savingLow  = total * ROUTABLE_FRACTION_LOW  * PER_TASK_DISCOUNT
 *   savingHigh = total * ROUTABLE_FRACTION_HIGH * PER_TASK_DISCOUNT
 *   fractionX  = total > 0 ? savingX / total : 0   // short-circuits div-by-zero
 *
 * These are heuristics and bands, and the UI has to say so: it reads
 * "suggests" and "varies", and never promises a single number.
 */

/* Anchor amount from the operator's profile bio
 * ("i was paying $400/month in claude bills"). */
export const DEFAULT_CLAUDE = 400;
export const DEFAULT_CODEX = 200;
export const DEFAULT_CURSOR = 0;

export const ROUTABLE_FRACTION_LOW = 0.4;
export const ROUTABLE_FRACTION_HIGH = 0.8;
export const PER_TASK_DISCOUNT = 0.75;

/* Github sponsors profile + source tag. `metadata_source=token_calc`
 * marks a sponsorship that started on /cost. */
export const SPONSOR_BASE_URL = 'https://github.com/sponsors/chernistry';

export interface SavingBand {
  /** Total monthly LLM spend across the three inputs, in USD. */
  totalSpend: number;
  /** Lower-bound saving estimate, in USD. */
  savingLow: number;
  /** Upper-bound saving estimate, in USD. */
  savingHigh: number;
  /** Lower-bound saving as a fraction of total spend, 0..1. */
  fractionLow: number;
  /** Upper-bound saving as a fraction of total spend, 0..1. */
  fractionHigh: number;
}

export function computeSavingBand(
  claude: number,
  codex: number,
  cursor: number,
): SavingBand {
  const total =
    sanitizeNumber(claude) + sanitizeNumber(codex) + sanitizeNumber(cursor);
  const savingLow = total * ROUTABLE_FRACTION_LOW * PER_TASK_DISCOUNT;
  const savingHigh = total * ROUTABLE_FRACTION_HIGH * PER_TASK_DISCOUNT;
  const fractionLow = total > 0 ? savingLow / total : 0;
  const fractionHigh = total > 0 ? savingHigh / total : 0;
  return { totalSpend: total, savingLow, savingHigh, fractionLow, fractionHigh };
}

/** Coerce raw input value to a non-negative finite number. */
export function sanitizeNumber(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Format a USD figure as `$1,234`. No decimals - keeps the math line
 * scannable. */
export function formatUsd(n: number): string {
  const rounded = Math.round(n);
  return `$${rounded.toLocaleString('en-US')}`;
}

/** Format a 0..1 fraction as a percent like "12%". */
export function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Compose the github sponsors URL with the tracking metadata_source
 * appended. Used in the cta and asserted in the test. */
export function sponsorUrl(): string {
  return `${SPONSOR_BASE_URL}?metadata_source=token_calc`;
}
