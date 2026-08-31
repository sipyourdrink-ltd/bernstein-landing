'use client';

/**
 * SponsorNote - one-time banner shown below the bot's answer card on
 * the FIRST `done` of a session.
 *
 * Trigger: DocsBot wires this in after it sees a non-declined `done`
 * event AND localStorage flag SPONSOR_NOTE_KEY isn't set. The flag is
 * written when this component first mounts; dismissing or clicking the
 * sponsor link doesn't change anything (the show is already counted).
 *
 * Voice: lowercase, concrete, vulnerable-not-whining. The dollar
 * figure was removed (issue #30) so personal-finance numbers stay
 * off the public landing; the rest of the framing is the operator's.
 *
 * Telemetry:
 *   sponsor-note-shown   - fires on mount once (the act of being seen)
 *   sponsor-note-click   - fires on the link click
 *   sponsor-note-dismiss - fires on the X button
 *
 * Out of scope:
 *   - showing again on a return visit (we accept "once per browser"
 *     as the price of not nagging)
 *   - cross-tab sync (localStorage is enough; Cypress + worker tests
 *     can clear it explicitly via SponsorNote.RESET_KEY)
 *   - server-side rendering (the component is client-only; mounted
 *     after the bot's `done` so it never runs on the SSR pass)
 */
import { useEffect, useState, type ReactElement } from 'react';

const SPONSOR_NOTE_KEY = 'bernstein:sponsor-note-seen-v1';
const SPONSOR_URL = 'https://github.com/sponsors/chernistry';

function trackUmami(name: string): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    umami?: { track: (n: string) => void };
  };
  w.umami?.track(name);
}

export function SponsorNote(): ReactElement | null {
  const [dismissed, setDismissed] = useState(false);

  /* Mark seen on first mount AND fire the show-event. We do this in an
     effect so it doesn't run during SSR / build-time prerender. */
  useEffect(() => {
    try {
      window.localStorage.setItem(SPONSOR_NOTE_KEY, '1');
    } catch {
      /* private mode / storage disabled - show anyway, just won't
         persist. The dismiss state still works in-session. */
    }
    trackUmami('sponsor-note-shown');
  }, []);

  if (dismissed) return null;

  return (
    <aside
      className="docs-bot-sponsor-note"
      role="complementary"
      aria-label="note from the developer"
    >
      <div className="docs-bot-sponsor-note-divider" aria-hidden>
        <span>note from alex</span>
      </div>
      <p className="docs-bot-sponsor-note-body">
        bernstein is open-source. free for everyone. running it costs
        real money each month (claude max, openrouter, jina, qdrant,
        the ovh box that hosts this). it stays free either way. if
        it's worth more to you than that:{' '}
        <a
          href={SPONSOR_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            trackUmami('sponsor-note-click');
            // Aggregate sponsor-anchor metric (introduced 2026-05-08).
            // Distinct from ``sponsor-note-click`` because the funnel
            // groups by anchor target, not by surface.
            trackUmami('gh-sponsors-click');
          }}
          data-umami-event="sponsor-note-click"
        >
          github.com/sponsors/chernistry →
        </a>
      </p>
      <p className="docs-bot-sponsor-note-sig">- alex</p>
      <button
        type="button"
        className="docs-bot-sponsor-note-x"
        onClick={() => {
          setDismissed(true);
          trackUmami('sponsor-note-dismiss');
        }}
        aria-label="dismiss note"
      >
        ×
      </button>
    </aside>
  );
}

/** Test helper. Clears the localStorage flag so the next mount shows the note. */
export function _resetSponsorNote(): void {
  try {
    window.localStorage.removeItem(SPONSOR_NOTE_KEY);
  } catch {
    /* swallow */
  }
}

/**
 * Read-side helper: returns true iff the visitor has NOT seen the note
 * yet. DocsBot calls this on a `done` event to decide whether to mount
 * the SponsorNote child.
 */
export function shouldShowSponsorNote(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SPONSOR_NOTE_KEY) === null;
  } catch {
    /* on access error we err on the side of NOT spamming. */
    return false;
  }
}
