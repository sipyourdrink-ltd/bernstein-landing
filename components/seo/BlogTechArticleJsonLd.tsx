import { JsonLd } from './JsonLd';
import { SITE_URL, SITE_NAME, AUTHOR } from '@/lib/seo';
import type { FrontmatterT } from '@/lib/mdx';

/**
 * TechArticle JSON-LD for architecture / comparison deep-dives that
 * read as technical reference rather than news (e.g. cost-aware-routing,
 * module-decomposition). Emitted alongside the existing BlogPosting so
 * Google can pick the stronger tier when ranking AI Overview citations
 * - TechArticle treats the URL as docs, not journalism.
 *
 * `proficiencyLevel: Expert` is a deliberate signal: these posts assume
 * the reader already runs multi-agent CLI tooling. `dependencies` carry
 * the actual prerequisites pulled from each post body (runtime versions,
 * required CLIs, accounts). We never invent dependencies - schema-spam
 * is a demotion risk per ticket
 * `2026-05-12-action-005-howto-techarticle-schema-on-blog`.
 */
export function BlogTechArticleJsonLd({
  slug,
  fm,
  readingMinutes,
}: {
  slug: string;
  fm: FrontmatterT;
  readingMinutes: number;
}) {
  const url = `${SITE_URL}/blog/${slug}`;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${url}#techarticle`,
    headline: fm.title,
    description: fm.description,
    datePublished: fm.date,
    dateModified: fm.dateModified ?? fm.date,
    author: {
      '@type': 'Person',
      '@id': 'https://alexchernysh.com/#person',
      name: AUTHOR,
      url: 'https://alexchernysh.com',
    },
    publisher: {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/favicon.svg`,
      },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: `${SITE_URL}/api/og?title=${encodeURIComponent(fm.title)}`,
    timeRequired: `PT${readingMinutes}M`,
    inLanguage: 'en',
    /* Architecture / comparison posts assume the reader is a working
       engineer evaluating tooling, not a beginner reading a tutorial.
       schema.org enumerates Beginner | Intermediate | Expert. */
    proficiencyLevel: 'Expert',
  };
  if (fm.techDependencies && fm.techDependencies.length > 0) {
    /* schema.org's `dependencies` field on TechArticle is a string per
       the spec (free-form prerequisite list). We join with `; ` so the
       parser handles it cleanly and the rendered AI-Overview chip
       stays readable. */
    data.dependencies = fm.techDependencies.join('; ');
  }
  if (fm.tags && fm.tags.length > 0) {
    data.keywords = fm.tags.join(', ');
  }
  return <JsonLd data={data} />;
}
