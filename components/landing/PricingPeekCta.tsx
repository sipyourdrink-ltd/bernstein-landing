'use client';

/**
 * PricingPeekCta - sticky pointer from `/` to `/cost`.
 *
 * Mount contract:
 *   - Renders on `/` only. The page-level usage in `app/page.tsx`
 *     handles that - we don't pathname-sniff here so the component
 *     stays SSR-clean.
 *   - Desktop: anchored bottom-right rail (16px gutter). Mobile: full-
 *     width pill anchored bottom, 12px gutter. Both share the same
 *     dismiss + impression contract; the layout flips via CSS media
 *     query, not JS.
 *   - Dismiss persists 7 days via a cookie (`pricing-peek-dismiss`).
 *     localStorage would tie dismissal to a single browser profile;
 *     cookies survive incognito → normal swaps for the same visitor
 *     better.
 *
 * Umami events:
 *   - pricing-peek-impression  (first mount per session, gate via
 *                               sessionStorage so a route bounce in
 *                               and out doesn't inflate count)
 *   - pricing-peek-click       (link click; bubbles before navigation
 *                               via data-umami-event attribute too)
 *   - pricing-peek-dismiss     (X button; sets 7-day cookie)
 *
 * Layout-stability rule:
 *   The component is `position: fixed`. It does not displace any other
 *   flow content, so it cannot push LCP below the fold. The mounting
 *   page reserves no inline space for it on purpose.
 */

import { useEffect, useState } from 'react';
import { track, UmamiEvent } from '@/lib/analytics/events';

const DISMISS_COOKIE = 'pricing-peek-dismiss';
const DISMISS_DAYS = 7;
const IMPRESSION_SESSION_KEY = 'umami:pricing-peek:imp';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string, days: number): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 86400 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function PricingPeekCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    /* Hydration gate: check dismiss cookie post-mount so the SSR
       output never depends on cookie state. The component renders
       nothing on first paint; the slot has no reserved space, so
       there's no CLS surprise when it flips visible. */
    if (readCookie(DISMISS_COOKIE)) return;
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    /* Fire impression exactly once per session per mount. */
    try {
      if (window.sessionStorage?.getItem(IMPRESSION_SESSION_KEY) === '1') return;
      window.sessionStorage?.setItem(IMPRESSION_SESSION_KEY, '1');
    } catch {
      /* private mode / sandbox - fall through; over-count > under-count */
    }
    track(UmamiEvent.PricingPeekImpression, { source: 'home' });
  }, [visible]);

  if (!visible) return null;

  const onDismiss = () => {
    writeCookie(DISMISS_COOKIE, '1', DISMISS_DAYS);
    track(UmamiEvent.PricingPeekDismiss, { source: 'home' });
    setVisible(false);
  };

  return (
    <aside
      className="pricing-peek"
      role="complementary"
      aria-label="what it costs to run"
    >
      <a
        href="/cost"
        className="pricing-peek__link"
        data-umami-event="pricing-peek-click"
        data-umami-event-source="home"
        onClick={() => track(UmamiEvent.PricingPeekClick, { source: 'home' })}
      >
        <span className="pricing-peek__label">what it costs to run</span>
        <span className="pricing-peek__arrow" aria-hidden="true">
          →
        </span>
      </a>
      <button
        type="button"
        className="pricing-peek__close"
        aria-label="dismiss what it costs to run"
        onClick={onDismiss}
      >
        ×
      </button>
    </aside>
  );
}
