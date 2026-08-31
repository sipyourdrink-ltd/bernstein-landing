'use client';

import { useEffect, useRef, useState } from 'react';

import { READING_COMPLETE_SENTINEL_EVENT } from './ReadingComplete';

/**
 * Fire a single Umami custom event.
 *
 * Guarded for SSR + missing tracker (script blocked / cookieless reader);
 * returns silently on either, so a tracker outage never throws.
 */
function trackUmami(name: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    umami?: { track: (n: string, d?: Record<string, unknown>) => void };
  };
  try {
    w.umami?.track(name, data);
  } catch {
    /* tracker blocked / extension-stripped - never throw */
  }
}

export interface ReadingProgressProps {
  /** Article word count, used to compute the article-aware dwell floor
   *  per ANALYTICS-002 §5:
   *    max(45s, words / 250 wpm * 0.6 * 60s)
   *  When omitted (e.g. on /, /why-bernstein where the prop wasn't
   *  threaded through yet), we fall back to a flat 60s - same as the
   *  pre-recon behaviour, so an un-updated call site doesn't lose
   *  read-complete tracking. */
  wordCount?: number;
}

/**
 * Top-of-page horizontal reading-progress bar plus the analytics emitter
 * for scroll-50 / scroll-90 / blog-post-read-complete + the catch-all
 * external-link-click delegate.
 *
 * ANALYTICS-002 changes (2026-05-09):
 *   - read-complete fires on the <ReadingComplete /> sentinel intersect
 *     (article-body bottom) AND a dwell ≥
 *     max(45s, words/250 * 0.6 * 60s) - instead of the older "scroll ≥
 *     95% of document AND dwell ≥ 60s" rule, which was tripped before
 *     the article body actually ended on this site (footer + related-
 *     posts push the document-bottom past 95%).
 *   - new payload fields: ``reached_via`` (sentinel | scroll-fallback)
 *     + ``max_scroll_pct`` (the deepest scroll percentage of the article
 *     during the mount - useful for cross-checking the sentinel against
 *     scroll depth).
 *   - scroll-fallback path retained so a degenerate page without the
 *     sentinel (e.g. landing surface that doesn't render <ReadingComplete>)
 *     can still fire on scroll ≥ 95%.
 */
export function ReadingProgress({ wordCount }: ReadingProgressProps = {}) {
  const [progress, setProgress] = useState(0);

  /* Fire-once flags + sentinel state + max-scroll snapshot. Refs (not
     state) so re-renders don't re-trigger; stay in sync with the
     analytics funnel name set. */
  const fired50 = useRef(false);
  const fired90 = useRef(false);
  const firedComplete = useRef(false);
  const sentinelHit = useRef(false);
  const maxScrollPct = useRef(0);
  const mountedAt = useRef<number>(typeof window !== 'undefined' ? Date.now() : 0);

  useEffect(() => {
    /* Article-aware dwell floor (ANALYTICS-002 recon §5). */
    const dwellFloorSeconds =
      typeof wordCount === 'number' && wordCount > 0
        ? Math.max(45, (wordCount / 250) * 0.6 * 60)
        : 60;

    const tryFireReadComplete = (reachedVia: 'sentinel' | 'scroll-fallback') => {
      if (firedComplete.current) return;
      const dwellSeconds = (Date.now() - mountedAt.current) / 1000;
      if (dwellSeconds < dwellFloorSeconds) return;
      firedComplete.current = true;
      trackUmami('blog-post-read-complete', {
        path: window.location.pathname,
        dwell_seconds: Math.round(dwellSeconds),
        reached_via: reachedVia,
        max_scroll_pct: Math.round(maxScrollPct.current),
      });
    };

    let frame = 0;
    const update = () => {
      frame = 0;
      const scrollTop = window.scrollY;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const pct = total > 0 ? Math.min(1, Math.max(0, scrollTop / total)) : 0;
      setProgress(pct);
      const pctInt = pct * 100;
      if (pctInt > maxScrollPct.current) {
        maxScrollPct.current = pctInt;
      }

      const path =
        typeof window !== 'undefined' ? window.location.pathname : '/';
      if (!fired50.current && pct >= 0.5) {
        fired50.current = true;
        trackUmami('scroll-50pct', { path });
      }
      if (!fired90.current && pct >= 0.9) {
        fired90.current = true;
        trackUmami('scroll-90pct', { path });
      }
      /* Scroll-fallback path: if the sentinel didn't render (or the
         reader genuinely scrolled to the document bottom past it), the
         old 95% scroll trigger still fires read-complete - gated by the
         new article-aware dwell floor. */
      if (!firedComplete.current && pct >= 0.95) {
        tryFireReadComplete('scroll-fallback');
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    /* Sentinel-driven path: <ReadingComplete /> dispatches
       READING_COMPLETE_SENTINEL_EVENT when its IntersectionObserver
       fires. We track the hit so a slow-scroller who passes the
       sentinel before the dwell gate can still fire when the gate
       finally elapses; a 5s recheck timer covers the no-scroll-after-
       sentinel case (reader stops scrolling but hangs around reading). */
    const onSentinelHit = () => {
      sentinelHit.current = true;
      tryFireReadComplete('sentinel');
    };

    const recheckTimer = setInterval(() => {
      if (sentinelHit.current && !firedComplete.current) {
        tryFireReadComplete('sentinel');
      }
    }, 5_000);

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener(
      READING_COMPLETE_SENTINEL_EVENT,
      onSentinelHit as EventListener,
    );

    /* Outbound-link delegation. We fire `external-link-click` for any
       anchor that points to a different host (so MDX-authored references
       are tracked without each one needing a hand-tagged event). The
       handler is mounted document-wide to cover footnotes + author bio +
       any future nav element; same-origin anchors are ignored so internal
       routing stays out of the event stream. */
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href || href.startsWith('#')) return;
      let host = '';
      try {
        host = new URL(href, window.location.href).host;
      } catch {
        return;
      }
      if (!host || host === window.location.host) return;
      /* Skip if the anchor already has a per-link Umami tag so we don't
         double-count canonical events (github-click, click-pypi-out etc).
         The inverse is fine: we want the catch-all to fire on un-tagged
         MDX anchors only. */
      if (anchor.hasAttribute('data-umami-event')) return;
      trackUmami('external-link-click', {
        href,
        host,
        path: window.location.pathname,
      });
    };
    document.addEventListener('click', onClick, { capture: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener(
        READING_COMPLETE_SENTINEL_EVENT,
        onSentinelHit as EventListener,
      );
      document.removeEventListener('click', onClick, { capture: true });
      clearInterval(recheckTimer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [wordCount]);

  return (
    <div
      className="reading-progress"
      aria-hidden="true"
      role="presentation"
    >
      <div
        className="reading-progress-bar"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
