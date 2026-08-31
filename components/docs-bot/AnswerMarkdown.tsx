'use client';

/**
 * AnswerMarkdown - render the bot's running answer as live markdown
 * with inline `[n]` citation chips.
 *
 * Pipeline: react-markdown + remark-gfm + a citation remark plugin
 * + a citation remark-rehype handler + rehype-sanitize, plus a
 * citation slot a plain markdown renderer does not need.
 *
 * Why a custom remark-rehype handler (instead of raw-HTML + rehype-
 * raw): rehype-raw carries a full HTML parser (~50 kB min) that we
 * don't need - our chip slot is a single self-closing element. The
 * handler converts the synthetic mdast `citation` node directly into
 * a HAST `docs-bot-cite` element. The sanitise schema allowlists the
 * tag + `data-n` attribute; the React components map renders it as
 * <CitationChip>.
 *
 * Streaming partial-markdown handling: the regex requires a closing
 * `]`, so an incomplete `[3` mid-stream simply doesn't match - it
 * renders as literal text until the closing bracket arrives, at
 * which point react-markdown's reconciliation swaps in the chip.
 * No special straddle code is needed at this layer.
 *
 * URL safety: the `a` component uses the same allowlist as
 * CitationChip's `safeHref` (http/https/mailto, plus relative).
 * Anything else collapses to `#`.
 *
 * Images are dropped (matches homepage). Code blocks render with the
 * monospace stack from the audit-log terminal tokens.
 */
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Citation } from './types.ts';
import { CitationChip } from './CitationChip.tsx';
import { remarkCitations, citationRehypeHandlers } from './remark-citations.ts';

interface AnswerMarkdownProps {
  /** Running concatenation of token deltas. */
  text: string;
  /** Citations keyed by `n`. Missing entries still render the chip. */
  citations: Map<number, Citation>;
}

/* URL scheme allowlist for markdown links inside the answer body.
   Mirrors CitationChip.safeHref so both rendering paths share the
   same defence-in-depth rules. */
const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set([
  'http:',
  'https:',
  'mailto:',
]);

function isSafeHref(raw: string | null | undefined): string {
  if (!raw) return '#';
  const trimmed = raw.trim();
  if (!trimmed) return '#';
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  const colon = trimmed.indexOf(':');
  if (colon < 0) return trimmed; /* protocol-less; treated as path */
  const scheme = trimmed.slice(0, colon + 1).toLowerCase();
  if (!SAFE_URL_SCHEMES.has(scheme)) return '#';
  return trimmed;
}

/* Extend the GitHub-flavoured default schema so:
   - <a> may carry target=_blank + rel=noopener noreferrer
   - <docs-bot-cite data-n="N"> survives sanitisation as our chip slot
   - href protocols are restricted to web + mailto (no irc/xmpp). */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a || []),
      ['target', '_blank'],
      ['rel', 'noopener noreferrer'],
    ],
    'docs-bot-cite': [['dataN'], 'data-n'],
  },
  tagNames: [...(defaultSchema.tagNames || []), 'docs-bot-cite'],
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
};

/* Bridge synthetic mdast `citation` nodes into HAST `docs-bot-cite`
   elements at the remark→rehype boundary. Defining the handlers as
   a module-level const so identity is stable across renders. */
const remarkRehypeOptions = { handlers: citationRehypeHandlers as never };

/* react-markdown's `components` map keys are lowercase HTML tag
   names; our custom citation tag is `docs-bot-cite`. We disable the
   typing here because `Components` only types known HTML tags - a
   custom element name isn't in `JSX.IntrinsicElements`. */
type AnyComp = (props: Record<string, unknown>) => React.ReactNode;

export const AnswerMarkdown = memo(function AnswerMarkdown({
  text,
  citations,
}: AnswerMarkdownProps) {
  /* The renderer functions reference `citations`. Keep the
     components object inline so the captured map stays current; the
     parent already memoises around `text` + `citations` identity, so
     this rebuild is cheap and not on the hot streaming path. */
  const components: Record<string, AnyComp> = {
    'docs-bot-cite': (props) => {
      const propsAny = props as { node?: { properties?: Record<string, unknown> } };
      /* hast normalises `data-n` to `dataN` on `properties` (camel-
         case). Read both spellings to be defensive - different
         pipeline configs can preserve raw attrs. */
      const raw =
        (propsAny.node?.properties?.dataN as string | number | undefined) ??
        (propsAny.node?.properties?.['data-n'] as string | number | undefined);
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) {
        /* Defensive: shouldn't happen given the regex, but if it
           does, render literal text rather than nothing. */
        return null;
      }
      return <CitationChip n={n} citation={citations.get(n)} />;
    },
    a: (props) => {
      const { href, children, ...rest } = props as {
        href?: string;
        children?: React.ReactNode;
      };
      const safe = isSafeHref(href);
      return (
        <a {...rest} href={safe} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    img: () => null,
    code: (props) => {
      const { className, children, ...rest } = props as {
        className?: string;
        children?: React.ReactNode;
      };
      const isBlock = typeof className === 'string' && className.includes('language-');
      if (isBlock) {
        return (
          <code {...rest} className={className}>
            {children}
          </code>
        );
      }
      return <code {...rest}>{children}</code>;
    },
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkCitations]}
      remarkRehypeOptions={remarkRehypeOptions}
      rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
      components={components as never}
    >
      {text}
    </ReactMarkdown>
  );
});
