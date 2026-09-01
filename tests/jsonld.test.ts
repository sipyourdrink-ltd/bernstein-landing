/**
 * Unit tests for the catalogue JSON-LD builder library.
 *
 * Validates each builder emits a JSON-LD object with:
 *  - the schema.org context
 *  - the expected @type
 *  - all required fields populated
 *  - no undefined leaks (every value either present or omitted)
 *
 * Mirrors the existing tests/json-ld-why-bernstein.test.ts
 * style — node:test + assert/strict, no test framework deps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PROJECT_ALTERNATE_NAME } from '../lib/project-description.ts';

import {
  articleLD,
  breadcrumbLD,
  comparisonLD,
  datasetLD,
  howToLD,
  organizationLD,
  softwareApplicationLD,
  techArticleLD,
} from '../lib/jsonld.ts';

function assertNoUndefinedLeak(obj: unknown, path = '$') {
  if (obj === undefined) {
    assert.fail(`${path} is undefined — builder should omit absent fields`);
  }
  if (obj === null || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => assertNoUndefinedLeak(item, `${path}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    assertNoUndefinedLeak(value, `${path}.${key}`);
  }
}

test('organizationLD emits a valid Organization node', () => {
  const node = organizationLD();
  assert.equal(node['@context'], 'https://schema.org');
  assert.equal(node['@type'], 'Organization');
  /* Must match components/seo/OrganizationJsonLd.tsx so generated catalogue pages and
     the site-wide block name a single Organization entity. */
  assert.equal(node['@id'], 'https://bernstein.run/#organization');
  assert.equal(typeof node.name, 'string');
  assert.equal(typeof node.url, 'string');
  assert.ok(Array.isArray(node.sameAs));
  assertNoUndefinedLeak(node);
});

test('organizationLD sameAs lists >= 3 operator-controlled profiles', () => {
  const node = organizationLD();
  const sameAs = node.sameAs as unknown;
  assert.ok(Array.isArray(sameAs), 'sameAs must be an array');
  assert.ok(
    (sameAs as string[]).length >= 3,
    'sameAs needs >= 3 entries for Knowledge-Graph disambiguation',
  );
  /* Every entry must be a non-empty https URL - sameAs is the
     disambiguation signal and we never want stub or relative values. */
  for (const entry of sameAs as unknown[]) {
    assert.equal(typeof entry, 'string');
    assert.match(entry as string, /^https:\/\/\S+$/);
  }
});

/* ---------------------------------------------------------------------
 * Site-wide Organization JSON-LD (components/seo/OrganizationJsonLd.tsx)
 *
 * This block has @id `${SITE_URL}/#organization` and is emitted on every
 * page via app/layout.tsx. The lib/jsonld.ts organizationLD() helper
 * (embedded in catalogue graph contexts) uses the SAME `/#organization` @id,
 * so both surfaces resolve to one Organization entity. Both must carry
 * enough sameAs entries for crawlers to disambiguate the project entity
 * from unrelated "Bernstein" references.
 *
 * We read the source file directly and pull the const literal via
 * regex - same approach as json-ld-why-bernstein.test.ts, which keeps
 * us free of next.js / JSX runtime in unit tests.
 * --------------------------------------------------------------------- */

const SITE_ORG_FILE = path.resolve(
  process.cwd(),
  'components',
  'seo',
  'OrganizationJsonLd.tsx',
);

/* Bind imported identifiers used by the ORGANIZATION_JSON_LD literal to
 * lightweight stand-ins lifted from lib/seo.ts. If new imports land,
 * extend this map.
 *
 * PROJECT_ALTERNATE_NAME is the real export rather than a stand-in:
 * lib/project-description.ts is dependency-free, so it imports cleanly
 * here, and a stand-in would reintroduce in this file the second copy
 * that module exists to eliminate. */
const SITE_ORG_WIRES = {
  AUTHOR: 'Alex Chernysh',
  SITE_URL: 'https://bernstein.run',
  SITE_NAME: 'Bernstein',
  PROJECT_ALTERNATE_NAME,
};

