/**
 * /why-bernstein - evaluation FAQ.
 *
 * Decision-support page for engineers working out whether bernstein
 * fits their setup. Loaded from `content/evaluation/index.mdx`.
 *
 * Why a standalone route (not /blog/why-bernstein):
 *   - the docs bot cites this content back to a stable URL. /blog
 *     pages drift in url over time when slugs are tweaked; /why-
 *     bernstein is short, descriptive, and locked.
 *   - this is the page someone shares with "is this thing for me?" -
 *     /blog/* implies "blog post i'd read once". /why-bernstein
 *     implies "decision page i'd link a colleague to".
 *
 * Visual consistency: reuses the blog-post template (Lead, MdxH2,
 * SmartLink, etc.) so the page reads like the rest of the site.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Metadata } from 'next';
import matter from 'gray-matter';
import readingTime from 'reading-time';
import { compileMDX } from 'next-mdx-remote/rsc';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { Lead } from '@/components/blog/Lead';
import { Callout } from '@/components/blog/Callout';
import { Figure } from '@/components/blog/Figure';
import { SmartLink } from '@/components/blog/SmartLink';
import { InlineCode } from '@/components/blog/InlineCode';
import { CodeBlock } from '@/components/blog/CodeBlock';
import { MdxH2 } from '@/components/blog/MdxH2';
import { MdxH3 } from '@/components/blog/MdxH3';
import { ReadingProgress } from '@/components/blog/ReadingProgress';
import { TocSidebar } from '@/components/blog/TocSidebar';
import { BackToTop } from '@/components/landing/BackToTop';
import { extractTableOfContents } from '@/lib/blog-headings';
import { SITE_URL, AUTHOR } from '@/lib/seo';

const MDX_PATH = path.resolve(process.cwd(), 'content', 'evaluation', 'index.mdx');

const mdxComponents = {
  Callout,
  Lead,
  Figure,
  a: SmartLink,
  code: InlineCode,
  h2: MdxH2,
  h3: MdxH3,
  pre: CodeBlock,
};

/* The page content is stable enough to render once at build
   time. Next.js statically prerenders /why-bernstein with the rest of
   the site; ISR isn't needed for a 6-section faq. */
export const dynamic = 'force-static';

const PAGE_TITLE = 'why bernstein - deterministic multi-agent CLI orchestrator';
const PAGE_DESC =
  'Decision-support FAQ for engineers evaluating Bernstein: a deterministic Python orchestrator that runs Claude Code, Codex, Aider, and Gemini CLI in parallel.';
const PAGE_URL = `${SITE_URL}/why-bernstein`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  authors: [{ name: AUTHOR }],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    url: PAGE_URL,
    authors: [AUTHOR],
    images: [{ url: `/api/og?title=${encodeURIComponent(PAGE_TITLE)}`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    images: [`/api/og?title=${encodeURIComponent(PAGE_TITLE)}`],
  },
};

async function loadMdx() {
  const raw = await fs.readFile(MDX_PATH, 'utf8');
  const { data, content } = matter(raw);
  const [remarkGfm, rehypePrettyCode] = await Promise.all([
    import('remark-gfm').then((m) => m.default),
    import('rehype-pretty-code').then((m) => m.default),
  ]);
  const { content: mdx } = await compileMDX({
    source: content,
    components: mdxComponents,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          [rehypePrettyCode, {
            theme: { dark: 'github-dark', light: 'github-light' },
            keepBackground: false,
            defaultLang: 'plaintext',
          }],
        ],
      },
    },
  });
  return {
    mdx,
    fm: data as { title?: string; description?: string; date?: string },
    readingMinutes: Math.max(1, Math.ceil(readingTime(content).minutes)),
    tableOfContents: extractTableOfContents(content),
  };
}

export default async function WhyBernsteinPage() {
  const { mdx, readingMinutes, tableOfContents } = await loadMdx();

  return (
    <>
      <Nav />
      <ReadingProgress wordCount={readingMinutes * 250} />
      <div className="blog-post-layout">
        <div>
          <div className="blog-post-chrome blog-post-chrome--top" data-nosnippet>
            <a href="/" className="blog-back">
              &larr; Back home
            </a>
          </div>

          <article className="blog-post">
            <header className="blog-post-header">
              <h1>{PAGE_TITLE}</h1>
              <p className="blog-post-meta">
                <span>By {AUTHOR}</span>
                <span aria-hidden="true">·</span>
                <span>{readingMinutes} min read</span>
              </p>
            </header>
            <div className="prose">
              <div>{mdx}</div>
            </div>
          </article>

          <div className="blog-post-chrome blog-post-chrome--bottom" data-nosnippet>
            <p className="blog-post-meta" style={{ marginTop: 'var(--space-4)' }}>
              still deciding? <a href="/ask">ask the bot</a> -{' '}
              comparison-shaped questions get a comparison-shaped answer with
              citations back to this page.
            </p>
          </div>
        </div>
        <aside className="blog-post-sidebar">
          <TocSidebar items={tableOfContents} />
        </aside>
      </div>
      <Footer />
      <BackToTop />
      {/* FAQPage JSON-LD removed 2026-05-21. Google restricted FAQPage
          rich results to government and healthcare authorities in Aug
          2023, so the markup was inert on a decision-support page.
          The visible Q&A copy renders from the MDX body above; only
          the structured-data emission was dropped. The previous
          WHY_BERNSTEIN_FAQ const is in git history for reuse if a
          future schema type (Article with inline Question/Answer,
          QAPage on a dedicated route) becomes viable. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(SOFTWARE_SOURCE_CODE_JSONLD),
        }}
      />
    </>
  );
}

/**
 * SoftwareSourceCode JSON-LD - open source code description.
 *
 * Schema.org SoftwareSourceCode is the AI-discoverability handle for
 * the github repo as a code artifact, distinct from the
 * SoftwareApplication node (which describes the installable product).
 * The two coexist on the site without collision: SoftwareApplication
 * is rendered on the homepage, SoftwareSourceCode here.
 *
 * The `description` field is written to be read, not stuffed. Anything
 * that ingests <script type="application/ld+json"> treats the body as
 * plain text, so whatever sits in this block is what gets quoted.
 */
const SOFTWARE_SOURCE_CODE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  name: 'bernstein',
  url: 'https://github.com/sipyourdrink-ltd/bernstein',
  codeRepository: 'https://github.com/sipyourdrink-ltd/bernstein',
  programmingLanguage: 'Python',
  license: 'https://www.apache.org/licenses/LICENSE-2.0',
  operatingSystem: 'macOS, Linux, Windows (WSL)',
  applicationCategory: 'DeveloperApplication',
  description:
    'deterministic python orchestrator for cli ai coding agents (claude code, codex, cursor, aider, gemini cli, 40+ more) running in parallel git worktrees behind lint, type, and test gates, with an always-on lineage spine and replay journal, and an opt-in hmac-chained audit trail a reviewer checks offline',
  author: {
    '@type': 'Person',
    name: AUTHOR,
    url: 'https://alexchernysh.com',
  },
};

/* WHY_BERNSTEIN_FAQ const removed 2026-05-21 alongside the FAQPage
 * JSON-LD script tag that consumed it. The visible Q&A copy on this
 * route is supplied by the MDX body in content/evaluation/index.mdx;
 * the duplicated array used to feed the structured-data block only.
 * Recover from git history if a future schema type (Article with
 * inline Question/Answer, QAPage on a dedicated route) becomes viable
 * for this content. */