'use client';

/**
 * CostHeadlineAb - 50/50 headline split for /cost.
 *
 * Variant assignment:
 *   - First visit: 50/50 Math.random pick, persisted in
 *     `pricing-variant` cookie (90 days). No server-side randomization
 *     is needed; the cookie is the source of truth for repeat visits.
 *   - Subsequent visits: the cookie wins. Both variants render the
 *     same wrapper, only the H1 copy differs - the rest of the page
 *     (lede, calculator, methodology) is identical between variants.
 *
 * Umami:
 *   - Sets a custom property `pricing-variant=a|b` on every event in
 *     the same session via `window.umami.identify` (lightweight; no
 *     extra wire traffic). Without `identify` the property is missing,
 *     so we also emit `cost-variant-view` once per session to seed the
 *     dimension into the events stream.
 *
 * Control flow:
 *   - Variant A: current headline ("cost").
 *   - Variant B: outcome-framed alternative.
 *   The H1 string is the only difference - anchor links and JSON-LD
 *   stay identical because the page URL doesn't change.
 *
 * SSR contract:
 *   The H1 is rendered client-side after hydration. Server renders an
 *   empty placeholder with the same dimensions so the layout doesn't
 *   shift when the variant resolves. The placeholder height matches
 *   variant B (the longer line) so neither variant pushes content.
 */

import { useEffect, useState } from 'react';
import { track, UmamiEvent } from '@/lib/analytics/events';

type Variant = 'a' | 'b';
const VARIANT_COOKIE = 'pricing-variant';
const VARIANT_DAYS = 90;
const SESSION_KEY = 'umami:cost-variant:seeded';

const HEADLINE: Record<Variant, string> = {
  a: 'cost',
  b: 'pay per task, not per seat',
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string, days: number): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 86400 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function pickVariant(): Variant {
  const existing = readCookie(VARIANT_COOKIE);
  if (existing === 'a' || existing === 'b') return existing;
  const fresh: Variant = Math.random() < 0.5 ? 'a' : 'b';
  writeCookie(VARIANT_COOKIE, fresh, VARIANT_DAYS);
  return fresh;
}

export function CostHeadlineAb() {
  const [variant, setVariant] = useState<Variant | null>(null);

  useEffect(() => {
    const v = pickVariant();
    setVariant(v);
    /* Seed the dimension into Umami via identify so subsequent events
       in this session carry pricing-variant=a|b. If umami.identify is
       not loaded yet, the next ``track`` call still includes the
       variant prop via the seeded event below. */
    try {
      window.umami?.identify?.({ 'pricing-variant': v });
    } catch {
      /* tracker not loaded; skip identify, the seed event still fires */
    }
    /* One-shot seed event so the variant lands in events stream too. */
    try {
      if (window.sessionStorage?.getItem(SESSION_KEY) === '1') return;
      window.sessionStorage?.setItem(SESSION_KEY, '1');
    } catch {
      /* fall through */
    }
    track(UmamiEvent.CostVariantView, { 'pricing-variant': v });
  }, []);

  /* Render placeholder (variant B copy length) until the client picks
     the variant so the layout doesn't shift. */
  return (
    <h1 data-variant={variant ?? 'pending'} className="cost-headline-ab">
      {variant ? HEADLINE[variant] : HEADLINE.b}
    </h1>
  );
}
