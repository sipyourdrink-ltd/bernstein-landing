/**
 * Landing page · ask-first layout.
 *
 * Sections, in render order:
 *   1. Hero · two-column ask-first split (DocsBot left, evidence rail right)
 *   2. PipelineRailMini · compressed 4-stage band (owns the `#how` anchor)
 *   3. FeaturedPosts · "from the blog" strip
 *   4. AuditLogEvidence · centerpiece terminal artifact
 *   5. FaqV2 · 4 questions, 2×2 grid
 *   6. EmailStrip · "one engineering post a month."
 *
 * Primary actions above the fold: the install snippet and the GitHub row
 * in RightRail, and the DocsBot ask box in the left column. The email
 * form and the blog links sit below the fold.
 *
 * Not rendered here (each one previously had its own section; the facts
 * they carried now live in RightRail, PipelineRailMini and
 * AuditLogEvidence): a persistent ask-AI dock, the animated DAG, the
 * stats strip, a dense side-by-side tool table, and a prose
 * `How does Bernstein work?` explainer. Parallax, autoplay video and
 * the hero gradient are also deliberately absent - the page stays
 * inside its motion budget.
 *
 * On the explainer specifically (removed 2026-08-15): it sat between
 * the hero and the rail and walked the same decompose/spawn/verify/
 * merge sequence the rail already draws, in wording that also restated
 * both hero sub-paragraphs almost verbatim. The pipeline is now stated
 * once, by PipelineRailMini; its verify stage absorbed the one claim
 * the explainer held alone (optional cross-model review). The dense
 * plain-text answer that block existed to expose to extraction still
 * ships via /llms-full.txt and the `how-does-bernstein-work` entry in
 * the /ask corpus, so nothing machine-readable was lost.
 *
 * Kept stable across layout changes:
 *   - WebSite + Sitelinks JSON-LD (search rich-results)
 *   - SoftwareApplication JSON-LD
 *   - voice rules - lowercase, italic emphasis, periods, no banned words
 *   - DocsBot UI conventions (kicker, citation chip, model + ms footer,
 *     copy-as-markdown)
 *   - umami event names (github-click, install-snippet-copy,
 *     email-capture-submit, docs-bot-ask) so reports stay continuous
 */

import { SoftwareApplicationJsonLd } from '@/components/seo/SoftwareApplicationJsonLd';
import { Nav } from '@/components/landing/Nav';
import { HeroV2 } from '@/components/landing/HeroV2';
import { PipelineRailMini } from '@/components/landing/PipelineRailMini';
import { FeaturedPosts } from '@/components/landing/FeaturedPosts';
import { AuditLogEvidence } from '@/components/landing/AuditLogEvidence';
import { FaqV2 } from '@/components/landing/FaqV2';
import { EmailStrip } from '@/components/landing/EmailStrip';
import { Footer } from '@/components/landing/Footer';
import { BackToTop } from '@/components/landing/BackToTop';
import { PricingPeekCta } from '@/components/landing/PricingPeekCta';
import { BetaNotice } from '@/components/landing/BetaNotice';
import { SponsorStrip } from '@/components/landing/SponsorStrip';
import { SocialProofStrip } from '@/components/landing/SocialProofStrip';
import { ReadingProgress } from '@/components/blog/ReadingProgress';
import { fetchAdapterCount } from '@/lib/adapter-count';
import { fetchPublicSponsors } from '@/lib/sponsors';
import { fetchPackageStats } from '@/lib/pkg-stats';
import { getFeaturedPosts, getPostCount } from '@/lib/mdx';
/* Client-only mount: the bot uses `window` + `performance.mark` and a
   useReducer that never matches SSR. Next 15 forbids `next/dynamic`
   with `ssr:false` from a Server Component, so the dynamic import
   lives inside `DocsBotClient`, a thin client wrapper. The hydration
   contract is unchanged: the placeholder reserves height to keep CLS
   pinned. */
import { DocsBotClient as DocsBot } from '@/components/docs-bot/DocsBotClient';

/* Page-level ISR window. The render path awaits several third-party
   fetches (adapter registry, pypi, github, sponsors graphql, peer-project
   stars, latest release tag) - each is now individually capped at 2s
   via AbortController + cached fallback (mirroring the
   `/api/stats` pattern from 4320057). Adding `revalidate: 60` lets
   the edge serve a slightly stale render during origin slowness
   instead of waiting on a fresh SSR every request, which is the
   regression coverage gap that re-opened the edge=504 rate on `/`.
   Dynamic blocks (DocsBot, ReadingProgress, sticky cta) are already
   client-only, so the staleness window is bounded to copy and
   numeric pills - not interactive surfaces. */
export const revalidate = 60;

/* FAQPage JSON-LD removed 2026-05-21. Google restricted FAQPage rich
 * results to government and healthcare authorities in Aug 2023, so the
 * markup was inert on a commercial open-source page. The visible FAQ
 * section under FaqV2 still renders the operator-curated Q&A copy;
 * only the structured-data emission was dropped. If a future schema
 * type (Article with inline Question/Answer, or QAPage on a dedicated
 * route) becomes viable for this content, the previous builder is in
 * git history. */

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': 'https://bernstein.run/#website',
  name: 'Bernstein',
  alternateName: 'Bernstein Orchestrator',
  url: 'https://bernstein.run',
  description: 'The open-source governance layer for AI agents. Deterministic task graphs replay byte-identically; byte-identical run receipts verify offline.',
  inLanguage: 'en',
  /* publisher references the canonical Organization node from the
     site-wide layout instead of redefining it. Graph edge keeps the KG
     consolidated. */
  publisher: { '@id': 'https://bernstein.run/#organization' },
  /* SearchAction surfaces the Google sitelinks search box. Pointing at
     /ask (live DocsBot) rather than /blog?q= gives engines a real
     query interface; the Search Console rich-results validator prefers
     a working search endpoint. */
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://bernstein.run/ask?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
};

