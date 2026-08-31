import { JsonLd } from './JsonLd';
import { SITE_URL, SITE_NAME, AUTHOR } from '@/lib/seo';
import type { FrontmatterT } from '@/lib/mdx';

/**
 * BlogPosting JSON-LD for /blog/[slug].
 *
 * Why BlogPosting, not TechArticle: Google's rich-result tester accepts
 * both, but BlogPosting renders the `publisher` row in the AI-overview
 * card whereas TechArticle hides it under a "More info" toggle. Since
 * the publisher edge is precisely what we want crawlers to follow back
 * to the Organization node, BlogPosting wins. The site already emits a
 * separate TechArticle through `lib/seo.ts.buildBlogPostJsonLd` for the
 * `<article>` microdata; emitting BlogPosting here is additive - Google
 * dedupes when the `@id` URLs match.
 */
export function BlogPostingJsonLd({
  slug,
  fm,
  readingMinutes,
}: {
  slug: string;
  fm: FrontmatterT;
  readingMinutes: number;
}) {
  const url = `${SITE_URL}/blog/${slug}`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#blogposting`,
    headline: fm.title,
    description: fm.description,
    datePublished: fm.date,
    /* `dateModified` falls back to the publish date when frontmatter
       does not carry an explicit edit timestamp. Search Console treats
       a missing dateModified as worse than one that equals
       datePublished, so always set both. */
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
        width: 512,
        height: 512,
      },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    image: `${SITE_URL}/api/og?title=${encodeURIComponent(fm.title)}`,
    timeRequired: `PT${readingMinutes}M`,
    inLanguage: 'en',
    ...(fm.tags && fm.tags.length > 0 ? { keywords: fm.tags.join(', ') } : {}),
  };
  return <JsonLd data={data} />;
}
