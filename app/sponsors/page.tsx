/**
 * /sponsors - public sponsor wall + tier ladder.
 *
 * Server component. Fetches the public sponsor list via GitHub GraphQL
 * when a GITHUB_TOKEN is present in env; otherwise falls back to a
 * hardcoded list (currently empty - that is the legitimate "no
 * sponsors yet" state, and the wall renders the placeholder copy).
 *
 * Why not /why-bernstein-style MDX render: this page is short and
 * structural (a wall + a table + a single CTA). MDX would add a build
 * step and a content file for one screen of copy. Keeping the prose
 * inline lets the operator edit voice in one place.
 *
 * JSON-LD on this page (per the research plan):
 *   - Person (Alex) - links into the existing Organization graph in
 *     layout.tsx via @id, so the /sponsors page contributes a Person
 *     node without duplicating the Organization block.
 *   - WebPage - anchors the URL and breadcrumb.
 *   - Offer (per tier) - gives AI crawlers a structured tier list.
 *
 *   The sister agent (#28) owns the FAQPage + SoftwareSourceCode
 *   blocks on /why-bernstein and the homepage; we deliberately do
 *   NOT emit either type here so the graph stays single-sourced.
 */
import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { BackToTop } from '@/components/landing/BackToTop';
import { SponsorWall } from '@/components/landing/SponsorWall';
import { JsonLd } from '@/components/seo/JsonLd';
import { fetchPublicSponsors } from '@/lib/sponsors';
import { SITE_URL, SITE_NAME, AUTHOR } from '@/lib/seo';

const PAGE_TITLE = 'sponsor Bernstein, github.com/sponsors/chernistry';
const PAGE_DESC =
  'Sponsor Bernstein on GitHub. Apache 2.0 reference implementation of HMAC-chained audit logs for CLI coding agents. Four monthly tiers plus one one-time tier.';
const PAGE_URL = `${SITE_URL}/sponsors`;
const SPONSOR_URL = 'https://github.com/sponsors/chernistry';

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

/** Tier ladder. Single source - same shape feeds the table render and
 *  the JSON-LD Offer blocks below. Keep label + benefits in lowercase.
 *
 *  ``slug`` is the Umami prop value for the
 *  ``sponsors-tier-click`` event (compact + stable so the report
 *  groupings don't churn when copy is edited). */
const TIER_LADDER = [
  {
    price: '$5/mo',
    priceNumeric: 5,
    cadence: 'monthly',
    label: 'you starred bernstein',
    slug: '5mo',
    benefits:
      'name in BACKERS.md, sponsor-only monthly changelog with breaking-change advisories.',
  },
  {
    price: '$25/mo',
    priceNumeric: 25,
    cadence: 'monthly',
    label: 'you ship at a small company',
    slug: '25mo',
    benefits: 'above, plus a private sponsors discussion in the github repo.',
  },
  {
    price: '$100/mo',
    priceNumeric: 100,
    cadence: 'monthly',
    label: 'your team runs bernstein in CI',
    slug: '100mo',
    benefits: 'above, plus small avatar in README and bernstein.run/sponsors.',
  },
  {
    price: '$500/mo',
    priceNumeric: 500,
    cadence: 'monthly',
    label: 'your company depends on bernstein',
    slug: '500mo',
    benefits:
      'above, plus monthly 30-min office hours, logo + tagline on bernstein.run, security pre-disclosure for breaking changes.',
  },
  {
    price: '$25 one-time',
    priceNumeric: 25,
    cadence: 'one-time',
    label: 'say thanks for the audit-trail bug i logged',
    slug: '25one',
    benefits: 'name in BACKERS.md.',
  },
] as const;

/** Build the per-tier GitHub Sponsors deep link. GH Sponsors honours
 *  ``?frequency=monthly|one-time`` and ``?amount=N`` so a click on the
 *  $100 row preselects that tier rather than dropping the visitor on
 *  the generic landing page with nothing filled in. */
function tierHref(tier: (typeof TIER_LADDER)[number]): string {
  const params = new URLSearchParams({
    frequency: tier.cadence === 'monthly' ? 'recurring' : 'one-time',
    amount: String(tier.priceNumeric),
    metadata_source: `sponsors_tier_${tier.slug}`,
  });
  return `${SPONSOR_URL}?${params.toString()}`;
}

