'use client';

import { useInViewOnce } from '@/lib/analytics/useInView';
import type { UmamiEventName } from '@/lib/analytics/events';

interface InViewTrackerProps {
  eventName: UmamiEventName;
  ratio?: number;
}

/**
 * Zero-noise client wrapper that fires a Umami event the first time
 * the parent section scrolls past `ratio` of viewport height. Drop
 * inside a server-rendered `<section>` to add an inview tracker
 * without converting the section to a client component.
 *
 * Renders a 1×1 px sentinel `<span>`. The element is positioned
 * ``absolute`` so it does **not** participate in flex/grid auto-
 * placement: dropping the tracker into a CSS-grid section (e.g.
 * ``.v2-hero``) would otherwise push the first real grid item into
 * the second cell, collapsing the two-column hero into a stacked
 * layout. Anchored to the top-left of the parent so the observer
 * still sees a real bounding rect tied to the section's position.
 */
export function InViewTracker({ eventName, ratio = 0.3 }: InViewTrackerProps) {
  const ref = useInViewOnce<HTMLSpanElement>(eventName, ratio);
  return (
    <span
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        margin: 0,
        padding: 0,
        pointerEvents: 'none',
        opacity: 0,
      }}
    />
  );
}
