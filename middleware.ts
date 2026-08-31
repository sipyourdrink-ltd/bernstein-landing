import { NextResponse, type NextRequest } from 'next/server';
import { AI_BOTS } from '@/lib/seo/ai-bots';
import {
  MARKDOWN_PATH_HEADER,
  markdownTargetFor,
  prefersMarkdown,
} from '@/lib/markdown-negotiation';

/* The named-crawler list lives in lib/seo/ai-bots.ts (single source of
   truth, shared with robots.txt and the analytics bot-filter). The
   previous local 16-entry copy had drifted: OAI-SearchBot,
   Claude-SearchBot, Claude-User, Perplexity-User, Amazonbot and others
   never received the ai-content Link discovery headers below. The
   module is a plain const string array, so the edge runtime imports it
   cleanly. */

/* Crawler-discovery surfaces - kept aligned with the per-path
   X-Robots-Tag overrides in next.config.mjs. Middleware runs after
   the config-level headers and would otherwise clobber the
   `noindex, follow` we set there, re-leaking the discovery files
   into the index. Pathnames are matched exactly except .well-known/
   which uses a prefix check. */
const DISCOVERY_PATHS = new Set([
  '/llms.txt',
  '/llms-full.txt',
  '/ai.txt',
  '/agents.txt',
  '/humans.txt',
  '/agents.json',
  '/auth.md',
]);

function isDiscoveryPath(pathname: string): boolean {
  if (DISCOVERY_PATHS.has(pathname)) return true;
  return pathname.startsWith('/.well-known/');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /* docs/_internal/** is a maintainer-notes tree that was never meant
     to be a public docs surface. The /docs catch-all redirect in
     next.config.mjs carves these paths out so they reach middleware;
     410 (not 404) tells crawlers the URLs are gone for good, which
     de-indexes faster. */
  if (pathname === '/docs/_internal' || pathname.startsWith('/docs/_internal/')) {
    return new NextResponse('410 Gone', {
      status: 410,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  /* Markdown content negotiation. A client that names text/markdown and
     weights it above text/html gets the markdown source of the page
     instead of the page: llms.txt for the site index, the post's own
     MDX for a blog post. Everything else is untouched, so a browser
     never lands here - see lib/markdown-negotiation.ts for why the
     wildcard in a browser's Accept header does not count.

     The rewrite target reads from disk, which the edge runtime cannot
     do, so the work happens in a Node route handler. That handler sets
     `no-store` on what it returns: this site is behind a CDN, and a CDN
     that ignores Vary would otherwise be able to serve a cached
     markdown body to the next browser asking for the same URL.

     `Vary: Accept` is set here as well as there. Set here it reaches
     the response even on the paths that do not rewrite, which is what
     tells a cache that honours Vary to keep the HTML and the markdown
     apart in the first place. */
  const wantsMarkdown = prefersMarkdown(request.headers.get('accept'));
  if (wantsMarkdown) {
    const target = markdownTargetFor(pathname);
    if (target) {
      /* The path travels as a request header, not as a query parameter
         on the rewrite target. A handler reached through a rewrite sees
         the *original* request URL, so a `?path=` appended here never
         arrives - the route read an empty path and 404'd every
         negotiated request. Verified against a running production
         build, which is the only place the difference shows up. */
      const headers = new Headers(request.headers);
      headers.set(MARKDOWN_PATH_HEADER, pathname);

      const rewritten = NextResponse.rewrite(new URL('/api/_markdown', request.url), {
        request: { headers },
      });
      rewritten.headers.set('Vary', 'Accept');
      return rewritten;
    }
  }

  const ua = request.headers.get('user-agent') ?? '';
  const isAiBot = AI_BOTS.some((bot) => ua.includes(bot));

  const response = NextResponse.next();

  // Add AI-friendly headers for all responses, except crawler-discovery
  // files which carry their own `noindex, follow` from next.config.mjs.
  if (!isDiscoveryPath(request.nextUrl.pathname)) {
    response.headers.set('X-Robots-Tag', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
  }

  if (isAiBot) {
    // Signal that AI-optimized content is available
    response.headers.set('X-AI-Content-Available', 'true');
    response.headers.set('Link', [
      `<${request.nextUrl.origin}/llms.txt>; rel="ai-content"; type="text/markdown"`,
      `<${request.nextUrl.origin}/llms-full.txt>; rel="ai-content-full"; type="text/markdown"`,
      `<${request.nextUrl.origin}/.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
      `<${request.nextUrl.origin}/.well-known/mcp/server-card.json>; rel="mcp-server"; type="application/json"`,
    ].join(', '));
  }

  return response;
}

export const config = {
  /* `/api` excluded: JSON routes do not need X-Robots-Tag (search
     engines do not index JSON endpoints) and the SSE route at
     /api/ask pays per-byte overhead for any header injected on every
     event-frame. The AI-bot Link headers are landing-page concerns,
     not API concerns. */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.svg|manifest.json).*)',
  ],
};
