import type { Metadata } from 'next';
import { getAllPosts } from '@/lib/mdx';
import { buildBlogIndexJsonLd, SITE_URL } from '@/lib/seo';
import { fetchLatestBernsteinVersion } from '@/lib/bernstein-version';
import { BlogIndexBreadcrumb } from '@/components/seo/BreadcrumbListJsonLd';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { StaffDivider } from '@/components/landing/StaffDivider';
import { BlogCard } from '@/components/blog/BlogCard';
import { BlogList } from '@/components/blog/BlogList';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Engineering deep-dives, community spotlights, and updates from the Bernstein project.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: 'Bernstein Blog',
    description: 'Engineering deep-dives, community spotlights, and updates from the Bernstein project.',
    url: `${SITE_URL}/blog`,
    type: 'website',
  },
};

export default async function BlogIndex() {
  const posts = await getAllPosts();
  const jsonLd = buildBlogIndexJsonLd(posts);
  const [featured, ...rest] = posts;
  /* Pull the latest release tag from GitHub at build / revalidate
     time. On failure we render the eyebrow without a version chunk
     rather than leaking a stale value to readers. */
  const latestVersion = await fetchLatestBernsteinVersion();
  const eyebrow = latestVersion
    ? `Field notes · open source · ${latestVersion}`
    : 'Field notes · open source';

  return (
    <>
      <Nav />
      <main className="blog-index" aria-labelledby="blog-index-heading">
        <header className="blog-index-header">
          <p className="blog-index-eyebrow">{eyebrow}</p>
          <h1 id="blog-index-heading" className="blog-index-title">
            Field <em>notes</em> from the orchestra pit.
          </h1>
          <p className="blog-index-lede">
            Engineering deep-dives, community spotlights, and updates from the
            Bernstein project - written when something is worth writing down.
          </p>
        </header>

        <StaffDivider />

        {/* RSS subscribe surface (conv-003, 2026-05-17). Sits in the
            body, NOT in the hero band (hero is owned by an adjacent
            ticket). Auto-discovery via <link rel="alternate"> in
            layout.tsx covers feed readers; this is the visible button
            for the non-feed-reader audience. */}
        <p
          style={{
            margin: '12px 0 24px',
            fontSize: '12.5px',
            color: 'var(--ink-soft, #707078)',
          }}
        >
          subscribe via{' '}
          <a
            href="/rss.xml"
            className="rss-subscribe-link"
            data-umami-event="rss-subscribe-click"
            data-umami-event-source="blog"
            style={{ color: 'inherit', textDecoration: 'underline' }}
          >
            RSS
          </a>
          .
        </p>

        {posts.length === 0 ? (
          <p className="blog-index-empty">No posts yet. Check back soon.</p>
        ) : (
          <div className="blog-index-body">
            {featured && <BlogCard post={featured} featured />}
            <BlogList posts={rest} />
          </div>
        )}
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BlogIndexBreadcrumb />
    </>
  );
}
