/**
 * Pure `[n]` marker tokeniser used by AnswerStream.
 *
 * Extracted from AnswerStream.tsx so the test runner (`node --test
 * --experimental-strip-types`) can import the function without
 * touching JSX - node's loader chokes on `.tsx` extensions.
 *
 * Strategy (verbatim from the AnswerStream comment block):
 *   - Walk the text once, copying everything up to a `[`.
 *   - On `[`, look ahead for `]` with digits between. Complete
 *     marker → emit chip. `[` followed by non-digit → emit literal
 *     `[`. Off-the-end with no closing `]` → hold the prefix back
 *     so the half-baked marker doesn't flash.
 *
 * The straddle-tolerance is the load-bearing property; covered by
 * `__tests__/AnswerStream.test.ts`.
 */

export type AnswerSegment =
  | { kind: 'text'; value: string }
  | { kind: 'chip'; n: number };

/**
 * Look-ahead window: how many characters past `[` we'll scan for a
 * `]`. Citations are 1-based with no expected upper bound > 99 in
 * any realistic answer, so 5 chars (`[12345]`) is generous.
 */
const LOOKAHEAD = 5;

export function tokeniseAnswer(text: string): AnswerSegment[] {
  const out: AnswerSegment[] = [];
  let i = 0;
  let buffer = '';

  const flush = () => {
    if (buffer.length > 0) {
      out.push({ kind: 'text', value: buffer });
      buffer = '';
    }
  };

  while (i < text.length) {
    const ch = text[i];
    if (ch !== '[') {
      buffer += ch;
      i += 1;
      continue;
    }
    /* Found '['. Look ahead for ']' with digits in between. */
    let j = i + 1;
    let digits = '';
    let nonDigitInside = false;
    while (j < text.length && j - i <= LOOKAHEAD) {
      const c = text[j];
      if (c === ']') break;
      if (c < '0' || c > '9') {
        nonDigitInside = true;
        break;
      }
      digits += c;
      j += 1;
    }
    if (j < text.length && text[j] === ']' && digits.length > 0) {
      /* Complete `[n]`. Emit chip. */
      flush();
      out.push({ kind: 'chip', n: Number.parseInt(digits, 10) });
      i = j + 1;
      continue;
    }
    if (nonDigitInside) {
      /* '[' was followed by non-digit before ']'. Emit '[' as
         literal text and continue. The non-digit char itself is
         re-evaluated on the next iteration. */
      buffer += '[';
      i += 1;
      continue;
    }
    /* Ran off the end mid-marker. Hold the `[…` tail back as
       pending so a half-rendered marker doesn't flash. We break
       (rather than fall through) so the partial bytes stay
       unrendered until the next token tops them up. */
    break;
  }
  flush();
  return out;
}
