/**
 * Pure remark + remark-rehype glue: replace `[N]` text fragments with
 * a synthetic `citation` mdast node (a tree-walker plugin), then map
 * `citation` → `<docs-bot-cite data-n="N">` HAST element via the
 * remark-rehype handlers prop.
 *
 * Why this shape (instead of emitting raw HTML and re-parsing it):
 *   - We avoid pulling in rehype-raw (which carries a full HTML
 *     parser, ~50 kB minified). Our chip slot is a single self-
 *     closing element with one attribute - round-tripping through
 *     parse5 is overkill.
 *   - The components map in react-markdown can render the HAST
 *     element directly because rehype-sanitize allowlists the tag.
 *
 * Extracted from AnswerMarkdown.tsx so the test runner (`node --test
 * --experimental-strip-types`) can import these helpers without
 * loading React or JSX.
 *
 * Bounds: matches `[1]`..`[99]`; longer numeric runs aren't real
 * citation markers in our gateway so we leave them as text.
 *
 * Two source formats are recognised:
 *   - canonical `[N]`            (our gateway's preferred shape)
 *   - OpenAI-style `【N†L1-L7】`  (LLM-native; the dagger + line-range
 *     suffix is optional and ignored)
 * Both collapse to the same `citation` mdast node so the chip lookup
 * is index-only - line-range hints are dropped.
 */
import { visit, SKIP } from 'unist-util-visit';

/* Group 1: canonical `[N]`. Group 2: full-width `【N】` with an
   optional `†...` line-range suffix. We keep them in one alternation
   so a single pass over the text node lights up both flavours. */
const CITE_MARKER_RE = /(?:\[(\d+)\]|【(\d+)(?:†[^】]*)?】)/g;
const MAX_CITE_N = 99;

type CitationMdast = { type: 'citation'; n: number };
type TextMdast = { type: 'text'; value: string };
type Parent = { children: Array<TextMdast | CitationMdast | unknown> };

export function remarkCitations() {
  return (tree: unknown) => {
    visit(tree as never, 'text', (node: unknown, index, parent) => {
      if (!parent || typeof index !== 'number') return;
      const n = node as { value?: unknown };
      const value = typeof n.value === 'string' ? n.value : '';
      /* Cheap rejection: skip text that contains neither marker
         opener. Saves a regex pass on the common no-citation chunk. */
      if (!value || (value.indexOf('[') < 0 && value.indexOf('【') < 0)) return;
      CITE_MARKER_RE.lastIndex = 0;
      const matches: { idx: number; len: number; n: number }[] = [];
      let m: RegExpExecArray | null;
      while ((m = CITE_MARKER_RE.exec(value)) !== null) {
        /* Group 1 is set for `[N]`, group 2 for `【N...】`. Exactly
           one of them carries the digits per the alternation. */
        const num = Number.parseInt(m[1] ?? m[2], 10);
        if (!Number.isInteger(num) || num < 1 || num > MAX_CITE_N) continue;
        matches.push({ idx: m.index, len: m[0].length, n: num });
      }
      if (matches.length === 0) return;
      const out: Array<TextMdast | CitationMdast> = [];
      let cursor = 0;
      for (const mt of matches) {
        if (mt.idx > cursor) {
          out.push({ type: 'text', value: value.slice(cursor, mt.idx) });
        }
        out.push({ type: 'citation', n: mt.n });
        cursor = mt.idx + mt.len;
      }
      if (cursor < value.length) {
        out.push({ type: 'text', value: value.slice(cursor) });
      }
      const p = parent as Parent;
      p.children.splice(index, 1, ...out);
      return [SKIP, index + out.length];
    });
  };
}

/**
 * remark-rehype handler: maps the synthetic `citation` mdast node
 * onto a HAST element that downstream sanitise + the React components
 * map both recognise.
 *
 * Hast properties are camel-cased; `data-n` becomes `dataN` on the
 * properties bag. We carry the marker number as both `dataN` and the
 * raw `data-n` to be defensive against future hast tooling that
 * might preserve raw attribute names.
 */
export const citationRehypeHandlers = {
  citation: (_state: unknown, node: unknown) => {
    const n = (node as { n: number }).n;
    return {
      type: 'element',
      tagName: 'docs-bot-cite',
      properties: { dataN: String(n) },
      children: [],
    };
  },
};
