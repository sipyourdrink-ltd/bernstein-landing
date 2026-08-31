'use client';

/**
 * Records clicks that leave the site for github.com, pypi.org or the
 * author's own site.
 *
 * One canonical event name and one payload shape, so a click recorded
 * on the way out can be lined up with anything recorded on the way in
 * without reconciling two vocabularies:
 *
 *   event: ``outbound-click``
 *   props: { destination, surface, slug? }
 *
 * We emit this *in addition* to the existing per-host events
 * (``click-author-site-out``, ``click-pypi-out`` etc.) so the historical
 * reports keep working while the new attribution view gets a clean
 * single-event source. ``destination`` is folded to the canonical
 * hostname per CANONICAL_HOSTNAMES so ``www.alexchernysh.com`` and
 * ``alexchernysh.com/blog?utm=…`` aggregate into a single dimension
 * value.
 *
 * No-op rule: every public surface short-circuits when ``window.umami``
 * is undefined. Tracker failure NEVER throws into the user-facing
 * component tree - matches the existing pattern in
 * ``lib/analytics/events.ts::track``.
 *
 * PII: payload is enums + slugs only; no URL strings, no full referrers.
 */

import {
  type AnchorHTMLAttributes,
  type MouseEvent,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import * as React from 'react';

/**
 * Hostnames this project owns. A click to one of these is a move
 * between our own surfaces, not a click that leaves; the two are
 * counted differently, so the list has to be exact.
 */
export const CANONICAL_HOSTNAMES: readonly string[] = [
  'alexchernysh.com',
  'bernstein.run',
  'getbernstein.com',
  'github.com',
  'pypi.org',
] as const;

const CANONICAL_SET = new Set<string>(CANONICAL_HOSTNAMES.map((h) => h.toLowerCase()));

function hostOf(href: string): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, 'https://bernstein.run');
  } catch {
    return null;
  }
  return url.hostname.replace(/^www\./i, '').toLowerCase();
}

/**
 * Resolve a raw href to its canonical owned-property hostname, or null
 * when the link doesn't target an owned cross-property surface. The
 * dashboard treats null-resolves as ``other`` and excludes them from
 * the owned-funnel view.
 */
export function canonicalDestination(href: string | null | undefined): string | null {
  if (!href) return null;
  const host = hostOf(href);
  if (!host) return null;
  return CANONICAL_SET.has(host) ? host : null;
}

/**
 * Closed enum of allowed surface labels. Adding a new value requires
 * an explicit edit here so a typo can't ship as a new dimension value
 * silently.
 */
export type OutboundSurface =
  | 'site-footer'
  | 'site-nav'
  | 'hero'
  | 'blog-body'
  | 'blog-card'
  | 'docs-body'
  | 'why-bernstein'
  | 'sponsors'
  | 'cost'
  | 'other';

interface TrackOutboundPayload {
  destination: string;
  surface: OutboundSurface;
  slug?: string;
}

function isUmamiDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem('umami:disabled') === 'true';
  } catch {
    return false;
  }
}

/**
 * Programmatic emit. Pass either a full URL or the bare canonical
 * hostname (``OutboundLink`` pre-resolves to the canonical form before
 * calling). Returns void; never throws.
 */
export function trackOutbound(
  destination: string,
  surface: OutboundSurface,
  slug?: string,
): void {
  if (typeof window === 'undefined') return;
  if (isUmamiDisabled()) return;
  const lc = destination.trim().toLowerCase();
  const canon = CANONICAL_SET.has(lc) ? lc : (canonicalDestination(destination) ?? destination);
  const payload: TrackOutboundPayload = { destination: canon, surface };
  if (slug) payload.slug = slug;
  try {
    window.umami?.track('outbound-click', payload as unknown as Record<string, string>);
  } catch {
    /* tracker not loaded / blocked / extension noise - never throw. */
  }
  /* gh-star-confirmed plumbing (EVENT_TAXONOMY 2026-05-17 row #5):
     when the outbound destination is github.com, stamp a short-lived
     cookie carrying the originating surface. RightRail's mount-time
     helper reads this cookie on the next page load and, if
     document.referrer is github.com, emits ``gh-star-confirmed`` with
     the original surface as the ``source`` prop. Cookie TTL is 2
     minutes - long enough for a real round-trip (star, optional
     scroll-around) without leaving a stale flag for hours of session
     drift. Path=/ so any return landing surface (/, /sponsors, a blog
     post that linked out) sees it. SameSite=Lax keeps it attached on
     top-level return navigation but excluded from third-party
     requests. Heuristic only - true star confirmation requires the
     GH webhook bridge tracked in EVENT_TAXONOMY §4 row 5. */
  if (canon === 'github.com' && typeof document !== 'undefined') {
    try {
      const value = encodeURIComponent(`${surface}${slug ? `-${slug}` : ''}`);
      document.cookie = `bernstein:gh-pending=${value}; Path=/; Max-Age=120; SameSite=Lax`;
    } catch {
      /* document.cookie can throw in some sandboxed contexts -
         cookie set is best-effort by design. */
    }
  }
}

/**
 * Drop-in <a> wrapper that fires the bridge event on click. If the href
 * resolves to an owned hostname, the click fires ``outbound-click``;
 * otherwise the wrapper is transparent.
 */
export interface OutboundLinkProps
  extends PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement>> {
  href: string;
  surface: OutboundSurface;
  slug?: string;
}

export function OutboundLink({
  href,
  surface,
  slug,
  children,
  onClick,
  target,
  rel,
  ...rest
}: OutboundLinkProps): ReactElement {
  const canon = canonicalDestination(href);
  const isExternal = href.startsWith('http://') || href.startsWith('https://');

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (canon) trackOutbound(canon, surface, slug);
    onClick?.(e);
  };

  return React.createElement(
    'a',
    {
      href,
      onClick: handleClick,
      target: target ?? (isExternal ? '_blank' : undefined),
      rel: rel ?? (isExternal ? 'noopener noreferrer' : undefined),
      ...rest,
    },
    children,
  );
}
