/**
 * The machine-facing surfaces bernstein.run actually serves.
 *
 * One list, two projections. `/.well-known/api-catalog` renders it as an
 * RFC 9727 linkset; `/.well-known/skills.json` renders the callable
 * subset as a skills index. They import this module rather than each
 * keeping its own copy, so the two documents cannot drift into
 * disagreeing about what this host offers - which is the failure mode
 * that produced a card describing tools that were not there.
 *
 * The bar for an entry: it must be a real, reachable, unauthenticated
 * surface on THIS origin, and `tests/machine-surfaces.test.ts` resolves
 * every path in the list against the repo's routes and public files. An
 * entry whose route does not exist fails the suite. Nothing goes in
 * here because it would be nice to offer.
 *
 * Deliberately absent, and why:
 *
 *   /api/indexnow      bearer-gated on an operator-held token; a caller
 *                      cannot use it, so advertising it is noise at best
 *   /api/notify        subscribes an address and sends mail; a side
 *                      effect on a third party, not a capability
 *   /api/unsubscribe   same, in reverse
 *   /api/_signals/log  internal instrumentation, not a public surface
 *   the task server    every path in openapi.yaml except /api/csp-report
 *                      runs on the operator's own machine, not here.
 *                      There is no hosted instance to link to, so the
 *                      document hangs off the site-root member of the
 *                      catalog rather than getting an anchor of its own.
 *
 * On robots.txt: that file carries `Disallow: /api/` (with `/api/og`
 * carved out). There is no contradiction to fix. robots.txt governs
 * crawling - whether a bot may walk these URLs looking for content to
 * index - and this list governs calling, which is a different act with
 * a different consent model. Do not "reconcile" one to the other.
 */

export const SITE_URL = 'https://bernstein.run';

/** RFC 8631 link relations, the three RFC 9727 puts to work. */
export type ServiceRelation = 'service-desc' | 'service-doc' | 'service-meta';

export interface DiscoveryDocument {
  /** Site-root-relative path, exactly as served. */
  path: string;
  /**
   * Short name for the plaintext listing in robots.txt, which is read
   * by eye and by crawlers that never parse JSON. Kept terse because
   * that block is column-aligned; the full sentence is `title`.
   */
  label: string;
  /**
   * `service-desc` for a machine-readable description of an API,
   * `service-doc` for prose a human or a model reads, `service-meta`
   * for metadata about the service rather than its interface.
   */
  rel: ServiceRelation;
  /** Media type this host actually returns for the path. */
  type: string;
  title: string;
}

export interface MachineEndpoint {
  /** Site-root-relative path, exactly as routed. */
  path: string;
  method: 'GET' | 'POST';
  /** Stable identifier used as the skill name. Kebab-case. */
  name: string;
  description: string;
  input: string;
  output: string;
  /**
   * Whether a caller can usefully invoke this to get something done.
   * `/api/csp-report` is real and public and belongs in the catalog,
   * but a browser posts to it unprompted and nothing else has any
   * reason to - so it is not a skill. This flag is the only difference
   * between the two projections.
   */
  agentCapability: boolean;
}

/**
 * Documents that describe this host or the project, rather than doing
 * work. Every one of these is served today; the test resolves them.
 */
export const DISCOVERY_DOCUMENTS: readonly DiscoveryDocument[] = [
  {
    path: '/openapi.yaml',
    label: 'OpenAPI spec',
    rel: 'service-desc',
    type: 'application/yaml',
    title:
      'OpenAPI 3.0 description of the Bernstein task server. That server runs on the operator\'s own machine (servers: http://{host}:{port}), not on this origin. The one path it describes that this origin serves is POST /api/csp-report.',
  },
  {
    path: '/.well-known/skills.json',
    label: 'Skills index',
    rel: 'service-desc',
    type: 'application/json',
    title: 'Machine-readable index of the callable endpoints this origin serves.',
  },
  {
    path: '/llms.txt',
    label: 'LLMs index',
    rel: 'service-doc',
    type: 'text/plain',
    title: 'llms.txt index: what this project is, and the canonical entry points.',
  },
  {
    path: '/llms-full.txt',
    label: 'LLMs full ref',
    rel: 'service-doc',
    type: 'text/plain',
    title: 'Full technical reference for language models, expanded from llms.txt.',
  },
  {
    path: '/AGENTS.md',
    label: 'Agent instructions',
    rel: 'service-doc',
    type: 'text/markdown',
    title: 'Instructions for coding agents working against this project.',
  },
  {
    path: '/auth.md',
    label: 'Authentication',
    rel: 'service-meta',
    type: 'text/markdown',
    title:
      'What credentials this host wants (none), which write endpoints are anonymous, and why the OpenAPI server is the reader\'s own machine.',
  },
  {
    path: '/ai.txt',
    label: 'AI permissions',
    rel: 'service-meta',
    type: 'text/plain',
    title: 'Crawl permissions, licence, and key facts for AI systems.',
  },
  {
    path: '/.well-known/agent-card.json',
    label: 'A2A agent card',
    rel: 'service-meta',
    type: 'application/json',
    title: 'A2A agent card for the Bernstein orchestrator.',
  },
  {
    path: '/.well-known/mcp/server-card.json',
    label: 'MCP server card',
    rel: 'service-meta',
    type: 'application/json',
    title:
      'MCP server card. The server is the locally-installed Bernstein package over stdio, not a remote endpoint on this origin.',
  },
  {
    path: '/agents.json',
    label: 'Agent manifest',
    rel: 'service-meta',
    type: 'application/json',
    title: 'Agent manifest, also served from /.well-known/agents.json.',
  },
  {
    path: '/.well-known/http-message-signatures-directory',
    label: 'Web Bot Auth keys',
    rel: 'service-meta',
    type: 'application/http-message-signatures-directory+json',
    title: 'Web Bot Auth verification keys for requests this site may sign.',
  },
];

