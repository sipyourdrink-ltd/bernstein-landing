/**
 * FeaturedPosts - compact 3-card "from the blog" triptych on the home page.
 *
 * Placement
 * ---------
 * Mounted *after* the install-snippet-bearing hero and PipelineRailMini so
 * mobile LCP isn't pushed below the fold.
 *
 * Layout & density
 * ----------------
 * Previously rendered inside `.v2-evidence` (`1fr 1fr`), which stacked three
 * full-size `BlogCard` banners vertically in the right half (~1,600 px tall)
 * beside an empty left column. Now uses `.v2-blog-strip`: a compact single-row
 * header above a 3-column horizontal grid (`.v2-blog-grid`) on desktop and
 * compact thumbnail-left horizontal rows on mobile, with descriptions clamped
 * to two lines and tag clouds omitted (tags live on `/blog`).
 *
 * Curation & hard cap
 * -------------------
 * Posts are pulled via `getFeaturedPosts()` in `lib/mdx.ts` (`featured: true`)
 * and hard-capped here with `.slice(0, 3)` so flagging a new post before
 * unflagging an old one can never spill a fourth card onto the home page.
 */

import Image from 'next/image';
import Link from 'next/link';
import type { PostIndex } from '@/lib/mdx';

export const MAX_FEATURED_POSTS = 3;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

interface FeaturedPostsProps {
  /** Curated featured posts, newest first. Empty array → section
   *  renders nothing (safe degrade if every flag is removed). */
  posts: PostIndex[];
}

export function FeaturedPosts({ posts }: FeaturedPostsProps) {
  const items = posts.slice(0, MAX_FEATURED_POSTS);
  if (items.length === 0) return null;
  return (
    <section
      className="v2-section v2-blog-strip"
      id="from-the-blog"
      aria-labelledby="from-the-blog-heading"
    >
      <div className="v2-blog-head">
        <div className="v2-blog-head-copy">
          <p className="v2-kicker">from the blog</p>
          <h2 id="from-the-blog-heading">
            {items.length} {items.length === 1 ? 'piece' : 'pieces'},{' '}
            <em>hand-picked</em>.
          </h2>
          <p className="v2-blog-sub">
            the org-kit plugin, what 4.0 tightened, and the autofix daemon for red CI on Bernstein-opened pull requests.
          </p>
        </div>
        <Link href="/blog" className="v2-blog-all">
          Read all field notes <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="v2-blog-grid">
        {items.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="v2-blog-pick"
          >
            {post.fm.cover && post.fm.coverAlt ? (
              <Image
                className="v2-blog-pick-cover"
                src={post.fm.cover}
                alt=""
                width={1200}
                height={630}
                unoptimized
                loading="lazy"
              />
            ) : (
              <div className="v2-blog-pick-cover v2-blog-pick-plate" aria-hidden="true">
                <svg
                  viewBox="0 0 1200 630"
                  width="1200"
                  height="630"
                  preserveAspectRatio="xMidYMid slice"
                  className="v2-blog-pick-plate-svg"
                >
                  <path d="M120 150 H360 L600 315 H1080" />
                  <path d="M120 260 H360 L600 315 H1080" />
                  <path d="M120 370 H360 L600 315 H1080" />
                  <path d="M120 480 H360 L600 315 H1080" />
                  <circle cx="600" cy="315" r="14" />
                </svg>
              </div>
            )}
            <div className="v2-blog-pick-body">
              <div className="v2-blog-pick-meta">
                <time dateTime={post.fm.date}>{formatDate(post.fm.date)}</time>
                <span aria-hidden="true">·</span>
                <span>{post.readingMinutes} min read</span>
              </div>
              <h3 className="v2-blog-pick-title">{post.fm.title}</h3>
              <p className="v2-blog-pick-desc">{post.fm.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
