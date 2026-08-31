/**
 * Server-only sponsors fetcher.
 *
 * Resolution order:
 *   1) GITHUB_TOKEN (env, "Bearer ...") + GraphQL `sponsorshipsAsMaintainer`.
 *      This is the documented path. Returns avatar URL, login, name,
 *      isPublic. Public-sponsor detection works without the elevated
 *      `read:user` scope; we drop any record whose `privacyLevel` is
 *      `PRIVATE`.
 *   2) Hardcoded fallback (currently empty). The page renders the
 *      "first three sponsors get listed by name" placeholder copy in
 *      that case - no fake data, no manufactured count.
 *
 * Why scrape is NOT used here:
 *   The sponsorkit ecosystem documents both GraphQL and HTML scrape
 *   paths. HTML scrape is fragile (GitHub renames anchors quarterly)
 *   and cannot distinguish public from private sponsors reliably.
 *   We pin on GraphQL when a token is available and degrade to the
 *   hardcoded list otherwise - operator can edit the list inline
 *   until they wire a token.
 *
 * Cache shape:
 *   Next.js fetch cache, 1h revalidate. The /sponsors page is
 *   force-static when the token is absent (no remote call) and
 *   incrementally revalidated when the token is present.
 */
import type { Sponsor } from '../components/landing/sponsor-wall-data';

const GH_GRAPHQL = 'https://api.github.com/graphql';
const REVALIDATE_SECONDS = 3600;
const UA = 'bernstein-landing/1.0 (+https://bernstein.run)';
/* Hard upstream timeout. Mirrors the per-request AbortController
   pattern from `app/api/stats/route.ts` (4320057): the home-page SSR
   awaits this fetch, so a slow GraphQL response must not pin the
   render handler open. 2s ceiling; on timeout we fall through to the
   hardcoded fallback like every other error path here. */
const UPSTREAM_TIMEOUT_MS = 2000;

/* Hardcoded fallback - keep empty unless the operator chooses to list
   sponsors who consented out-of-band. The voice rule is "no fake
   sponsors": this array stays empty until a real human approves their
   name being added here. */
const HARDCODED_SPONSORS: Sponsor[] = [];

interface GraphSponsorEdge {
  /* `privacyLevel` is a field of the SponsorshipEdge itself, not of
     the node - the GraphQL schema places it at the edge layer so the
     "this sponsorship is public/private" answer is independent of
     who the sponsor entity is. The query above selects it at that
     layer. */
  privacyLevel?: 'PUBLIC' | 'PRIVATE';
  node: {
    sponsorEntity?: {
      __typename?: string;
      login?: string;
      name?: string | null;
      avatarUrl?: string;
      url?: string;
    } | null;
  };
}

interface GraphResponse {
  data?: {
    user?: {
      sponsorshipsAsMaintainer?: {
        edges?: GraphSponsorEdge[];
      };
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Fetch the public sponsor list for `chernistry`. Returns the empty
 * array on any non-200, missing token, parse failure, or zero
 * sponsors. The page renders the placeholder copy when this returns
 * empty - that is the legitimate "no sponsors yet" path.
 */
export async function fetchPublicSponsors(): Promise<Sponsor[]> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    return [...HARDCODED_SPONSORS];
  }

  const query = `
    query SponsorList($login: String!) {
      user(login: $login) {
        sponsorshipsAsMaintainer(first: 100, includePrivate: false) {
          edges {
            privacyLevel
            node {
              sponsorEntity {
                __typename
                ... on User { login name avatarUrl url }
                ... on Organization { login name avatarUrl url }
              }
            }
          }
        }
      }
    }
  `;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(GH_GRAPHQL, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { login: 'chernistry' },
      }),
      next: { revalidate: REVALIDATE_SECONDS },
      signal: ac.signal,
    });
  } catch {
    /* Network error, DNS, or AbortController firing the 2s ceiling all
       land here. Returning the hardcoded fallback keeps render unblocked. */
    return [...HARDCODED_SPONSORS];
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) return [...HARDCODED_SPONSORS];

  let json: GraphResponse;
  try {
    json = (await res.json()) as GraphResponse;
  } catch {
    return [...HARDCODED_SPONSORS];
  }

  const edges = json.data?.user?.sponsorshipsAsMaintainer?.edges ?? [];
  const sponsors: Sponsor[] = [];
  for (const edge of edges) {
    if (edge.privacyLevel === 'PRIVATE') continue;
    const ent = edge.node?.sponsorEntity;
    if (!ent || !ent.login || !ent.avatarUrl) continue;
    sponsors.push({
      login: ent.login,
      name: ent.name ?? ent.login,
      avatarUrl: ent.avatarUrl,
      profileUrl: ent.url ?? `https://github.com/${ent.login}`,
      /* No recognizability signal from GraphQL by default. The
         operator can extend this fetcher later (follower-count
         lookup, "starred bernstein" bool). For now everything sorts
         alphabetically - research file: "don't fake the order." */
      recognizability: 0,
    });
  }
  return sponsors.length > 0 ? sponsors : [...HARDCODED_SPONSORS];
}
