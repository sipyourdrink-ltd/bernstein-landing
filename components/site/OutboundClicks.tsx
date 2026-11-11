'use client';

import { useEffect } from 'react';
import { OUTBOUND_CLICK_EVENT, outboundDestination } from '@/lib/analytics/outbound';

/**
 * Counts clicks on links that leave the site, with the destination host
 * name as the only property. Renders nothing. When the analytics script
 * is absent or blocked, `window.umami` is undefined and nothing is sent.
 */
export function OutboundClicks(): null {
  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const destination = outboundDestination(anchor.href, window.location.hostname);
      if (!destination) return;
      try {
        window.umami?.track(OUTBOUND_CLICK_EVENT, { destination });
      } catch {
        /* a tracker failure must never break navigation */
      }
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);
  return null;
}
