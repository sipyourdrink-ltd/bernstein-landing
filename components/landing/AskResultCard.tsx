import type { SearchHit } from '@/lib/docs-search/types';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface AskResultCardProps {
  hit: SearchHit;
}

/**
 * Single result card on /ask. Same shape as a /blog card so the page
 * does not introduce a new visual unit; it reuses the editorial token
 * set (cream paper, italic Fraunces accent, JetBrains Mono labels).
 *
 * Internal links use a relative path; the indexer wrote an absolute
 * `https://bernstein.run/blog/<slug>` URL, but since we are on the
 * same origin we render the in-app path so client navigation stays
 * single-page-app-y when Next prefetches.
 */
export function AskResultCard({ hit }: AskResultCardProps) {
  const tags = hit.tags ?? [];
  const href = `/blog/${hit.slug}`;
  return (
    <a href={href} className="ask-card">
      <div className="ask-card-meta-row">
        {hit.date ? (
          <time className="ask-card-date" dateTime={hit.date}>
            {formatDate(hit.date)}
          </time>
        ) : null}
        <span aria-hidden className="ask-card-meta-sep">
          ·
        </span>
        <span className="ask-card-score" title="bm25 relevance score">
          score {hit.score.toFixed(2)}
        </span>
      </div>
      <h2 className="ask-card-title">{hit.title}</h2>
      <p className="ask-card-desc">{hit.excerpt}</p>
      {tags.length > 0 ? (
        <div className="ask-card-tags">
          {tags.slice(0, 4).map((tag) => (
            <span key={tag} className="ask-tag-chip">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <span className="ask-card-cta" aria-hidden>
        read in full
      </span>
    </a>
  );
}
