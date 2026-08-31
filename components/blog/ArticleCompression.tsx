'use client';

/**
 * ArticleCompression - inline TL;DR component for /blog/[slug].
 *
 * Ported from alex/components/blog/ArticleCompression.tsx with the
 * portfolio class names rewritten to bernstein editorial tokens
 * (blog-compress-*) defined in styles/ux-blog.css.
 *
 * The component is intentionally a single file: a small Root provider
 * + Trigger + Body. The blog post page renders all three siblings; the
 * Trigger sits next to the share buttons in the top chrome, the Body
 * wraps the article prose so it can be visually replaced with the
 * compressed view when the user hits the trigger.
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ArticleSummary, SummaryMode } from '@/lib/blog-summary/types';

type CompressionContextValue = {
  view: 'original' | 'summary';
  activeMode: SummaryMode;
  loadingMode: SummaryMode | null;
  error: string | null;
  retryMode: SummaryMode | null;
  summaries: Partial<Record<SummaryMode, ArticleSummary>>;
  openCompressed: (mode?: SummaryMode) => void;
  restoreOriginal: () => void;
  switchMode: (mode: SummaryMode) => void;
};

const CompressionContext = createContext<CompressionContextValue | null>(null);

function useCompression() {
  const v = useContext(CompressionContext);
  if (!v) {
    throw new Error('ArticleCompression* must be used inside ArticleCompressionRoot');
  }
  return v;
}

export function ArticleCompressionRoot({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<'original' | 'summary'>('original');
  const [activeMode, setActiveMode] = useState<SummaryMode>('quick');
  const [loadingMode, setLoadingMode] = useState<SummaryMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryMode, setRetryMode] = useState<SummaryMode | null>(null);
  const [summaries, setSummaries] = useState<Partial<Record<SummaryMode, ArticleSummary>>>({});
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const fetchSummary = useCallback(
    async (mode: SummaryMode) => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      requestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 24_000);
      setLoadingMode(mode);
      setError(null);
      setRetryMode(null);

      try {
        const response = await fetch('/api/blog/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ slug, mode }),
        });
        /* Cloudflare returns a `text/plain` 504 body (`error code: 504`)
           when the upstream LLM hop exceeds the edge timeout, and a
           `text/html` 5xx page when the origin function crashed. Both
           explode `response.json()` with "Unexpected token '<' ...". Read
           the body once as text, then narrow by content-type. */
        const rawBody = await response.text();
        const contentType = response.headers.get('content-type') ?? '';
        const isJson = contentType.includes('application/json');
        let payload: { ok?: boolean; data?: unknown; error?: { code?: string; message?: string }; message?: string } | null = null;
        if (isJson) {
          try {
            payload = JSON.parse(rawBody);
          } catch {
            /* malformed JSON despite the header - fall through to a
               friendly error message below */
          }
        }
        if (!response.ok || !payload) {
          const upstreamMsg =
            payload?.error?.message ??
            payload?.message ??
            (response.status === 504
              ? 'the upstream model is slow right now; try again in a moment'
              : `summary service responded ${response.status}`);
          throw new Error(upstreamMsg);
        }
        if (requestIdRef.current === requestId) {
          /* The route returns the canonical {ok, data} envelope. The
             component's downstream consumers historically read the
             summary fields off the top level, so unwrap `data` here. */
          const summary = (payload.data ?? payload) as ArticleSummary;
          setSummaries((cur) => ({ ...cur, [mode]: summary }));
          setActiveMode(mode);
          setView('summary');
          setRetryMode(null);
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        if (requestIdRef.current === requestId) {
          setError(e instanceof Error ? e.message : 'summary did not land');
          setRetryMode(mode);
        }
      } finally {
        window.clearTimeout(timeout);
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }
        if (requestIdRef.current === requestId) {
          setLoadingMode(null);
        }
      }
    },
    [slug],
  );

  const openCompressed = useCallback(
    (mode: SummaryMode = 'quick') => {
      if (summaries[mode]) {
        setError(null);
        setRetryMode(null);
        setActiveMode(mode);
        setView('summary');
        return;
      }
      void fetchSummary(mode);
    },
    [fetchSummary, summaries],
  );

  const switchMode = useCallback(
    (mode: SummaryMode) => {
      if (mode === activeMode && summaries[mode]) {
        setError(null);
        setRetryMode(null);
        setView('summary');
        return;
      }
      if (summaries[mode]) {
        setError(null);
        setRetryMode(null);
        setActiveMode(mode);
        setView('summary');
        return;
      }
      void fetchSummary(mode);
    },
    [activeMode, fetchSummary, summaries],
  );

  const restoreOriginal = useCallback(() => {
    requestIdRef.current += 1;
    requestControllerRef.current?.abort();
    setError(null);
    setRetryMode(null);
    setLoadingMode(null);
    setView('original');
  }, []);

  const value = useMemo<CompressionContextValue>(
    () => ({
      view,
      activeMode,
      loadingMode,
      error,
      retryMode,
      summaries,
      openCompressed,
      restoreOriginal,
      switchMode,
    }),
    [activeMode, error, loadingMode, openCompressed, restoreOriginal, retryMode, summaries, switchMode, view],
  );

  return <CompressionContext.Provider value={value}>{children}</CompressionContext.Provider>;
}

