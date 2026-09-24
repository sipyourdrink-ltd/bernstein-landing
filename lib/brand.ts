// The Bernstein mark as one even-odd path: the rounded hexagon, then the
// `>_` cut-out. Same geometry as public/favicon.svg and, upstream, the
// mask-based master at docs/assets/brand/bernstein-mark.svg in the main
// repository. Flattened to a single path because Satori (the OG renderer)
// draws paths but not <mask>, and an inline path needs no asset fetch.
export const MARK_VIEWBOX = '80 80 640 640';

export const MARK_PATH =
  'M 380.00 165.36 A 50 50 0 0 1 420.00 165.36 L 587.85 262.28 A 50 50 0 0 1 607.85 296.92 ' +
  'L 607.85 503.08 A 50 50 0 0 1 587.85 537.72 L 420.00 634.64 A 50 50 0 0 1 380.00 634.64 ' +
  'L 212.15 537.72 A 50 50 0 0 1 192.15 503.08 L 192.15 296.92 A 50 50 0 0 1 212.15 262.28 Z ' +
  'M 216 290 L 433 400 L 216 510 L 216 450 L 315 400 L 216 350 Z M 453 452 H 583 V 510 H 453 Z';

export const MARK_AMBER = '#F5A524';
