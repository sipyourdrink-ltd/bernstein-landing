'use client';

import { track, UmamiEvent } from '@/lib/analytics/events';

/**
 * Sibling-link strip rendered below every /blog/<slug> body.
 *
 * The picker (lib/clusters.ts) supplies a deterministic 3-5 entry list
 * pulled from a hand-curated topic-cluster map at
 * content/blog/_clusters.yaml. The server passes us already-resolved
 * cards so this stays a thin presentational client component - the
 * only reason it isn't a server component is the onClick handler that
 * emits the InternalLinkClick Umami event.
 *
 * Style note: re-uses the existing .blog-nextprev-card chrome the
 * read-next strip already uses, plus a small .blog-related-grid wrapper
 * that lays them out 3-up at wide widths (vs the 2-up nextprev grid).
 * No new CSS file - the rules live in styles/ux-blog.css.
 *
 * Action-004 (2026-05-12) - installed to push sibling-link density from
 * ~2 to ≥ 5 so Google's topic-cluster signal and LLM crawlers can see
 * the hub-and-spoke graph.
 */

export interface RelatedPostCard {
  /** Destination slug (the dir name under content/blog/). */
  slug: string;
  /** Frontmatter title - rendered as the card body. */
  title: string;
  /** ISO date string from frontmatter. */
  date: string;
}

interface RelatedPostsProps {
  /** Slug of the current post. Stamped onto the wrapper as a
   *  data-current-slug attribute so Playwright snapshots / heatmap
   *  exports can correlate the strip to the source page without
   *  reading the URL. Not emitted on the Umami event (Umami already
   *  records the source URL via the pageview). */
  currentSlug: string;
  cards: RelatedPostCard[];
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function RelatedPosts({ currentSlug, cards }: RelatedPostsProps) {
  /* Picker may return fewer than the requested 3 in pathological YAML
     edits. Render nothing rather than half a strip - the eyebrow row
     would otherwise look broken. The build-time guard in lib/mdx.ts
     prevents the unclustered case; this guard is defence-in-depth. */
  if (!cards || cards.length === 0) return null;

  return (
    <nav
      className="blog-related"
      aria-label="related posts"
      data-current-slug={currentSlug}
    >
      <div className="blog-nextprev-eyebrow-row">related posts</div>
      <div className="blog-related-grid">
        {cards.map((card) => (
          <a
            key={card.slug}
            href={`/blog/${card.slug}`}
            className="blog-nextprev-card"
            onClick={() => {
              /* Fires before navigation. We don't preventDefault: the
                 auto-tracker enqueues asynchronously and a navigation
                 pause would feel laggy. Per the events.ts contract,
                 props are enums + booleans + slugs only - no free-form
                 text, no PII. */
              track(UmamiEvent.InternalLinkClick, {
                target_blog: card.slug,
                source: 'related-posts',
              });
            }}
          >
            <div className="blog-nextprev-eyebrow">read next</div>
            <div className="blog-nextprev-title">{card.title}</div>
            <div className="blog-nextprev-date">
              <time dateTime={card.date}>{formatShortDate(card.date)}</time>
            </div>
          </a>
        ))}
      </div>
    </nav>
  );
}