/**
 * Endpoints this origin serves. All anonymous - see /auth.md.
 *
 * `input` and `output` are prose on purpose. A JSON Schema here would
 * be a second definition of a shape that already lives in the route's
 * zod schema, and the two would drift; a sentence that says what the
 * body is cannot pretend to a precision it does not have. The
 * authoritative contract is the route.
 */
export const MACHINE_ENDPOINTS: readonly MachineEndpoint[] = [
  {
    path: '/api/blog/summary',
    method: 'POST',
    name: 'blog-summary',
    description:
      'Summarise a published post from this blog in one of three registers. Answers are precomputed for most posts; otherwise the summary is generated on demand and must ground itself in the post text or the route declines.',
    input:
      'application/json: { slug: string (kebab-case, matches a directory under content/blog), mode: "quick" | "takeaways" | "technical" }',
    output:
      'application/json: { ok: true, data: ArticleSummary }. 400 INVALID_PARAMS on a malformed body, 404 INVALID_ARTICLE for an unknown or draft slug, 503 when the upstream model is unconfigured or every attempt failed.',
    agentCapability: true,
  },
  {
    path: '/api/ask',
    method: 'POST',
    name: 'docs-ask',
    description:
      'Ask a question against the Bernstein documentation and blog. Streams a cited answer over Server-Sent Events. Retrieval is pinned to this project\'s index; the route declines rather than answering from outside it.',
    input:
      'application/json: { query: string (<= 2000 chars) }. Request body is capped at 8 KB. Per-IP rate limited.',
    output:
      'text/event-stream: token frames followed by a citation frame; a single `error` event frame when retrieval is unavailable.',
    agentCapability: true,
  },
  {
    path: '/api/ask/summarise',
    method: 'POST',
    name: 'docs-summarise-hits',
    description:
      'Summarise up to three search results you already hold, with every claim cited back to the hit it came from. The caller supplies the passages; this endpoint does no retrieval of its own.',
    input:
      'application/json: { query: string (<= 500 chars), hits: Array<{ title, excerpt, url? }> (1-3 items) }',
    output:
      'application/json: { ok: true, data: { summary, model, citations: number[] } }. 503 when the upstream model is unconfigured.',
    agentCapability: true,
  },
  {
    path: '/api/related',
    method: 'GET',
    name: 'related-posts',
    description:
      'Given the canonical URL of a post on this site, return the posts most similar to it. Returns an empty list for a URL on any other host rather than guessing.',
    input: 'query string: ?url=<canonical post url>&limit=<1-20, default 5>',
    output: 'application/json: { ok: true, data: { items: RelatedPost[] } }. 400 on a malformed url parameter.',
    agentCapability: true,
  },
  {
    path: '/api/stats',
    method: 'GET',
    name: 'project-stats',
    description:
      'Current package downloads and repository stars for the Bernstein project, cached upstream-side. Serves last-known-good rather than failing when an upstream is rate-limited.',
    input: 'no parameters',
    output:
      'application/json: { monthly_downloads: number, stars: number, fetched_at: string (ISO 8601) }',
    agentCapability: true,
  },
  {
    path: '/api/og',
    method: 'GET',
    name: 'og-image',
    description:
      'Render the Open Graph card this site uses for a given title. Returns a PNG. This is the one /api/ path robots.txt allows crawlers to fetch, because page metadata references it by URL.',
    input: 'query string: ?title=<string, truncated at 200 chars>. Omit it for the default card.',
    output: 'image/png',
    agentCapability: true,
  },
  {
    path: '/api/health',
    method: 'GET',
    name: 'health',
    description:
      'Liveness and build identity of the process serving this request. Uncached by construction, so it reports the container answering now rather than the edge.',
    input: 'no parameters',
    output:
      'application/json: { status: "ok", sha: string (build SHA, empty when unset), ts: string (ISO 8601) }',
    agentCapability: true,
  },
  {
    path: '/api/csp-report',
    method: 'POST',
    name: 'csp-report',
    description:
      'Content-Security-Policy violation sink for this site. Browsers post here on their own, named by the report-uri and report-to directives of every response. Catalogued because it is real and public and openapi.yaml describes it; not offered as a capability, because nothing but a browser has a reason to call it.',
    input:
      'application/csp-report (a single kebab-case report) or application/reports+json (an array of Reporting API envelopes)',
    output: 'empty 204, whatever happened to the report',
    agentCapability: false,
  },
];

/** Absolute URL for a site-root-relative path. */
export function absolute(path: string): string {
  return `${SITE_URL}${path}`;
}

/** The endpoints a caller can usefully invoke. */
export function agentCapabilities(): readonly MachineEndpoint[] {
  return MACHINE_ENDPOINTS.filter((e) => e.agentCapability);
}

/**
 * Every site-relative path this module asserts exists, across both
 * projections. The test resolves each one against the repo.
 */
export function allDeclaredPaths(): string[] {
  return [
    ...DISCOVERY_DOCUMENTS.map((d) => d.path),
    ...MACHINE_ENDPOINTS.map((e) => e.path),
  ];
}
