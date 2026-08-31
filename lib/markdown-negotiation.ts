/**
 * Accept-header negotiation for the markdown views of this site.
 *
 * A client that says it wants markdown gets markdown; everything else
 * gets the page. "Says it wants markdown" is deliberately narrow: the
 * client must name `text/markdown` (or `text/x-markdown`) explicitly
 * AND weight it strictly above `text/html`. Two consequences, both
 * intended:
 *
 *   - A browser never negotiates into markdown. Chrome names text/html
 *     first and ends on a catch-all wildcard at q=0.8; `text/markdown`
 *     would only match through that wildcard, and a wildcard does not
 *     count as naming a type here.
 *   - `Accept: text/markdown, text/html` gets HTML. RFC 9110 section
 *     12.5.1 gives no preference to list order, so equal weights are
 *     not a preference and this returns false. A client that wants
 *     markdown can say `text/markdown, text/html;q=0.9`.
 *
 * This module is imported by middleware, which runs in the edge
 * runtime. It must stay free of `node:` imports and of anything that
 * touches the filesystem - the route handler does that part.
 */

/**
 * Request header carrying the originally-requested path from middleware
 * to the markdown route.
 *
 * It has to be a header rather than a query parameter on the rewrite
 * target, because a handler reached through a rewrite sees the original
 * request URL and never the rewritten one.
 *
 * The route does not trust it. A client can set this header on a direct
 * hit to /api/_markdown, since middleware does not run on /api paths -
 * so the value is validated by `markdownTargetFor` like any other
 * input, and the most a forged value can produce is the markdown of a
 * published post, which is already public at its own URL.
 */
export const MARKDOWN_PATH_HEADER = 'x-markdown-path';

/** Media types that mean "markdown" for our purposes. */
const MARKDOWN_TYPES = new Set(['text/markdown', 'text/x-markdown']);

/** Cheap reject before parsing. Runs on every request. */
const MENTIONS_MARKDOWN = /markdown/i;

/** Slug shape for a blog post. Matches lib/mdx's kebab-case directories. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** The path shapes that have a markdown view. */
export type MarkdownTarget =
  | { kind: 'site-index' }
  | { kind: 'blog-post'; slug: string };

interface MediaRange {
  type: string;
  q: number;
}

/**
 * Parse an Accept header into media ranges with their quality values.
 * Malformed parameters are ignored rather than throwing: a header we
 * cannot read is a header that does not ask for markdown.
 */
function parseAccept(header: string): MediaRange[] {
  const ranges: MediaRange[] = [];
  for (const part of header.split(',')) {
    const [rawType, ...params] = part.split(';');
    const type = rawType?.trim().toLowerCase();
    if (!type) continue;

    let q = 1;
    for (const param of params) {
      const [rawKey, rawValue] = param.split('=');
      if (rawKey?.trim().toLowerCase() !== 'q') continue;
      const parsed = Number.parseFloat(rawValue ?? '');
      /* An unreadable or out-of-range q is treated as the default. */
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) q = parsed;
    }
    ranges.push({ type, q });
  }
  return ranges;
}

/**
 * Best quality value for an exactly-named type. A wildcard range does
 * not count: it says the client will take anything, not that it is
 * asking for this.
 */
function exactQuality(ranges: MediaRange[], types: ReadonlySet<string>): number {
  let best = 0;
  for (const range of ranges) {
    if (types.has(range.type)) best = Math.max(best, range.q);
  }
  return best;
}

/**
 * Best quality value for HTML, wildcard ranges included. They count on
 * this side: a client offering a catch-all at q=0.8 genuinely will
 * accept HTML, and scoring that as zero would let a bare
 * markdown-plus-wildcard header negotiate into markdown on the
 * strength of the wildcard alone.
 */
function htmlQuality(ranges: MediaRange[]): number {
  let best = 0;
  for (const range of ranges) {
    if (range.type === 'text/html' || range.type === 'text/*' || range.type === '*/*') {
      best = Math.max(best, range.q);
    }
  }
  return best;
}

/** Does this Accept header explicitly prefer markdown over HTML? */
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept || !MENTIONS_MARKDOWN.test(accept)) return false;
  const ranges = parseAccept(accept);
  const markdown = exactQuality(ranges, MARKDOWN_TYPES);
  if (markdown <= 0) return false;
  return markdown > htmlQuality(ranges);
}

/**
 * Which markdown view a path maps to, or null when the path has none.
 *
 * Only two shapes have one: the site index and a blog post. Anything
 * else - /cost, /vs/aider, a nested path under /blog - is not
 * negotiable and is left alone, because there is no markdown source
 * for it and synthesising one would mean inventing content.
 */
export function markdownTargetFor(pathname: string): MarkdownTarget | null {
  if (pathname === '/') return { kind: 'site-index' };

  const blog = /^\/blog\/([^/]+)\/?$/.exec(pathname);
  if (!blog) return null;

  /* Decode before validating so a percent-encoded traversal ("%2e%2e")
     is rejected by the slug pattern rather than sailing through it. A
     malformed escape sequence throws; that is a reject, not a crash. */
  let slug: string;
  try {
    slug = decodeURIComponent(blog[1]!);
  } catch {
    return null;
  }
  if (!SLUG.test(slug)) return null;

  return { kind: 'blog-post', slug };
}
