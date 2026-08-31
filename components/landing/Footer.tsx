'use client';

import { track, UmamiEvent, emitFunnelStep } from '@/lib/analytics/events';
import { trackOutbound } from '@/components/site/track-outbound';
import { withUtm } from '@/lib/utm';
import { ReadTheCode } from './ReadTheCode';

export function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="footer-logo">bernstein<span>.run</span></span>
          <p className="footer-tagline">The open-source governance layer for AI agents, verifiable offline</p>
        </div>
        <div className="footer-links">
          <div className="footer-col">
            <h4>Product</h4>
            <a
              href={withUtm('https://github.com/sipyourdrink-ltd/bernstein', {
                source: 'bernstein.run',
                medium: 'outbound-link',
                campaign: 'footer-product',
              })}
              data-umami-event="outbound-github"
              data-umami-event-surface="footer-product"
              data-umami-event-source="footer"
              onClick={() => {
                emitFunnelStep('ghClick', { source: 'footer-product', repeatable: true });
                trackOutbound('github.com', 'site-footer', 'product-gh');
              }}
            >
              GitHub
            </a>
            <a
              href="https://pypi.org/project/bernstein/"
              data-umami-event="click-pypi-out"
              data-umami-event-source="footer"
              onClick={() => trackOutbound('pypi.org', 'site-footer', 'product-pypi')}
            >
              PyPI
            </a>
            <a href="https://bernstein.readthedocs.io/" data-umami-event="click-docs-out" data-umami-event-source="footer">Docs</a>
            <a href="/blog" data-umami-event="click-blog-internal" data-umami-event-source="footer">Blog</a>
            {/* RSS subscribe - surfaced as a primary subscribe option
                (conv-003, 2026-05-17). The <link rel="alternate"> in
                <head> handles auto-discovery; this link gives the
                non-feed-reader audience a visible button. */}
            <a
              href="/rss.xml"
              className="rss-subscribe-link"
              data-umami-event="rss-subscribe-click"
              data-umami-event-source="footer"
              onClick={() => track(UmamiEvent.RssSubscribeClick, { source: 'footer' })}
            >
              <span className="rss-subscribe-link__icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                  <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z" />
                  <path d="M4.142 11.858a1.143 1.143 0 1 0 0-2.286 1.143 1.143 0 0 0 0 2.286M4 5.5a.5.5 0 0 1 .5-.5c3.59 0 6.5 2.91 6.5 6.5a.5.5 0 0 1-1 0A5.5 5.5 0 0 0 4.5 6a.5.5 0 0 1-.5-.5m0 3a.5.5 0 0 1 .5-.5A3.5 3.5 0 0 1 8 11.5a.5.5 0 0 1-1 0A2.5 2.5 0 0 0 4.5 9a.5.5 0 0 1-.5-.5" />
                </svg>
              </span>
              RSS
            </a>
          </div>
          <div className="footer-col">
            <h4>Resources</h4>
            <a href="/why-bernstein" data-umami-event="click-why-bernstein" data-umami-event-source="footer">why this over X</a>
            <a href="/benchmarks" data-umami-event="click-benchmarks-internal" data-umami-event-source="footer">benchmarks</a>
            <a href="/cost" data-umami-event="click-cost-internal" data-umami-event-source="footer">cost calculator</a>
            <a href="/llms-full.txt" data-umami-event="click-llms-full" data-umami-event-source="footer">llms-full.txt</a>
            <a href="/ai.txt" data-umami-event="click-ai-txt" data-umami-event-source="footer">ai.txt</a>
            <a href="/sitemap.xml" data-umami-event="click-sitemap" data-umami-event-source="footer">Sitemap</a>
            {/* Mirrors the hero strip - the browsable views of the
                source. Same array, same component; see
                read-the-code-data.ts. */}
            <ReadTheCode surface="footer" />
          </div>
          <div className="footer-col">
            <h4>Community</h4>
            <a
              href={withUtm('https://github.com/sipyourdrink-ltd/bernstein/discussions', {
                source: 'bernstein.run',
                medium: 'outbound-link',
                campaign: 'footer-discussions',
              })}
              data-umami-event="outbound-github"
              data-umami-event-surface="footer-discussions"
              data-umami-event-source="footer"
            >
              GitHub Discussions
            </a>
            <a
              href="https://github.com/sponsors/chernistry"
              data-umami-event="click-gh-sponsors-out"
              data-umami-event-source="footer"
              onClick={() => {
                track(UmamiEvent.GhSponsorsClick, { source: 'footer' });
                track(UmamiEvent.SponsorsFooterClick, { target: 'gh-sponsors' });
              }}
            >
              GitHub Sponsors
            </a>
            {/* Internal /sponsors link - addresses the audit finding that
                /sponsors got 1 organic landing in 3 days because nothing
                links to it. Distinct ``sponsors-footer-click`` lets the
                report attribute footer-driven /sponsors traffic. */}
            <a
              href="/sponsors"
              data-umami-event="click-sponsors-internal"
              data-umami-event-source="footer"
              onClick={() => track(UmamiEvent.SponsorsFooterClick, { target: 'sponsors-page' })}
            >
              Sponsor tiers
            </a>
            <a href="https://star-history.com/#sipyourdrink-ltd/bernstein" data-umami-event="click-star-history-out" data-umami-event-source="footer">Star history</a>
            <a href="/llms.txt" className="footer-llms-link" data-umami-event="click-llms" data-umami-event-source="footer">/llms.txt</a>
          </div>
          <div className="footer-col">
            <h4>Legal &amp; meta</h4>
            <a href="/about" data-umami-event="click-about" data-umami-event-source="footer">About</a>
            <a href="mailto:forte@bernstein.run" data-umami-event="click-mailto" data-umami-event-source="footer">forte@bernstein.run</a>
            <a href="https://www.apache.org/licenses/LICENSE-2.0" data-umami-event="click-license-out" data-umami-event-source="footer">Apache 2.0</a>
            <a href="/privacy" data-umami-event="click-privacy" data-umami-event-source="footer">Privacy</a>
            <a href="/terms" data-umami-event="click-terms" data-umami-event-source="footer">Terms</a>
            <a href="/.well-known/security.txt" data-umami-event="click-security-txt" data-umami-event-source="footer">Security</a>
            <a href="/humans.txt" data-umami-event="click-humans-txt" data-umami-event-source="footer">Humans</a>
          </div>
          <div className="footer-col">
            <h4>Identity</h4>
            <a
              href="https://alexchernysh.com"
              target="_blank"
              rel="noopener me author"
              data-umami-event="click-author-site-out"
              data-umami-event-source="footer"
              onClick={() => trackOutbound('alexchernysh.com', 'site-footer', 'author-site')}
            >
              alexchernysh.com
            </a>
            <a
              href="https://github.com/chernistry"
              target="_blank"
              rel="noopener me author"
              data-umami-event="click-author-gh-out"
              data-umami-event-source="footer"
              onClick={() => trackOutbound('github.com', 'site-footer', 'author-gh')}
            >
              GitHub @chernistry
            </a>
            <a
              href="https://x.com/alex_chernysh"
              target="_blank"
              rel="noopener me author"
              data-umami-event="click-author-x-out"
              data-umami-event-source="footer"
            >
              X @alex_chernysh
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>
            Built by{' '}
            <a
              href="https://alexchernysh.com"
              rel="author"
              data-umami-event="click-author-site-out"
              data-umami-event-source="footer-bottom"
              onClick={() => trackOutbound('alexchernysh.com', 'site-footer', 'byline')}
            >
              Alex Chernysh
            </a>
            {' · '}
            <a
              href="https://github.com/chernistry"
              rel="me"
              data-umami-event="click-author-gh-out"
              data-umami-event-source="footer-bottom"
              onClick={() => trackOutbound('github.com', 'site-footer', 'byline-gh')}
            >
              github.com/chernistry
            </a>
            {' · '}
            <a href="mailto:forte@bernstein.run" data-umami-event="click-mailto" data-umami-event-source="footer-bottom">forte@bernstein.run</a>
          </p>
          <p>
            Named for Leonard Bernstein, the original orchestrator. Apache 2.0.
          </p>
        </div>
      </div>
    </footer>
  );
}
