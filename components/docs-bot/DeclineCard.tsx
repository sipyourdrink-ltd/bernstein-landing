'use client';

/**
 * DeclineCard - visually-distinct card surfaced when the bot can't
 * ground an answer in the docs index.
 *
 * The decline path *must* be unmistakable in <2s of visual scan.
 * Choices that contribute to that:
 *
 *   1. Different border treatment - dashed muted-bronze instead of
 *      the answer card's solid rule.
 *   2. Different background - paper-3 (more saturated cream) so the
 *      eye registers it as a different surface, not just "the answer
 *      card with different text".
 *   3. Italic display-font kicker reading "no grounded answer." - same
 *      voice as the legacy BM25 summarise endpoint, deliberately
 *      reusing reader vocabulary.
 *   4. Three short bulleted next-steps; numbered lists feel like
 *      "follow these instructions in order", a flat bulleted list
 *      reads as "here are options, pick one".
 */
import { useEffect, useRef, type ReactNode } from 'react';

import type { Citation } from './types.ts';
import { withUtm } from '@/lib/utm';

interface DeclineCardProps {
  /** Optional decline reason from the gateway; rendered if non-empty. */
  reason?: string | null;
  /**
   * Retriever fallback picks from the gateway's `decline-replace`
   * frame (URL-deduped, max 3). Rendered as plain links so the reader
   * has somewhere to go even when the answer couldn't be grounded.
   */
  suggestions?: Citation[];
  /** Slot for any tenant-specific footer content. */
  children?: ReactNode;
}

function trackDecline(reason?: string | null): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { umami?: { track: (n: string, d?: Record<string, unknown>) => void } };
  w.umami?.track('docs-bot-decline', { reason: reason ? reason.slice(0, 80) : 'unknown' });
}

export function DeclineCard({ reason, suggestions, children }: DeclineCardProps) {
  /* Fire the umami event exactly once per mount.
     Previously this used `queueMicrotask(trackDecline)` directly in
     render, which fired on every re-render of the declined phase
     (research-005 brief found this inflated `docs-bot-decline` counts
     above `docs-bot-ask`). React 18 StrictMode also double-invokes
     effects in dev - `firedRef` guards against the second invocation
     so the event fires exactly once per real mount. */
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    trackDecline(reason);
    /* `reason` is intentionally not a dep: we want one fire per mount,
       not one per reason change. The card unmounts/remounts when the
       reducer transitions in/out of `phase === 'declined'`. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <aside className="docs-bot-decline-card" aria-live="polite">
      <p className="docs-bot-decline-kicker">no grounded answer.</p>
      <p className="docs-bot-decline-lead">
        I don&apos;t have docs that answer this.
      </p>
      <ul className="docs-bot-decline-list">
        <li>
          <span className="docs-bot-decline-action">rephrase</span>{' '}
          - try keywords from the docs index.
        </li>
        <li>
          <span className="docs-bot-decline-action">browse</span>{' '}
          - <a href="/blog">blog</a> · <a href="/ask">docs</a>.
        </li>
        <li>
          <span className="docs-bot-decline-action">file</span>{' '}
          -{' '}
          <a
            href={withUtm('https://github.com/sipyourdrink-ltd/bernstein/issues/new', {
              source: 'bernstein.run',
              medium: 'outbound-link',
              campaign: 'docs-bot-decline',
            })}
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="outbound-github"
            data-umami-event-surface="docs-bot-decline"
          >
            open an issue
          </a>{' '}
          and we&apos;ll add it.
        </li>
      </ul>
      {reason ? (
        <p className="docs-bot-decline-reason">
          <span className="docs-bot-decline-reason-label">gateway:</span> {reason}
        </p>
      ) : null}
      {suggestions && suggestions.length > 0 ? (
        /* Fallback picks from the retriever (decline-replace frame).
           Reuses the decline list styling - these are options to
           browse, not instructions to follow. */
        <>
          <p className="docs-bot-decline-lead">closest pages in the index:</p>
          <ul className="docs-bot-decline-list">
            {suggestions.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  data-umami-event="docs-bot-decline-suggestion"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {children}
    </aside>
  );
}
