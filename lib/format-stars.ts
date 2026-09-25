/** Shared GitHub star-count formatter, used by the nav button and the
 *  right rail so both surfaces render the same figure. */
export function formatStars(stars: number | null): string {
  return stars === null ? '-' : stars.toLocaleString('en-US');
}
