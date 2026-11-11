'use client';

import { withUtm } from '@/lib/utm';
import { ReadTheCode } from './ReadTheCode';
import { PageSeal } from './PageSeal';

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
            >
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/company/bernstein-run/"
              aria-label="LinkedIn"
            >
              LinkedIn
            </a>
            <a
              href="https://pypi.org/project/bernstein/"
            >
              PyPI
            </a>
            <a href="https://docs.bernstein.run/">Docs</a>
            {/* /#how used to have its own Nav entry; it moved here when
                the primary nav was trimmed to Install / Verify / Docs /
                Ask (plus GitHub) - the section itself still lives on the
                home page, unchanged. */}
            <a href="/#how">How it works</a>
            <a href="/blog">Blog</a>
            {/* RSS subscribe - surfaced as a primary subscribe option
                (conv-003, 2026-05-17). The <link rel="alternate"> in
                <head> handles auto-discovery; this link gives the
                non-feed-reader audience a visible button. */}
            <a
              href="/rss.xml"
              className="rss-subscribe-link"
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
            <a href="/#ask">Ask the docs</a>
            <a href="https://mcp.bernstein.run/verify" target="_blank" rel="noopener noreferrer">Verify a run receipt</a>
            {/* Was a top-level Nav entry before the nav was trimmed to
                Install / Verify / Docs / Ask; kept reachable here since
                it is a real per-adapter comparison surface, not a link
                to prune. */}
            <a href="/compare">compare adapters</a>
            <a href="/benchmarks">benchmarks</a>
            <a href="/cost">cost calculator</a>
            <a href="/llms-full.txt">llms-full.txt</a>
            <a href="/ai.txt">ai.txt</a>
            <a href="/sitemap.xml">Sitemap</a>
            {/* Browsable views of the source - github / deepwiki. See
                read-the-code-data.ts; this is the strip's only mount
                point now (RightRail's hero copy was removed). */}
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
            >
              GitHub Discussions
            </a>
            <a
              href="https://github.com/sponsors/chernistry"
            >
              GitHub Sponsors
            </a>
            <a
              href="/sponsors"
            >
              Sponsor tiers
            </a>
            <a href="https://star-history.com/#sipyourdrink-ltd/bernstein">Star history</a>
            <a href="/llms.txt" className="footer-llms-link">/llms.txt</a>
          </div>
          <div className="footer-col">
            <h4>Legal &amp; meta</h4>
            <a href="/about">About</a>
            <a href="mailto:forte@bernstein.run">forte@bernstein.run</a>
            <a href="https://www.apache.org/licenses/LICENSE-2.0">Apache 2.0</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/.well-known/security.txt">Security</a>
            <a href="/humans.txt">Humans</a>
          </div>
          <div className="footer-col">
            <h4>Identity</h4>
            <a
              href="https://alexchernysh.com"
              target="_blank"
              rel="noopener me author"
            >
              alexchernysh.com
            </a>
            <a
              href="https://github.com/chernistry"
              target="_blank"
              rel="noopener me author"
            >
              GitHub @chernistry
            </a>
            <a
              href="https://x.com/alex_chernysh"
              target="_blank"
              rel="noopener me author"
            >
              X @alex_chernysh
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <PageSeal />
          <p>
            Built by{' '}
            <a
              href="https://alexchernysh.com"
              rel="author"
            >
              Alex Chernysh
            </a>
            {' · '}
            <a
              href="https://github.com/chernistry"
              rel="me"
            >
              github.com/chernistry
            </a>
            {' · '}
            <a href="mailto:forte@bernstein.run">forte@bernstein.run</a>
          </p>
          <p>
            Named for Leonard Bernstein, the original orchestrator. Apache 2.0.
          </p>
        </div>
      </div>
    </footer>
  );
}
