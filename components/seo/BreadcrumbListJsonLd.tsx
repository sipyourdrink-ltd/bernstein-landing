import { JsonLd } from './JsonLd';
import { SITE_URL } from '@/lib/seo';

export type BreadcrumbItem = {
  name: string;
  url: string;
};

/**
 * BreadcrumbList JSON-LD.
 *
 * Google renders this as the breadcrumb chip under the SERP title, which
 * matters most for blog post URLs that are otherwise opaque (e.g.
 * `/blog/orchestrator-on-someone-elses-box`). For the blog index we still
 * emit a 2-level Home > Blog crumb so the chip is consistent across the
 * section.
 */
export function BreadcrumbListJsonLd({ items }: { items: BreadcrumbItem[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
  return <JsonLd data={data} />;
}

export function BlogIndexBreadcrumb() {
  return (
    <BreadcrumbListJsonLd
      items={[
        { name: 'Home', url: SITE_URL },
        { name: 'Blog', url: `${SITE_URL}/blog` },
      ]}
    />
  );
}

export function BlogPostBreadcrumb({ slug, title }: { slug: string; title: string }) {
  return (
    <BreadcrumbListJsonLd
      items={[
        { name: 'Home', url: SITE_URL },
        { name: 'Blog', url: `${SITE_URL}/blog` },
        { name: title, url: `${SITE_URL}/blog/${slug}` },
      ]}
    />
  );
}

/**
 * Static page breadcrumb (Home > <name>).
 *
 * Used on /ask, /privacy, /terms - non-root routes whose URL alone is
 * fine but whose SERP chip benefits from an explicit "Home > Privacy"
 * trail that links Search Console's coverage report to the parent
 * page. The slug must include the leading slash.
 */
export function StaticPageBreadcrumb({ name, slug }: { name: string; slug: string }) {
  const path = slug.startsWith('/') ? slug : `/${slug}`;
  return (
    <BreadcrumbListJsonLd
      items={[
        { name: 'Home', url: SITE_URL },
        { name, url: `${SITE_URL}${path}` },
      ]}
    />
  );
}
