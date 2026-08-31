import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // `sans` stays Inter (body). `mono` stays JetBrains Mono.
        // `display` is the editorial serif slot (Instrument Serif when the
        // foundation agent wires `--font-display`; graceful fallback to
        // Iowan Old Style / Georgia if that variable is not yet defined).
        display: ['var(--font-display)', 'Iowan Old Style', 'Palatino', 'Georgia', 'serif'],
        sans: ['var(--font-inter)'],
        mono: ['var(--font-jetbrains)'],
      },
      maxWidth: {
        content: '1080px',
      },
      // ────────────────────────────────────────────────────────────────
      // Typography - semantic ramp
      // Each entry bundles size + lineHeight + letterSpacing (and sometimes
      // fontWeight) as a Tailwind 3-tuple, so `text-display-1` alone already
      // ships its optical defaults. Siblings don't have to remember to pair
      // `leading-*` and `tracking-*` by hand.
      //
      // Scale rationale:
      //   - display ramp uses clamp() against vw so hero + section titles
      //     scale continuously between 375px phones and 1440px desktops.
      //     1.05 / 0.95 line-heights hug the editorial serif. Tight negative
      //     tracking (−0.035em → −0.018em) compensates for serif's natural
      //     looseness at large sizes.
      //   - title/body/ui are fixed rems tuned against Inter's x-height so
      //     body-sm is still readable at 13px and body-lg sits pleasantly
      //     between 16-17px.
      //   - mono ramp runs tabular-nums / uppercase territory (eyebrow, stat,
      //     tag, kbd) - all JetBrains Mono, with letter-spacing that FLIPS
      //     from tight (−0.01em stats) to open (+0.14em eyebrows) by role.
      // ────────────────────────────────────────────────────────────────
      fontSize: {
        // Display (serif) - hero + section titles
        'display-1': ['clamp(3rem, 7vw, 5rem)', { lineHeight: '0.95', letterSpacing: '-0.035em', fontWeight: '400' }],
        'display-2': ['clamp(2rem, 4vw, 3.25rem)', { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '400' }],
        'display-3': ['clamp(1.5rem, 3vw, 2.25rem)', { lineHeight: '1.12', letterSpacing: '-0.018em', fontWeight: '400' }],

        // Title (serif) - card titles, sub-section heads
        'title-1': ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.014em', fontWeight: '400' }],
        'title-2': ['1.125rem', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '400' }],

        // Body (sans) - prose, paragraphs
        'body-lg': ['1.0625rem', { lineHeight: '1.55', letterSpacing: '-0.003em' }],
        'body': ['0.9375rem', { lineHeight: '1.55', letterSpacing: '-0.002em' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.5', letterSpacing: '0' }],

        // UI (sans) - buttons, nav, inline chips, tighter leading for controls
        'ui-lg': ['0.9375rem', { lineHeight: '1.3', letterSpacing: '-0.005em', fontWeight: '500' }],
        'ui': ['0.8125rem', { lineHeight: '1.35', letterSpacing: '-0.003em', fontWeight: '500' }],

        // Mono - uppercase eyebrows, stat digits, kbd chips, tag pills
        'mono-eyebrow': ['0.6875rem', { lineHeight: '1.35', letterSpacing: '0.14em', fontWeight: '500' }],
        'mono-stat': ['0.8125rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '500' }],
        'mono-tag': ['0.6875rem', { lineHeight: '1.3', letterSpacing: '0.02em', fontWeight: '400' }],
        'mono-kbd': ['0.75rem', { lineHeight: '1', letterSpacing: '0.02em', fontWeight: '500' }],
      },
      letterSpacing: {
        // Named letter-spacing tokens. Bigger size → tighter tracking.
        'tighter-1': '-0.035em', // display-1
        'tighter-2': '-0.025em', // display-2
        'tighter-3': '-0.018em', // display-3
        'tighter-4': '-0.012em', // title bands
        'tight-ui': '-0.005em',  // UI controls
        'eyebrow': '0.14em',     // uppercase mono rail
        'tag': '0.02em',         // mono chip / tag
      },
      lineHeight: {
        // Role-based leading presets for ad-hoc composition.
        'display': '0.95',
        'heading': '1.1',
        'title': '1.2',
        'body': '1.55',
        'ui': '1.35',
      },
    },
  },
  plugins: [],
};

export default config;
