import type { Metadata } from 'next';
import { getAllPosts } from '@/lib/mdx';
import { buildBlogIndexJsonLd, SITE_URL } from '@/lib/seo';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
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

  return (
    <>
      <Nav />
      <div className="blog-index">
        <h1>Blog</h1>
        <p>Engineering deep-dives, community spotlights, and updates from the Bernstein project.</p>
        {posts.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No posts yet. Check back soon.</p>
        ) : (
          <>
            {featured && <BlogCard post={featured} featured />}
            <BlogList posts={rest} />
          </>
        )}
      </div>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
