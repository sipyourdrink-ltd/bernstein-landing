/**
 * /auth.md - what credentials this host wants (none) and what the
 * OpenAPI document's `servers` block actually points at (not here).
 *
 * The gap this closes: `/openapi.yaml` is advertised from robots.txt,
 * ai.txt, llms.txt, the agent card and now the API catalog, and it
 * describes a task server that runs on the reader's own machine. An
 * agent that finds the document and reasons "REST API, therefore
 * credentials, therefore look for the token endpoint" has nowhere to
 * land - the document declares no `securitySchemes`, the agent card
 * declares `authentication.schemes: []`, and neither absence says
 * whether that means "open" or "undocumented". This file says which.
 *
 * Everything below is checked against the routes in `app/api/`. If a
 * route gains or loses a limiter, or a credential appears anywhere,
 * this file is wrong until it is edited. `tests/auth-md.test.ts` pins
 * the claims that can be pinned from the repo.
 */
// The H1 keeps the literal file name in it: auth.md validators identify
// the document by an H1 containing "auth.md", not by its prose.
const CONTENT = `# auth.md — bernstein.run

There is none, and there is none to request. No accounts, no login, no
sessions, no API keys, no OAuth, no paid tier. This page exists because
"no credentials" and "credentials we did not document" look identical
from the outside, and an agent should not have to guess which it found.

## auth.md registration

This host does not offer auth.md registration. There are no
\`identity_assertion\`, \`service_auth\`, or \`anonymous\` registration
methods to attempt, no Protected Resource Metadata, and no token
exchange: every endpoint answers clients that present no credential at
all. Do not mint ID-JAGs or hunt for a registration endpoint here. If a
future version of this file adds registration support, it will link the
discovery metadata from this section.

## Reading

Every page and every discovery document on this host is public and
served without credentials. Fetch anything listed in \`/llms.txt\`,
\`/ai.txt\`, \`/.well-known/api-catalog\` or \`/.well-known/skills.json\`
and it answers. Crawling, retrieval-augmented grounding and training are
all permitted - see the \`Content-Signal\` line in \`/robots.txt\`.

## The OpenAPI document does not describe this host

\`/openapi.yaml\` is mostly the Bernstein **task server** REST API. That
server runs on the machine where an operator installed Bernstein; its
\`servers\` entry is the URL template \`http://{host}:{port}\`, loopback
by default. There is no hosted instance, so no token for it can exist
here. Access control on that server is whatever the operator's own host
and network provide: the document declares no security schemes, and the
A2A agent card at \`/.well-known/agent-card.json\` declares
\`"authentication": { "schemes": [] }\` for the same reason.

The one path in that document served by this domain is
\`POST /api/csp-report\`, which carries its own \`servers\` entry.

## Write endpoints on this domain

All anonymous. None accepts or checks a credential.

| Endpoint | Per-IP limiter |
| --- | --- |
| \`POST /api/blog/summary\` | no limiter in the route; answers are precomputed where possible, and the route returns 503 when the upstream model is not configured |
| \`POST /api/csp-report\` | yes, route-local |
| \`POST /api/ask\` | yes, shared assistant limiter |
| \`POST /api/ask/summarise\` | no limiter in the route |
| \`POST /api/notify\` | yes, 5 per 10 minutes |

Rate limiting is per process and in memory. Treat the numbers as the
current shape of the code, not as a service-level guarantee.

## The one gated endpoint

\`POST /api/indexnow\` is bearer-gated on an operator-held token and
refuses in production when that token is unset. It exists to notify
search engines after a deploy. It is not a capability offered to
callers, and the token is not obtainable - it is listed here so an
agent that meets a 401 knows the 401 is intentional and final.

## Contact

Apache-2.0, solo-maintained. Issues:
https://github.com/sipyourdrink-ltd/bernstein/issues
`;

export function GET(): Response {
  return new Response(CONTENT, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
