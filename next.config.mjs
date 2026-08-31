/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  env: {
    /* Inlined at build time. Toggling requires a redeploy — that's
       intentional. The `disabled` value falls back to the BM25 panel. */
    NEXT_PUBLIC_DOCS_BOT: process.env.NEXT_PUBLIC_DOCS_BOT ?? 'enabled',
  },
  async redirects() {
    return [
      {
        /* /docs and /docs/* redirect to readthedocs EXCEPT /docs/cli/*
           which is the locally-rendered CLI glossary generated catalogue pages
           . The negative-lookahead `has` constraint
           keeps the redirect scoped. */
        source: '/docs',
        destination: 'https://bernstein.readthedocs.io/',
        permanent: true,
      },
      {
        /* /docs/_internal/* is also carved out: that tree is maintainer
           working notes, not published docs — the docs host excludes it
           from its build, so forwarding would land on a 404 anyway.
           Middleware answers these paths with 410 so anything already
           indexed drops out (config redirects run before middleware;
           without this carve-out the 308 would win). */
        source: '/docs/:path((?!cli$|cli/|_internal$|_internal/).*)',
        destination: 'https://bernstein.readthedocs.io/en/latest/:path/',
        permanent: true,
      },
      /* Singular `/sponsor` 404'd because the live route is `/sponsors`
         (plural). The CEO conversion plan and the deep-research brief
         both wrote `/sponsor`, and natural English typing collapses to
         the singular too. Permanent (308) so Next preserves the method,
         query string, and fragment — which matters because /cost and
         the GHS deeplink propagate `?metadata_source=...`. */
      {
        source: '/sponsor',
        destination: '/sponsors',
        permanent: true,
      },
      /* /blog/v2-0-0-release was an auto-generated changelog-mirror stub
         that duplicated the hand-written canonical post at
         /blog/v2-0-release. The stub's slug is derived from the full
         version "2.0.0" (v2-0-0-release) while the canonical post uses
         "v2-0-release", so the two never reconciled: the stub 404'd (its
         MDX failed to compile) yet still appeared in the sitemap + RSS,
         which the crosspost pipeline retried daily (issue #23). The stub
         is removed; this 301 carries the already-indexed URL and any
         cached feed entry to the canonical post. */
      {
        source: '/blog/v2-0-0-release',
        destination: '/blog/v2-0-release',
        permanent: true,
      },
    ];
  },
  async headers() {
    /* CSP violation sink. Until now the policy declared source lists
       but named no reporting endpoint, so every block — including a
       regression in a source list — was dropped on the floor.
       `report-uri` is the legacy directive and the only one Firefox
       and Safari implement; `report-to` is the Reporting-API path
       Chrome takes, and it resolves its group name from the
       `Reporting-Endpoints` response header below. Shipping both means
       every browser that reports at all has somewhere to report to.
       The collector is `app/api/csp-report/route.ts`. */
    const cspReportPath = '/api/csp-report';
    const cspReportOrigin = process.env.BERNSTEIN_PUBLIC_ORIGIN ?? 'https://bernstein.run';
    /* `Reporting-Endpoints` is a structured-field header keyed by group
       name; the URL is absolute because the spec's relative-URL
       resolution is not implemented consistently. This header is
       distinct from the `Report-To` header Cloudflare stamps for NEL,
       so the two do not collide. */
    const reportingEndpoints = `csp-endpoint="${cspReportOrigin}${cspReportPath}"`;

    /* Shared TTL for the static discovery surfaces (manifest, agent
       cards, openapi.yaml). One hour shared cache, one day of
       stale-while-revalidate. See the matchers near the bottom. */
    const DISCOVERY_CACHE_CONTROL =
      'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

    /* An Accept header that names markdown at all. Next anchors the
       `value` regex of a has/missing matcher, so the wildcards are
       required to match the rest of a real Accept header around the
       token. Deliberately looser than the q-value comparison in
       lib/markdown-negotiation.ts - see the matchers for `/` and
       `/blog/:slug` near the bottom for why the looseness is safe. */
    const MARKDOWN_ACCEPT = '.*text/(x-)?markdown.*';

    /* What a markdown-negotiated request gets instead of the page's
       edge TTL. `no-store` keeps a negotiated body out of every shared
       cache; `Vary: Accept` is for the caches that do honour it. */
    const NEGOTIATED_MARKDOWN_HEADERS = [
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'Vary', value: 'Accept' },
    ];

    /* Page-level security headers — applied to every non-API surface.
       Crawler hints (X-Robots-Tag) and CSP are landing-page concerns
       that have no meaning on JSON endpoints; X-Robots-Tag on an
       /api/* response wastes wire bytes and confuses scanners that
       expect API responses to be unindexed by default. The matcher
       below uses a negative lookahead so /api/* surfaces stay free
       of these headers — mirrors the middleware matcher's exclusion. */
    /* X-XSS-Protection is deliberately absent. The header only ever
       drove the legacy Chromium XSS auditor, which was removed in
       Chrome 78 and never implemented by Firefox or Safari; on the
       remaining old-Chromium tail the auditor is itself a cross-site
       information-leak vector. The CSP below is the mitigation that
       actually applies. Do not reintroduce it. */
    const pageSecurityHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      { key: 'Reporting-Endpoints', value: reportingEndpoints },
      {
        key: 'Content-Security-Policy',
        value: `default-src 'self'; script-src 'self' 'unsafe-inline' https://analytics.bernstein.run; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://app.kit.com https://analytics.bernstein.run; frame-src 'none'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://app.kit.com; report-uri ${cspReportPath}; report-to csp-endpoint;`,
      },
      {
        key: 'X-Robots-Tag',
        value: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      },
    ];
    /* Crawler-discovery surfaces (llms.txt, ai.txt, agent-card, etc.)
       exist to be fetched by crawlers and agents, not to appear in
       search results. Per-path overrides below the broad matcher emit
       `noindex, follow` so the links inside them stay crawlable (e.g.
       agent-card -> MCP server cards; llms.txt -> canonical docs)
       while the discovery files themselves stay out of the index. */
    /* Lightweight headers safe to ship on /api/* too — content-type
       nosniff and frame-options are defence-in-depth even for JSON. */
    const apiSecurityHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ];
    return [
      /* Non-API surfaces — full security + crawler headers. */
      {
        source: '/((?!api/).*)',
        headers: pageSecurityHeaders,
      },
      /* API surfaces — minimal defence-in-depth headers only. */
      {
        source: '/api/:path*',
        headers: apiSecurityHeaders,
      },
      /* Crawler-discovery file overrides — these match AFTER the broad
         pageSecurityHeaders matcher above so the X-Robots-Tag here wins.
         Keep this list narrow: only emit `noindex, follow` for files
         whose sole purpose is crawler/agent discovery. Any new utility
         route under this discipline goes here. */
      {
        source: '/llms.txt',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
      {
        source: '/llms-full.txt',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
      {
        source: '/ai.txt',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
      {
        source: '/agents.txt',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
      {
        source: '/humans.txt',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
      {
        source: '/agents.json',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
      /* /auth.md states what credentials this host wants (none) and
         where the OpenAPI document's server actually is. Same
         discipline as the rest of this list: it exists to be fetched by
         an agent that already found openapi.yaml, not to rank. */
      {
        source: '/auth.md',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
      {
        source: '/.well-known/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, follow' },
          { key: 'Cache-Control', value: DISCOVERY_CACHE_CONTROL },
        ],
      },
      /* Discovery surfaces served straight out of `public/`. Next.js
         stamps `public, max-age=0` on static public files, so every
         agent/crawler fetch of these three fell through the CDN to the
         origin — the inverse of the HTML pages they describe, which
         cache for ten minutes. They only change on deploy, so a
         one-hour shared TTL is safe; `stale-while-revalidate` keeps the
         edge warm without letting a release sit unnoticed for longer
         than the TTL. Capped at one hour on purpose: the agent card and
         openapi.yaml carry a version and a server URL that must not
         pin for longer than a deploy cycle. */
      {
        source: '/manifest.json',
        headers: [
          /* The W3C-registered media type for a web app manifest.
             Next.js's static file server infers `application/json` from
             the extension, which strict validators (and iOS install
             prompts) reject. `send` only sets Content-Type when it is
             not already present, so setting it here wins. */
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
          { key: 'Cache-Control', value: DISCOVERY_CACHE_CONTROL },
        ],
      },
      {
        source: '/openapi.yaml',
        headers: [{ key: 'Cache-Control', value: DISCOVERY_CACHE_CONTROL }],
      },
      /* Edge-cacheable generated catalogue pages . 1-hour Cloudflare
         cache + 24-hour stale-while-revalidate so a content tweak takes
         minutes to propagate and the surface stays warm regardless. */
      {
        source: '/vs/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      /* `:path+` (one or more segments), not `:path*` (zero or more):
         the zero-segment form also matched the bare `/docs/cli`, so the
         index and its sub-pages shared one TTL. They should not. The
         index is a 308 to readthedocs and nothing else; the sub-pages,
         if any come back, are rendered content. Keeping the two matchers
         disjoint also means `/docs/cli` is covered by exactly one rule,
         so there is no question of whether a second Cache-Control
         replaces the first or joins it. */
      {
        source: '/docs/cli/:path+',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      /* `/docs/cli` is a permanent redirect to the canonical docs host
         (app/docs/cli/page.tsx calls `permanentRedirect`, so the status
         is 308). A 308 says the move is not coming back, so the edge may
         hold it far longer than a content page: a day, against the ten
         minutes the rendered surfaces get. `stale-while-revalidate`
         matches the rest of this config - it keeps the edge from
         blocking on the origin for the one request that lands just after
         expiry, which for a redirect an external link points at is the
         difference between a hop and a 504 during a deploy. */
      {
        source: '/docs/cli',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=86400' },
        ],
      },
      /* OPS-2026-05-17 - cache-control for the hot mostly-static surfaces.
         CF cache hit rate sat at 20.5% (24h) because Next.js standalone
         did not emit Cache-Control for `/`, `/cost`, `/why-bernstein` or
         `/blog/*`, so every uncached bot/visitor hit re-rendered SSR and
         was a 504 candidate when the origin was warming. 10-min edge
         cache + 1-hour stale-while-revalidate keeps the surface warm and
         insulates origin restarts from immediately surfacing as 5xx. */
      /* The two negotiable surfaces (`/` and `/blog/:slug`) split their
         Cache-Control on whether the request asked for markdown.

         Why this has to happen here and not in the route handler: these
         `headers()` entries are matched against the *incoming* path, so
         they still apply after middleware rewrites the request to
         /api/_markdown, and they win over whatever the handler set. The
         handler asks for `no-store`; without the split below it was
         being overwritten with `public, s-maxage=600` and the markdown
         body became edge-cacheable. A CDN generally ignores `Vary` for
         anything but Accept-Encoding, so a cached markdown body would
         then be replayed to the next browser asking for the same URL.

         The match is a substring test on Accept, which is looser than
         the q-value comparison in lib/markdown-negotiation.ts. The
         looseness only ever costs a cache entry: a request naming
         markdown but not outranking html gets HTML with `no-store`,
         which is uncached but correct. It cannot go the other way, and
         that asymmetry is the point. Browsers never send the token, so
         ordinary traffic keeps the ten-minute edge TTL. */
      {
        source: '/',
        has: [{ type: 'header', key: 'accept', value: MARKDOWN_ACCEPT }],
        headers: NEGOTIATED_MARKDOWN_HEADERS,
      },
      {
        source: '/',
        missing: [{ type: 'header', key: 'accept', value: MARKDOWN_ACCEPT }],
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=600, stale-while-revalidate=3600' },
        ],
      },
      {
        source: '/cost',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=600, stale-while-revalidate=3600' },
        ],
      },
      {
        source: '/why-bernstein',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=600, stale-while-revalidate=3600' },
        ],
      },
      {
        source: '/blog',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=600, stale-while-revalidate=3600' },
        ],
      },
      /* Same split as `/` above. See the comment there. */
      {
        source: '/blog/:slug',
        has: [{ type: 'header', key: 'accept', value: MARKDOWN_ACCEPT }],
        headers: NEGOTIATED_MARKDOWN_HEADERS,
      },
      {
        source: '/blog/:slug',
        missing: [{ type: 'header', key: 'accept', value: MARKDOWN_ACCEPT }],
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=600, stale-while-revalidate=3600' },
        ],
      },
    ];
  },
};

export default nextConfig;
