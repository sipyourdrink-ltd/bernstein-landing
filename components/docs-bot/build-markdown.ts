/**
 * Pure markdown builder used by CopyAsMarkdown.
 *
 * Bundles the streamed answer + the inline `[n]` markers into
 * reference-style markdown links so a paste into a notes app keeps
 * the citations clickable:
 *
 *   `tasks live in `.sdd/` directories [1]…`
 *   `[1]: https://bernstein.run/blog/state-files`
 *
 * Markers without a matching citation are kept literal in the body
 * but not added to the reference list - the user shouldn't see a
 * stray `[3]: undefined` link.
 *
 * Lives in its own module so the test runner (`node --test
 * --experimental-strip-types`) can import without touching JSX.
 */
import type { Citation } from './types.ts';

export function buildMarkdown(text: string, citations: Map<number, Citation>): string {
  const referenced = new Set<number>();
  const markerRe = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(text)) !== null) {
    const n = Number.parseInt(m[1], 10);
    if (citations.has(n)) referenced.add(n);
  }
  if (referenced.size === 0) return text;
  const sortedNs = [...referenced].sort((a, b) => a - b);
  const links = sortedNs
    .map((n) => {
      const c = citations.get(n)!;
      const url = c.chunkId ? `${c.url}#${c.chunkId}` : c.url;
      return `[${n}]: ${url}`;
    })
    .join('\n');
  return `${text}\n\n${links}\n`;
}
