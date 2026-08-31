/**
 * beta-notice-data.ts — copy + pure helpers for the BetaNotice strip.
 *
 * Kept as a sister `.ts` (same pattern as sponsor-wall-data.ts) so the
 * `node --test` runner can assert on the copy, the dismiss logic and
 * the pre-paint hide script without spinning up a DOM renderer.
 */

/* DOM id the pre-paint hide script looks up. */
export const BETA_NOTICE_ID = 'beta-notice';

/* localStorage key. Value '1' means the visitor dismissed the strip. */
export const BETA_NOTICE_DISMISS_KEY = 'beta-notice:dismissed';

export const CONTRIBUTING_URL =
  'https://github.com/sipyourdrink-ltd/bernstein/blob/main/CONTRIBUTING.md';

export const SPONSORS_PATH = '/sponsors';

/* One line, lowercase voice, split around the two inline links. */
export const BETA_NOTICE_COPY = {
  lead: 'bernstein is beta software, built by one maintainer. if it earns its keep, help with ',
  codeLabel: 'code',
  mid: ' or ',
  sponsorLabel: 'sponsorship',
  tail: '.',
} as const;

/* The full visible sentence, for tests and for aria labelling sanity. */
export function betaNoticeLine(): string {
  const c = BETA_NOTICE_COPY;
  return `${c.lead}${c.codeLabel}${c.mid}${c.sponsorLabel}${c.tail}`;
}

export function isBetaNoticeDismissed(stored: string | null): boolean {
  return stored === '1';
}

/* Inline script rendered right after the strip in the server HTML. It
 * runs during parse — before first paint and before hydration — so a
 * returning visitor who dismissed the strip never sees it flash in,
 * and the page never shifts when it stays hidden. Throw-safe outside
 * a browser: every reference lives inside the try block. React 19
 * leaves the style attribute alone during hydration because the
 * component never renders one itself. */
export const BETA_NOTICE_HIDE_SCRIPT =
  `try{if(localStorage.getItem('${BETA_NOTICE_DISMISS_KEY}')==='1'){` +
  `var n=document.getElementById('${BETA_NOTICE_ID}');` +
  `if(n){n.style.display='none';}}}catch(e){}`;
