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
import type { ReactNode } from 'react';

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

export function DeclineCard({ reason, suggestions, children }: DeclineCardProps) {
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
          - <a href="/blog">blog</a> · <a href="https://docs.bernstein.run/">docs</a>.
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
