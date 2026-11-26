/**
 * Accept-header negotiation and edge-safe AIO discovery header builders.
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
import { AI_BOTS } from './seo/ai-bots.ts';

/**
 * Request header carrying the originally-requested path from middleware
 * to the markdown route.
 */
export const MARKDOWN_PATH_HEADER = 'x-markdown-path';

export const CANONICAL_PUBLIC_ORIGIN = 'https://bernstein.run';

/** Media types that mean "markdown" for our purposes. */
const MARKDOWN_TYPES = new Set(['text/markdown', 'text/x-markdown']);

/** Cheap reject before parsing. Runs on every request. */
const MENTIONS_MARKDOWN = /markdown/i;

/** Slug shape for a blog post or canonical Q&A slug. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Static pages with canonical markdown views and no unguarded edge TTL in next.config.mjs. */
export type NegotiableStaticPage =
  | 'about'
  | 'cli-quickstart'
  | 'spec-driven'
  | 'agent-failure-taxonomy-v0.1'
  | 'agent-md-bench';

const STATIC_PAGE_TARGETS: Readonly<Record<string, NegotiableStaticPage>> = {
  '/about': 'about',
  '/cli-quickstart': 'cli-quickstart',
  '/spec-driven': 'spec-driven',
  '/spec/agent-failure-taxonomy/v0.1': 'agent-failure-taxonomy-v0.1',
  '/tools/agent-md-bench': 'agent-md-bench',
};

/** The path shapes that have a markdown view. */
export type MarkdownTarget =
  | { kind: 'site-index' }
  | { kind: 'blog-post'; slug: string }
  | { kind: 'qa-index' }
  | { kind: 'qa-item'; slug: string }
  | { kind: 'static-page'; page: NegotiableStaticPage };

interface MediaRange {
  type: string;
  q: number;
}

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
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) q = parsed;
    }
    ranges.push({ type, q });
  }
  return ranges;
}

function exactQuality(ranges: MediaRange[], types: ReadonlySet<string>): number {
  let best = 0;
  for (const range of ranges) {
    if (types.has(range.type)) best = Math.max(best, range.q);
  }
  return best;
}

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

function parseSafeSlug(rawSegment: string): string | null {
  let slug: string;
  try {
    slug = decodeURIComponent(rawSegment);
  } catch {
    return null;
  }
  return SLUG.test(slug) ? slug : null;
}

/**
 * Which markdown view a path maps to, or null when the path has none.
 *
 * Routes with unguarded shared-cache `s-maxage` rules in next.config.mjs
 * (`/blog`, `/cost`, `/vs/*`, `/docs/cli*`) deliberately return null so
 * a CDN that ignores `Vary: Accept` can never cache a markdown body for
 * browsers.
 */
export function markdownTargetFor(pathname: string): MarkdownTarget | null {
  if (pathname === '/') return { kind: 'site-index' };

  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (normalized === '/q') return { kind: 'qa-index' };

  const staticPage = STATIC_PAGE_TARGETS[normalized];
  if (staticPage) return { kind: 'static-page', page: staticPage };

  const blog = /^\/blog\/([^/]+)\/?$/.exec(pathname);
  if (blog) {
    const slug = parseSafeSlug(blog[1]!);
    return slug ? { kind: 'blog-post', slug } : null;
  }

  const qa = /^\/q\/([^/]+)\/?$/.exec(pathname);
  if (qa) {
    const slug = parseSafeSlug(qa[1]!);
    return slug ? { kind: 'qa-item', slug } : null;
  }

  return null;
}

/**
 * Resolve the public origin used in RFC 8288 Link headers.
 *
 * Inside Next.js standalone Docker (`HOSTNAME=0.0.0.0`, `PORT=3000`),
 * `request.nextUrl.origin` resolves to `https://0.0.0.0:3000`, which
 * previously leaked unreachable bind addresses to AI crawlers on live
 * bernstein.run. Any missing or loopback/bind-all origin falls back to
 * the canonical public origin.
 */
const INTERNAL_HOST_ORIGIN = /^https?:\/\/(0\.0\.0\.0|127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/?$/i;

export function resolvePublicOrigin(candidate?: string | null): string {
  const trimmed = candidate?.trim().replace(/\/+$/, '') ?? '';
  if (!trimmed || INTERNAL_HOST_ORIGIN.test(trimmed)) {
    return CANONICAL_PUBLIC_ORIGIN;
  }
  return trimmed;
}

/**
 * RFC 8288 Link header advertising the RFC 9727 API catalog, llms.txt
 * indices, and A2A / MCP capability cards on the canonical public origin.
 */
export function buildAiDiscoveryLinkHeader(publicOrigin = CANONICAL_PUBLIC_ORIGIN): string {
  const origin = resolvePublicOrigin(publicOrigin);
  return [
    `<${origin}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
    `<${origin}/llms.txt>; rel="ai-content"; type="text/plain"`,
    `<${origin}/llms-full.txt>; rel="ai-content-full"; type="text/plain"`,
    `<${origin}/.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
    `<${origin}/.well-known/mcp/server-card.json>; rel="mcp-server"; type="application/json"`,
  ].join(', ');
}

/**
 * Machine-discovery surfaces that must carry `X-Robots-Tag: noindex, follow`
 * so search engines crawl outbound links inside them without indexing raw
 * plaintext/JSON descriptors as SERP results.
 */
const DISCOVERY_PATHS = new Set([
  '/llms.txt',
  '/llms-full.txt',
  '/robots.txt',
  '/ai.txt',
  '/agents.txt',
  '/humans.txt',
  '/agents.json',
  '/auth.md',
  '/AGENTS.md',
  '/openapi.yaml',
  '/mcp-server.json',
  '/mcp-catalog.json',
  '/structured-data.json',
]);

export function isDiscoveryPath(pathname: string): boolean {
  if (DISCOVERY_PATHS.has(pathname)) return true;
  return pathname.startsWith('/.well-known/');
}

export function buildPageResponseHeaders(params: {
  pathname: string;
  userAgent: string;
  publicOrigin?: string | null;
}): Record<string, string> {
  const { pathname, userAgent, publicOrigin } = params;
  const headers: Record<string, string> = {};

  headers['X-Robots-Tag'] = isDiscoveryPath(pathname)
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  if (markdownTargetFor(pathname) !== null) {
    headers['Vary'] = 'Accept';
  }

  if (AI_BOTS.some((bot) => userAgent.includes(bot))) {
    headers['X-AI-Content-Available'] = 'true';
    headers['Link'] = buildAiDiscoveryLinkHeader(resolvePublicOrigin(publicOrigin));
  }

  return headers;
}
