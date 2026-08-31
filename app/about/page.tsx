/**
 * /about - author identity + content sourcing notes.
 *
 * Why this route exists
 * ---------------------
 * The Google E-E-A-T framework (Dec 2025 update) reads an explicit
 * /about page as the canonical "who is making these claims" signal.
 * Without one, comparison-shaped queries land on /why-bernstein and
 * /vs/* with no anchor for author identity. This page is the anchor:
 * one paragraph each on who, why, authority, sourcing, contact.
 *
 * Voice: lowercase senior-engineer copy. No marketing voice, no
 * "10+ years of experience" filler. Concrete signals only.
 *
 * Discoverability: Person JSON-LD with sameAs cross-links to the
 * verifiably-owned profiles (alexchernysh.com, GitHub, X, Mastodon)
 * so a Knowledge-Graph crawler can stitch identity across surfaces.
 */
import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { StaticPageBreadcrumb } from '@/components/seo/BreadcrumbListJsonLd';
import { JsonLd } from '@/components/seo/JsonLd';
import { personLD } from '@/lib/jsonld';
import { SITE_URL, AUTHOR } from '@/lib/seo';

const LAST_UPDATED = '2026-05-21';
const PAGE_URL = `${SITE_URL}/about`;
const PAGE_TITLE = 'about';
const PAGE_DESC =
  'who runs bernstein.run, why the project exists, and how blog posts and comparison claims are sourced. solo-maintained, apache 2.0, bias disclosure included.';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  authors: [{ name: AUTHOR }],
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'profile',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    url: PAGE_URL,
    images: [
      { url: `/api/og?title=${encodeURIComponent(PAGE_TITLE)}`, width: 1200, height: 630 },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    images: [`/api/og?title=${encodeURIComponent(PAGE_TITLE)}`],
  },
};

/* Static page - no per-request data. */
export const dynamic = 'force-static';

const PERSON_DESCRIPTION =
  'solo maintainer of bernstein, a deterministic python orchestrator for cli ai coding agents. apache 2.0, self-bootstrapped, no vc funding.';

