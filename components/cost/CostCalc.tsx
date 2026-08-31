'use client';

/**
 * CostCalc - interactive token-bill calculator for /cost.
 *
 * The reader already knows their monthly model bill. The calculator's
 * only job is to put that number next to a routed one and show the
 * arithmetic: three numeric inputs (claude / codex / cursor monthly
 * spend), one dollar-figure delta, and every step on screen so an
 * engineer can check it instead of trusting it.
 *
 * Voice rules:
 *   - lowercase casual copy
 *   - real numbers, no hype
 *   - "suggests" + a band, never a promise of a single saving figure
 *   - no banned words (delve / leverage / harness / empower / etc.)
 *   - cta lifts copy directly from the operator's profile-bio anchor
 *     ("i was paying $400/month in claude bills") so the visitor who
 *     pays a similar amount recognises themselves
 *
 * No external state libs. Pure useState + useMemo. ARIA-labelled inputs.
 * Mobile responsive via .cost-calc-* utility classes (see ux-cost.css).
 *
 * Tracking: the cta href appends `?metadata_source=token_calc` so github
 * sponsors profile analytics can attribute new sponsors to this surface.
 *
 * Honesty footnote: the saving band is computed from a heuristic
 * (40-80% of tasks routable to a cheaper model that still passes tests).
 * The footnote text says so. The `[?]` tooltip links the visitor to the
 * dated model-prices source table at the bottom of the page so they can
 * audit the inputs themselves.
 *
 * Math + formatters live in `./cost-math.ts` so the test runner
 * (no jsx pipeline) can import them without dragging React in.
 */

import { useEffect, useMemo, useRef, useState, useId } from 'react';
import {
  DEFAULT_CLAUDE,
  DEFAULT_CODEX,
  DEFAULT_CURSOR,
  ROUTABLE_FRACTION_LOW,
  ROUTABLE_FRACTION_HIGH,
  PER_TASK_DISCOUNT,
  computeSavingBand,
  formatUsd,
  formatPct,
  sponsorUrl,
} from './cost-math';
import {
  track,
  UmamiEvent,
  magnitudeBucket,
  savingBandBucket,
} from '@/lib/analytics/events';

/* Re-export so consumers that only import the component file still get
 * the helpers (back-compat for any tooling that scans the .tsx). */
export {
  computeSavingBand,
  formatUsd,
  formatPct,
  sponsorUrl,
  sanitizeNumber,
} from './cost-math';

