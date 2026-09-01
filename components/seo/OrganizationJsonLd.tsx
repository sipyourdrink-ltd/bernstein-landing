import { JsonLd, type JsonLdData } from './JsonLd';
import { SITE_URL, SITE_NAME, AUTHOR } from '@/lib/seo';
import { PROJECT_ALTERNATE_NAME } from '@/lib/project-description';

/**
 * Organization JSON-LD for the site root.
 *
 * Co-located with the matching SoftwareApplication block - Google reads
 * them as a graph and will draw `author -> Person` and `publisher ->
 * Organization` edges as long as the `@id` URLs match. The `sameAs`
 * array lists verifiably-owned surfaces so Knowledge-Graph crawlers can
 * disambiguate the project entity from unrelated "Bernstein"
 * references. Keep this list aligned with the Person `sameAs` in
 * lib/jsonld.ts so the identity cluster stays coherent - never add
 * stub, half-broken, or aspirational profiles, Search Console flags
 * the orphan and downgrades the cluster.
 */
export const ORGANIZATION_JSON_LD: JsonLdData = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  alternateName: [PROJECT_ALTERNATE_NAME, 'Bernstein multi-agent CLI orchestrator'],
  description:
    'The open-source governance layer for AI agents. Coordinates Claude Code, Codex, Gemini CLI, and 40+ more coding agents under a plain-Python scheduler with no model in the coordination loop, git worktree isolation, quality gates, MCP server mode, A2A protocol, an always-on lineage spine and replay journal, and an opt-in HMAC-chained audit log a reviewer checks offline.',
  url: SITE_URL,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'forte@bernstein.run',
    url: 'https://github.com/sipyourdrink-ltd/bernstein/issues',
    availableLanguage: ['en'],
  },
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/favicon.svg`,
    width: 512,
    height: 512,
  },
  sameAs: [
    'https://github.com/sipyourdrink-ltd/bernstein',
    'https://github.com/chernistry',
    'https://pypi.org/project/bernstein/',
    'https://www.npmjs.com/package/bernstein-orchestrator',
    'https://bernstein.readthedocs.io/',
    'https://x.com/alex_chernysh',
    'https://mastodon.social/@alexchernysh',
    'https://bsky.app/profile/alex-chernysh.bsky.social',
    'https://alexchernysh.com',
  ],
  founder: {
    '@type': 'Person',
    '@id': 'https://alexchernysh.com/#person',
    name: AUTHOR,
    url: 'https://alexchernysh.com',
    jobTitle: 'Software engineer',
    sameAs: [
      'https://alexchernysh.com',
      'https://github.com/chernistry',
      'https://x.com/alex_chernysh',
    ],
  },
  foundingDate: '2025-09',
};

export function OrganizationJsonLd() {
  return <JsonLd data={ORGANIZATION_JSON_LD} />;
}
