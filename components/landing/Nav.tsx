'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { trackOutbound } from '@/components/site/track-outbound';
import { track, UmamiEvent, emitFunnelStep } from '@/lib/analytics/events';
import { withUtm } from '@/lib/utm';

/* Section ids the redesigned homepage renders for scroll-spy. Compare moved
   to the /compare route and the under-the-hood section was removed in the
   2026-05-21 redesign, so "how" is the only remaining on-page anchor. */
const SECTION_IDS = ['how'] as const;

function formatStars(stars: number): string {
  if (stars >= 1000) {
    const k = stars / 1000;
    const fixed = k.toFixed(1);
    return `${fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed}k`;
  }
  return String(stars);
}

export function Nav() {
  const [active, setActive] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const pathname = usePathname();
  const isHome = pathname === '/';

  const sectionHref = (id: string) => (isHome ? `#${id}` : `/#${id}`);

  /* Scroll spy via IntersectionObserver */
  useEffect(() => {
    const entries = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (observed) => {
        for (const entry of observed) {
          entries.set(entry.target.id, entry.isIntersecting);
        }
        for (const id of SECTION_IDS) {
          if (entries.get(id)) {
            setActive(id);
            return;
          }
        }
      },
      { rootMargin: '-64px 0px -40% 0px', threshold: 0 },
    );
    for (const id of SECTION_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  /* Nav background transition on scroll */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Fetch GitHub star count */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.stars === 'number' && data.stars > 0) setStars(data.stars);
      })
      .catch(() => {
        /* silent - leave button unchanged */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <a href="#main" className="skip-to-content">
        Skip to main content
      </a>

      <header className={scrolled ? 'nav-scrolled' : 'nav-top'}>
        {/* Mobile-only quick-links strip - its own row above the logo line so
            it gets full viewport width and never collides with the logo or
            anything else. Hidden ≥769 px via CSS. No hamburger: the three
            links here ARE the mobile nav. */}
        <nav className="nav-mobile-strip" aria-label="Quick links">
          <a href="/blog" className={pathname?.startsWith('/blog') ? 'nav-active' : undefined}>
            Blog
          </a>
          <a
            href="https://bernstein.readthedocs.io/"
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="read-the-docs-click"
            data-umami-event-source="nav-mobile"
          >
            Docs
          </a>
          <a
            href={withUtm('https://github.com/sipyourdrink-ltd/bernstein', {
              source: 'bernstein.run',
              medium: 'outbound-link',
              campaign: 'nav-mobile',
            })}
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="outbound-github"
            data-umami-event-surface="nav-mobile"
            data-umami-event-source="nav-mobile"
            onClick={() => {
              /* Canonical funnel step-3 re-emit - the operator dashboard
                 joins on ``github-click``. Without this the nav GitHub
                 link only fed ``outbound-github`` and the funnel pass-
                 rate read 0% on step-3 (root cause 2026-05-14). */
              emitFunnelStep('ghClick', { source: 'nav-mobile', repeatable: true });
              trackOutbound('github.com', 'site-nav', 'mobile-gh');
            }}
          >
            GitHub
          </a>
          {/* Skip-to-repo pill - mobile mirror of the desktop pill
              (action-003, 2026-05-10). Distinct event from the generic
              github-click so the SERP-cohort lift is measurable. */}
          <a
            href={withUtm('https://github.com/sipyourdrink-ltd/bernstein', {
              source: 'bernstein.run',
              medium: 'outbound-link',
              campaign: 'nav-mobile-pill',
            })}
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="outbound-github"
            data-umami-event-surface="nav-mobile-pill"
            onClick={() => {
              track(UmamiEvent.GhSkipToRepoClick, { source: 'nav' });
              emitFunnelStep('ghClick', { source: 'nav-mobile-pill', repeatable: true });
            }}
          >
            → repo
          </a>
        </nav>
        <div className="nav-inner">
          <a href="/" className="nav-logo" aria-label="Bernstein home">
            bernstein<span className="run">.run</span>
          </a>
          <nav className="nav-links" aria-label="Primary">
            {!isHome && <a href="/">Home</a>}
            <a
              href={sectionHref('how')}
              className={active === 'how' ? 'nav-active' : undefined}
            >
              How it works
            </a>
            <a
              href="/compare"
              className={pathname?.startsWith('/compare') ? 'nav-active' : undefined}
            >
              Compare
            </a>
            <a
              href="/cost"
              className={pathname?.startsWith('/cost') ? 'nav-active' : undefined}
              data-umami-event="click-cost-internal"
              data-umami-event-source="nav-desktop"
            >
              Cost
            </a>
            {/* Skip-to-repo pill (action-003, 2026-05-10) - one-click
                escape for the "bernstein github" SERP cohort. */}
            <a
              href={withUtm('https://github.com/sipyourdrink-ltd/bernstein', {
                source: 'bernstein.run',
                medium: 'outbound-link',
                campaign: 'nav-desktop-pill',
              })}
              target="_blank"
              rel="noopener noreferrer"
              data-umami-event="outbound-github"
              data-umami-event-surface="nav-desktop-pill"
              onClick={() => {
                track(UmamiEvent.GhSkipToRepoClick, { source: 'nav' });
                emitFunnelStep('ghClick', { source: 'nav-desktop-pill', repeatable: true });
              }}
            >
              → repo
            </a>
            {/* The /sponsors entry point lives in the footer only (see
                components/landing/Footer.tsx). It keeps the same
                ``click-sponsors-internal`` event name there, so the
                taxonomy is unchanged - only the surface moved. */}
            <a href="/blog" className={pathname?.startsWith('/blog') ? 'nav-active' : undefined}>Blog</a>
            <a
              href="https://bernstein.readthedocs.io/"
              target="_blank"
              rel="noopener noreferrer"
              data-umami-event="read-the-docs-click"
              data-umami-event-source="nav-desktop"
            >
              Docs
            </a>
            <a
              href={withUtm('https://github.com/sipyourdrink-ltd/bernstein', {
                source: 'bernstein.run',
                medium: 'outbound-link',
                campaign: 'nav-desktop',
              })}
              className="nav-github"
              target="_blank"
              rel="noopener noreferrer"
              data-umami-event="outbound-github"
              data-umami-event-surface="nav-desktop"
              data-umami-event-source="nav-desktop"
              onClick={() => {
                emitFunnelStep('ghClick', { source: 'nav-desktop', repeatable: true });
                trackOutbound('github.com', 'site-nav', 'desktop-gh');
              }}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <span>GitHub</span>
              {stars !== null && stars > 0 ? (
                <>
                  <span className="nav-gh-divider" aria-hidden="true" />
                  <span className="nav-gh-stars">{formatStars(stars)}</span>
                </>
              ) : null}
            </a>
          </nav>
        </div>
      </header>
    </>
  );
}
