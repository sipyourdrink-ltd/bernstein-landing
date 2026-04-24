export function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="footer-logo">bernstein<span>.run</span></span>
          <p className="footer-tagline">Multi-agent orchestration for CLI coding agents</p>
        </div>
        <div className="footer-links">
          <div className="footer-col">
            <h4>Product</h4>
            <a href="https://github.com/chernistry/bernstein">GitHub</a>
            <a href="https://pypi.org/project/bernstein/">PyPI</a>
            <a href="https://bernstein.readthedocs.io/">Docs</a>
            <a href="/blog">Blog</a>
          </div>
          <div className="footer-col">
            <h4>Resources</h4>
            <a href="/llms-full.txt">llms-full.txt</a>
            <a href="/ai.txt">ai.txt</a>
            <a href="/sitemap.xml">Sitemap</a>
          </div>
          <div className="footer-col">
            <h4>Community</h4>
            <a href="https://github.com/chernistry/bernstein/discussions">GitHub Discussions</a>
            <a href="https://github.com/sponsors/chernistry">GitHub Sponsors</a>
            <a href="https://star-history.com/#chernistry/bernstein">Star history</a>
            <a href="/llms.txt" className="footer-llms-link">/llms.txt</a>
            <div className="footer-featured">
              <span className="footer-featured-label">As featured in</span>
              <div className="footer-featured-badges">
                <a
                  href="https://codetrendy.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Listed on codetrendy.com"
                >
                  <picture>
                    <source
                      media="(prefers-color-scheme: light)"
                      srcSet="https://codetrendy.com/api/badge?style=classic"
                    />
                    <img
                      src="https://codetrendy.com/api/badge?style=dark"
                      alt="Listed on codetrendy.com"
                      loading="lazy"
                    />
                  </picture>
                </a>
                <a
                  href="https://www.saashub.com/bernstein?utm_source=badge&utm_campaign=badge&utm_content=bernstein&badge_variant=dark&badge_kind=approved"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Bernstein approved on SaaSHub"
                >
                  <picture>
                    <source
                      media="(prefers-color-scheme: light)"
                      srcSet="https://cdn-b.saashub.com/img/badges/approved-neutral.png?v=1"
                    />
                    <img
                      src="https://cdn-b.saashub.com/img/badges/approved-dark.png?v=1"
                      alt="Bernstein approved on SaaSHub"
                      loading="lazy"
                    />
                  </picture>
                </a>
              </div>
            </div>
          </div>
          <div className="footer-col">
            <h4>Legal &amp; meta</h4>
            <a href="mailto:forte@bernstein.run">forte@bernstein.run</a>
            <a href="https://www.apache.org/licenses/LICENSE-2.0">Apache 2.0</a>
            <a href="/.well-known/security.txt">Security</a>
            <a href="/humans.txt">Humans</a>
          </div>
          <div className="footer-col">
            <h4>By the author</h4>
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
              href="https://hireex.ai"
              target="_blank"
              rel="noopener"
              title="HireEx — AI hiring platform by Alex Chernysh"
            >
              HireEx
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>
            Made with care by{' '}
            <a href="https://alexchernysh.com" rel="author">
              Alex Chernysh
            </a>
            {' · '}
            <a href="https://github.com/chernistry" rel="me">
              github.com/chernistry
            </a>
            {' · '}
            <a href="mailto:forte@bernstein.run">forte@bernstein.run</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