export default function AboutPage() {
  return (
    <>
      <Nav />
      <main className="blog-post-layout">
        <article className="blog-post">
          <header className="blog-post-header">
            <h1>about bernstein.run</h1>
            <p className="blog-post-meta">
              <span>By {AUTHOR}</span>
              <span aria-hidden="true"> &middot; </span>
              <time dateTime={LAST_UPDATED}>updated {LAST_UPDATED}</time>
            </p>
          </header>

          <div className="prose">
            <h2>who</h2>
            <p>
              bernstein.run is the project site for{' '}
              <a
                href="https://github.com/sipyourdrink-ltd/bernstein"
                rel="noopener external"
              >
                bernstein
              </a>
              , an open-source orchestrator for cli coding agents (claude
              code, codex, cursor, aider, gemini cli, and the rest of the
              adapter registry). it is
              built and maintained by{' '}
              <a href="https://alexchernysh.com" rel="me author">
                alex chernysh
              </a>{' '}
              as a solo project, self-bootstrapped, no investor money. the
              site, the python package on{' '}
              <a href="https://pypi.org/project/bernstein/" rel="noopener">
                pypi
              </a>
              , the npm wrapper, and the docs all ship under apache 2.0.
              public profiles:{' '}
              <a
                href="https://github.com/chernistry"
                rel="me author"
                target="_blank"
              >
                github.com/chernistry
              </a>{' '}
              and{' '}
              <a
                href="https://x.com/alex_chernysh"
                rel="me author"
                target="_blank"
              >
                x.com/@alex_chernysh
              </a>
              .
            </p>

            <h2>why this project exists</h2>
            <p>
              the short version is in the{' '}
              <a
                href="https://github.com/sipyourdrink-ltd/bernstein#readme"
                rel="noopener external"
              >
                project readme
              </a>
              : i was paying about $400/month in claude bills running three
              coding agents in parallel and getting nondeterministic merges
              back. the bill was annoying, the merges were worse. bernstein
              is the orchestrator i wished i had then - a
              deterministic python scheduler in front of whichever cli
              coding agents you already trust, with parallel git worktrees,
              a quality-gate stage, and an hmac-chained audit log so the
              run is repeatable and the artefacts are accountable. it is
              not a magic prompt; it is a scheduler.
            </p>

            <h2>what qualifies the voice</h2>
            <p>
              concrete signals rather than years-of-experience filler.
              bernstein ships 49 cli adapters (claude code, codex, cursor,
              aider, gemini, openai agents sdk, and the rest - see{' '}
              <a href="/vs">/vs</a> for the comparison index), an
              hmac-signed audit log, sigstore-style lineage records per
              artefact, a contextual-bandit router for cheapest-passing
              model selection, and an mcp server so the orchestrator
              itself is callable from any mcp client. architectural
              decisions are public: parallel worktrees over shared state,
              file-based session store over database, sub-process
              isolation over in-process plugin loading. the source is on{' '}
              <a
                href="https://github.com/sipyourdrink-ltd/bernstein"
                rel="noopener external"
              >
                github
              </a>{' '}
              and the api docs are on{' '}
              <a href="https://bernstein.readthedocs.io/" rel="noopener">
                readthedocs
              </a>
              ; the design rationale lives in commit history, prs, and{' '}
              <a href="/blog">/blog</a> rather than in marketing copy.
            </p>

            <h2>how content is sourced</h2>
            <p>
              every blog post carries a publish date in its frontmatter
              and is dated in the visible header. comparisons (the{' '}
              <a href="/vs">/vs</a> hub, the{' '}
              <a href="/why-bernstein">/why-bernstein</a> decision page,
              and the per-adapter pages under{' '}
              <a href="/vs">/vs/&lt;adapter&gt;</a>) cite the upstream
              project&apos;s own documentation as the source of feature
              claims wherever the claim is about the other tool. where i
              test a claim myself, i publish the test command in the post
              body so you can re-run it. benchmark numbers come
              from a reproducible eval harness (the{' '}
              <a href="/benchmarks/cli-agent-orchestrators">benchmark page</a>{' '}
              includes the methodology and a re-run script). model prices
              on <a href="/cost">/cost</a> link to the upstream price
              page and carry the date the table was captured.
            </p>
            <p>
              <strong>bias disclosure.</strong> i build bernstein, so any
              claim on this site about bernstein vs another tool is
              biased by that authorship. i try to keep the bias visible
              rather than hidden: the{' '}
              <a href="/benchmarks/cli-agent-orchestrators">benchmark page</a>{' '}
              publishes a 10-task suite where bernstein loses 4 of 10
              against the comparison set, the{' '}
              <a href="/why-bernstein">/why-bernstein</a> page includes
              explicit &ldquo;who this is not for&rdquo; sections, and
              the comparison source memo is the{' '}
              <a href="/vs">/vs</a> hub itself - each comparison
              page links the upstream tool&apos;s docs at the top so a
              reader can audit the claim against the source. if a
              comparison reads as marketing rather than as a fair
              assessment, file an issue on{' '}
              <a
                href="https://github.com/sipyourdrink-ltd/bernstein/issues"
                rel="noopener external"
              >
                the bernstein repo
              </a>{' '}
              and i&apos;ll either fix the copy or take the page down.
            </p>

            <h2>contact</h2>
            <p>
              email{' '}
              <a href="mailto:forte@bernstein.run">forte@bernstein.run</a>,
              github issues on the{' '}
              <a
                href="https://github.com/sipyourdrink-ltd/bernstein/issues"
                rel="noopener external"
              >
                bernstein repo
              </a>
              , or{' '}
              <a
                href="https://x.com/alex_chernysh"
                rel="me author"
                target="_blank"
              >
                x.com/@alex_chernysh
              </a>{' '}
              for short notes.
            </p>
          </div>
        </article>
      </main>
      <Footer />
      <StaticPageBreadcrumb name="About" slug="/about" />
      <JsonLd data={personLD({ url: PAGE_URL, description: PERSON_DESCRIPTION, jobTitle: 'maintainer, bernstein' })} />
    </>
  );
}
