/**
 * Pure data + ordering helpers for SponsorWall.
 *
 * Why a separate `.ts`:
 *   - Test runner is `node --test --experimental-strip-types` and does
 *     not load .tsx (no JSX in the test path). The pattern across this
 *     repo is to put load-bearing logic in a sister .ts module so it
 *     can be unit-tested without React DOM. See sse-reducer.ts +
 *     sse-reducer.test.ts and tokenise-answer.ts + AnswerStream.test.ts
 *     for the convention.
 *
 * What lives here:
 *   - Sponsor + placeholder shapes.
 *   - The ordering rule (recognizability score desc, then login asc).
 *   - The "row filler" that decides how many placeholder cards to add
 *     when the real sponsor count is small (< 5). The cap enforces the
 *     research file's "do not fake the order, do not fake the count"
 *     rule: placeholders are visually distinct from real avatars and
 *     never assert that they are sponsors.
 */

/** Public sponsor record, server-fetched (or hardcoded fallback). */
export interface Sponsor {
  /** GitHub login, lowercase. */
  login: string;
  /** Display name. Falls back to login when the sponsor opted out. */
  name: string;
  /** Absolute avatar URL (githubusercontent or equivalent CDN). */
  avatarUrl: string;
  /** Profile URL. Defaults to https://github.com/<login> when absent. */
  profileUrl: string;
  /**
   * Recognizability score for the order rule. Higher = more
   * recognizable to bernstein's audience. Computed from public
   * signals (follower count, "starred bernstein" boolean, etc.). When
   * unknown, leave at 0 - the alphabetical tiebreak takes over.
   */
  recognizability?: number;
}

/** A placeholder card. No fake login; just a slot. */
export interface SponsorPlaceholder {
  kind: 'placeholder';
  /** Caption rendered in the card body. Voice-correct, lowercase. */
  caption: string;
}

export type WallSlot = (Sponsor & { kind: 'sponsor' }) | SponsorPlaceholder;

/** Visual width target for the sponsor row. The wall renders one of:
 *  - empty state (count 0): a single full-width placeholder card.
 *  - small state (1..MIN_VISIBLE-1): real avatars + N placeholders.
 *  - normal state (>= MIN_VISIBLE): real avatars only.
 *  MIN_VISIBLE is 5 because the research file draws the line at
 *  "compounding levers wait until the first 5-10 sponsors land."
 */
export const MIN_VISIBLE = 5;

/**
 * Order rule: recognizability score descending, then login ascending.
 * Returns a NEW array; the input is left untouched so we don't surprise
 * the caller. The login tiebreak is locale-aware case-insensitive so
 * "AlexC" and "alexc" sort consistently across runtimes.
 */
export function orderSponsors<T extends Sponsor>(input: readonly T[]): T[] {
  return [...input].sort((a, b) => {
    const ra = a.recognizability ?? 0;
    const rb = b.recognizability ?? 0;
    if (ra !== rb) return rb - ra;
    return a.login.localeCompare(b.login, 'en', { sensitivity: 'base' });
  });
}

/**
 * Build the slot list rendered by the wall. When `sponsors` is empty
 * we return a single placeholder; otherwise we order the real ones and
 * top up with placeholders to reach MIN_VISIBLE cells. Placeholders sit
 * AFTER the real avatars so the eye lands on real names first.
 */
export function buildWallSlots(sponsors: readonly Sponsor[]): WallSlot[] {
  if (sponsors.length === 0) {
    return [
      {
        kind: 'placeholder',
        caption: 'first three sponsors get listed by name on the homepage.',
      },
    ];
  }
  const ordered = orderSponsors(sponsors);
  const cells: WallSlot[] = ordered.map((s) => ({ ...s, kind: 'sponsor' }));
  if (cells.length < MIN_VISIBLE) {
    const fillerCount = MIN_VISIBLE - cells.length;
    for (let i = 0; i < fillerCount; i++) {
      cells.push({
        kind: 'placeholder',
        caption: 'open slot. sponsor at $5/mo and your name lands here.',
      });
    }
  }
  return cells;
}

/** Predicate used by the page copy to flip between zero-count and
 *  any-count phrasing. Kept here so the page and the wall agree. */
export function isZeroCount(sponsors: readonly Sponsor[]): boolean {
  return sponsors.length === 0;
}
