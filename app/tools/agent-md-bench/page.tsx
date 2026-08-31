/**
 * /tools/agent-md-bench - AGENTS.md / CLAUDE.md / .cursorrules linter.
 *
 * 100% client-side. The static page renders surrounding chrome (Nav,
 * Footer, JSON-LD); the actual linter is the AgentMdBench client
 * component in components/tools/AgentMdBench.tsx.
 *
 * Voice: lowercase, no marketing copy. Footer is the single subtle
 * "powered by bernstein.run" line - no popups, no email gate.
 *
 * Why exists (per traffic-amplification-2026-05-09):
 *   - 2500+ repos ship AGENTS.md (GitHub blog, 2026)
 *   - generators exist (codewithclaude, exampleconfig, ncreighton)
 *   - none of them check parser quirks across CLI agents
 *   - bernstein already encodes those quirks in src/bernstein/adapters/
 *   - surface that as a free linter
 */

import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { BackToTop } from '@/components/landing/BackToTop';
import { AgentMdBench } from '@/components/tools/AgentMdBench';
import { SITE_URL, AUTHOR } from '@/lib/seo';
import { withUtm } from '@/lib/utm';

const PAGE_TITLE = 'agent-md-bench - AGENTS.md / CLAUDE.md linter';
const PAGE_DESC =
  'paste any AGENTS.md, CLAUDE.md, .cursorrules or .mdc; see token count, per-agent size budgets, and parser-quirk findings. 100% client-side, no login.';
const PAGE_URL = `${SITE_URL}/tools/agent-md-bench`;

/* Static export - the linter runs entirely on the client. */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  authors: [{ name: AUTHOR }],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    url: PAGE_URL,
    images: [{ url: `/api/og?title=${encodeURIComponent('agent-md-bench')}`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    images: [`/api/og?title=${encodeURIComponent('agent-md-bench')}`],
  },
};

/* FAQPage JSON-LD removed 2026-05-21. Google restricted FAQPage rich
 * results to government and healthcare authorities in Aug 2023, so the
 * markup was inert on a tool page. The Q&A copy lived only in the
 * structured-data block (no visible FAQ section on this page) and was
 * removed wholesale; the page-level explanation under "what the linter
 * checks" still covers the same parser-quirk surface for human readers.
 * If a future schema type becomes viable, the previous builder is in
 * git history. */

export default function AgentMdBenchPage() {
  return (
    <>
      <Nav />
      <main id="main" className="cost-page">
        <article className="cost-page-inner">
          <header className="cost-page-header">
            <p className="blog-back-link">
              <a href="/" className="blog-back">
                &larr; back home
              </a>
            </p>
            <h1>agent-md-bench</h1>
            <p className="cost-page-lede">
              paste your AGENTS.md, CLAUDE.md, .cursorrules or .mdc. the page will count tokens and bytes, show per-agent size budgets, and flag parser quirks across the major CLI coding agents. 100% in the browser. nothing leaves the page.
            </p>
          </header>

          <AgentMdBench />

          <section className="cost-method" aria-labelledby="rules-heading">
            <h2 id="rules-heading">what the linter checks</h2>
            <ul>
              <li>
                <strong>claude code:</strong> 200-line soft cap; YAML frontmatter is ignored (and burns tokens); subdirectory CLAUDE.md needs explicit <code>--add-dir</code>.
              </li>
              <li>
                <strong>cursor:</strong> .mdc requires YAML frontmatter; legacy <code>.cursorrules</code> still works but is undocumented; ≤500 lines per .mdc.
              </li>
              <li>
                <strong>codex (openai):</strong> reads AGENTS.md only; weighs prose blocks higher than dense bullet lists.
              </li>
              <li>
                <strong>aider:</strong> reads CONVENTIONS.md, NOT AGENTS.md / CLAUDE.md, and only if .aider.conf.yml lists it.
              </li>
              <li>
                <strong>gemini cli:</strong> reads GEMINI.md (case-sensitive on linux).
              </li>
              <li>
                <strong>opencode:</strong> reads AGENTS.md by convention.
              </li>
              <li>
                <strong>cross-cutting:</strong> non-standard <code>max-tool-budget</code> directive; HTML comments cost tokens; prompt-cache penalty over 16 KB; missing &ldquo;## Build &amp; test&rdquo; section.
              </li>
            </ul>
            <p>
              every rule is a pure function over the input text. the source of truth is{' '}
              <a
                href={withUtm(
                  'https://github.com/sipyourdrink-ltd/bernstein/tree/main/src/bernstein/adapters',
                  {
                    source: 'bernstein.run',
                    medium: 'outbound-link',
                    campaign: 'agent-md-bench-source',
                  },
                )}
                rel="noopener nofollow"
                target="_blank"
                data-umami-event="outbound-github"
                data-umami-event-surface="agent-md-bench-source"
              >
                src/bernstein/adapters
              </a>{' '}
              in the bernstein OSS repo. send a PR to fix or extend a rule.
            </p>
          </section>
        </article>
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
