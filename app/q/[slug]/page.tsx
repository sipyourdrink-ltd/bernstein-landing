/**
 * /q/[slug] - one canonical question per route, server-rendered.
 *
 * Why a separate route at all (we already have /ask):
 *   - /ask is a search tool. ai-overview crawlers prefer to cite a url
 *     that *is* the answer over a url that is the search form. one
 *     answer per url gives the crawler something stable to point at.
 *   - the /q/<slug> shape is short, memorable, and easy to drop into
 *     prose ("see https://bernstein.run/q/how-does-the-audit-chain-work").
 *   - schema.org QAPage applies cleanly here; we'd otherwise lump
 *     thirty Q&As under one FAQPage on /ask, which Google's docs warn
 *     against for non-canonical or unstable answer sets.
 *
 * Source of truth: `data/ask-seed.json` via `lib/ask-seed.ts`. The
 * same seed drives:
 *   - quick-pick chips on /ask
 *   - the static FAQPage block on /ask (empty-state)
 *   - the FAQ section appended to /llms-full.txt
 *
 * `generateStaticParams` emits one route per seed item, so /q/<slug>
 * pages are built and cached at build time. There is no client code;
 * the entire surface is pure SSG plain HTML.
 *
 * Voice rules: lowercase, no em-dashes, no marketing-speak. Each
 * answer body is the unmodified `a` string from the seed.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { StaffDivider } from '@/components/landing/StaffDivider';
import { JsonLd } from '@/components/seo/JsonLd';
import { BreadcrumbListJsonLd } from '@/components/seo/BreadcrumbListJsonLd';
import { SITE_URL, SITE_NAME, AUTHOR } from '@/lib/seo';
import { getAllSeedItems, getSeedItem, type AskSeedItem } from '@/lib/ask-seed';

export async function generateStaticParams() {
  const items = await getAllSeedItems();
  return items.map((it) => ({ slug: it.slug }));
}

export const dynamic = 'force-static';
export const revalidate = false;

type Props = { params: Promise<{ slug: string }> };

function pageTitle(item: AskSeedItem): string {
  /* Keep the question as the title so search snippets, ai-overview
     headings, and the browser tab all match the canonical phrasing.
     The layout's `title.template` already appends ` | Bernstein`, so
     we do not repeat the brand here. */
  return item.q;
}

function pageDescription(item: AskSeedItem): string {
  /* Meta description leads with the literal answer body, capped at the
     SERP snippet cap (155 chars desktop / ~120 mobile). Previously
     truncated at 320 which let google clip mid-sentence and surface
     the question text instead of the answer in the snippet (issue #57:
     /q/* pages indexed at page-one bottom with zero click-through
     because the snippet repeated the query rather than answering it).
     Now: first 155 chars of the answer = the literal direct answer
     sentence, which is what AIO-style crawlers cite and what humans
     scan to decide whether to click. The full answer remains visible
     in the page body for AIO citation behaviour. */
  const text = item.a.replace(/\s+/g, ' ').trim();
  return text.length > 155 ? `${text.slice(0, 152)}...` : text;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await getSeedItem(slug);
  if (!item) return { title: 'Not found' };
  const url = `${SITE_URL}/q/${item.slug}`;
  const title = pageTitle(item);
  const desc = pageDescription(item);
  return {
    title,
    description: desc,
    authors: [{ name: AUTHOR }],
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title,
      description: desc,
      url,
      authors: [AUTHOR],
      images: [
        {
          url: `/api/og?title=${encodeURIComponent(item.q)}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
      images: [`/api/og?title=${encodeURIComponent(item.q)}`],
    },
    robots: { index: true, follow: true },
  };
}

/**
 * Resolve a `related` entry from the seed into a renderable
 * link. Slugs reference other q/<slug> pages; values that start
 * with `/` are treated as relative urls on bernstein.run.
 */
function relatedLink(
  ref: string,
  itemsBySlug: Map<string, AskSeedItem>,
): { href: string; label: string } | null {
  if (ref.startsWith('/')) {
    return { href: ref, label: ref };
  }
  const target = itemsBySlug.get(ref);
  if (!target) return null;
  return { href: `/q/${target.slug}`, label: target.q };
}

export default async function QPage({ params }: Props) {
  const { slug } = await params;
  const item = await getSeedItem(slug);
  if (!item) notFound();

  const all = await getAllSeedItems();
  const bySlug = new Map(all.map((it) => [it.slug, it]));
  const relatedItems = item.related
    .map((ref) => relatedLink(ref, bySlug))
    .filter((x): x is { href: string; label: string } => x !== null);

  const url = `${SITE_URL}/q/${item.slug}`;

  /* QAPage JSON-LD - google's preferred shape for a single Q&A page.
     The `acceptedAnswer.text` carries the full answer; `mainEntity`
     anchors the QAPage to itself so the schema validator can resolve
     the chain. dateModified is the seed file's `updated` field,
     but we don't expose that per-item yet; fall back to today. */
  const qaJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'QAPage',
    inLanguage: 'en',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    mainEntity: {
      '@type': 'Question',
      name: item.q,
      url,
      text: item.q,
      answerCount: 1,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
        url,
        author: {
          '@type': 'Organization',
          name: SITE_NAME,
          url: SITE_URL,
        },
      },
    },
  };

  return (
    <>
      <Nav />
      <main className="ask-page" aria-labelledby="q-heading">
        <header className="ask-header">
          <p className="ask-eyebrow">canonical answer</p>
          <h1 id="q-heading" className="ask-title">
            {item.q}
          </h1>
        </header>

        <StaffDivider />

        <article className="ask-faq-item" style={{ borderTop: 'none' }}>
          <p className="ask-faq-answer">{item.a}</p>
        </article>

        {item.tags.length > 0 ? (
          <p className="ask-meta" style={{ marginTop: '1.5rem' }}>
            <span className="ask-meta-label">tags</span>
            {item.tags.map((t, i) => (
              <span key={t}>
                <code>{t}</code>
                {i < item.tags.length - 1 ? (
                  <span className="ask-meta-sep" aria-hidden>
                    {' '}
                    ·{' '}
                  </span>
                ) : null}
              </span>
            ))}
          </p>
        ) : null}

        {relatedItems.length > 0 ? (
          <section
            className="ask-seeds"
            aria-labelledby="q-related-heading"
            style={{ marginTop: '2rem' }}
          >
            <h2 id="q-related-heading" className="ask-seeds-heading">
              related
            </h2>
            <ul className="ask-seeds-list" role="list">
              {relatedItems.map((r) => (
                <li key={r.href}>
                  <a className="ask-seed" href={r.href}>
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="ask-seeds-foot">
              browse the full index at <a href="/q">/q</a> or search the blog
              at <a href="/ask">/ask</a>.
            </p>
          </section>
        ) : null}
      </main>
      <Footer />

      <JsonLd data={qaJsonLd} />
      <BreadcrumbListJsonLd
        items={[
          { name: 'Home', url: SITE_URL },
          { name: 'Canonical answers', url: `${SITE_URL}/q` },
          { name: item.q, url },
        ]}
      />
    </>
  );
}
