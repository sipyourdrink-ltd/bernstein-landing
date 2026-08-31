/**
 * JSON-LD schema builder library.
 *
 * Structured data was being hand-written per page, which meant two
 * pages describing the same entity disagreed about its identity and a
 * malformed block was only caught by an external validator. These
 * builders return the object; the page decides which one it needs.
 *
 * Schema set emitted on every generated catalogue page:
 * - ``Article`` / ``TechArticle`` / ``Dataset`` / ``SoftwareApplication``
 *   (whichever matches the page content)
 * - ``Organization`` (already site-wide, but builders re-emit it
 *   inside graph contexts when needed)
 * - ``BreadcrumbList`` (universal nav)
 *
 * Public surface
 * --------------
 * - ``softwareApplicationLD`` - adapter pages (e.g. ``/vs/aider``)
 * - ``comparisonLD`` - vs-pages (e.g. ``/vs/<adapter>``)
 * - ``techArticleLD`` - CLI command reference (e.g. ``/docs/cli/run``)
 * - ``datasetLD`` - public-domain salary / benchmark data pages
 * - ``howToLD`` - resume templates, walkthroughs
 * - ``articleLD`` - feature deep-dives, prose pages
 * - ``breadcrumbLD`` - universal nav helper
 * - ``organizationLD`` - for graph composition
 *
 * Each builder returns a plain JS object. Inject via the
 * ``<JsonLd data={...} />`` component (alongside the existing
 * ``components/seo/JsonLd.tsx`` wrapper).
 *
 * Implementation notes
 * --------------------
 * - We do NOT take the ``schema-dts`` dependency. The strict types in
 *   that package are useful but every operator has the existing
 *   ``tests/json-ld-why-bernstein.test.ts`` style validator that
 *   catches structural drift. Adding a runtime dep for compile-time
 *   typing would violate the zero-new-dep rule (operator brief).
 * - Builders are pure functions - no I/O, no env reads - so they're
 *   trivial to unit-test and safe to call from server components.
 * - All builders set ``@context: 'https://schema.org'`` so the JSON-LD
 *   block is self-describing without a graph wrapper.
 */

/* Inlined constants from @/lib/seo - duplicated rather than imported so
   the builders can be tested with ``node --test --experimental-strip-types``
   without a path-alias resolver. If you change the values in lib/seo.ts,
   update them here too (they're load-bearing brand strings, so changes
   are exceedingly rare). */
const SITE_URL = 'https://bernstein.run';
const SITE_NAME = 'Bernstein';
const AUTHOR = 'Alex Chernysh';

/** Plain JSON-LD object - what we render inside <script type="application/ld+json">. */
export type JsonLdNode = Record<string, unknown>;

/** Stable Organization node. Used directly by ``organizationLD`` and as
 *  a publisher / author placeholder elsewhere.
 *
 *  The `@id` fragment matches components/seo/OrganizationJsonLd.tsx
 *  (`/#organization`), so generated catalogue pages and the site-wide block name the
 *  SAME Organization entity. An earlier `/#org` fragment split the
 *  knowledge graph into two entities and diluted the sameAs cluster. */
