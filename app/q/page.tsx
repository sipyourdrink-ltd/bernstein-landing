/**
 * /q - index of canonical Q&A pages, grouped by tag.
 *
 * Why an index page (the chips on /ask already link to /q/<slug>):
 *   - internal link surface. crawlers landing on a /q/<slug> via a
 *     citation breadcrumb back to /q, and /q lists every other slug
 *     under stable tag headings. without the index, the 44 leaf pages
 *     have no internal back-link other than the breadcrumb on each
 *     leaf and the empty-state list on /ask.
 *   - operator-discoverability gap. one short url that lists every
 *     canonical answer, so an operator can drop "see /q on
 *     bernstein.run" in a response instead of memorising slugs.
 *
 * Pure SSG, no client code. Source of truth: `data/ask-seed.json`.
 *
 * JSON-LD emitted:
 *   - CollectionPage with hasPart -> QAPage children (semantic shape
 *     for "this page is a collection of these pages").
 *   - ItemList with ListItem children (ordered, position-numbered,
 *     the shape Google's rich-result pipeline prefers for crawlable
 *     indices).
 *   Both blocks reference the same /q/<slug> urls, so the crawl chain
 *   is reachable two ways.
 */
import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { StaffDivider } from '@/components/landing/StaffDivider';
import { JsonLd } from '@/components/seo/JsonLd';
import { StaticPageBreadcrumb } from '@/components/seo/BreadcrumbListJsonLd';
import { SITE_URL, AUTHOR } from '@/lib/seo';
import { getAllSeedItems, type AskSeedItem } from '@/lib/ask-seed';

export const dynamic = 'force-static';
export const revalidate = false;

const PAGE_TITLE = 'canonical answers';
const PAGE_DESC =
  'short, citable answers to the questions people and machine readers ask about bernstein - what it is, how it works, how the audit chain works, how to run agents in parallel.';
const PAGE_URL = `${SITE_URL}/q`;

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
  },
  robots: { index: true, follow: true },
};

/**
 * Group seed items by their primary tag. The first tag in each item's
 * `tags[]` is treated as canonical (the seed orders tags so the most
 * specific category comes first). Items with no tags fall into a
 * synthetic "other" bucket; today the seed has no untagged items, but
 * the fallback keeps the page from silently dropping an entry if that
 * changes.
 */
interface TagGroup {
  tag: string;
  items: AskSeedItem[];
}

function groupByPrimaryTag(items: AskSeedItem[]): TagGroup[] {
  const map = new Map<string, AskSeedItem[]>();
  for (const it of items) {
    const tag = it.tags[0] ?? 'other';
    const bucket = map.get(tag);
    if (bucket) {
      bucket.push(it);
    } else {
      map.set(tag, [it]);
    }
  }
  /* Stable tag ordering: tags first appear in `items[]` order in the
     seed, and `Map` preserves insertion order, so iterating `map`
     gives a deterministic group order keyed by the seed file. That
     keeps the rendered html byte-stable across builds, which matters
     for the etag-based caching on /sitemap.xml and indexnow. */
  return Array.from(map, ([tag, groupItems]) => ({ tag, items: groupItems }));
}

function firstSentence(text: string, cap: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const sentenceEnd = cleaned.search(/[.!?]\s/);
  if (sentenceEnd > 0 && sentenceEnd <= cap) {
    return cleaned.slice(0, sentenceEnd + 1);
  }
  if (cleaned.length <= cap) return cleaned;
  return `${cleaned.slice(0, cap - 3)}...`;
}

export default async function QIndexPage() {
  const items = await getAllSeedItems();
  const groups = groupByPrimaryTag(items);

  /* CollectionPage is the right shape for a list of QAPage children;
     hasPart points at each /q/<slug> so the crawl chain is explicit.
     Keeping it lean - we don't repeat the answer text here (it lives
     on the individual /q/<slug> pages and on /ask). */
  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: PAGE_TITLE,
    description: PAGE_DESC,
    url: PAGE_URL,
    mainEntityOfPage: { '@type': 'WebPage', '@id': PAGE_URL },
    hasPart: items.map((it) => ({
      '@type': 'QAPage',
      url: `${SITE_URL}/q/${it.slug}`,
      name: it.q,
    })),
  };

  /* ItemList is the explicit ordered-index shape. Position is 1-based
     per schema.org. We render the same set as the visible <ol> so the
     structured-data view and the human view stay aligned. */
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: PAGE_TITLE,
    description: PAGE_DESC,
    url: PAGE_URL,
    numberOfItems: items.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/q/${it.slug}`,
      name: it.q,
    })),
  };

  return (
    <>
      <Nav />
      <main className="ask-page" aria-labelledby="q-index-heading">
        <header className="ask-header">
          <p className="ask-eyebrow">
            {items.length} answers · {groups.length} tags
          </p>
          <h1 id="q-index-heading" className="ask-title">
            {PAGE_TITLE}
          </h1>
          <p className="ask-lede">
            one canonical answer per url. drop <code>/q/&lt;slug&gt;</code>{' '}
            into prose or chat to cite a specific bernstein answer instead of
            the search page. grouped below by primary tag.
          </p>
        </header>

        <StaffDivider />

        {groups.map((group) => {
          const headingId = `q-group-${group.tag}`;
          return (
            <section
              key={group.tag}
              className="ask-faq"
              aria-labelledby={headingId}
            >
              <h2 id={headingId} className="ask-faq-heading">
                <code>{group.tag}</code>
                <span className="ask-meta-sep" aria-hidden>
                  {' '}
                  ·{' '}
                </span>
                <span className="ask-eyebrow" style={{ fontSize: '0.85em' }}>
                  {group.items.length} answer{group.items.length === 1 ? '' : 's'}
                </span>
              </h2>
              <ol className="ask-faq-list" role="list">
                {group.items.map((it) => (
                  <li key={it.slug} className="ask-faq-item">
                    <h3 className="ask-faq-q">
                      <a href={`/q/${it.slug}`}>{it.q}</a>
                    </h3>
                    <p className="ask-faq-answer">
                      {/* preview - first sentence, capped */}
                      {firstSentence(it.a, 240)}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </main>
      <Footer />

      <JsonLd data={collectionJsonLd} />
      <JsonLd data={itemListJsonLd} />
      <StaticPageBreadcrumb name="Canonical answers" slug="/q" />
    </>
  );
}