function extractObjectLiteral(source: string, name: string): string | null {
  const startRe = new RegExp(`const\\s+${name}\\b[^=]*=\\s*`, 'm');
  const startMatch = source.match(startRe);
  if (!startMatch || startMatch.index === undefined) return null;
  const after = source.slice(startMatch.index + startMatch[0].length);
  if (after.length === 0 || after[0] !== '{') return null;
  let depth = 0;
  let i = 0;
  let inString: string | null = null;
  let escape = false;
  for (; i < after.length; i++) {
    const ch = after[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
    }
  }
  if (depth !== 0) return null;
  return after.slice(0, i);
}

function evalSiteOrgLiteral(literal: string): unknown {
  const argNames = Object.keys(SITE_ORG_WIRES) as Array<keyof typeof SITE_ORG_WIRES>;
  const argValues = argNames.map((k) => SITE_ORG_WIRES[k]);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function(...argNames, `return ${literal};`);
  return fn(...argValues);
}

test('site-wide Organization JSON-LD sameAs lists >= 3 operator-controlled profiles', async () => {
  const source = await fs.readFile(SITE_ORG_FILE, 'utf8');
  const literal = extractObjectLiteral(source, 'ORGANIZATION_JSON_LD');
  assert.ok(
    literal,
    'ORGANIZATION_JSON_LD const must exist in components/seo/OrganizationJsonLd.tsx',
  );

  const node = evalSiteOrgLiteral(literal!) as Record<string, unknown>;
  assert.equal(node['@context'], 'https://schema.org');
  assert.equal(node['@type'], 'Organization');
  assert.equal(node['@id'], 'https://bernstein.run/#organization');

  const sameAs = node.sameAs as unknown;
  assert.ok(Array.isArray(sameAs), 'sameAs must be an array');
  const list = sameAs as string[];
  assert.ok(
    list.length >= 3,
    'sameAs needs >= 3 entries for Knowledge-Graph disambiguation',
  );
  for (const entry of list) {
    assert.equal(typeof entry, 'string');
    assert.match(entry, /^https:\/\/\S+$/);
  }
  /* These operator-controlled URLs are referenced elsewhere in the
     repo (lib/jsonld.ts Person + Org nodes) and must stay aligned with
     the site-wide Organization block so Knowledge-Graph crawlers see a
     single coherent identity cluster. */
  assert.ok(
    list.includes('https://mastodon.social/@alexchernysh'),
    'sameAs must include the operator Mastodon handle',
  );
  assert.ok(
    list.includes('https://bsky.app/profile/alex-chernysh.bsky.social'),
    'sameAs must include the operator Bluesky handle',
  );
  assert.ok(
    list.includes('https://github.com/chernistry'),
    'sameAs must include the operator GitHub profile',
  );
});

test('softwareApplicationLD emits required schema fields', () => {
  const node = softwareApplicationLD({
    name: 'Bernstein',
    url: 'https://bernstein.run',
    description: 'Multi-agent CLI orchestrator.',
    codeRepository: 'https://github.com/sipyourdrink-ltd/bernstein',
    license: 'https://www.apache.org/licenses/LICENSE-2.0',
    programmingLanguage: 'Python',
    softwareRequirements: 'Python 3.12+',
  });
  assert.equal(node['@context'], 'https://schema.org');
  assert.equal(node['@type'], 'SoftwareApplication');
  assert.equal(node.applicationCategory, 'DeveloperApplication');
  assert.equal(node.operatingSystem, 'Cross-platform');
  assert.equal(node.programmingLanguage, 'Python');
  const offers = node.offers as Record<string, unknown>;
  assert.equal(offers.price, '0');
  assert.equal(offers.priceCurrency, 'USD');
  assertNoUndefinedLeak(node);
});

test('softwareApplicationLD honours custom price + rating', () => {
  const node = softwareApplicationLD({
    name: 'X',
    url: 'https://x',
    description: 'd',
    pricePerUnit: '49',
    rating: { value: '4.7', count: '120' },
  });
  assert.equal((node.offers as Record<string, unknown>).price, '49');
  assert.equal((node as Record<string, unknown>).isAccessibleForFree, false);
  const rating = node.aggregateRating as Record<string, unknown>;
  assert.equal(rating.ratingValue, '4.7');
  assert.equal(rating.ratingCount, '120');
});

