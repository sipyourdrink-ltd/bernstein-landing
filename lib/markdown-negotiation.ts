/**
 * Accept-header negotiation, explicit `.md` URL twin resolution, and
 * edge-safe AIO discovery header builders.
 *
 * Content negotiation rules:
 *   - A client must explicitly name `text/markdown` or `text/x-markdown`
 *     with `q > 0` (wildcard media ranges never count as naming
 *     markdown) and weight it `>=` `text/html` (including `q=1` ties,
 *     which `Claude Code`, `GitHub Copilot CLI`, and `Microsoft Copilot`
 *     send when requesting both markdown and html).
 *   - Browsers never name `text/markdown`, so `markdown === 0` and
 *     browsers always receive HTML.
 *   - Explicit `.md` URL twins (`/index.md`, `/about.md`, `/cost.md`,
 *     `/cli-quickstart.md`, `/spec-driven.md`,
 *     `/spec/agent-failure-taxonomy/v0.1.md`, `/tools/agent-md-bench.md`,
 *     `/q.md`, `/q/<slug>.md`, `/blog/<slug>.md`) serve markdown
 *     unconditionally with `X-Robots-Tag: noindex, follow` and a
 *     canonical `Link` pointing back to the HTML route.
 *
 * Edge-runtime safe: zero `node:` or filesystem imports.
 */
import { AI_BOTS } from './seo/ai-bots.ts';

export const MARKDOWN_PATH_HEADER = 'x-markdown-path';

export const CANONICAL_PUBLIC_ORIGIN = 'https://bernstein.run';

const MARKDOWN_TYPES = new Set(['text/markdown', 'text/x-markdown']);

const MENTIONS_MARKDOWN = /markdown/i;

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

const AI_BOTS_LOWER: readonly string[] = AI_BOTS.map((bot) => bot.toLowerCase());

/** Static pages negotiable via `Accept: text/markdown` on their canonical HTML URL (no unguarded s-maxage in next.config.mjs). */
export type NegotiableStaticPage =
  | 'about'
  | 'cli-quickstart'
  | 'spec-driven'
  | 'agent-failure-taxonomy-v0.1'
  | 'agent-md-bench';

/** All static pages that have a markdown representation (includes `/cost.md` explicit twin). */
export type StaticMarkdownPage = NegotiableStaticPage | 'cost';

const NEGOTIABLE_STATIC_TARGETS: Readonly<Record<string, NegotiableStaticPage>> = {
  '/about': 'about',
  '/cli-quickstart': 'cli-quickstart',
  '/spec-driven': 'spec-driven',
  '/spec/agent-failure-taxonomy/v0.1': 'agent-failure-taxonomy-v0.1',
  '/tools/agent-md-bench': 'agent-md-bench',
};

const EXPLICIT_TWIN_STATIC_TARGETS: Readonly<
  Record<string, { page: StaticMarkdownPage; canonicalPath: string }>
> = {
  '/about.md': { page: 'about', canonicalPath: '/about' },
  '/cli-quickstart.md': { page: 'cli-quickstart', canonicalPath: '/cli-quickstart' },
  '/cost.md': { page: 'cost', canonicalPath: '/cost' },
  '/spec-driven.md': { page: 'spec-driven', canonicalPath: '/spec-driven' },
  '/spec/agent-failure-taxonomy/v0.1.md': {
    page: 'agent-failure-taxonomy-v0.1',
    canonicalPath: '/spec/agent-failure-taxonomy/v0.1',
  },
  '/tools/agent-md-bench.md': {
    page: 'agent-md-bench',
    canonicalPath: '/tools/agent-md-bench',
  },
};

const HTML_TO_TWIN_STATIC: Readonly<Record<string, string>> = {
  '/': '/index.md',
  '/about': '/about.md',
  '/cost': '/cost.md',
  '/cli-quickstart': '/cli-quickstart.md',
  '/spec-driven': '/spec-driven.md',
  '/spec/agent-failure-taxonomy/v0.1': '/spec/agent-failure-taxonomy/v0.1.md',
  '/tools/agent-md-bench': '/tools/agent-md-bench.md',
  '/q': '/q.md',
};

