/**
 * FeaturedPosts - "from the blog" strip on the home page.
 *
 * Why this exists
 * ---------------
 * The pre-2026-05-13 home rendered zero links to any individual
 * `/blog/<slug>` URL. Every blog post was a PageRank island while
 * `/` was racking up 287 impressions in the trailing 7 days alone.
 * Ticket: `.sdd/backlog/open/2026-05-12-action-001-home-internal-link-graph-rebuild.md`.
 *
 * Placement
 * ---------
 * Mounted *after* the install-snippet-bearing hero so mobile LCP isn't
 * pushed below the fold. The hero's RightRail promotes ABOVE the bot
 * column on phones, so the install snippet stays the first big block;
 * this strip lands further down the scroll.
 *
 * Styling
 * -------
 * Reuses `BlogCard` from the blog index. No new CSS file - the
 * `.blog-card` / `.blog-card--featured` rules in `styles/ux-blog.css`
 * already drive these cards on `/blog`, so they paint identically here.
 *
 * Curation
 * --------
 * Posts are pulled via `getFeaturedPosts()` in `lib/mdx.ts` (frontmatter
 * flag `featured: true`). Picked by hand on purpose: an automated
 * "latest 3" would push the next monthly recap ahead of a post that
 * stays useful for years.
 *
 * The heading counts `posts.length` rather than spelling a number out,
 * so flagging a fourth post cannot leave the heading saying "three".
 */

import type { PostIndex } from '@/lib/mdx';
import { BlogCard } from '@/components/blog/BlogCard';

interface FeaturedPostsProps {
  /** Curated featured posts, newest first. Empty array → section
   *  renders nothing (safe degrade if every flag is removed). */
  posts: PostIndex[];
}

export function FeaturedPosts({ posts }: FeaturedPostsProps) {
  if (posts.length === 0) return null;
  return (
    <section
      className="v2-section"
      id="from-the-blog"
      aria-labelledby="from-the-blog-heading"
    >
      <div className="v2-evidence">
        <header>
          <p className="v2-kicker">from the blog</p>
          <h2 id="from-the-blog-heading">
            {posts.length} {posts.length === 1 ? 'piece' : 'pieces'},{' '}
            <em>hand-picked</em>.
          </h2>
          <p>
            field notes from the orchestra pit: what the newest
            release fixed and what it did not, what running this in the cloud
            looks like, and how it started.
          </p>
        </header>
        <div className="blog-list-items">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
}