const ORGANIZATION_NODE: JsonLdNode = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.svg` },
  /* sameAs feeds the Knowledge Graph - list only verifiably-owned profiles. */
  sameAs: [
    'https://github.com/sipyourdrink-ltd/bernstein',
    'https://github.com/chernistry',
    'https://pypi.org/project/bernstein/',
    'https://www.npmjs.com/package/bernstein-orchestrator',
    'https://mastodon.social/@alexchernysh',
    'https://bsky.app/profile/alex-chernysh.bsky.social',
    'https://x.com/alex_chernysh',
  ],
};

/** Author / Person node. Reused by Article-shaped builders. */
const PERSON_AUTHOR_NODE: JsonLdNode = {
  '@type': 'Person',
  name: AUTHOR,
  url: 'https://alexchernysh.com',
  sameAs: [
    'https://alexchernysh.com',
    'https://github.com/chernistry',
    'https://x.com/alex_chernysh',
    'https://mastodon.social/@alexchernysh',
  ],
};

/** Universal Organization JSON-LD (call once site-wide if needed). */
export function organizationLD(): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    ...ORGANIZATION_NODE,
  };
}

// ---------------------------------------------------------------------------
// SoftwareApplication - adapter pages (e.g. /vs/aider)
// ---------------------------------------------------------------------------

export interface SoftwareApplicationMeta {
  /** Adapter / product display name. */
  name: string;
  /** Canonical page URL (absolute). */
  url: string;
  /** One-paragraph factual description. */
  description: string;
  /** Defaults to ``DeveloperApplication`` (Google's required value for dev tools). */
  applicationCategory?: string;
  /** Defaults to ``Cross-platform``. */
  operatingSystem?: string;
  /** Source repo URL, if any. */
  codeRepository?: string;
  /** SPDX-style license URL or identifier. */
  license?: string;
  /** Optional offer price. Defaults to free if omitted (matches Bernstein). */
  pricePerUnit?: string;
  /** Optional aggregateRating - only set if real reviews exist. */
  rating?: { value: string; count: string };
  /** Programming language (e.g. "Python"). */
  programmingLanguage?: string;
  /** Min runtime requirements (e.g. "Python 3.12+"). */
  softwareRequirements?: string;
}

export function softwareApplicationLD(meta: SoftwareApplicationMeta): JsonLdNode {
  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${meta.url}#software`,
    name: meta.name,
    description: meta.description,
    url: meta.url,
    applicationCategory: meta.applicationCategory ?? 'DeveloperApplication',
    operatingSystem: meta.operatingSystem ?? 'Cross-platform',
    isAccessibleForFree: meta.pricePerUnit ? meta.pricePerUnit === '0' : true,
    offers: {
      '@type': 'Offer',
      price: meta.pricePerUnit ?? '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    author: PERSON_AUTHOR_NODE,
    publisher: ORGANIZATION_NODE,
  };
  if (meta.codeRepository) node.codeRepository = meta.codeRepository;
  if (meta.license) node.license = meta.license;
  if (meta.programmingLanguage) node.programmingLanguage = meta.programmingLanguage;
  if (meta.softwareRequirements) node.softwareRequirements = meta.softwareRequirements;
  if (meta.rating) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: meta.rating.value,
      ratingCount: meta.rating.count,
      bestRating: '5',
      worstRating: '1',
    };
  }
  return node;
}

// ---------------------------------------------------------------------------
// Comparison - vs-pages (Article-with-itemList shape)
// ---------------------------------------------------------------------------

export interface ComparisonProduct {
  name: string;
  url: string;
  /** One-line description for the comparison. */
  description?: string;
}

export interface ComparisonMatrixRow {
  feature: string;
  productAValue: string;
  productBValue: string;
}

export interface ComparisonMeta {
  /** Canonical comparison page URL (absolute). */
  url: string;
  /** Page title - usually "<A> vs <B>". */
  title: string;
  /** Short factual blurb. */
  description: string;
  /** ISO publish date. */
  datePublished: string;
  /** ISO modified date (defaults to datePublished). */
  dateModified?: string;
}

/** Build a TechArticle-shaped comparison record. The matrix is included
 *  as ``mentions`` so AI overviews can extract the structured facts
 *  without reparsing the page body.
 */
export function comparisonLD(
  productA: ComparisonProduct,
  productB: ComparisonProduct,
  matrix: ComparisonMatrixRow[],
  meta: ComparisonMeta,
): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': meta.url,
    headline: meta.title,
    description: meta.description,
    datePublished: meta.datePublished,
    dateModified: meta.dateModified ?? meta.datePublished,
    author: PERSON_AUTHOR_NODE,
    publisher: ORGANIZATION_NODE,
    mainEntityOfPage: { '@type': 'WebPage', '@id': meta.url },
    about: [
      {
        '@type': 'SoftwareApplication',
        name: productA.name,
        url: productA.url,
        ...(productA.description ? { description: productA.description } : {}),
      },
      {
        '@type': 'SoftwareApplication',
        name: productB.name,
        url: productB.url,
        ...(productB.description ? { description: productB.description } : {}),
      },
    ],
    /* Each comparison row becomes a PropertyValue mention so an LLM
       summariser can extract feature-level facts. The shape mirrors
       Wikipedia infobox triples. */
    mentions: matrix.map((row) => ({
      '@type': 'PropertyValue',
      name: row.feature,
      value: `${productA.name}: ${row.productAValue}; ${productB.name}: ${row.productBValue}`,
    })),
    inLanguage: 'en',
  };
}

