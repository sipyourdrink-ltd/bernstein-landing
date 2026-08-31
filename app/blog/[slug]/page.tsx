import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllPosts, getPost, getSlugs, type PostIndex } from '@/lib/mdx';
import { SITE_URL, AUTHOR } from '@/lib/seo';
import { BlogPostingJsonLd } from '@/components/seo/BlogPostingJsonLd';
import { BlogHowToJsonLd } from '@/components/seo/BlogHowToJsonLd';
import { BlogTechArticleJsonLd } from '@/components/seo/BlogTechArticleJsonLd';
import { BlogPostBreadcrumb } from '@/components/seo/BreadcrumbListJsonLd';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { EmailCapture } from '@/components/landing/EmailCapture';
import { ShareButtons } from '@/components/blog/ShareButtons';
import { TocSidebar } from '@/components/blog/TocSidebar';
import { ReadingProgress } from '@/components/blog/ReadingProgress';
import { ReadingComplete } from '@/components/blog/ReadingComplete';
import { RelatedPosts, type RelatedPostCard } from '@/components/blog/RelatedPosts';
import { pickSiblings } from '@/lib/clusters';
import { withUtm } from '@/lib/utm';
import {
  ArticleCompressionRoot,
  ArticleCompressionTrigger,
  ArticleCompressionBody,
} from '@/components/blog/ArticleCompression';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await getSlugs();
  return slugs.map((slug) => ({ slug }));
}

/**
 * Word-boundary truncate helper for SEO title / description caps.
 *
 * Google SERP cuts <title> at ~60 chars; Slack / LinkedIn / Facebook
 * unfurl og:title at ~70 chars; meta-description at ~160. We trim at the
 * last whitespace at or before the cap so the cut never lands mid-word,
 * and strip trailing punctuation so the result reads as a complete
 * phrase. The visible H1 (`post.fm.title`) is unchanged - only the
 * <head> meta fields are capped.
 */
function capAtWordBoundary(s: string, cap: number): string {
  if (s.length <= cap) return s;
  const head = s.slice(0, cap);
  const lastSpace = head.lastIndexOf(' ');
  let cut = lastSpace > cap / 2 ? head.slice(0, lastSpace) : head;
  /* Iterate the trim: strip trailing punctuation, then any dangling
     conjunction/article/preposition that would leave the phrase
     mid-thought. Two passes are enough for natural-language titles. */
  for (let i = 0; i < 3; i += 1) {
    const before = cut;
    cut = cut.replace(/[\s,;:.\-]+$/, '');
    cut = cut.replace(/\s+(and|or|but|the|a|an|of|to|for|with|in|on|at|by|from|as)$/i, '');
    if (cut === before) break;
  }
  return cut;
}

/* Title cap is 60 chars in the SERP. The layout-level `title.template`
   appends ' | Bernstein' (12 chars), so the post-title slot is 48. */
const TITLE_CAP = 48;
/* og:title / twitter:title carry no template suffix, so the full 70-char
   social-unfurl budget is available. */
