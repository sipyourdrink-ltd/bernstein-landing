'use client';

/**
 * CopyAsMarkdown - single-button "copy answer as markdown" affordance.
 *
 * Bundles the streamed answer + the inline `[n]` markers into
 * reference-style markdown links so a paste into a notes app keeps
 * the citations clickable:
 *
 *   `tasks live in `.sdd/` directories [1]…`
 *   `[1]: https://bernstein.run/blog/state-files`
 *
 * Click handler is small and avoids importing `clipboard-polyfill` -
 * `navigator.clipboard.writeText` is universally available on the
 * browsers this site targets (see ticket success criteria).
 */
import { useCallback, useState } from 'react';
import type { Citation } from './types.ts';
import { buildMarkdown } from './build-markdown.ts';

interface CopyAsMarkdownProps {
  text: string;
  citations: Map<number, Citation>;
}

/* Re-export the pure helper so call sites can import either from
   here or from the dedicated module. The implementation lives in
   `build-markdown.ts`; this is just an alias. */
export { buildMarkdown } from './build-markdown.ts';

export function CopyAsMarkdown({ text, citations }: CopyAsMarkdownProps) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    const md = buildMarkdown(text, citations);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard write can fail on insecure-context tabs; we degrade
         silently - the user can still select the text manually. */
    }
  }, [text, citations]);

  /* Don't render when there's nothing to copy. Avoids a flash of an
     enabled-looking button before the first token. */
  if (text.length === 0) return null;
  return (
    <button
      type="button"
      className="docs-bot-copy-md"
      onClick={onClick}
      data-umami-event="docs-bot-copy-markdown"
      aria-label={copied ? 'copied as markdown' : 'copy answer as markdown'}
    >
      {copied ? 'copied' : 'copy as markdown'}
    </button>
  );
}
