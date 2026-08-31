'use client';

/**
 * useInViewOnce - fire a Umami event the first time a section scrolls
 * into view. Per-session (sessionStorage-keyed) so a soft re-render
 * doesn't double-fire and so a refresh during the same browsing session
 * doesn't either.
 *
 * Why a hook + sessionStorage rather than a one-shot useEffect: a
 * funnel "did the visitor reach this section" signal must not depend
 * on mount order. Components remount on hash navigation, theme toggles,
 * and dynamic-import boundaries - any of those would re-fire a naive
 * mount-time event and inflate the inview count above the visit count.
 */

import { useEffect, useRef } from 'react';
import { track, type UmamiEventName } from './events';

export function useInViewOnce<T extends HTMLElement = HTMLElement>(
  eventName: UmamiEventName,
  ratio = 0.3,
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === 'undefined') return;
    if (typeof IntersectionObserver === 'undefined') return;

    const key = `umami:inview:${eventName}`;
    try {
      if (window.sessionStorage?.getItem(key) === '1') return;
    } catch {
      /* sessionStorage can throw in iframe sandboxes / private mode -
         fall through and let the observer fire normally so we never
         lose the signal entirely. */
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= ratio) {
            try {
              window.sessionStorage?.setItem(key, '1');
            } catch {
              /* ignore - duplicate-fire is preferable to missed-fire */
            }
            track(eventName);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: ratio },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [eventName, ratio]);
  return ref;
}