export function CostCalc() {
  const [claude, setClaude] = useState<number>(DEFAULT_CLAUDE);
  const [codex, setCodex] = useState<number>(DEFAULT_CODEX);
  const [cursor, setCursor] = useState<number>(DEFAULT_CURSOR);

  const band = useMemo(
    () => computeSavingBand(claude, codex, cursor),
    [claude, codex, cursor],
  );

  /* CTA percent - what $25/mo represents as a fraction of the user's
   * total spend. Cap at 999% so the line stays readable when total is
   * tiny (or zero). */
  const sponsorPct = useMemo(() => {
    if (band.totalSpend <= 0) return null;
    const raw = (25 / band.totalSpend) * 100;
    return raw > 999 ? null : Math.round(raw);
  }, [band.totalSpend]);

  const claudeId = useId();
  const codexId = useId();
  const cursorId = useId();

  // Engagement instrumentation - debounced 1s so a number-spinner click
  // doesn't fire 50 events. The bucket helpers (magnitudeBucket /
  // savingBandBucket) keep PII out of the wire by reporting only the
  // coarse range, never the literal dollar amount.
  const inputDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInputBucket = useRef<{ which: string; bucket: string } | null>(null);
  const trackInput = (which: 'claude' | 'codex' | 'cursor', value: number) => {
    if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current);
    inputDebounceRef.current = setTimeout(() => {
      const bucket = magnitudeBucket(value);
      // Skip if the bucket hasn't changed AND it's the same input (the
      // user fiddled within a band - that's not a new engagement signal).
      const last = lastInputBucket.current;
      if (last && last.which === which && last.bucket === bucket) return;
      lastInputBucket.current = { which, bucket };
      track(UmamiEvent.CostInputChange, { input: which, bucket });
    }, 1000);
  };

  const onChange =
    (setter: (v: number) => void, which: 'claude' | 'codex' | 'cursor') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = Number(e.target.value);
      const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      setter(next);
      trackInput(which, next);
    };

  // Fire ``cost-result-shown`` exactly once per page load when the band
  // first resolves to a non-zero saving (i.e. the visitor has put real
  // numbers in). The ref guards against re-fire on subsequent renders.
  const resultShownOnce = useRef(false);
  useEffect(() => {
    if (resultShownOnce.current) return;
    if (band.savingHigh <= 0) return;
    resultShownOnce.current = true;
    track(UmamiEvent.CostResultShown, {
      band: savingBandBucket(band.savingHigh),
    });
  }, [band.savingHigh]);

  return (
    <section className="cost-calc" aria-labelledby="cost-calc-heading">
      <header className="cost-calc-header">
        <p className="v2-kicker">your bill, audited</p>
        <h2 id="cost-calc-heading">
          what <em>cheapest-passing-test routing</em> would shift.
        </h2>
        <p className="cost-calc-lede">
          enter your last month's spend on three of the bills bernstein
          users typically pay. the calculation below uses a documented
          heuristic, hardcoded model prices, and shows every step so you
          can audit it.
        </p>
      </header>

      <div className="cost-calc-grid">
        {/* INPUTS */}
        <fieldset className="cost-calc-inputs">
          <legend>monthly spend (usd)</legend>

          <div className="cost-calc-input">
            <label htmlFor={claudeId}>claude (anthropic api / max plan)</label>
            <div className="cost-calc-input-row">
              <span className="cost-calc-prefix" aria-hidden="true">
                $
              </span>
              <input
                id={claudeId}
                type="number"
                inputMode="decimal"
                min={0}
                max={100000}
                step={10}
                value={claude}
                onChange={onChange(setClaude, 'claude')}
                aria-label="claude monthly spend in usd"
              />
            </div>
          </div>

          <div className="cost-calc-input">
            <label htmlFor={codexId}>codex / openai api</label>
            <div className="cost-calc-input-row">
              <span className="cost-calc-prefix" aria-hidden="true">
                $
              </span>
              <input
                id={codexId}
                type="number"
                inputMode="decimal"
                min={0}
                max={100000}
                step={10}
                value={codex}
                onChange={onChange(setCodex, 'codex')}
                aria-label="codex or openai monthly spend in usd"
              />
            </div>
          </div>

          <div className="cost-calc-input">
            <label htmlFor={cursorId}>cursor</label>
            <div className="cost-calc-input-row">
              <span className="cost-calc-prefix" aria-hidden="true">
                $
              </span>
              <input
                id={cursorId}
                type="number"
                inputMode="decimal"
                min={0}
                max={100000}
                step={10}
                value={cursor}
                onChange={onChange(setCursor, 'cursor')}
                aria-label="cursor monthly spend in usd"
              />
            </div>
          </div>
        </fieldset>

        {/* OUTPUT */}
        <div className="cost-calc-output" aria-live="polite">
          <p className="cost-calc-output-kicker">
            estimated band{' '}
            <a
              href="#model-prices"
              className="cost-calc-tooltip"
              aria-label="see model price table"
              title="see the dated model price table at the bottom of this page"
            >
              [?]
            </a>
          </p>
          <p className="cost-calc-output-figure">
            <span>{formatUsd(band.savingLow)}</span>
            <span className="cost-calc-output-sep">-</span>
            <span>{formatUsd(band.savingHigh)}</span>
            <span className="cost-calc-output-unit"> /mo</span>
          </p>
          <p className="cost-calc-output-meta">
            the calculation suggests bernstein could shift roughly{' '}
            {formatPct(band.fractionLow)}-{formatPct(band.fractionHigh)} of
            your llm spend. your real saving will vary because it depends on
            the test-pass rate of the cheaper models on your specific tasks.
          </p>
        </div>
      </div>

      {/* MATH BREAKDOWN - auditable step by step */}
      <div className="cost-calc-math" aria-label="show the math">
        <h3>show the math</h3>
        <ol>
          <li>
            <span className="cost-calc-math-label">total monthly llm spend</span>
            <span className="cost-calc-math-value">
              {formatUsd(claude)} + {formatUsd(codex)} + {formatUsd(cursor)} ={' '}
              <strong>{formatUsd(band.totalSpend)}</strong>
            </span>
          </li>
          <li>
            <span className="cost-calc-math-label">
              fraction of tasks routable to a cheaper model that still passes
              tests
            </span>
            <span className="cost-calc-math-value">
              {formatPct(ROUTABLE_FRACTION_LOW)}-
              {formatPct(ROUTABLE_FRACTION_HIGH)}{' '}
              <small>(heuristic)</small>
            </span>
          </li>
          <li>
            <span className="cost-calc-math-label">
              cost ratio: cheapest-passing model vs current premium model
            </span>
            <span className="cost-calc-math-value">
              ~{formatPct(1 - PER_TASK_DISCOUNT)} of original{' '}
              <small>(see model-prices table below)</small>
            </span>
          </li>
          <li>
            <span className="cost-calc-math-label">
              saving = total &times; routable% &times; (1 &minus; cost ratio)
            </span>
            <span className="cost-calc-math-value">
              <strong>
                {formatUsd(band.savingLow)}-{formatUsd(band.savingHigh)}
              </strong>{' '}
              /mo
            </span>
          </li>
        </ol>
        <p className="cost-calc-math-footnote">
          the routable% is a heuristic, not a measured number. real saving
          depends on whether the cheaper models pass your project's tests
          on each task. on a repo where tests are flaky or coverage is low,
          routing falls back to the premium model and the band shrinks
          toward zero. on a repo with tight tests and a lot of mechanical
          work, the band shifts higher than {formatPct(ROUTABLE_FRACTION_HIGH)}.
        </p>
      </div>

      {/* CTA - direct lift from the research-anchored example. The X and
          Y are substituted in real time from the inputs. */}
      <div className="cost-calc-cta" aria-label="sponsor cta">
        {band.totalSpend > 0 ? (
          <>
            <p>
              your last month's bill was{' '}
              <strong>{formatUsd(band.totalSpend)}</strong>.
            </p>
            <p>
              sponsoring at $25/mo is{' '}
              {sponsorPct !== null ? (
                <strong>{sponsorPct}%</strong>
              ) : (
                <strong>a small slice</strong>
              )}{' '}
              of {formatUsd(band.totalSpend)}.
            </p>
            <p>bernstein keeps routing the cheapest model that passes tests.</p>
            <p className="cost-calc-cta-link">
              <a
                href={sponsorUrl()}
                rel="noopener"
                data-umami-event="gh-sponsors-click"
                data-umami-event-source="cost-calc"
              >
                &rarr; github.com/sponsors/chernistry
              </a>
            </p>
          </>
        ) : (
          <>
            <p>
              put a number in any field above and this block will show the
              math and a link.
            </p>
            <p className="cost-calc-cta-link">
              <a
                href={sponsorUrl()}
                rel="noopener"
                data-umami-event="gh-sponsors-click"
                data-umami-event-source="cost-calc"
              >
                &rarr; github.com/sponsors/chernistry
              </a>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
