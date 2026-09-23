'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { trackOutbound } from '@/components/site/track-outbound';
import { emitFunnelStep } from '@/lib/analytics/events';
import { withUtm } from '@/lib/utm';

/* Primary nav is one entry point per job: Install, Verify, Docs, Ask, plus
   GitHub. Everything else (how it works, cost, blog, the code-map
   shortcuts) lives in the footer or inline in page copy instead - see
   Footer.tsx. There is no on-page scroll-spy anymore: none of the five
   entries point at a same-page anchor, so the previous IntersectionObserver
   wiring for `#how` was removed along with the nav link that used it. */

function formatStars(stars: number): string {
  if (stars >= 1000) {
    const k = stars / 1000;
    const fixed = k.toFixed(1);
    return `${fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed}k`;
  }
  return String(stars);
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const pathname = usePathname();

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
            anything else. Hidden ≥769 px via CSS. No hamburger: the five
            links here ARE the mobile nav, mirroring the desktop list below. */}
        <nav className="nav-mobile-strip" aria-label="Quick links">
          <a
            href="/cli-quickstart"
            className={pathname?.startsWith('/cli-quickstart') ? 'nav-active' : undefined}
            data-umami-event="click-install-internal"
            data-umami-event-source="nav-mobile"
          >
            Install
          </a>
          <a
            href="https://mcp.bernstein.run/verify"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Verify a run receipt"
            data-umami-event="click-verify-out"
            data-umami-event-source="nav-mobile"
          >
            Verify
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
            href="/#ask"
            data-umami-event="click-ask-internal"
            data-umami-event-source="nav-mobile"
          >
            Ask
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
          <a
            href="https://www.linkedin.com/company/bernstein-run/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            data-umami-event="outbound-linkedin"
            data-umami-event-source="nav-mobile"
            onClick={() => trackOutbound('linkedin.com', 'site-nav', 'mobile-li')}
          >
            LinkedIn
          </a>
        </nav>
        <div className="nav-inner">
          <a href="/" className="nav-logo" aria-label="bernstein.run home">
            bernstein<span className="run">.run</span>
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a
              href="/cli-quickstart"
              className={pathname?.startsWith('/cli-quickstart') ? 'nav-active' : undefined}
              data-umami-event="click-install-internal"
              data-umami-event-source="nav-desktop"
            >
              Install
            </a>
            <a
              href="https://mcp.bernstein.run/verify"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Verify a run receipt"
              data-umami-event="click-verify-out"
              data-umami-event-source="nav-desktop"
            >
              Verify
            </a>
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
              href="/#ask"
              data-umami-event="click-ask-internal"
              data-umami-event-source="nav-desktop"
            >
              Ask
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
            <a
              href="https://www.linkedin.com/company/bernstein-run/"
              className="nav-github"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              data-umami-event="outbound-linkedin"
              data-umami-event-source="nav-desktop"
              onClick={() => trackOutbound('linkedin.com', 'site-nav', 'desktop-li')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              <span>LinkedIn</span>
            </a>
          </nav>
        </div>
      </header>
    </>
  );
}
