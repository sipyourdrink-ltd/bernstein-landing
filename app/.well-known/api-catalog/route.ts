/**
 * /.well-known/api-catalog - RFC 9727 API catalog.
 *
 * RFC 9727 registers this well-known URI as the place a client looks to
 * find out which APIs a host serves and where each one is described. The
 * document is an RFC 9264 linkset: a list of members, each anchored on
 * an API, each carrying `service-desc` (machine-readable description),
 * `service-doc` (prose) and `service-meta` (metadata about the service)
 * links.
 *
 * Everything here comes from `lib/machine-surfaces.ts`, which
 * `/.well-known/skills.json` also reads. The point of the shared module
 * is that a catalog cannot advertise an endpoint the skills index has
 * never heard of, and neither can advertise a path that does not
 * resolve - `tests/machine-surfaces.test.ts` walks app/ and public/ and
 * fails if any listed URL would 404.
 *
 * The profile parameter on the media type is how a client tells an
 * RFC 9727 catalog from any other linkset, so it is part of the
 * contract and is asserted in the test.
 */
/* Relative import so the route can be exercised under
   `node --test --experimental-strip-types`. */
import {
  DISCOVERY_DOCUMENTS,
  MACHINE_ENDPOINTS,
  SITE_URL,
  absolute,
  type DiscoveryDocument,
  type ServiceRelation,
} from '../../../lib/machine-surfaces.ts';

export const RFC9727_PROFILE = 'https://www.rfc-editor.org/info/rfc9727';
export const LINKSET_CONTENT_TYPE = `application/linkset+json; profile="${RFC9727_PROFILE}"`;

/** One link object inside a linkset member (RFC 9264 section 4.2). */
interface LinksetLink {
  href: string;
  type: string;
  title: string;
}

interface LinksetMember {
  anchor: string;
  'service-desc'?: LinksetLink[];
  'service-doc'?: LinksetLink[];
  'service-meta'?: LinksetLink[];
}

function link(doc: DiscoveryDocument): LinksetLink {
  return { href: absolute(doc.path), type: doc.type, title: doc.title };
}

/** Documents from the shared list, grouped by their relation. */
function docsByRelation(paths: readonly string[]): Partial<Record<ServiceRelation, LinksetLink[]>> {
  const wanted = DISCOVERY_DOCUMENTS.filter((d) => paths.includes(d.path));
  const out: Partial<Record<ServiceRelation, LinksetLink[]>> = {};
  for (const doc of wanted) {
    (out[doc.rel] ??= []).push(link(doc));
  }
  return out;
}

/**
 * Every endpoint points at the same three documents: the skills index
 * describes it, llms.txt is the prose, /auth.md states what it wants
 * from a caller (nothing). `/api/csp-report` additionally points at
 * openapi.yaml, which is the one endpoint on this origin that document
 * genuinely covers - the rest of it describes the operator's own task
 * server, and pinning it to endpoints it does not describe would be the
 * same class of error as a card listing tools that are not there.
 */
const PER_ENDPOINT_DOCS = ['/.well-known/skills.json', '/llms.txt', '/auth.md'];

function buildLinkset(): LinksetMember[] {
  const members: LinksetMember[] = [];

  for (const endpoint of MACHINE_ENDPOINTS) {
    const paths =
      endpoint.path === '/api/csp-report'
        ? [...PER_ENDPOINT_DOCS, '/openapi.yaml']
        : PER_ENDPOINT_DOCS;
    members.push({ anchor: absolute(endpoint.path), ...docsByRelation(paths) });
  }

  /* The site-root member.
     RFC 9727 anchors each member on an API. Most of the documents above
     describe this project rather than any one endpoint, and the OpenAPI
     document describes a server with no hosted instance to anchor on -
     its `servers` entry is a template the reader fills in. Rather than
     invent an anchor for an API that is not reachable from here, the
     site root carries those documents and each title says what the
     document is actually about. */
  const rootPaths = DISCOVERY_DOCUMENTS.map((d) => d.path);
  members.push({
    anchor: `${SITE_URL}/`,
    ...docsByRelation(rootPaths),
  });

  return members;
}

export function GET(): Response {
  /* `linkset` is the RFC 9264 JSON serialisation's only top-level key.
     Anything else we might want to say goes in a link title, not in a
     sibling key a conforming parser would ignore. */
  const body = { linkset: buildLinkset() };
  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    status: 200,
    headers: {
      'Content-Type': LINKSET_CONTENT_TYPE,
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