/** Build the JSON-LD graph emitted on this page. Person + WebPage +
 *  one Offer per tier. The Person @id matches the Organization graph
 *  founder @id in components/seo/OrganizationJsonLd.tsx so search
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
        'https://github.com/sponsors/chernistry',
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
    ...TIER_LADDER.map((tier) => ({
      '@context': 'https://schema.org',
      '@type': 'Offer',
      name: tier.label,
      description: tier.benefits,
      price: String(tier.priceNumeric),
      priceCurrency: 'USD',
      eligibleQuantity: {
        '@type': 'QuantitativeValue',
        unitCode: tier.cadence === 'monthly' ? 'MON' : 'C62',
      },
      url: SPONSOR_URL,
      seller: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: SITE_URL,
      },
    })),
  ];
}

export default async function SponsorsPage() {
  const sponsors = await fetchPublicSponsors();
  const realCount = sponsors.length;
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
              bernstein is the apache 2.0 reference implementation of an
              HMAC-chained audit log for parallel CLI coding agents. every
              scheduling decision is plain python, every agent action is
              tamper-evidently logged. the audit chain maps cleanly to EU AI
              Act Article 12 automatic event-logging and DORA Article 8-15
              ICT-incident-reporting evidence.
            </p>
            <p>
              {realCount === 0
                ? 'no sponsors yet. first three sponsors get listed by name on the homepage.'
                : `${realCount} ${realCount === 1 ? 'sponsor' : 'sponsors'} so far. ordered by recognizability, then alphabetical. real avatars only.`}
            </p>
            <p>
              <strong>what your sponsorship actually funds.</strong> one human
              running an audit-grade orchestrator. tokens going through the
              docs bot. infrastructure that keeps the audit-chain reference
              alive while the project waits for production users. the bet is
              that tamper-evident logging becomes table-stakes for regulated
              AI coding pipelines, and that an apache-licensed reference
              implementation is useful to have around when it does.
            </p>
            <p>
              <strong>stage honesty.</strong> a few hundred github stars. one
              maintainer. no production reference customer. no SOC 2 / ISO
              27001 / FedRAMP. tiers below are picked by who you are, not how
              much we are worth. nothing here gets diverted into growth
              marketing or paid distribution. it goes into code and
              audit-chain reference work.
            </p>
          </header>
        </div>

        <section aria-labelledby="audiences-heading" className="sponsors-audiences">
          <h2 id="audiences-heading" className="sponsor-wall__heading">
            if you are <em>...</em>
          </h2>
          {/* One card per kind of reader, each naming the tier that
              matches. Slugs match the umami sponsors-tier-click names so
              tier clicks stay attributable to the card that led to them. */}
          <div className="audience-grid">
            <article className="audience-card">
              <h3>...a regulated-industry engineer or OSPO contact</h3>
              <p>
                you work somewhere DORA, NIS2, EU AI Act Article 12, SR 11-7,
                or ISO 42001 lands on your plate. the audit chain is the
                primitive your compliance team actually needs from an AI
                coding pipeline. back the reference implementation so it
                stays around when procurement asks for one.
              </p>
              <p className="audience-tier-hint">$100/mo tier fits, see below.</p>
            </article>
            <article className="audience-card">
              <h3>...an AI safety or reliability researcher</h3>
              <p>
                you study agent behaviour and need a deterministic substrate
                that does not change the experiment when you re-run it.
                bernstein is plain python on the coordination path, zero LLM
                tokens on scheduling, every decision is in the HMAC chain.
                replayable end to end.
              </p>
              <p className="audience-tier-hint">$25/mo tier fits.</p>
            </article>
            <article className="audience-card">
              <h3>...a devtool founder building in this space</h3>
              <p>
                you compete on a different axis (TUI, swarm, kanban,
                hosted SaaS). the audit-grade column is empty in every one
                of the bigger projects&apos; readmes. backing this means the
                column stays in the public commons rather than getting
                absorbed into a closed-source vendor.
              </p>
              <p className="audience-tier-hint">$100/mo tier fits.</p>
            </article>
            <article className="audience-card">
              <h3>...an indie dev who likes the shape of it</h3>
              <p>
                bernstein saved you a few claude bills, or you starred it
                and want it to keep shipping. $5 or $25 a month covers a
                meaningful slice of openrouter tokens. lowercase voice. no
                growth-hack ladder.
              </p>
              <p className="audience-tier-hint">$5/mo or $25 one-time tier fits.</p>
            </article>
          </div>
        </section>

        <SponsorWall sponsors={sponsors} heading={null} />

        <section aria-labelledby="tiers-heading">
          <h2 id="tiers-heading" className="sponsor-wall__heading" style={{ marginBottom: 'var(--space-3)' }}>
            tier ladder
          </h2>
          <div className="tier-table-wrap">
            <table className="tier-table">
              <caption>four monthly tiers, one one-time. github sponsors caps at ten of each kind.</caption>
              <thead>
                <tr>
                  <th scope="col">tier</th>
                  <th scope="col">label</th>
                  <th scope="col">benefits</th>
                </tr>
              </thead>
              <tbody>
                {/* Each row's tier label cell is an anchor to the
                    GH-sponsors deep link with the tier preselected. The
                    cell carries both ``sponsors-tier-click`` (per-tier)
                    and ``gh-sponsors-click`` (every sponsors anchor), so
                    either name can be read on its own. ``rel="external"``
                    flags this as leaving the site without breaking the
                    GitHub page's auth flow. */}
                {TIER_LADDER.map((tier) => (
                  <tr key={`${tier.price}-${tier.label}`}>
                    <td>{tier.price}</td>
                    <td>
                      <a
                        href={tierHref(tier)}
                        rel="external noopener noreferrer"
                        target="_blank"
                        data-umami-event="sponsors-tier-click"
                        data-umami-event-tier={tier.slug}
                        data-umami-event-surface="sponsors-page-tier"
                        data-umami-event-conversion="sponsor-conversion"
                        aria-label={`sponsor at ${tier.price} tier - ${tier.label}`}
                      >
                        &ldquo;{tier.label}&rdquo;
                      </a>
                    </td>
                    <td>{tier.benefits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="sponsors-page__cta">
          <p>
            sponsor on github. 0% fee on personal-account sponsorships,
            stripe payouts, no middleman.
          </p>
          <a
            href={SPONSOR_URL}
            rel="external noopener noreferrer"
            target="_blank"
            data-umami-event="gh-sponsors-click"
            data-umami-event-source="sponsors-page-cta"
            data-umami-event-surface="sponsors-page-cta"
            data-umami-event-conversion="sponsor-conversion"
          >
            github.com/sponsors/chernistry &rarr;
          </a>
        </section>
      </main>
      <Footer />
      <BackToTop />
      <JsonLd data={jsonLd} />
    </>
  );
}
