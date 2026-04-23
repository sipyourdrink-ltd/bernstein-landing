import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllPosts, getPost, getSlugs, type PostIndex } from '@/lib/mdx';
import { buildBlogPostJsonLd, SITE_URL, AUTHOR } from '@/lib/seo';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { EmailCapture } from '@/components/landing/EmailCapture';
import { ShareButtons } from '@/components/blog/ShareButtons';
import { TocSidebar } from '@/components/blog/TocSidebar';
import { ReadingProgress } from '@/components/blog/ReadingProgress';

type Props = { params: { slug: string } };

export async function generateStaticParams() {
  const slugs = await getSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return {};
  return {
    title: post.fm.title,
    description: post.fm.description,
    authors: [{ name: AUTHOR }],
    alternates: { canonical: `${SITE_URL}/blog/${params.slug}` },
    openGraph: {
      type: 'article',
      title: post.fm.title,
      description: post.fm.description,
      url: `${SITE_URL}/blog/${params.slug}`,
      publishedTime: post.fm.date,
      authors: [AUTHOR],
      images: [{ url: `/api/og?title=${encodeURIComponent(post.fm.title)}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.fm.title,
      description: post.fm.description,
      images: [`/api/og?title=${encodeURIComponent(post.fm.title)}`],
    },
  };
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function NextPrevCard({
  post,
  label,
}: {
  post: PostIndex;
  label: 'Previous' | 'Next';
}) {
  return (
    <a href={`/blog/${post.slug}`} className="blog-nextprev-card">
      <div className="blog-nextprev-eyebrow">{label}</div>
      <div className="blog-nextprev-title">{post.fm.title}</div>
      <div className="blog-nextprev-date">
        <time dateTime={post.fm.date}>{formatShortDate(post.fm.date)}</time>
      </div>
    </a>
  );
}

export default async function BlogPost({ params }: Props) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  const jsonLd = buildBlogPostJsonLd(params.slug, post.fm, post.readingMinutes);

  const all = await getAllPosts();
  const idx = all.findIndex((p) => p.slug === params.slug);
  // getAllPosts() is sorted newest-first.
  // "Previous" post = older = next index (idx + 1).
  // "Next" post = newer = previous index (idx - 1).
  const prev = idx >= 0 && idx + 1 < all.length ? all[idx + 1] : null;
  const next = idx > 0 ? all[idx - 1] : null;

  const postUrl = `https://bernstein.run/blog/${params.slug}`;

  return (
    <>
      <Nav />
      <ReadingProgress />
      <div className="blog-post-layout">
        <article className="blog-post">
          <a href="/blog" className="blog-back">&larr; Back to blog</a>
          <header className="blog-post-header">
            <h1>{post.fm.title}</h1>
            <div className="blog-post-meta">
              <time dateTime={post.fm.date}>
                {new Date(post.fm.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </time>
              <span>{post.readingMinutes} min read</span>
            </div>
          </header>
          <ShareButtons url={postUrl} title={post.fm.title} variant="compact" />
          <div className="prose">{post.mdx}</div>
          <ShareButtons url={postUrl} title={post.fm.title} variant="large" />
          {(prev || next) && (
            <nav className="blog-nextprev" aria-label="More posts">
              <div className="blog-nextprev-eyebrow-row">Read next</div>
              <div className="blog-nextprev-grid">
                {prev ? (
                  <NextPrevCard post={prev} label="Previous" />
                ) : (
                  <div className="blog-nextprev-card blog-nextprev-card--empty" aria-hidden="true" />
                )}
                {next ? (
                  <NextPrevCard post={next} label="Next" />
                ) : (
                  <div className="blog-nextprev-card blog-nextprev-card--empty" aria-hidden="true" />
                )}
              </div>
            </nav>
          )}
          <div className="blog-post-subscribe">
            <EmailCapture />
          </div>
        </article>
        <aside className="blog-post-sidebar">
          <TocSidebar items={post.tableOfContents} />
        </aside>
      </div>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