const SITELINKS_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: [
    {
      '@type': 'SiteNavigationElement',
      position: 1,
      name: 'Blog',
      description: 'Engineering deep-dives, tutorials, and project updates',
      url: 'https://bernstein.run/blog',
    },
    {
      '@type': 'SiteNavigationElement',
      position: 2,
      name: 'Documentation',
      description: 'Installation, configuration, adapter guide, and API reference',
      url: 'https://bernstein.readthedocs.io/',
    },
    {
      '@type': 'SiteNavigationElement',
      position: 3,
      name: 'Getting Started',
      description: 'Your first multi-agent run in 5 minutes',
      url: 'https://bernstein.run/blog/getting-started',
    },
    {
      '@type': 'SiteNavigationElement',
      position: 4,
      name: 'GitHub',
      description: 'Source code, issues, and community contributions',
      url: 'https://github.com/sipyourdrink-ltd/bernstein',
    },
    {
      '@type': 'SiteNavigationElement',
      position: 5,
      name: 'PyPI',
      description: 'Python package. Install with pipx install bernstein.',
      url: 'https://pypi.org/project/bernstein/',
    },
  ],
};

export default async function LandingPage() {
  /* Fetch live signals in parallel:
     - adapter count from the bernstein registry on GitHub
     - GitHub stars / closed PRs / contributors (one cached call so
       every surface that needs them gets a free hit)
     Both have hardcoded fallbacks inside their respective lib helpers,
     so a network outage does not break the page render. */
  const [adapterCount, pkgStats, featuredPosts, postCount, sponsors] = await Promise.all([
    fetchAdapterCount(),
    fetchPackageStats(),
    /* Drives the "from the blog" strip below the hero, so the home page
       links into /blog/<slug> at all. The slug set is curated via
       `featured: true` MDX frontmatter, not derived from latest-three. */
    getFeaturedPosts(),
    /* Feeds the hero's "grounded in source + N posts" kicker. Counted
       from content/blog/ rather than stated, so publishing a post
       updates the claim on the next build. */
    getPostCount(),
    /* Powers the in-fold sponsor strip. The fetcher returns an empty
       array when no token is configured; SponsorStrip renders nothing in
       that case so the fold band degrades cleanly to social proof
       alone. */
    fetchPublicSponsors(),
  ]);

  return (
    <>
      <Nav />
      {/* Scroll-depth telemetry on the landing route. Mounts the same
          ReadingProgress component used by /blog/[slug] and /why-bernstein
          so scroll-50pct / scroll-90pct events fire with `path: "/"`;
          before this they fired on blog routes only, so the landing page
          had no scroll data at all. External-link delegation also moves
          to /, surfacing un-tagged outbound clicks via
          `external-link-click`. */}
      <ReadingProgress />
      <main id="main">
        <HeroV2
          docsBot={<DocsBot variant="hero" initialQuery="" />}
          adapterCount={adapterCount}
          closedPrs={pkgStats.closed_prs}
          contributors={pkgStats.contributors}
          postCount={postCount}
        />
        {/* Beta status strip - one line, dismissible, localStorage-backed.
            Server-rendered in flow so it exists at first paint (no CLS);
            an inline script inside the component hides it pre-paint for
            visitors who already dismissed it. */}
        <BetaNotice />
        {/* In-fold sponsor + social-proof strips. The sponsor strip
            degrades to null when zero sponsors are resolved; the
            social-proof row always renders. Mounted immediately after
            the hero so they sit in the fold band, above PipelineRailMini.
            Both rows are well under 100px tall combined; `<img>` tags
            use explicit width/height so LCP is unaffected. */}
        <SponsorStrip sponsors={sponsors} />
        <SocialProofStrip stars={pkgStats.stars ?? null} />
        {/* The four-stage view of a run. Sole presentation of the
            pipeline on this page, and the only remaining on-page anchor
            (`#how`) - the Nav scroll-spy and the /#how links from
            /spec-driven both resolve here. */}
        <PipelineRailMini />
        {/* "from the blog" strip - internal links from the home page to
            /blog/<slug>. Sits above AuditLogEvidence so a reader meets
            the writing before the technical centerpiece. The component
            no-ops cleanly when no posts are flagged. */}
        <FeaturedPosts posts={featuredPosts} />
        <AuditLogEvidence />
        <FaqV2 />
        {/* One newsletter form on the page, monthly cadence. A second
            weekly form used to sit here; two forms on one page just
            split the choice. The weekly Resend audience env var stays
            wired in /api/notify so existing subscribers keep working;
            only the form is gone. */}
        <EmailStrip />
      </main>
      <Footer />
      <BackToTop />
      {/* Sticky pointer to /cost. Hidden after dismiss via a 7-day
          cookie; never mounted on /cost itself. */}
      <PricingPeekCta />
      <SoftwareApplicationJsonLd />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SITELINKS_JSON_LD) }}
      />
    </>
  );
}
