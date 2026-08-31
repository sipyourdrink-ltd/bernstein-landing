import { getAllPosts, BLOG_DIR } from '@/lib/mdx';
import {
  buildNewsSitemapBody,
  type NewsPost,
} from '@/lib/sitemap-news';

/**
 * Google News sitemap.
 *
 * Spec: https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
 *
 * Distinct from the regular `/sitemap.xml` for two reasons:
 *   1. Google News only ingests entries published in the **last 2 days**
 *      - anything older must NOT appear here (the spec is explicit).
 *   2. It uses the `news:` namespace and demands `news:publication`,
 *      `news:publication_date`, `news:title` per item.
 *
 * The crawl frequency is high (a few minutes for active publishers), so
 * the response carries a sha1 ETag and respects If-None-Match → 304 to
 * keep wire cost flat. Cache-Control matches the rss/sitemap routes.
 *
 * All XML rendering and date logic lives in `@/lib/sitemap-news` so the
 * unit test can exercise it without pulling in the React-heavy MDX loader.
 */

export async function GET(request: Request): Promise<Response> {
  const posts = await getAllPosts();
  const newsPosts: NewsPost[] = posts.map((p) => ({
    slug: p.slug,
    title: p.fm.title,
    date: p.fm.date,
    tags: p.fm.tags,
  }));

  const { xml, etag } = await buildNewsSitemapBody(newsPosts, new Date(), BLOG_DIR);

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
      },
    });
  }

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      ETag: etag,
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  });
}
