import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';
import adapterCount from '@/data/adapter-count.json';
import { PROJECT_TAGLINE, PROJECT_ONE_LINER } from '@/lib/project-description';
import { renderableOgText } from '@/lib/og-text';

export const runtime = 'edge';

// The card renders with a font that ships in the repo. Without an explicit
// `fonts` list @vercel/og draws with its built-in font and, for every glyph
// that font lacks (the star below, emoji, non-Latin titles), downloads a
// fallback font from fonts.googleapis.com or an emoji image from jsdelivr
// while the request is being served. That download failed intermittently
// ("Failed to download dynamic font") and made cold renders slow. Bundled
// here, the font is resolved at build time; the promise is memoised for the
// life of the isolate and cleared on failure so one bad read is not cached.
// lib/og-text.ts keeps user-supplied titles inside what this font can draw.
let fontData: Promise<ArrayBuffer> | undefined;
function loadFont(): Promise<ArrayBuffer> {
  fontData ??= fetch(new URL('../../../assets/og/Geist-Regular.ttf', import.meta.url))
    .then((r) => {
      if (!r.ok) throw new Error(`og font: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .catch((e) => {
      fontData = undefined;
      throw e;
    });
  return fontData;
}

// @vercel/og defaults every ImageResponse to
// `public, immutable, no-transform, max-age=31536000`. That is correct
// for a fingerprinted asset and wrong here: /api/og has no version hash,
// the homepage pins og:image at exactly this URL, and the rendered card
// changes with the query string, the template, and the live star count.
// `immutable` told every proxy that honours it never to revalidate for a
// year, so a redesign stayed invisible in downstream caches. An hour in
// the browser and a day at the edge keeps the origin cost near zero while
// letting a redeploy surface within a day. `no-transform` is kept so
// proxies do not recompress the PNG.
//
// The key MUST stay lower-case: @vercel/og spreads `options.headers` over
// its own lower-cased defaults, so `Cache-Control` would add a second
// entry and the Headers constructor would join the two values with a
// comma instead of replacing.
const OG_CACHE_CONTROL =
  'public, no-transform, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';

// Live-fetch GitHub stargazer count once an hour at the edge so the
// OG image badge does not drift. Falls back to a static floor when
// the API is unavailable. revalidate:3600 keeps cost trivial - one
// upstream call per cache region per hour.
async function fetchLiveStats(): Promise<{ stars: number; adapters: number }> {
  const FALLBACK = { stars: 693, adapters: adapterCount.count };
  try {
    const r = await fetch(
      'https://api.github.com/repos/sipyourdrink-ltd/bernstein',
      {
        next: { revalidate: 3600 },
        headers: { 'User-Agent': 'bernstein.run-og/1.0' },
      } as RequestInit,
    );
    if (!r.ok) return FALLBACK;
    const d = (await r.json()) as { stargazers_count?: number };
    const stars =
      typeof d.stargazers_count === 'number' && d.stargazers_count > 0
        ? d.stargazers_count
        : FALLBACK.stars;
    return { stars, adapters: FALLBACK.adapters };
  } catch {
    return FALLBACK;
  }
}

// Round stars DOWN to the nearest 50 / 100 / 500 milestone so the
// badge reads "390+" rather than "394" - looks intentional + ages
// gracefully between deploys.
function formatStarsBadge(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 100) * 100}+`;
  if (n >= 250) return `${Math.floor(n / 50) * 50}+`;
  if (n >= 50) return `${Math.floor(n / 25) * 25}+`;
  return `${n}+`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('title') ?? '';
  const title = renderableOgText(raw.slice(0, 200)) || 'Bernstein';
  const isDefault = !searchParams.get('title');
  const [stats, font] = await Promise.all([fetchLiveStats(), loadFont()]);
  const starsLabel = `${formatStarsBadge(stats.stars)} stars`;
  const adaptersLabel = `${stats.adapters} adapters`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 80px',
          background: '#131316',
          color: '#f0f0f2',
          fontFamily: 'Geist',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle grid pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(110,110,128,0.15) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)',
          }}
        />

        {/* Accent glow */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-80px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(100,100,180,0.12) 0%, transparent 70%)',
          }}
        />

        {/* Top bar with logo and stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Terminal icon */}
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(110,110,180,0.15)',
                border: '1px solid rgba(110,110,180,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                color: '#8888bb',
              }}
            >
              &gt;_
            </div>
            <span style={{ fontSize: 22, color: '#a0a0b0', fontWeight: 500, letterSpacing: '-0.01em' }}>
              bernstein.run
            </span>
          </div>

          {/* Social proof pills */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '20px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 14,
                color: '#c0c0d0',
              }}
            >
              {/* Inline SVG, not a U+2605 glyph: the bundled font has no star. */}
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill="#ffcc00"
                />
              </svg>
              {starsLabel}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '20px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 14,
                color: '#c0c0d0',
              }}
            >
              {adaptersLabel}
            </div>
          </div>
        </div>

        {/* Main title */}
        <div style={{ display: 'flex', flexDirection: 'column', zIndex: 1, flex: 1, justifyContent: 'center' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              fontSize: isDefault ? 56 : 48,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              maxWidth: '900px',
            }}
          >
            {isDefault
              ? PROJECT_TAGLINE
              : title}
          </div>
          {isDefault && (
            <div style={{ display: 'flex', fontSize: 20, color: '#6e6e80', marginTop: 20, maxWidth: '700px', lineHeight: 1.5 }}>
              {PROJECT_ONE_LINER}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                background: '#3a3a5c',
                color: '#e0e0f0',
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              pipx install bernstein
            </div>
          </div>
          <div style={{ fontSize: 14, color: '#6e6e80' }}>
            Open source &middot; Apache 2.0
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Geist', data: font, weight: 400, style: 'normal' }],
      headers: { 'cache-control': OG_CACHE_CONTROL },
    },
  );
}