test('comparisonLD includes both products + matrix as PropertyValues', () => {
  const node = comparisonLD(
    { name: 'Bernstein', url: 'https://bernstein.run' },
    { name: 'Example Tool', url: 'https://example.com' },
    [
      { feature: 'Audit log', productAValue: 'Yes (HMAC)', productBValue: 'No' },
      { feature: 'Parallel worktrees', productAValue: 'Yes', productBValue: 'No' },
    ],
    {
      url: 'https://bernstein.run/vs/example-tool',
      title: 'Bernstein vs Example Tool',
      description: 'Comparison of two multi-agent orchestrators.',
      datePublished: '2026-05-09',
    },
  );
  assert.equal(node['@type'], 'TechArticle');
  const about = node.about as Array<Record<string, unknown>>;
  assert.equal(about.length, 2);
  assert.equal(about[0].name, 'Bernstein');
  const mentions = node.mentions as Array<Record<string, unknown>>;
  assert.equal(mentions.length, 2);
  assert.equal(mentions[0]['@type'], 'PropertyValue');
  assert.match(mentions[0].value as string, /Bernstein:.*Example Tool:/);
  assertNoUndefinedLeak(node);
});

test('techArticleLD renders flags as PropertyValue mentions', () => {
  const node = techArticleLD({
    command: 'bernstein run',
    description: 'Start a Bernstein run with the given goal.',
    flags: [
      { flag: '--goal', description: 'natural-language goal text' },
      { flag: '--budget', description: 'cost cap', default: '0.50' },
    ],
    url: 'https://bernstein.run/docs/cli/run',
    datePublished: '2026-05-09',
  });
  assert.equal(node['@type'], 'TechArticle');
  const mentions = node.mentions as Array<Record<string, unknown>>;
  assert.equal(mentions.length, 2);
  assert.equal(mentions[1].defaultValue, '0.50');
  assertNoUndefinedLeak(node);
});

test('datasetLD includes percentiles + citation', () => {
  const node = datasetLD(
    'software-engineer',
    'san-francisco',
    [
      { name: 'p10', value: 110000, unit: 'USD' },
      { name: 'p50', value: 175000, unit: 'USD' },
      { name: 'p90', value: 280000, unit: 'USD' },
    ],
    {
      name: 'BLS OEWS 2025',
      url: 'https://www.bls.gov/oes/current/oes_41940.htm',
    },
  );
  assert.equal(node['@type'], 'Dataset');
  const distributions = node.distribution as Array<Record<string, unknown>>;
  assert.equal(distributions.length, 3);
  assert.equal(distributions[1].value, 175000);
  assert.match(node.citation as string, /BLS OEWS/);
  assertNoUndefinedLeak(node);
});

test('howToLD numbers steps starting at 1', () => {
  const node = howToLD(
    [
      { name: 'Install', text: 'pip install bernstein' },
      { name: 'Run', text: 'bernstein run --goal "..."' },
    ],
    {
      url: 'https://bernstein.run/howto/quickstart',
      name: 'Quickstart',
      description: 'Five-minute setup.',
    },
  );
  assert.equal(node['@type'], 'HowTo');
  const steps = node.step as Array<Record<string, unknown>>;
  assert.equal(steps.length, 2);
  assert.equal(steps[0].position, 1);
  assert.equal(steps[1].position, 2);
  assertNoUndefinedLeak(node);
});

test('articleLD honours optional fields', () => {
  const node = articleLD({
    url: 'https://bernstein.run/blog/post',
    headline: 'Post',
    description: 'Desc',
    datePublished: '2026-05-09',
    keywords: ['orchestration', 'multi-agent'],
    readingMinutes: 7,
  });
  assert.equal(node['@type'], 'Article');
  assert.equal(node.timeRequired, 'PT7M');
  assert.match(node.keywords as string, /orchestration/);
  assertNoUndefinedLeak(node);
});

test('breadcrumbLD numbers items + requires at least one crumb', () => {
  assert.throws(() => breadcrumbLD([]));
  const node = breadcrumbLD([
    { name: 'Home', url: 'https://bernstein.run' },
    { name: 'Blog', url: 'https://bernstein.run/blog' },
  ]);
  assert.equal(node['@type'], 'BreadcrumbList');
  const items = node.itemListElement as Array<Record<string, unknown>>;
  assert.equal(items[0].position, 1);
  assert.equal(items[1].position, 2);
  assertNoUndefinedLeak(node);
});
