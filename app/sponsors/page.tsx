/**
 * /sponsors - public sponsor wall.
 *
 * Server component. Fetches the public sponsor list via GitHub GraphQL
 * when a GITHUB_TOKEN is present in env; otherwise falls back to a
 * hardcoded list (currently empty - that is the legitimate "an empty
 * list" state, and the wall renders the placeholder copy).
 *
 * JSON-LD on this page (per the research plan):
 *   - Person (Alex) - links into the existing Organization graph in
 *     layout.tsx via @id, so the /sponsors page contributes a Person
 *     node without duplicating the Organization block.
 *   - WebPage - anchors the URL and breadcrumb.
 */
import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { BackToTop } from '@/components/landing/BackToTop';
import { SponsorWall } from '@/components/landing/SponsorWall';
import { JsonLd } from '@/components/seo/JsonLd';
import { fetchPublicSponsors } from '@/lib/sponsors';
import { SITE_URL, AUTHOR } from '@/lib/seo';

const PAGE_TITLE = 'sponsor Bernstein';
const PAGE_DESC =
  'An Apache 2.0 governance layer for AI agents.';
const PAGE_URL = `${SITE_URL}/sponsors`;

/* The page is server-rendered with sponsor data refreshed via
   fetch-cache (see lib/sponsors.ts:REVALIDATE_SECONDS). When no token
   is wired the fetcher returns an empty array immediately, so the
   page is effectively static for the no-token deploy and incremental
   for the token-wired deploy. Either path is safe at build time. */
export const dynamic = 'force-static';
export const revalidate = 3600;

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
    images: [{ url: `/api/og?title=${encodeURIComponent(PAGE_TITLE)}`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    images: [`/api/og?title=${encodeURIComponent(PAGE_TITLE)}`],
  },
};

/** Build the JSON-LD graph emitted on this page: Person + WebPage.
 *  The Person @id matches the Organization graph founder @id in components/seo/OrganizationJsonLd.tsx so search
 *  consoles read them as the same node. */
function buildJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': 'https://alexchernysh.com/#person',
      name: AUTHOR,
      url: 'https://alexchernysh.com',
      sameAs: [
        'https://alexchernysh.com',
        'https://github.com/chernistry',
        'https://x.com/alex_chernysh',
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': PAGE_URL,
      url: PAGE_URL,
      name: 'Sponsor Bernstein',
      description: PAGE_DESC,
      isPartOf: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'en',
    },
  ];
}

export default async function SponsorsPage() {
  const sponsors = await fetchPublicSponsors();
  const jsonLd = buildJsonLd();

  return (
    <>
      <Nav />
      <main id="main" className="sponsors-page">
        <div>
          <a href="/" className="sponsors-page__back">&larr; back home</a>
          <header className="sponsors-page__intro">
            <h1>sponsor bernstein</h1>
            <p>
              {'bernstein is an apache 2.0 governance layer for AI agents. every scheduling decision is plain python. the replay journal records every run; the HMAC-chained audit log is opt-in.'}
            </p>
            <p>
              <strong>stage honesty.</strong> one
              maintainer. no production reference customer. no SOC 2 / ISO
              27001 / FedRAMP.
            </p>
          </header>
        </div>

        <SponsorWall sponsors={sponsors} heading={null} />

      </main>
      <Footer />
      <BackToTop />
      <JsonLd data={jsonLd} />
    </>
  );
}
