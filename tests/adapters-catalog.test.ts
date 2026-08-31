/**
 * Regression guards for the /vs/* generated catalogue pages.
 *
 * - asserts data/adapters.json exists and has the expected adapter
 *   count (down by >1 = a regression in the extractor or a deletion
 *   in upstream bernstein that we must investigate)
 * - asserts every "ready" adapter has the operator-curated
 *   summary/whenToChoose pair populated (otherwise the page renders
 *   a generic fallback that still works but loses E-E-A-T)
 * - asserts no adapter is missing a docstring (extractor failure)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA = path.resolve(process.cwd(), 'data', 'adapters.json');

const MIN_ADAPTERS = 40; /* the extraction currently yields 45 (46 registry keys minus mock, which has no adapter module); the floor leaves room for upstream churn */

test('data/adapters.json exists', async () => {
  const exists = await fs.access(DATA).then(() => true).catch(() => false);
  assert.ok(exists, `expected ${DATA} to exist; run \`node scripts/extract-adapters.mjs\``);
});

test('adapters.json has the expected adapter count', async () => {
  const raw = await fs.readFile(DATA, 'utf8');
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.adapters), 'adapters is an array');
  assert.ok(
    data.adapters.length >= MIN_ADAPTERS,
    `expected >= ${MIN_ADAPTERS} adapters, got ${data.adapters.length}; investigate before publishing`,
  );
});

test('every adapter has a slug, displayName, category, sourceFile', async () => {
  const raw = await fs.readFile(DATA, 'utf8');
  const data = JSON.parse(raw);
  for (const a of data.adapters) {
    assert.ok(a.slug, `missing slug for ${a.name}`);
    assert.ok(a.displayName, `missing displayName for ${a.slug}`);
    assert.ok(a.category, `missing category for ${a.slug}`);
    assert.ok(a.sourceFile && a.sourceFile.startsWith('src/'), `bad sourceFile for ${a.slug}: ${a.sourceFile}`);
  }
});

test('every "ready" adapter has summary + whenToChoose + whenToChooseBernstein', async () => {
  const raw = await fs.readFile(DATA, 'utf8');
  const data = JSON.parse(raw);
  const ready = data.adapters.filter((a: any) => a.ready);
  assert.ok(ready.length > 0, 'at least one adapter must be flagged ready (otherwise no /vs/* page is published)');
  for (const a of ready) {
    assert.ok(a.summary, `ready adapter ${a.slug} is missing operator-curated summary in data/adapters-overlay.json`);
    assert.ok(a.whenToChoose, `ready adapter ${a.slug} is missing whenToChoose paragraph`);
    assert.ok(a.whenToChooseBernstein, `ready adapter ${a.slug} is missing whenToChooseBernstein paragraph`);
  }
});
