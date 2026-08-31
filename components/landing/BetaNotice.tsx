'use client';

/**
 * BetaNotice — slim dismissible status strip directly under the hero.
 *
 * Mount contract:
 *   - Server-rendered in flow, visible by default, so it is present at
 *     first paint and never pops in (no CLS on appearance). The CSS
 *     reserves a min-height for the single-line case.
 *   - An inline script rendered right after the strip reads the
 *     localStorage dismiss flag during HTML parse — before first paint
 *     — and hides the strip for returning visitors who dismissed it,
 *     so nothing below shifts on load either.
 *   - The dismiss button writes `beta-notice:dismissed=1` to
 *     localStorage and unmounts the strip. That collapse is
 *     user-initiated, so it does not count toward CLS.
 *   - Motion budget: the only motion is a link-underline colour
 *     transition, disabled under prefers-reduced-motion in
 *     ux-conv.css.
 *
 * Umami: `beta-notice-contribute-click` / `beta-notice-sponsor-click`
 * via data attributes (auto-tracked); no impression event — the strip
 * renders on every un-dismissed page view, so an impression would
 * duplicate the pageview count.
 */

import { useEffect, useState } from 'react';
import {
  BETA_NOTICE_COPY,
  BETA_NOTICE_DISMISS_KEY,
  BETA_NOTICE_HIDE_SCRIPT,
  BETA_NOTICE_ID,
  CONTRIBUTING_URL,
  SPONSORS_PATH,
  isBetaNoticeDismissed,
} from './beta-notice-data';

export function BetaNotice() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    /* Sync React state with the flag the pre-paint script already
       acted on, so a dismissed strip unmounts instead of lingering as
       display:none. No visual change — it is hidden either way. */
    try {
      if (isBetaNoticeDismissed(window.localStorage?.getItem(BETA_NOTICE_DISMISS_KEY) ?? null)) {
        setDismissed(true);
      }
    } catch {
      /* private mode / storage blocked — keep the strip visible */
    }
  }, []);

  if (dismissed) return null;

  const onDismiss = () => {
    try {
      window.localStorage?.setItem(BETA_NOTICE_DISMISS_KEY, '1');
    } catch {
      /* private mode — dismiss lasts this page view only */
    }
    setDismissed(true);
  };

  return (
    <>
      <aside
        id={BETA_NOTICE_ID}
        className="beta-notice"
        role="note"
        aria-label="beta status"
      >
        <p className="beta-notice__text">
          {BETA_NOTICE_COPY.lead}
          <a
            className="beta-notice__link"
            href={CONTRIBUTING_URL}
            rel="noopener noreferrer"
            target="_blank"
            data-umami-event="beta-notice-contribute-click"
          >
            {BETA_NOTICE_COPY.codeLabel}
          </a>
          {BETA_NOTICE_COPY.mid}
          <a
            className="beta-notice__link"
            href={SPONSORS_PATH}
            data-umami-event="beta-notice-sponsor-click"
          >
            {BETA_NOTICE_COPY.sponsorLabel}
          </a>
          {BETA_NOTICE_COPY.tail}
        </p>
        <button
          type="button"
          className="beta-notice__close"
          aria-label="dismiss beta notice"
          onClick={onDismiss}
        >
          ×
        </button>
      </aside>
      {/* Pre-paint dismiss check — see beta-notice-data.ts for why this
          is an inline script and not an effect. Scripts injected via
          innerHTML on client-side navigation do not execute; the
          useEffect above covers that path. */}
      <script
        // eslint-disable-next-line react/no-danger -- hardcoded constant
        // from beta-notice-data.ts; not user input.
        dangerouslySetInnerHTML={{ __html: BETA_NOTICE_HIDE_SCRIPT }}
      />
    </>
  );
}
