import { JsonLd, type JsonLdData } from './JsonLd';
import { SITE_URL, AUTHOR } from '@/lib/seo';
import versionData from '@/data/bernstein-version.json';

/**
 * SoftwareApplication JSON-LD for the landing page.
 *
 * Notes for future editors:
 *   - `applicationCategory: 'DeveloperApplication'` is the only string
 *     Google's rich-results validator recognises for dev-tooling.
 *   - `operatingSystem: 'Cross-platform'` is the canonical wording when the
 *     tool runs anywhere Python does. Listing all three (mac/linux/win) is
 *     also acceptable but harder for crawlers to dedupe across mirrors.
 *   - `aggregateRating` is intentionally absent. Google's structured-data
 *     policy only permits review markup when the page hosts actual
 *     first-party user reviews; GitHub stars do not satisfy that bar and
 *     fabricated values risk a manual action that cascades through the
 *     org `@id` reference graph. Reintroduce only when we host a real
 *     review corpus on the page itself.
 *   - `offers` declares the package free; required for the rich card to
 *     show "Free" instead of falling back to a price-on-request label.
 */

export const SOFTWARE_APPLICATION_JSON_LD: JsonLdData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${SITE_URL}/#software`,
  name: 'Bernstein',
  alternateName: [
    'Bernstein Orchestrator',
    'Bernstein multi-agent CLI orchestrator',
    'Bernstein AI coding agent manager',
  ],
  description:
    'The open-source governance layer for AI agents. A plain-Python scheduler with no model in the coordination loop runs Claude Code, Codex, Gemini CLI, and 40+ more CLI coding agents in parallel git worktrees behind lint, type, and test gates. An always-on lineage spine and replay journal record every run; an opt-in HMAC-chained audit log and signed receipts let a reviewer who did not execute the run check it offline, without rerunning it. Signature and hash-chain checks read the on-disk records alone; the HMAC leg needs the key the chain was written with. MCP multi-agent server and A2A protocol support included.',
  url: SITE_URL,
  applicationCategory: 'DeveloperApplication',
  applicationSubCategory: 'CLI Agent Orchestration',
  /* Schema.org `keywords` is a free-text field Google's rich-results
     validator accepts as a comma-separated list. Lifts the 13 tracked
     SERP terms from the May-2026 keyword snapshot - see
     .sdd/backlog/open/2026-05-14-seo-keyword-bump.md. */
  keywords:
    'open-source governance layer for AI agents, ai governance, agent governance, deterministic orchestration, parallel git worktrees, byte-identical run receipts, offline audit verification, HMAC audit chain, signed lineage, claude code parallel, MCP server, A2A protocol, air-gap agent orchestration, reproducible agent runs',
  operatingSystem: 'Cross-platform',
  programmingLanguage: 'Python',
  softwareRequirements: 'Python 3.12+',
  /* Tracks data/bernstein-version.json, which scripts/sync-version.mjs
     rewrites from the published release tag on every build. The earlier
     revision read lib/version.ts, the OFFLINE FLOOR - so a stale
     constant shipped a stale version into this JSON-LD on / and every
     /vs page even when the build had resolved the real one. The floor
     is still the fallback, because sync-version.mjs writes it into this
     file when the releases API is unreachable. */
  softwareVersion: versionData.version,
  license: 'https://www.apache.org/licenses/LICENSE-2.0',
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
  },
  author: {
    '@type': 'Person',
    '@id': 'https://alexchernysh.com/#person',
    name: AUTHOR,
    url: 'https://alexchernysh.com',
    email: 'forte@bernstein.run',
    sameAs: [
      'https://alexchernysh.com',
      'https://github.com/chernistry',
      'https://x.com/alex_chernysh',
    ],
  },
  publisher: { '@id': `${SITE_URL}/#organization` },
  codeRepository: 'https://github.com/sipyourdrink-ltd/bernstein',
  downloadUrl: 'https://pypi.org/project/bernstein/',
  /* releaseNotes URL points at the CHANGELOG inside ReadTheDocs, which is
     the human-readable release surface. Google's SoftwareApplication
     validator accepts a URL string. */
  releaseNotes: 'https://bernstein.readthedocs.io/en/latest/CHANGELOG/',
  installUrl: 'https://pypi.org/project/bernstein/',
  maintainer: {
    '@id': 'https://alexchernysh.com/#person',
  },
  featureList: [
    'Deterministic scheduling (no LLM in the coordination loop)',
    '40+ CLI agent adapters',
    'Always-on lineage spine and replay journal',
    'Opt-in HMAC-chained audit log with signed receipts',
    'Per-task git worktree isolation',
    'Air-gap install profile',
    'Pluggable sandbox backends (worktree, Docker, E2B, Modal, Blaxel, Cloudflare, Daytona, Runloop, Vercel)',
    'Cloud artifact sinks (S3, GCS, Azure Blob, Cloudflare R2)',
    'Progressive-disclosure skill packs via load_skill MCP tool',
    'Quality gates',
    'Cost-aware routing',
    'MCP server mode',
    'A2A protocol support',
    'ACP bridge (bernstein acp serve)',
    'CI autofix daemon (bernstein autofix)',
    'OS keychain credential vault (bernstein connect)',
    'Sandboxed preview server (bernstein preview start)',
  ],
};

export function SoftwareApplicationJsonLd() {
  return <JsonLd data={SOFTWARE_APPLICATION_JSON_LD} />;
}
