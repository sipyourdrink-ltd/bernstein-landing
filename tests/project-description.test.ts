/**
 * Drift guard for how the project describes itself.
 *
 * The failure this pins: the human-readable copy and the primary
 * machine-readable descriptions were rewritten when the project
 * description changed, and six structured-data and plaintext surfaces
 * were not. Two of the six sat in the same response body as an
 * already-corrected description, so the host served two different
 * descriptions of one project to the same crawler. Nobody reads
 * `/agents.txt` next to the `WebSite` JSON-LD next to `/llms-full.txt`,
 * which is why the mismatch survived.
 *
 * The cause was four hand-maintained copies of one sentence.
 * `lib/project-description.ts` is now the one copy, and the first two
 * tests below fail if a surface grows its own again - either by
 * inlining a literal instead of importing, or by reintroducing the
 * vocabulary the description moved off.
 *
 * Why source text rather than rendered output: `/llms-full.txt` and
 * `/about` pull MDX compilation and the post index through `@/` path
 * aliases, which `node --test --experimental-strip-types` does not
 * resolve. `tests/meta-description-cap.test.ts` and
 * `tests/voice-banned-words.test.ts` read source for the same reason.
 * `lib/project-description.ts` is dependency-free, so its values are
 * imported and asserted directly.
 *
 * Out of scope, deliberately: pointers labelled "the orchestrator" that
 * resolve to the engine repository, and prose about the orchestrator
 * process relative to its workers. The scheduler is an orchestrator.
 * Only descriptions of the product are governed here, which is why the
 * retired-phrase list below names whole phrases and not the substring
 * "orchestrat".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PROJECT_ALTERNATE_NAME,
  PROJECT_CATEGORIES,
  PROJECT_DESCRIPTION,
  PROJECT_MAINTAINER_DESCRIPTION,
  PROJECT_ONE_LINER,
  PROJECT_OVERVIEW,
  PROJECT_SITE_DESCRIPTION,
  PROJECT_TAGLINE,
  PROJECT_TAGLINE_LOWER,
  PROJECT_TAGS,
} from '../lib/project-description.ts';

const REPO_ROOT = process.cwd();

const read = (file: string): string =>
  fs.readFileSync(path.resolve(REPO_ROOT, file), 'utf8');

/**
 * The four surfaces the description has to stay identical across, and
 * the exact binding site on each one.
 *
 * These pin the binding rather than the import, because importing the
 * module and then spelling the description out anyway is a real way to
 * regress and an import-only assertion waves it through. A literal
 * re-typed at any of these positions fails here.
 */
const DERIVED_SURFACES: Array<{ file: string; bindings: string[] }> = [
  {
    file: 'app/page.tsx',
    bindings: [
      'alternateName: PROJECT_ALTERNATE_NAME,',
      'description: PROJECT_SITE_DESCRIPTION,',
    ],
  },
  {
    file: 'app/agents.txt/route.ts',
    bindings: [
      'Description: ${PROJECT_DESCRIPTION}',
      "Category: ${PROJECT_CATEGORIES.join(', ')}",
      "Tags: ${PROJECT_TAGS.join(', ')}",
    ],
  },
  {
    file: 'app/llms-full.txt/route.ts',
    bindings: ['> ${PROJECT_ONE_LINER}', '${PROJECT_OVERVIEW}'],
  },
  {
    file: 'app/about/page.tsx',
    bindings: [
      'description: PROJECT_MAINTAINER_DESCRIPTION,',
      '{PROJECT_TAGLINE_LOWER}',
    ],
  },
];

/**
 * Phrases the project description moved off. Each one described the
 * previous, narrower scope, and each is specific enough that a correct
 * reference to the orchestrator process or the engine repository cannot
 * trip it.
 */
const RETIRED_PHRASES: string[] = [
  'Bernstein Orchestrator',
  'AIOrchestration',
  'orchestration system',
  'Orchestrate any CLI coding agent',
  'orchestrator for cli coding agents',
  'orchestrator for cli ai coding agents',
];

/**
 * Surfaces that still spell the description out, because the string
 * they need is longer or differently shaped than any shared export.
 * They are not required to import the module, but they are required to
 * agree with it, which is what the tests below check.
 *
 * `app/vs/page.tsx` and `app/vs/[slug]/page.tsx` are deliberately not
 * listed here: the /vs hub and per-adapter pages are generated and
 * deployed straight to the host, outside this git tree, so a checkout
 * never has them on disk and a source-text read can only ENOENT. That
 * also means this suite cannot guard their copy - see the drift-guard
 * gap this leaves, tracked separately from this fix.
 */
