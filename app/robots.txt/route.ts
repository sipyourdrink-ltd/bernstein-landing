/* Relative import (rather than `@/lib/...`) so this route can be
   imported under `node --test --experimental-strip-types`, which does
   not resolve the tsconfig path alias. Next resolves it either way.
   Same pattern as app/api/blog/summary/route.ts. */
import { AI_BOTS } from '../../lib/seo/ai-bots.ts';
import { DISCOVERY_DOCUMENTS, SITE_URL } from '../../lib/machine-surfaces.ts';

/**
 * The plaintext discovery listing at the top of the file.
 *
 * Built from the same list `/.well-known/api-catalog` and
 * `/.well-known/skills.json` render, so a surface added to one is
 * advertised by all three. It used to be a hand-kept block of six
 * entries and had already fallen behind.
 *
 * The catalog itself leads, because it is the RFC 9727 entry point: a
 * client that reads only that one URL can find everything below it.
 * The rest are listed anyway, for readers that will never parse JSON.
 */
function discoveryComment(): string[] {
  const entries: Array<[string, string]> = [
    ['API catalog', '/.well-known/api-catalog'],
    ...DISCOVERY_DOCUMENTS.map((doc): [string, string] => [doc.label, doc.path]),
  ];
  const width = Math.max(...entries.map(([label]) => label.length)) + 1;
  return entries.map(([label, path]) => `#   ${`${label}:`.padEnd(width + 1)} ${SITE_URL}${path}`);
}

/**
 * Content signal declaration, emitted inside every user-agent group.
 *
 * The vocabulary is the one at content-signals.org: `search` covers
 * building a search index and linking out, `ai-input` covers reading a
 * page to ground a generated answer at query time, and `ai-train`
 * covers keeping the text to train or fine-tune a model. Each is
 * `yes`, `no`, or absent, and absence means nothing has been stated -
 * it is not a refusal.
 *
 * All three are `yes` here, deliberately. This host exists to be read
 * by machines: it publishes llms.txt, an agent card, an OpenAPI
 * document and a skills index precisely so that crawlers, retrieval
 * pipelines and training corpora can consume them. Declaring anything
 * narrower would contradict every other surface on the domain. The
 * content is Apache-2.0-licensed project documentation, so there is no
 * reservation to express.
 *
 * It lives in GROUP_RULES rather than only under `User-agent: *` for
 * the reason spelled out below: RFC 9309 gives a crawler exactly one
 * group and no inheritance, so a signal stated only in the wildcard
 * group would never reach the named AI crawlers - which are the
 * clients the signal is for.
 */
const CONTENT_SIGNAL = 'Content-Signal: search=yes, ai-input=yes, ai-train=yes';

/**
 * Bots that we want to *explicitly* allow even though `User-agent: *`
 * already does. The reason is twofold: (1) some crawlers' policy
 * engines (Bingbot, Applebot, ClaudeBot) match the most-specific
 * record and skip the wildcard entirely, so we have to repeat the
 * Allow there; (2) listing them by name makes Search Console / Apple
 * Bot validators show a green tick instead of a "no rule found"
 * warning.
 *
 * The list itself lives in `lib/seo/ai-bots.ts` so the analytics
 * bot-filter regex can be derived from the same source. Append new
 * entries there; the rendered robots.txt is built from the array
 * order verbatim.
 */

/**
 * The rule block every group carries, wildcard and named alike.
 *
 * Reason 1 above cuts both ways and used to be applied to only half
 * the file: each named group carried `Allow: /` and nothing else, so
 * the `Disallow: /api/` that sits in the wildcard group applied to no
 * named crawler at all. RFC 9309 section 2.2.1 - a crawler obeys
 * exactly one group, the most specific match on the product token, and
 * does not inherit rules from `User-agent: *`. Repeating the whole
 * block per group is the only way to state a restriction that every
 * crawler sees.
 *
 * `/api/og` is carved back out because it renders the Open Graph image
 * that page metadata (`app/layout.tsx` and every `page.tsx` that sets
 * `openGraph.images`) and the RSS feed reference by URL; a preview
 * fetcher that honours the Disallow would render a blank card. RFC
 * 9309 section 2.2.2 resolves Allow/Disallow by longest match, so
 * `Allow: /api/og` wins for that one path while the rest of `/api/`
 * stays closed.
 */
const GROUP_RULES: readonly string[] = [
  CONTENT_SIGNAL,
  'Allow: /',
  'Disallow: /api/',
  'Allow: /api/og',
];

function buildRobotsTxt(): string {
  const lines: string[] = [
    '# bernstein.run robots.txt',
    '# Generated dynamically - see app/robots.txt/route.ts',
    '#',
    '# LLM / agent discovery surfaces (not robots.txt directives, listed',
    '# here so crawlers that read the file as plaintext find them):',
    ...discoveryComment(),
    '#',
    '# Content signals (content-signals.org vocabulary). Every group',
    '# below declares search=yes, ai-input=yes, ai-train=yes.',
    '#',
    '# This is an opt-IN, and it is deliberate. This host is written to',
    '# be read by machines - it publishes llms.txt, an agent card, an',
    '# OpenAPI document and a skills index for exactly that purpose - and',
    '# the content is Apache-2.0 project documentation. Searching it,',
    '# grounding an answer on it, and training on it are all permitted.',
    '# If that ever changes, change it here: this file is the',
    '# declaration, not a mirror of one made elsewhere.',
    '',
    'User-agent: *',
    ...GROUP_RULES,
    '',
  ];

  for (const bot of AI_BOTS) {
    lines.push(`User-agent: ${bot}`, ...GROUP_RULES, '');
  }

  // Only the standard sitemap is advertised. The Google News sitemap at
  // /sitemap-news.xml is intentionally NOT listed here: a news sitemap is
  // submitted through Google News Publisher Center, not robots.txt, and it
  // is empty outside Google's rolling 48h freshness window - so advertising
  // it only yields a standing "empty sitemap" status with no upside. The
  // generator (app/sitemap-news.xml + lib/sitemap-news.ts) stays in place so
  // the line can be restored if the site registers as a Publisher Center
  // publication. See issue #60.
  lines.push(
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    `Host: ${SITE_URL}`,
    '',
  );

  return lines.join('\n');
}

export async function GET(): Promise<Response> {
  const body = buildRobotsTxt();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
