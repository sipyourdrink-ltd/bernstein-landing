/**
 * Text the /api/og card is allowed to render.
 *
 * The card renderer (@vercel/og / satori) has no opt-out for its dynamic
 * asset loader: any glyph missing from the loaded font makes it fetch a
 * fallback font (fonts.googleapis.com) or an emoji image (jsdelivr) while
 * the request is being served. A cold isolate or a blocked egress path
 * turns that into "Failed to download dynamic font" and a slow or failed
 * card. The card ships its own font (assets/og/Geist-Regular.ttf), so the
 * only way to reach the loader is text the font cannot draw.
 *
 * `renderableOgText` removes those code points, which keeps every render
 * self-contained. The ranges below are the code points the bundled font
 * covers, verified by rendering each one with `fetch` blocked
 * (tests/og-text.test.ts repeats that check on every run, so replacing the
 * font file cannot silently widen the set).
 */

/** Inclusive [first, last] code point ranges covered by the bundled font. */
export const OG_FONT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x7e], // Basic Latin
  [0xa0, 0xac], // Latin-1 Supplement (no soft hyphen at 0xad)
  [0xae, 0x113], // Latin-1 Supplement .. Latin Extended-A
  [0x116, 0x12b],
  [0x12e, 0x137],
  [0x139, 0x13e],
  [0x141, 0x148],
  [0x14a, 0x14d],
  [0x150, 0x17e],
  [0x2013, 0x2014], // en / em dash
  [0x2018, 0x201a], // single quotes
  [0x201c, 0x201e], // double quotes
  [0x2020, 0x2022], // daggers, bullet
  [0x2026, 0x2026], // ellipsis
  [0x2030, 0x2030],
  [0x2032, 0x2033], // primes
  [0x2039, 0x203a], // single angle quotes
  [0x2044, 0x2044],
  [0x20ac, 0x20ac], // euro
  [0x2122, 0x2122], // trade mark
  [0x2190, 0x2193], // arrows
];

function covered(cp: number): boolean {
  return OG_FONT_RANGES.some(([a, b]) => cp >= a && cp <= b);
}

/**
 * Drop every code point the bundled font cannot draw, then collapse the
 * whitespace that removal leaves behind. Returns '' when nothing is left.
 */
export function renderableOgText(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const cp = ch.codePointAt(0) as number;
    out += covered(cp) ? ch : ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}
