'use client';

import { useEffect, useRef } from 'react';

/**
 * Custom-event name dispatched on `window` when the bottom-of-article
 * sentinel intersects. ``ReadingProgress`` listens for this to gate the
 * ``blog-post-read-complete`` analytics event (ANALYTICS-002).
 *
 * Exported so the listener side imports the same string - a typo can't
 * desync the two without TypeScript breaking.
 */
export const READING_COMPLETE_SENTINEL_EVENT = 'reading-complete-sentinel';

/**
 * Bottom-of-article sentinel. Renders as an invisible 1px row that an
 * IntersectionObserver watches so ``ReadingProgress`` can fire
 * ``blog-post-read-complete`` when the reader actually finishes the
 * article body (instead of when they scroll past 95% of the document
 * scroll-height - which includes the footer + related-posts and is
 * tripped before the article body actually ends).
 *
 * Mount immediately after the article body (e.g. at the end of the MDX
 * content / inside the article tag's closing region). One mount per
 * article page; firing once per mount is fine because the sentinel
 * never moves and the IntersectionObserver self-disconnects after the
 * first hit.
 */
export function ReadingComplete() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let fired = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fired) {
          fired = true;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(READING_COMPLETE_SENTINEL_EVENT));
          }
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        height: '1px',
        width: '100%',
        // Keep it visually invisible; this is purely an instrumentation
        // sentinel, not a UX element.
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
