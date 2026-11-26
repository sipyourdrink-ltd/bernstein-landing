'use client';

import { useEffect } from 'react';
import { INSTALL_COPY_EVENT, installCopyMethod } from '@/lib/analytics/events';
import { OUTBOUND_CLICK_EVENT, outboundDestination } from '@/lib/analytics/outbound';

/**
 * Delegated click listener for the site's two custom browser events:
 *   1. `install-snippet-copy` (`{ method }`) on install copy buttons.
 *   2. `outbound-click` (`{ destination }`) on links leaving the site.
 *
 * Renders nothing. When the analytics script is absent or blocked,
 * `window.umami` is undefined and nothing is sent.
 */
export function OutboundClicks(): null {
  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const copyButton = target.closest('button');
      if (copyButton) {
        const method = installCopyMethod(copyButton);
        if (method) {
          try {
            window.umami?.track(INSTALL_COPY_EVENT, { method });
          } catch {
            /* a tracker failure must never break clipboard copy */
          }
          return;
        }
      }
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