export function ArticleCompressionTrigger({ className }: { className?: string }) {
  const { loadingMode, openCompressed, view } = useCompression();
  const isActive = view === 'summary' || Boolean(loadingMode);
  return (
    <button
      type="button"
      className={`blog-compress-trigger${isActive ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => openCompressed('quick')}
      disabled={Boolean(loadingMode)}
      aria-pressed={view === 'summary'}
      aria-label="compress this article"
      data-umami-event="blog-compress-open"
    >
      {/* The button label is one verb - mirrors alex's "compress" choice.
          A bracketed glyph keeps it visually distinct from the share/back
          buttons in the top chrome without needing an icon font. */}
      <span aria-hidden="true">[</span>
      <span>compress</span>
      <span aria-hidden="true">]</span>
    </button>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`blog-compress-pill${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ArticleCompressionBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { view, activeMode, loadingMode, error, retryMode, summaries, restoreOriginal, switchMode } =
    useCompression();
  const currentSummary = summaries[activeMode];
  const isLoadingOriginal = view === 'original' && Boolean(loadingMode);
  const isRefreshingSummary = view === 'summary' && Boolean(loadingMode);
  const retryTarget = retryMode ?? activeMode;
  const retry = () => switchMode(retryTarget);

  if (view === 'summary' && currentSummary) {
    return (
      <section
        className={`blog-compress-card${isRefreshingSummary ? ' is-loading' : ''}`}
        aria-live="polite"
      >
        <div className="blog-compress-toolbar" role="tablist" aria-label="summary modes">
          <PillButton active={activeMode === 'quick'} onClick={() => switchMode('quick')}>
            brief
          </PillButton>
          <PillButton active={activeMode === 'takeaways'} onClick={() => switchMode('takeaways')}>
            takeaways
          </PillButton>
          <PillButton active={activeMode === 'technical'} onClick={() => switchMode('technical')}>
            technical
          </PillButton>
          <PillButton active={false} onClick={restoreOriginal}>
            full article
          </PillButton>
        </div>

        {loadingMode ? (
          <div className="blog-compress-progress" aria-hidden="true">
            <span />
          </div>
        ) : null}

        <p className="blog-compress-kicker">summary</p>
        <h2 className="blog-compress-title">{currentSummary.title}</h2>

        {currentSummary.format === 'paragraphs' ? (
          <div className="blog-compress-paragraphs">
            {currentSummary.items.map((p, i) => (
              <p key={i} className="blog-compress-paragraph">
                {p}
              </p>
            ))}
          </div>
        ) : (
          <ul className="blog-compress-bullets">
            {currentSummary.items.map((item, i) => (
              <li key={i} className="blog-compress-bullet">
                {item}
              </li>
            ))}
          </ul>
        )}

        <div className="blog-compress-why">
          <p className="blog-compress-kicker">why it matters</p>
          <p>{currentSummary.whyItMatters}</p>
        </div>

        <p className="blog-compress-attribution">
          summary by <code>{currentSummary.model}</code>
          {currentSummary.cached ? ' · cached' : ''}
        </p>

        {error ? (
          <div className="blog-compress-error">
            <p>{error}</p>
            <button type="button" onClick={retry} disabled={Boolean(loadingMode)}>
              retry
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className="blog-compress-original-wrap">
      <div className={`${className ?? ''}${isLoadingOriginal ? ' is-compressing' : ''}`}>
        {children}
      </div>

      {isLoadingOriginal ? (
        <div className="blog-compress-loading" aria-live="polite">
          <div className="blog-compress-progress" aria-hidden="true">
            <span />
          </div>
          <p className="blog-compress-kicker">summarising</p>
          <p className="blog-compress-loading-detail">thinking…</p>
        </div>
      ) : null}

      {error ? (
        <div className="blog-compress-error">
          <p>{error}</p>
          <button type="button" onClick={retry} disabled={Boolean(loadingMode)}>
            retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
