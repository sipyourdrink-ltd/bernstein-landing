# OG card font

`Geist-Regular.ttf` is the font `app/api/og/route.tsx` renders the social card with.
It is the same file `@vercel/og` ships internally, copied here so the card no longer
depends on a runtime download. Geist is licensed under the SIL Open Font License 1.1
(https://github.com/vercel/geist-font).

If this file is replaced, update the code point ranges in `lib/og-text.ts`;
`tests/og-text.test.ts` fails when they no longer match the font.
