'use client';

/**
 * AnswerStream - render the running answer as live markdown, with
 * `[n]` markers swapped to <CitationChip /> chips.
 *
 * Markdown rendering lives in `./AnswerMarkdown.tsx` (react-markdown
 * + remark-gfm + rehype-sanitize + a custom remark plugin that
 * promotes `[n]` text into a synthetic `<docs-bot-cite>` tag).
 *
 * The streaming `▊` cursor and the live-region announcement are
 * the only AnswerStream concerns; the markdown component handles
 * partial-input tolerance natively (an unfinished `**bold` renders
 * as text until the closing `**` arrives, no flicker).
 *
 * Exported as a named component (`AnswerStream`) and made `memo` so
 * the parent's per-token re-render only walks the function body when
 * `text` or `citations` actually change identity.
 */
import { memo } from 'react';
import type { Citation } from './types.ts';
import { AnswerMarkdown } from './AnswerMarkdown.tsx';

interface AnswerStreamProps {
  /** Running concatenation of token deltas. */
  text: string;
  /** Citations keyed by `n`. Missing entries render the marker as plain text. */
  citations: Map<number, Citation>;
  /** Whether the stream is still active. Drives the live-region politeness. */
  streaming?: boolean;
}

/* Re-export the legacy tokeniser so callers that import from
   AnswerStream (e.g. CopyAsMarkdown's own tokeniser test) still get
   the symbol. The tokeniser is no longer used by AnswerStream itself
   - the markdown pipeline subsumes it - but it's covered by tests
   and used by `CopyAsMarkdown`. */
export { tokeniseAnswer } from './tokenise-answer.ts';

export const AnswerStream = memo(function AnswerStream({
  text,
  citations,
  streaming = false,
}: AnswerStreamProps) {
  return (
    <div
      className="docs-bot-answer"
      /* aria-live=polite so SR users hear the answer without being
         interrupted on every token. The streaming flag only affects
         the visual cursor; the live-region announce is identical
         whether streaming or done. */
      aria-live="polite"
      aria-busy={streaming}
    >
      <AnswerMarkdown text={text} citations={citations} />
      {streaming ? (
        <span className="docs-bot-cursor" aria-hidden>
          {'▊'}
        </span>
      ) : null}
    </div>
  );
});
