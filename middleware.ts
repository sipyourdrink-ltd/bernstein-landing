import { NextResponse, type NextRequest } from 'next/server';
import {
  MARKDOWN_PATH_HEADER,
  buildPageResponseHeaders,
  markdownTargetFor,
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

  /* Markdown content negotiation. A client that names text/markdown and
     weights it above text/html gets the markdown representation of a
     negotiable page; browsers keep HTML. Both the rewritten markdown
     branch and the non-rewritten HTML branch carry `Vary: Accept` so
     HTTP caches that honour Vary never mix HTML and markdown entries. */
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