// ---------------------------------------------------------------------------
// TechArticle - CLI command reference pages
// ---------------------------------------------------------------------------

export interface TechArticleCommandFlag {
  flag: string;
  description: string;
  default?: string;
}

export interface TechArticleMeta {
  command: string;
  /** What the command does, in one paragraph. */
  description: string;
  flags: TechArticleCommandFlag[];
  url: string;
  datePublished: string;
  dateModified?: string;
}

export function techArticleLD(meta: TechArticleMeta): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': meta.url,
    headline: `${meta.command} - Bernstein CLI reference`,
    description: meta.description,
    datePublished: meta.datePublished,
    dateModified: meta.dateModified ?? meta.datePublished,
    author: PERSON_AUTHOR_NODE,
    publisher: ORGANIZATION_NODE,
    mainEntityOfPage: { '@type': 'WebPage', '@id': meta.url },
    proficiencyLevel: 'Beginner',
    /* Each CLI flag becomes a PropertyValue so an LLM extracting flags
       gets a typed shape rather than re-parsing markdown. */
    mentions: meta.flags.map((f) => ({
      '@type': 'PropertyValue',
      name: f.flag,
      description: f.description,
      ...(f.default !== undefined ? { defaultValue: f.default } : {}),
    })),
    inLanguage: 'en',
  };
}

// ---------------------------------------------------------------------------
// Dataset - public-domain salary / benchmark pages
// ---------------------------------------------------------------------------

export interface DatasetPercentile {
  /** e.g. "p10", "p50", "p90". */
  name: string;
  /** Numeric value (USD if salaries; raw if benchmark). */
  value: number;
  /** Optional unit string. */
  unit?: string;
}

export interface DatasetMeta {
  /** Page URL the dataset is presented on. */
  url: string;
  /** Display name (e.g. "Software engineer salaries - San Francisco"). */
  name: string;
  description: string;
  datePublished: string;
  /** Source URL (BLS OEWS table, etc.). */
  sourceUrl: string;
  /** Source name (e.g. "U.S. Bureau of Labor Statistics - OEWS"). */
  sourceName: string;
  /** Optional license (e.g. public-domain claim URL). */
  license?: string;
  /** Distribution percentiles. */
  percentiles: DatasetPercentile[];
}