export type MarkdownTarget =
  | { kind: 'site-index' }
  | { kind: 'blog-post'; slug: string }
  | { kind: 'qa-index' }
  | { kind: 'qa-item'; slug: string }
  | { kind: 'static-page'; page: StaticMarkdownPage };

export interface MarkdownTwinMatch {
  target: MarkdownTarget | null;
  canonicalPath: string | null;
}

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

/**
 * Does this Accept header explicitly request markdown at `>=` HTML quality?
 *
 * Wildcards never count toward `markdown`, so browsers (`text/html, ..., *\/*;q=0.8`)
 * have `markdown === 0` and always receive HTML, whereas coding agents sending
 * `Accept: text/markdown, text/html, *\/*` (`q=1` tie) receive markdown.
 */
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept || !MENTIONS_MARKDOWN.test(accept)) return false;
  const ranges = parseAccept(accept);
  const markdown = exactQuality(ranges, MARKDOWN_TYPES);
  if (markdown <= 0) return false;
  return markdown >= htmlQuality(ranges);
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
 * Which markdown view an `Accept`-negotiated HTML path maps to, or null.
 *
 * Routes with unguarded shared-cache `s-maxage` rules in next.config.mjs
 * (`/blog`, `/cost`, `/vs/*`, `/docs/cli*`) deliberately return null on
 * Accept negotiation; `/cost` exposes `/cost.md` as an explicit twin instead.
 */
export function markdownTargetFor(pathname: string): MarkdownTarget | null {
  if (pathname === '/') return { kind: 'site-index' };

  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (normalized === '/q') return { kind: 'qa-index' };

  const staticPage = NEGOTIABLE_STATIC_TARGETS[normalized];
  if (staticPage) return { kind: 'static-page', page: staticPage };

  const blog = /^\/blog\/([^/]+)\/?$/.exec(pathname);
  if (blog) {
    /* Exclude `.md` twin URLs from HTML Accept negotiation; they are handled by markdownTwinTargetFor. */
    if (blog[1]!.toLowerCase().endsWith('.md')) return null;
    const slug = parseSafeSlug(blog[1]!);
    return slug ? { kind: 'blog-post', slug } : null;
  }

  const qa = /^\/q\/([^/]+)\/?$/.exec(pathname);
  if (qa) {
    if (qa[1]!.toLowerCase().endsWith('.md')) return null;
    const slug = parseSafeSlug(qa[1]!);
    return slug ? { kind: 'qa-item', slug } : null;
  }

  return null;
}

/**
 * Resolve an explicit `/*.md` URL twin path.
 *
 * Returns `null` when `pathname` is NOT an explicit `.md` twin path
 * (e.g. `/auth.md`, `/AGENTS.md`, `/spec/agent-failure-taxonomy/CHANGELOG.md`,
 * or ordinary HTML paths). Returns `{ target: null, canonicalPath: null }`
 * when a `/blog/*.md` or `/q/*.md` path carries a malformed/traversal slug
 * so callers return a clean `404` markdown response with `X-Robots-Tag: noindex`.
 */
export function markdownTwinTargetFor(pathname: string): MarkdownTwinMatch | null {
  if (pathname === '/index.md') {
    return { target: { kind: 'site-index' }, canonicalPath: '/' };
  }
  if (pathname === '/q.md') {
    return { target: { kind: 'qa-index' }, canonicalPath: '/q' };
  }

  const staticTwin = EXPLICIT_TWIN_STATIC_TARGETS[pathname];
  if (staticTwin) {
    return {
      target: { kind: 'static-page', page: staticTwin.page },
      canonicalPath: staticTwin.canonicalPath,
    };
  }

  const blogMd = /^\/blog\/(.+)\.md$/i.exec(pathname);
  if (blogMd) {
    if (blogMd[1]!.includes('/')) return { target: null, canonicalPath: null };
    const slug = parseSafeSlug(blogMd[1]!);
    if (!slug) return { target: null, canonicalPath: null };
    return {
      target: { kind: 'blog-post', slug },
      canonicalPath: `/blog/${slug}`,
    };
  }

  const qaMd = /^\/q\/(.+)\.md$/i.exec(pathname);
  if (qaMd) {
    if (qaMd[1]!.includes('/')) return { target: null, canonicalPath: null };
    const slug = parseSafeSlug(qaMd[1]!);
    if (!slug) return { target: null, canonicalPath: null };
    return {
      target: { kind: 'qa-item', slug },
      canonicalPath: `/q/${slug}`,
    };
  }

  return null;
}

