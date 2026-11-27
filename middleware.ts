import { NextResponse, type NextRequest } from 'next/server';
import {
  MARKDOWN_PATH_HEADER,
  buildPageResponseHeaders,
  markdownTargetFor,
  markdownTwinTargetFor,
  prefersMarkdown,
} from '@/lib/markdown-negotiation';

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

  /* Explicit `/*.md` URL twins (`/index.md`, `/about.md`, `/cost.md`,
     `/cli-quickstart.md`, `/spec-driven.md`, `/spec/agent-failure-taxonomy/v0.1.md`,
     `/tools/agent-md-bench.md`, `/q.md`, `/q/<slug>.md`, `/blog/<slug>.md`)
     rewrite unconditionally to `/api/_markdown` regardless of `Accept` header,
     carrying `X-Robots-Tag: noindex, follow` and a canonical `Link` back to
     the HTML route so raw markdown twins never duplicate HTML in SERPs. */
  const twin = markdownTwinTargetFor(pathname);
  if (twin) {
    if (!twin.target || !twin.canonicalPath) {
      return new NextResponse('# Not found\n', {
        status: 404,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'no-store',
          Vary: 'Accept',
          'X-Robots-Tag': 'noindex',
        },
      });
    }

    const headers = new Headers(request.headers);
    headers.set(MARKDOWN_PATH_HEADER, pathname);

    const rewritten = NextResponse.rewrite(new URL('/api/_markdown', request.url), {
      request: { headers },
    });
    rewritten.headers.set('Vary', 'Accept');
    rewritten.headers.set('X-Robots-Tag', 'noindex, follow');
    return rewritten;
  }

  /* Accept-header markdown content negotiation on canonical HTML paths. */
  if (prefersMarkdown(request.headers.get('accept'))) {
    const target = markdownTargetFor(pathname);
    if (target) {
      const headers = new Headers(request.headers);
      headers.set(MARKDOWN_PATH_HEADER, pathname);

      const rewritten = NextResponse.rewrite(new URL('/api/_markdown', request.url), {
        request: { headers },
      });
      rewritten.headers.set('Vary', 'Accept');
      return rewritten;
    }
  }

  const response = NextResponse.next();
  const extraHeaders = buildPageResponseHeaders({
    pathname,
    userAgent: request.headers.get('user-agent') ?? '',
    publicOrigin: process.env.BERNSTEIN_PUBLIC_ORIGIN,
  });

  for (const [key, value] of Object.entries(extraHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  /* `/api` excluded: JSON routes do not need X-Robots-Tag (search
     engines do not index JSON endpoints) and the SSE route at
     /api/ask pays per-byte overhead for any header injected on every
     event-frame. */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.svg|manifest.json).*)',
  ],
};