export function datasetLD(
  role: string,
  region: string,
  percentiles: DatasetPercentile[],
  source: { name: string; url: string },
  extra?: Partial<DatasetMeta>,
): JsonLdNode {
  const url = extra?.url ?? `${SITE_URL}/data/salary/${region}/${role}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': url,
    name: extra?.name ?? `${role} salaries - ${region}`,
    description:
      extra?.description ??
      `Public-domain salary distribution for ${role} in ${region}, sourced from ${source.name}.`,
    url,
    datePublished: extra?.datePublished ?? new Date().toISOString().slice(0, 10),
    creator: ORGANIZATION_NODE,
    isBasedOn: source.url,
    citation: `${source.name} - ${source.url}`,
    license: extra?.license ?? 'https://www.usa.gov/government-works',
    distribution: percentiles.map((p) => ({
      '@type': 'DataDownload',
      name: p.name,
      contentUrl: url,
      encodingFormat: 'application/ld+json',
      ...(p.unit ? { unitText: p.unit } : {}),
      ...(typeof p.value === 'number' ? { value: p.value } : {}),
    })),
  };
}

// ---------------------------------------------------------------------------
// HowTo - resume templates, walkthroughs
// ---------------------------------------------------------------------------

export interface HowToStep {
  name: string;
  text: string;
  image?: string;
  url?: string;
}

export interface HowToMeta {
  url: string;
  name: string;
  description: string;
  datePublished?: string;
  totalTimeISO?: string; // e.g. "PT15M"
}

export function howToLD(steps: HowToStep[], meta: HowToMeta): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    '@id': meta.url,
    name: meta.name,
    description: meta.description,
    ...(meta.totalTimeISO ? { totalTime: meta.totalTimeISO } : {}),
    ...(meta.datePublished ? { datePublished: meta.datePublished } : {}),
    step: steps.map((s, idx) => ({
      '@type': 'HowToStep',
      position: idx + 1,
      name: s.name,
      text: s.text,
      ...(s.url ? { url: s.url } : {}),
      ...(s.image ? { image: s.image } : {}),
    })),
    author: PERSON_AUTHOR_NODE,
    publisher: ORGANIZATION_NODE,
  };
}

// ---------------------------------------------------------------------------
// FAQPage builder removed 2026-05-21.
// Google restricted FAQPage rich results to government and healthcare
// authorities in Aug 2023, so the schema was inert on commercial pages.
// All callers were swept; if a future schema type becomes viable, the
// previous helper (faqPageLD + FaqEntry) is in git history.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Article - feature deep-dives
// ---------------------------------------------------------------------------

export interface ArticleMeta {
  url: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  /** Hero / OG image URL. */
  image?: string;
  /** Optional keywords for AI summarizers. */
  keywords?: string[];
  /** Approximate read time in minutes. */
  readingMinutes?: number;
}

export function articleLD(meta: ArticleMeta): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': meta.url,
    headline: meta.headline,
    description: meta.description,
    datePublished: meta.datePublished,
    dateModified: meta.dateModified ?? meta.datePublished,
    author: PERSON_AUTHOR_NODE,
    publisher: ORGANIZATION_NODE,
    mainEntityOfPage: { '@type': 'WebPage', '@id': meta.url },
    inLanguage: 'en',
    ...(meta.image ? { image: meta.image } : {}),
    ...(meta.keywords ? { keywords: meta.keywords.join(', ') } : {}),
    ...(meta.readingMinutes ? { timeRequired: `PT${meta.readingMinutes}M` } : {}),
  };
}

// ---------------------------------------------------------------------------
// Person - author bio / about page
// ---------------------------------------------------------------------------

export interface PersonMeta {
  /** Canonical page that hosts the bio (the /about URL). */
  url: string;
  /** One-paragraph description of who the person is. */
  description: string;
  /** Optional job title / role string. */
  jobTitle?: string;
  /** Optional override for the same-as list; defaults to the project list. */
  sameAs?: string[];
}

/**
 * Person JSON-LD for the /about page.
 *
 * The Google E-E-A-T framework (Dec 2025 update) reads Person markup as
 * the canonical signal for "who is making these claims". The `sameAs`
 * list cross-links the bio to the verifiably-owned profiles so a
 * Knowledge-Graph crawler can stitch identity across surfaces. We do
 * not list properties we cannot prove (no awards, no affiliation, no
 * fabricated alma-mater); the page is honest about being a
 * solo-maintainer project.
 */
export function personLD(meta: PersonMeta): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${meta.url}#person`,
    name: AUTHOR,
    description: meta.description,
    url: meta.url,
    sameAs: meta.sameAs ?? [
      'https://alexchernysh.com',
      'https://github.com/chernistry',
      'https://x.com/alex_chernysh',
      'https://mastodon.social/@alexchernysh',
      SITE_URL,
    ],
    ...(meta.jobTitle ? { jobTitle: meta.jobTitle } : {}),
    worksFor: ORGANIZATION_NODE,
    mainEntityOfPage: { '@type': 'WebPage', '@id': meta.url },
  };
}

// ---------------------------------------------------------------------------
// BreadcrumbList - universal nav helper
// ---------------------------------------------------------------------------

export interface Breadcrumb {
  name: string;
  url: string;
}

export function breadcrumbLD(crumbs: Breadcrumb[]): JsonLdNode {
  if (!crumbs || crumbs.length === 0) {
    throw new Error('breadcrumbLD: at least one crumb required');
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: c.name,
      item: c.url,
    })),
  };
}
