/**
 * Pure helpers shared by CitationChip and the test runner.
 *
 * Why split out of CitationChip.tsx: the React component pulls in
 * `react` + `react-dom` at module scope, which would force the
 * `node --test --experimental-strip-types` runner to resolve those
 * packages just to unit-test the URL safety logic. Keeping these
 * here means the helpers are testable in isolation; the chip simply
 * imports them.
 *
 * No DOM, no React, no third-party deps.
 */
import type { Citation } from './types.ts';

/* URL scheme allowlist for citation hrefs. The gateway is the only
   thing that should ever supply a citation url, but defense-in-depth:
   if a hostile gateway response (or a poisoned Qdrant payload) ships
   `javascript:` / `data:` / `vbscript:` / `file:` we refuse to render
   it as a clickable href. We accept relative urls (no scheme) and the
   conventional web schemes only. */
const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set([
  'http:', 'https:', 'mailto:',
]);

/**
 * Sanitise an arbitrary string into a value safe to use as an `href`.
 *
 * Returns the input verbatim when it looks like a relative path
 * (`/foo`, `#bar`) or carries an allowed scheme. Returns `'#'` for
 * empty input or any disallowed/unknown scheme.
 *
 * Note: `'#'` is the sentinel for "rejected"; callers that need to
 * distinguish "navigate to top of page" from "this URL was unsafe"
 * should use `chipHrefState` instead, which never returns `'#'`.
 */
export function safeHref(raw: string): string {
  if (!raw) return '#';
  const trimmed = raw.trim();
  /* Whitespace-only inputs trim to '' - fall through to the same
     rejection sentinel as the empty-string branch above. */
  if (!trimmed) return '#';
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  /* The URL constructor throws on relative inputs without a base; we
     only get here when the string looks like it has a scheme.
     Test the scheme explicitly so an attacker can't sneak through
     `  javascript:` (leading whitespace) or capitalised schemes. */
  const colon = trimmed.indexOf(':');
  if (colon < 0) return trimmed; /* protocol-less; treated as path */
  const scheme = trimmed.slice(0, colon + 1).toLowerCase();
  if (!SAFE_URL_SCHEMES.has(scheme)) return '#';
  return trimmed;
}

/**
 * Decide whether a citation has a usable destination URL.
 *
 * Two failure modes the gateway hits in practice:
 *   - the `citation` SSE event is missing entirely for an N that
 *     appears in the answer text (chip renders, no metadata) - the
 *     full-width OpenAI-style markers `【N】` see this most often
 *   - the citation is present but its `url` is empty / whitespace
 *
 * In either case rendering the chip as an `<a href="#">` produces a
 * dead link that drops a stray `#` onto the address bar (and, when
 * the bot lives inside a `<form>`, surfaces the previous `?q=…` from
 * the form submit). The chip should still display the marker number
 * for grounding context - but as a non-interactive `<span>`, not as
 * an anchor that lies about being clickable.
 */
export function chipHrefState(
  citation: Citation | undefined
): { href: string; isLinkable: boolean } {
  if (!citation) return { href: '', isLinkable: false };
  const url = (citation.url ?? '').trim();
  if (!url) return { href: '', isLinkable: false };
  const withChunk = citation.chunkId ? `${url}#${citation.chunkId}` : url;
  const safe = safeHref(withChunk);
  /* `#` alone is the sanitiser's "rejected" sentinel - treat it as
     non-linkable even though the string is non-empty. */
  if (safe === '#' || safe === '') return { href: '', isLinkable: false };
  return { href: safe, isLinkable: true };
}