const LITERAL_SURFACES: string[] = [
  'app/layout.tsx',
  'manifest.json',
  'public/manifest.json',
  'components/seo/SoftwareApplicationJsonLd.tsx',
  'components/seo/OrganizationJsonLd.tsx',
  'app/why-bernstein/page.tsx',
];

/** Every surface that carries a description of the project. */
const DESCRIBING_SURFACES: string[] = [
  ...DERIVED_SURFACES.map((s) => s.file),
  ...LITERAL_SURFACES,
];

test('the four drift-prone surfaces derive their description from the shared module', () => {
  for (const { file, bindings } of DERIVED_SURFACES) {
    const src = read(file);
    assert.match(
      src,
      /from '@\/lib\/project-description'/,
      `${file} must import its description from @/lib/project-description, not keep its own copy`,
    );
    for (const binding of bindings) {
      assert.ok(
        src.includes(binding),
        `${file} no longer binds the shared description at \`${binding}\` - a literal there is the copy this module exists to prevent`,
      );
    }
  }
});

test('no surface reintroduces the retired project description', () => {
  for (const file of DESCRIBING_SURFACES) {
    const src = read(file);
    for (const phrase of RETIRED_PHRASES) {
      assert.ok(
        !src.includes(phrase),
        `${file} carries the retired phrase "${phrase}"`,
      );
    }
  }
});

test('receipts are described as offline-verifiable, not byte-identical', () => {
  /* Receipt bytes are identical across independent builds of the same
     run. Two different runs produce different receipts, as they must -
     each carries its own run id and heads. "byte-identical run
     receipts" invites the reading that receipts are byte-identical in
     general, which is not a property this project has. */
  for (const file of DESCRIBING_SURFACES) {
    assert.ok(
      !read(file).includes('byte-identical run receipts'),
      `${file} overstates the receipt guarantee; receipts are offline-verifiable, and it is the run that replays byte-identically`,
    );
  }
});

test('surfaces that spell the description out still name the governance layer', () => {
  /* The derived four are covered by the import test above - a file that
     imports the phrase does not contain it literally, which is the
     point. These are the copies that remain, and they are the ones that
     can drift. */
  for (const file of LITERAL_SURFACES) {
    const src = read(file).toLowerCase();
    assert.ok(
      src.includes(PROJECT_TAGLINE_LOWER),
      `${file} describes the project without naming it as ${PROJECT_TAGLINE_LOWER}`,
    );
  }
});

test('every exported description is built from the one canonical phrase', () => {
  const phrase = PROJECT_TAGLINE_LOWER;
  for (const [name, value] of [
    ['PROJECT_DESCRIPTION', PROJECT_DESCRIPTION],
    ['PROJECT_SITE_DESCRIPTION', PROJECT_SITE_DESCRIPTION],
    ['PROJECT_OVERVIEW', PROJECT_OVERVIEW],
    ['PROJECT_MAINTAINER_DESCRIPTION', PROJECT_MAINTAINER_DESCRIPTION],
  ] as const) {
    assert.ok(
      value.toLowerCase().includes(phrase),
      `${name} no longer contains the canonical phrase "${phrase}"`,
    );
  }
  assert.equal(PROJECT_TAGLINE_LOWER, PROJECT_TAGLINE.toLowerCase());
  assert.ok(PROJECT_ALTERNATE_NAME.includes('Governance Layer'));
});

test('the agents.txt classification fields carry a governance and a provenance term', () => {
  /* A directory that ingests /agents.txt classifies the project from
     these two fields alone. They described the previous scope while the
     Description line above them was already correct. */
  const categories = PROJECT_CATEGORIES.join(', ').toLowerCase();
  const tags = PROJECT_TAGS.join(', ').toLowerCase();
  assert.ok(categories.includes('governance'), 'Category names no governance term');
  assert.ok(categories.includes('provenance'), 'Category names no provenance term');
  assert.ok(tags.includes('governance'), 'Tags name no governance term');
  assert.ok(tags.includes('provenance'), 'Tags name no provenance term');
});

test('CLI coding agents stay named as the out-of-the-box path', () => {
  /* The fix is that CLI coding agents are no longer the only thing
     described, not that they disappear. */
  assert.match(PROJECT_OVERVIEW, /CLI coding agents work out of the box/);
  assert.ok(PROJECT_TAGS.includes('cli-agents'));
  assert.match(read('app/about/page.tsx'), /work out of the box/);
});

test('one liner and overview do not restate a claim the summary block already makes', () => {
  /* Site 4 was the previous tagline left in place under four lines that
     had already been rewritten - a stale line survives longest where it
     sits next to a correct one. */
  assert.ok(!PROJECT_ONE_LINER.toLowerCase().includes('orchestrate'));
  assert.ok(!PROJECT_OVERVIEW.toLowerCase().includes('orchestration system'));
});
