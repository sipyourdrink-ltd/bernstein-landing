import { JsonLd } from './JsonLd';
import { SITE_URL, SITE_NAME, AUTHOR } from '@/lib/seo';
import type { FrontmatterT } from '@/lib/mdx';
import { slugifyHeading } from '@/lib/blog-headings';

/**
 * HowTo JSON-LD for procedural blog posts (e.g. getting-started,
 * operator-pack). Emitted alongside - not instead of - BlogPosting so
 * both can fire and Google dedupes on the matching `@id` URLs.
 *
 * Steps come from `fm.howToSteps`: each `name` mirrors a body H2 so
 * the LLM citation surface sees the same sequence the human reader
 * walks through. We do not invent steps that aren't in the post -
 * see ticket `2026-05-12-action-005` Risk section (schema-spam is a
 * demotion risk on Google's side).
 *
 * Block stays well under the 5 KB JSON-LD ceiling for posts with up
 * to ~12 short steps; the largest current post (operator-pack at 4
 * steps) lands well under 2 KB.
 */
export function BlogHowToJsonLd({
  slug,
  fm,
  readingMinutes,
}: {
  slug: string;
  fm: FrontmatterT;
  readingMinutes: number;
}) {
  if (!fm.howToSteps || fm.howToSteps.length === 0) return null;
  const url = `${SITE_URL}/blog/${slug}`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    '@id': `${url}#howto`,
    name: fm.title,
    description: fm.description,
    datePublished: fm.date,
    dateModified: fm.dateModified ?? fm.date,
    /* Reading time is a reasonable proxy for total task time - agents
       reading the schema benefit from the field being present, and
       human walkthroughs of these posts land close to the reading
       estimate. Marked optional in the schema; we always set it. */
    totalTime: `PT${readingMinutes}M`,
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
    inLanguage: 'en',
    step: fm.howToSteps.map((s, idx) => ({
      '@type': 'HowToStep',
      position: idx + 1,
      name: s.name,
      text: s.text,
      /* Each step deep-links to the matching H2 anchor in the post
         body so the schema and the human view stay aligned. We reuse
         the same slugifier the TOC builder uses (lib/blog-headings),
         which is also what `MdxH2` renders as the anchor id. */
      url: `${url}#${slugifyHeading(s.name)}`,
    })),
  };
  return <JsonLd data={data} />;
}