/**
 * Return the explicit `.md` twin path for a canonical HTML route, or `null`
 * if the route has no `.md` twin.
 */
export function markdownTwinPathFor(pathname: string): string | null {
  if (pathname === '/') return '/index.md';

  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const direct = HTML_TO_TWIN_STATIC[normalized];
  if (direct) return direct;

  const blog = /^\/blog\/([^/]+)\/?$/.exec(pathname);
  if (blog && !blog[1]!.toLowerCase().endsWith('.md')) {
    const slug = parseSafeSlug(blog[1]!);
    return slug ? `/blog/${slug}.md` : null;
  }

  const qa = /^\/q\/([^/]+)\/?$/.exec(pathname);
  if (qa && !qa[1]!.toLowerCase().endsWith('.md')) {
    const slug = parseSafeSlug(qa[1]!);
    return slug ? `/q/${slug}.md` : null;
  }

  return null;
}

const INTERNAL_HOST_ORIGIN = /^https?:\/\/(0\.0\.0\.0|127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/?$/i;

export function resolvePublicOrigin(candidate?: string | null): string {
  const trimmed = candidate?.trim().replace(/\/+$/, '') ?? '';
  if (!trimmed || INTERNAL_HOST_ORIGIN.test(trimmed)) {
    return CANONICAL_PUBLIC_ORIGIN;
  }
  return trimmed;
}

/** Case-insensitive match against the named AI / search crawler allow-list. */
export function isAiBotUserAgent(userAgent: string): boolean {
  if (!userAgent) return false;
  const lower = userAgent.toLowerCase();
  return AI_BOTS_LOWER.some((bot) => lower.includes(bot));
}

/**
 * RFC 8288 Link header advertising the RFC 9727 API catalog, llms.txt
 * (`rel="describedby ai-content"` per RFC 8288 §3.3), llms-full.txt,
 * and A2A / MCP capability cards on the canonical public origin.
 */
export function buildAiDiscoveryLinkHeader(publicOrigin = CANONICAL_PUBLIC_ORIGIN): string {
  const origin = resolvePublicOrigin(publicOrigin);
  return [
    `<${origin}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
    `<${origin}/llms.txt>; rel="describedby ai-content"; type="text/plain"`,
    `<${origin}/llms-full.txt>; rel="ai-content-full"; type="text/plain"`,
    `<${origin}/.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
    `<${origin}/.well-known/mcp/server-card.json>; rel="mcp-server"; type="application/json"`,
  ].join(', ');
}

const DISCOVERY_PATHS = new Set([
  '/llms.txt',
  '/llms-ctx.txt',
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
  '/spec/agent-failure-taxonomy/v0.1.json',
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
  const origin = resolvePublicOrigin(publicOrigin);
  const headers: Record<string, string> = {};

  headers['X-Robots-Tag'] = isDiscoveryPath(pathname)
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  if (markdownTargetFor(pathname) !== null) {
    headers['Vary'] = 'Accept';
  }

  const twinPath = markdownTwinPathFor(pathname);
  const aiBot = isAiBotUserAgent(userAgent);

  if (aiBot) {
    headers['X-AI-Content-Available'] = 'true';
    headers['Link'] = twinPath
      ? `<${origin}${twinPath}>; rel="alternate"; type="text/markdown", ${buildAiDiscoveryLinkHeader(origin)}`
      : buildAiDiscoveryLinkHeader(origin);
  } else if (twinPath) {
    headers['Link'] = `<${origin}${twinPath}>; rel="alternate"; type="text/markdown", <${origin}/llms.txt>; rel="describedby"`;
  }

  return headers;
}
