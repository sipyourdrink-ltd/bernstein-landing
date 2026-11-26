'use client';

import { useEffect } from 'react';
import {
  AI_REFERRAL_EVENT,
  INSTALL_COPY_EVENT,
  aiReferralSource,
  installCopyMethod,
} from '@/lib/analytics/events';
import { OUTBOUND_CLICK_EVENT, outboundDestination } from '@/lib/analytics/outbound';

let aiReferralRecorded = false;

/**
 * Delegated listener for the site's three custom browser events:
 *   1. `ai-referral` (`{ source }`) once per page load when the arrival
 *      referrer or inbound `utm_source` matches the 14-host AI allowlist.
 *   2. `install-snippet-copy` (`{ method }`) on install copy buttons.
 *   3. `outbound-click` (`{ destination }`) on links leaving the site.
 *
 * Renders nothing. Uses no cookies and no browser storage. When the
 * analytics script is absent or blocked, `window.umami` is undefined
 * and nothing is sent.
 */
export function OutboundClicks(): null {
  useEffect(() => {
    let removeLoadListener: (() => void) | undefined;
    if (!aiReferralRecorded) {
      const source = aiReferralSource(document.referrer, window.location.search);
      if (source) {
        const sendReferral = () => {
          if (aiReferralRecorded) return;
          aiReferralRecorded = true;
          try {
            window.umami?.track(AI_REFERRAL_EVENT, { source });
          } catch {
            /* a tracker failure must never break page load */
          }
        };
        if (document.readyState === 'complete') {
          sendReferral();
        } else {
          window.addEventListener('load', sendReferral, { once: true });
          removeLoadListener = () => window.removeEventListener('load', sendReferral);
        }
      } else {
        aiReferralRecorded = true;
      }
    }

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
    return () => {
      removeLoadListener?.();
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, []);
  return null;
}
