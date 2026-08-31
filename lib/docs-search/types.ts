/**
 * Shared types for the docs search index and retriever.
 *
 * Kept tiny on purpose. The shipped `public/docs-index.json` carries
 * the raw documents only - minisearch rebuilds its index in-process
 * on first query. That keeps the on-disk file small (no precomputed
 * inverted index) and keeps all version-coupling between minisearch
 * versions out of the wire format.
 */

export type DocRecord = {
  /** Stable ID, equal to slug. */
  id: string;
  /** Slug from the content directory name (e.g. "getting-started"). */
  slug: string;
  /** Frontmatter title. */
  title: string;
  /** Frontmatter description (also used as excerpt fallback). */
  description: string;
  /** First ~280 chars of body text after MDX stripping. */
  excerpt: string;
  /** Full plain-text body (MDX stripped). Used by BM25, never rendered. */
  body: string;
  /** Tags from frontmatter (lowercased). */
  tags: string[];
  /** ISO date string. */
  date: string;
  /** Public URL on bernstein.run. */
  url: string;
};

export type DocsIndex = {
  /** Schema version - bump on any breaking shape change. */
  version: 1;
  /** ISO timestamp of when the index was built. */
  builtAt: string;
  /** All searchable records. */
  docs: DocRecord[];
};

export type SearchHit = {
  slug: string;
  title: string;
  excerpt: string;
  url: string;
  score: number;
  /** Tags echoed back so the UI can show the same chips as /blog. */
  tags: string[];
  /** ISO date so the UI can render the same date format as /blog. */
  date: string;
};