const OG_TITLE_CAP = 70;
/* meta-description and og/twitter:description share a 160-char cap. */
const DESCRIPTION_CAP = 160;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  /* Author-supplied `seo_title` (frontmatter) wins when present. Zod
     already enforces the <=60-char hard ceiling; we still defensively
     re-check the length so an out-of-band edit can't slip past the
     SERP cap. When set, emit as `title.absolute` so the parent layout's
     `template: '%s | Bernstein'` suffix is bypassed and the SERP <title>
     equals `seo_title` exactly. When absent, fall back to the
     word-boundary trim against the 48-char post-title slot
     (template ' | Bernstein' = 12 chars, SERP cap = 60). The visible
     H1 always uses `post.fm.title` - only the <head> meta fields
     honour `seo_title`. */
  const seoTitleOverride =
    post.fm.seo_title && post.fm.seo_title.length <= 60
      ? post.fm.seo_title
      : null;
  const trimmedTitle = capAtWordBoundary(post.fm.title, TITLE_CAP);
  const metaTitle: Metadata['title'] = seoTitleOverride
    ? { absolute: seoTitleOverride }
    : trimmedTitle;
  /* og:title / twitter:title carry no template suffix, so a present
     `seo_title` is used verbatim; otherwise use the 70-char trim. */
  const ogTitle = seoTitleOverride ?? capAtWordBoundary(post.fm.title, OG_TITLE_CAP);
  const metaDescription = capAtWordBoundary(post.fm.description, DESCRIPTION_CAP);
  return {
    title: metaTitle,
    description: metaDescription,
    authors: [{ name: AUTHOR }],
    alternates: { canonical: `${SITE_URL}/blog/${slug}` },
    openGraph: {
      type: 'article',
      title: ogTitle,
      description: metaDescription,
      url: `${SITE_URL}/blog/${slug}`,
      publishedTime: post.fm.date,
      authors: [AUTHOR],
      images: [{ url: `/api/og?title=${encodeURIComponent(post.fm.title)}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: metaDescription,
      images: [`/api/og?title=${encodeURIComponent(post.fm.title)}`],
    },
    other: {
      /* OpenGraph article metadata - picked up by Pocket / Instapaper /
         Readwise so saved-for-later cards have an author + publish date
         even before they finish their own extraction pass. */
      'article:author': AUTHOR,
      'article:published_time': post.fm.date,
      ...(post.fm.tags && post.fm.tags.length > 0
        ? { 'article:tag': post.fm.tags.join(',') }
        : {}),
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
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const all = await getAllPosts();
  const idx = all.findIndex((p) => p.slug === slug);
  // getAllPosts() is sorted newest-first.
  // "Previous" post = older = next index (idx + 1).
  // "Next" post = newer = previous index (idx - 1).
  const prev = idx >= 0 && idx + 1 < all.length ? all[idx + 1] : null;
  const next = idx > 0 ? all[idx - 1] : null;

  /* Related-posts strip (action-004, 2026-05-12). The picker returns
     3-5 sibling slugs from the topic-cluster map. We resolve each to
     a (title, date) card here on the server so the client component
     stays presentational and the markup is fully static - important
     for GPTBot / ClaudeBot, which don't run client JS. */
  const siblingSlugs = pickSiblings(slug, { min: 3, max: 5 });
  const postIndexBySlug = new Map(all.map((p) => [p.slug, p]));
  const relatedCards: RelatedPostCard[] = siblingSlugs
    .map((s) => postIndexBySlug.get(s))
    .filter((p): p is PostIndex => Boolean(p))
    .map((p) => ({ slug: p.slug, title: p.fm.title, date: p.fm.date }));

  const postUrl = `${SITE_URL}/blog/${slug}`;

  return (
    <>
      <Nav />
      <ReadingProgress wordCount={post.readingMinutes * 250} />
      <div className="blog-post-layout">
        <div>
          <ArticleCompressionRoot slug={slug}>
          <div className="blog-post-chrome blog-post-chrome--top" data-nosnippet>
            <a href="/blog" className="blog-back">
              &larr; Back to blog
            </a>
            <div className="blog-post-chrome-tools">
              <ArticleCompressionTrigger />
              <ShareButtons url={postUrl} title={post.fm.title} variant="compact" />
            </div>
          </div>

          {/* ARTICLE: ONLY the post body (h1, lede, byline, prose).
              Share/nav/aside/email-capture live in sibling chrome blocks
              so Safari Reader / Readability.js extract a clean article. */}
          <article
            className="blog-post"
            itemScope
            itemType="https://schema.org/TechArticle"
          >
            <header className="blog-post-header">
              <h1 itemProp="headline">{post.fm.title}</h1>
              {/* Frontmatter `description` stays in <head> meta only.
                  The visible authorial lede is rendered by the MDX
                  <Lead> component (`.lead`), so we don't double up here. */}
              <p className="blog-post-meta">
                <span>
                  By{' '}
                  <a
                    rel="author"
                    href="https://alexchernysh.com"
                    itemProp="author"
                    itemScope
                    itemType="https://schema.org/Person"
                  >
                    <span itemProp="name">{AUTHOR}</span>
                  </a>
                </span>
                <span aria-hidden="true">·</span>
                <time dateTime={post.fm.date} itemProp="datePublished">
                  {new Date(post.fm.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
                <meta itemProp="dateModified" content={post.fm.date} />
                <span aria-hidden="true">·</span>
                <span>{post.readingMinutes} min read</span>
              </p>
            </header>
            <ArticleCompressionBody className="prose">
              <div itemProp="articleBody">
                {post.mdx}
              </div>
              {/* ANALYTICS-002 sentinel: invisible bottom-of-article
                  marker the IntersectionObserver in ReadingComplete uses
                  to trigger ``blog-post-read-complete``. Lives INSIDE
                  the article body so it intersects only after the reader
                  actually finishes the post - distinct from the
                  document-bottom 95% scroll heuristic that older builds
                  used (which fires before the article ends because of
                  footer + related-posts). */}
              <ReadingComplete />
            </ArticleCompressionBody>
            {/* Hidden microdata for publisher - schema.org requires it on
                Article-family types but it doesn't need to render. */}
            <span
              itemProp="publisher"
              itemScope
              itemType="https://schema.org/Organization"
              style={{ display: 'none' }}
            >
              <span itemProp="name">Bernstein</span>
              <span
                itemProp="logo"
                itemScope
                itemType="https://schema.org/ImageObject"
              >
                <meta itemProp="url" content={`${SITE_URL}/favicon.svg`} />
              </span>
            </span>
            <meta itemProp="mainEntityOfPage" content={postUrl} />
          </article>

          <div className="blog-post-chrome blog-post-chrome--bottom" data-nosnippet>
            <ShareButtons url={postUrl} title={post.fm.title} variant="large" />
            <aside className="blog-author" aria-label="About the author">
              <strong>About the author.</strong>{' '}
              Written by{' '}
              <a
                href="https://alexchernysh.com"
                rel="author noopener"
                target="_blank"
                data-umami-event="click-author-site-out"
                data-umami-event-source="blog-author"
              >
                {AUTHOR}
              </a>
              , creator of{' '}
              <a
                href={withUtm('https://github.com/sipyourdrink-ltd/bernstein', {
                  source: 'bernstein.run',
                  medium: 'outbound-link',
                  campaign: 'blog-author-bio',
                })}
                rel="noopener"
                target="_blank"
                data-umami-event="outbound-github"
                data-umami-event-surface="blog-author-bio"
                data-umami-event-source="blog-author"
              >
                Bernstein
              </a>
              . Find more on{' '}
              <a
                href="https://github.com/chernistry"
                rel="me noopener"
                target="_blank"
                data-umami-event="click-author-gh-out"
                data-umami-event-source="blog-author"
              >
                GitHub
              </a>
              .
            </aside>
            {(prev || next) && (
              <nav className="blog-nextprev" aria-label="More posts">
                <div className="blog-nextprev-eyebrow-row">Read next</div>
                <div className="blog-nextprev-grid">
                  {prev ? (
                    <NextPrevCard post={prev} label="Previous" />
                  ) : (
                    <div
                      className="blog-nextprev-card blog-nextprev-card--empty"
                      aria-hidden="true"
                    />
                  )}
                  {next ? (
                    <NextPrevCard post={next} label="Next" />
                  ) : (
                    <div
                      className="blog-nextprev-card blog-nextprev-card--empty"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </nav>
            )}
            <RelatedPosts currentSlug={slug} cards={relatedCards} />
            <div className="blog-post-subscribe email-capture">
              <EmailCapture />
            </div>
            {/* Quiet one-line pointer to the weekly digest. Anchored
                in the bottom chrome so the canonical article body
                stays clean for Safari Reader / Readability.js. Reuses
                the `digest-signup-impression` event taxonomy - no new
                event names - so the existing report keeps reading the
                blog-footer surface without a schema change. */}
            <p className="blog-digest-line">
              Prefer a weekly recap?{' '}
              <a
                href="/ask"
                data-umami-event="digest-signup-impression"
                data-umami-event-source="blog-footer"
              >
                Subscribe to the weekly digest
              </a>
              .
            </p>
          </div>
          </ArticleCompressionRoot>
        </div>
        <aside className="blog-post-sidebar">
          <TocSidebar items={post.tableOfContents} />
        </aside>
      </div>
      <Footer />
      <BlogPostingJsonLd
        slug={slug}
        fm={post.fm}
        readingMinutes={post.readingMinutes}
      />
      {/* Secondary schema tier alongside BlogPosting: HowTo for
          procedural walkthroughs, TechArticle for architecture /
          comparison deep-dives. Both coexist with BlogPosting because
          Google dedupes on the URL @id and prefers the stronger tier
          when ranking citations. */}
      {post.fm.schemaType === 'HowTo' && (
        <BlogHowToJsonLd
          slug={slug}
          fm={post.fm}
          readingMinutes={post.readingMinutes}
        />
      )}
      {post.fm.schemaType === 'TechArticle' && (
        <BlogTechArticleJsonLd
          slug={slug}
          fm={post.fm}
          readingMinutes={post.readingMinutes}
        />
      )}
      <BlogPostBreadcrumb slug={slug} title={post.fm.title} />
    </>
  );
}
