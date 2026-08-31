/**
 * read-the-code-data.ts — entries for the "read the code" strip.
 *
 * Kept as a sister `.ts` (same pattern as beta-notice-data.ts and
 * sponsor-wall-data.ts) so the `node --test` runner can assert on the
 * entries without spinning up a DOM renderer.
 *
 * Adding a surface is a ONE-LINE change to READ_THE_CODE_ENTRIES below.
 * The component maps the array; there is no per-link JSX. A second
 * generated code-map surface is expected, so resist the temptation to
 * inline these back into the component when the list is short.
 */

export type ReadTheCodeEntry = {
  /** Visible label. Lowercase — the strip sits in the mono voice. */
  label: string;
  href: string;
  /** Umami event name. One per entry so the surfaces stay separable. */
  event: string;
};

export const READ_THE_CODE_LABEL = 'read the code';

export const READ_THE_CODE_ENTRIES: readonly ReadTheCodeEntry[] = [
  {
    label: 'github',
    href: 'https://github.com/sipyourdrink-ltd/bernstein',
    event: 'read-the-code-github',
  },
  {
    label: 'ask deepwiki',
    href: 'https://deepwiki.com/sipyourdrink-ltd/bernstein',
    event: 'read-the-code-deepwiki',
  },
  {
    label: 'docs',
    href: 'https://bernstein.readthedocs.io/',
    event: 'read-the-code-docs',
  },
] as const;

/**
 * External links get target/rel; internal paths must not. Derived from
 * the href so a future internal entry needs no extra field.
 */
export function isExternalEntry(entry: ReadTheCodeEntry): boolean {
  return /^https?:\/\//.test(entry.href);
}
