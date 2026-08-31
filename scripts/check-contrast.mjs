#!/usr/bin/env node
/* Standalone contrast verifier for the redesign tokens.
 * Converts OKLCH → linear sRGB → relative luminance and computes WCAG ratios.
 * Targets per spec:
 *   --ink       on --bg-paper  ≥ 7.0   (AAA body)
 *   --ink-soft  on --bg-paper  ≥ 4.5   (AA body)
 *   --ink-faint on --bg-paper  ≥ 3.0   (non-text only)
 *   --accent    on --bg-paper  ≥ 4.5   (text)
 */

// OKLab/OKLCH to linear-sRGB → sRGB. Reference: https://bottosson.github.io/posts/oklab/
function oklchToOklab(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function relativeLuminanceFromLinear([r, g, b]) {
  const clamp = (x) => Math.max(0, Math.min(1, x));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function oklchLuminance(L, C, h) {
  const [Lab_L, a, b] = oklchToOklab(L, C, h);
  const linear = oklabToLinearSrgb(Lab_L, a, b);
  return relativeLuminanceFromLinear(linear);
}

function contrast(lumA, lumB) {
  const [L1, L2] = lumA > lumB ? [lumA, lumB] : [lumB, lumA];
  return (L1 + 0.05) / (L2 + 0.05);
}

// Tokens (L as fraction 0–1, C, h in degrees)
const tokens = {
  'bg-paper':  [0.96, 0.015, 75],
  ink:         [0.20, 0.005, 60],
  'ink-soft':  [0.45, 0.005, 60],
  'ink-faint': [0.60, 0.005, 60],
  accent:      [0.55, 0.10, 35],
};

const lum = Object.fromEntries(
  Object.entries(tokens).map(([k, [L, C, h]]) => [k, oklchLuminance(L, C, h)]),
);

const targets = [
  ['ink',       'bg-paper', 7.0, 'AAA body text'],
  ['ink-soft',  'bg-paper', 4.5, 'AA body text'],
  ['ink-faint', 'bg-paper', 3.0, 'non-text / decorative'],
  ['accent',    'bg-paper', 4.5, 'AA text (italic accent)'],
];

let allPass = true;
console.log('Token contrast verification (against --bg-paper)\n');
for (const [fg, bg, target, note] of targets) {
  const ratio = contrast(lum[fg], lum[bg]);
  const pass = ratio >= target;
  if (!pass) allPass = false;
  console.log(
    `  --${fg.padEnd(10)}  ${ratio.toFixed(2).padStart(5)} : 1   ` +
      `target ≥ ${target.toFixed(1)}  ` +
      `[${pass ? 'PASS' : 'FAIL'}]  ${note}`,
  );
}
console.log('\n' + (allPass ? 'All contrast targets met.' : 'Contrast FAILURE — see above.'));
process.exit(allPass ? 0 : 1);
