'use client';

/**
 * AskSummary - feature-flagged dispatch into the new docs-bot panel.
 *
 * Rollout shape (matches RAG-004 ticket):
 *
 *   NEXT_PUBLIC_DOCS_BOT=enabled  → render <DocsBot variant="hero" />
 *   anything else                 → render the legacy BM25 summariser
 *                                   (kept verbatim as AskSummaryLegacy
 *                                   so flipping the flag back is a
 *                                   one-line revert at deploy time).
 *
 * Why a single component name and not two imports at the call site:
 *   /ask/page.tsx already mounts <AskSummary>; switching panels
 *   shouldn't require touching server code. The flag is read at
 *   module-eval time on the client; Next replaces
 *   process.env.NEXT_PUBLIC_* at build time so this is just a
 *   compile-time string compare.
 *
 * Note: the docs-bot panel does NOT need the BM25 hits to mount -
 * it talks to the gateway directly. We accept the same props for
 * call-site compatibility and ignore them in the enabled path.
 */
import { useState } from 'react';
import type { SearchHit } from '@/lib/docs-search/types';
import { DocsBot } from '@/components/docs-bot/DocsBot';

interface AskSummaryProps {
  query: string;
  hits: SearchHit[];
}

/**
 * Render the legacy BM25 summary trigger. The body is a near-verbatim
 * copy of the pre-flag implementation; only the export name changed.
 * Keeping this as a named export means RAG-005 can import it directly
 * for goldset capture without grepping for inlined logic.
 */
export function AskSummaryLegacy({ query, hits }: AskSummaryProps) {
  type Phase =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ready'; summary: string; model: string; citations: number[] }
    | { kind: 'error'; message: string };

  type ApiSuccess = {
    summary: string;
    model: string;
    citations: number[];
  };

  type ApiError = {
    code: 'INVALID_PARAMS' | 'NOT_CONFIGURED' | 'TEMPORARILY_UNAVAILABLE';
    message: string;
  };

  /**
   * Render the summary text with `[n]` markers turned into
   * superscript links to the matching result card.
   */
  const renderSummaryWithCitations = (summary: string): React.ReactNode => {
    const parts = summary.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const m = part.match(/^\[(\d+)\]$/);
      if (!m) return <span key={i}>{part}</span>;
      const n = Number.parseInt(m[1], 10);
      const hit = hits[n - 1];
      if (!hit) return <span key={i}>{part}</span>;
      return (
        <sup key={i} className="ask-summary-cite">
          <a href={`#result-${hit.slug}`} aria-label={`go to result ${n}: ${hit.title}`}>
            [{n}]
          </a>
        </sup>
      );
    });
  };

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  /* The visibility gate is enforced at the call site, but we re-check
     here so the component stays self-correcting if it's reused. */
  if (hits.length === 0 || hits.length > 3) return null;

  const requestSummary = async () => {
    setPhase({ kind: 'loading' });
    try {
      const response = await fetch('/api/ask/summarise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          hits: hits.slice(0, 3).map((h) => ({
            title: h.title,
            excerpt: h.excerpt,
            url: h.url,
          })),
        }),
      });
      const payload = (await response.json()) as ApiSuccess | ApiError;
      if (!response.ok) {
        const error = payload as ApiError;
        setPhase({
          kind: 'error',
          message:
            error.code === 'NOT_CONFIGURED'
              ? 'summary not configured'
              : 'summary not available',
        });
        return;
      }
      const ok = payload as ApiSuccess;
      setPhase({
        kind: 'ready',
        summary: ok.summary,
        model: ok.model,
        citations: ok.citations,
      });
    } catch {
      setPhase({ kind: 'error', message: 'summary not available' });
    }
  };

  if (dismissed) return null;

  if (phase.kind === 'idle') {
    return (
      <div className="ask-summary-shell">
        <button
          type="button"
          className="ask-summary-trigger"
          onClick={requestSummary}
          data-umami-event="ask-summarize"
        >
          summarize these {hits.length} {hits.length === 1 ? 'hit' : 'hits'}
        </button>
        <button
          type="button"
          className="ask-summary-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="dismiss summary trigger"
        >
          dismiss
        </button>
      </div>
    );
  }

  if (phase.kind === 'loading') {
    return (
      <div className="ask-summary-shell ask-summary-shell--loading" aria-live="polite">
        <p className="ask-summary-status">thinking…</p>
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="ask-summary-shell ask-summary-shell--error" aria-live="polite">
        <p className="ask-summary-status">{phase.message}</p>
        <button
          type="button"
          className="ask-summary-retry"
          onClick={requestSummary}
        >
          retry
        </button>
        <button
          type="button"
          className="ask-summary-dismiss"
          onClick={() => setDismissed(true)}
        >
          dismiss
        </button>
      </div>
    );
  }

  /* phase.kind === 'ready' */
  const isDecline = phase.summary === 'no grounded answer.';
  return (
    <aside className="ask-summary-card" aria-live="polite">
      <p className="ask-summary-kicker">summary · grounded in cited hits</p>
      {isDecline ? (
        <p className="ask-summary-decline">
          the hits do not answer this directly. browse the cards below.
        </p>
      ) : (
        <p className="ask-summary-body">
          {renderSummaryWithCitations(phase.summary)}
        </p>
      )}
      <p className="ask-summary-attribution">
        <code>{phase.model}</code>
      </p>
    </aside>
  );
}

/**
 * Public surface. Reads the rollout flag at render time so a single
 * deployable bundle can flip between paths without a code change.
 *
 * The flag is read via `process.env.NEXT_PUBLIC_DOCS_BOT` and Next.js
 * statically replaces it during build; matching `'enabled'` exactly
 * keeps the path opt-in until staging proves it.
 */
export function AskSummary(props: AskSummaryProps) {
  const flag = process.env.NEXT_PUBLIC_DOCS_BOT;
  if (flag === 'enabled') {
    /* New docs-bot panel ignores `props.hits`; it talks to the
       gateway directly. We pass the user's prior query as a prefill
       so they don't lose context when the panel switches paths. */
    return <DocsBot variant="hero" initialQuery={props.query} />;
  }
  return <AskSummaryLegacy {...props} />;
}
