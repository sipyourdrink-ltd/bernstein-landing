/**
 * Every surface that states an exact adapter count must state the same
 * one.
 *
 * The number used to be hand-typed in each place and the copies drifted:
 * 42 in the CLI catalogue, 44 in the evaluation copy and the /ai.txt
 * descriptor, 45 in the hero rail fallback, "30+" in the repo README.
 * `scripts/sync-adapter-count.mjs` now writes all of them from
 * `data/adapter-count.json`; these tests fail if a literal creeps back
 * in or the sync step is dropped from the build.
 *
 * Approximate figures ("40+") are deliberately out of scope - they are a
 * floor, not a count, and they stay correct as the registry grows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { GET } from '../app/ai.txt/route.ts';

const root = process.cwd();

async function expectedCount(): Promise<number> {
  const raw = await fs.readFile(path.join(root, 'data', 'adapter-count.json'), 'utf8');
  const parsed = JSON.parse(raw) as { count?: unknown };
  assert.equal(
    typeof parsed.count,
    'number',
    'data/adapter-count.json must carry a numeric `count`',
  );
  return parsed.count as number;
}

test('data/adapter-count.json holds a plausible count', async () => {
  const count = await expectedCount();
  assert.ok(
    Number.isInteger(count) && count > 0,
    `adapter count must be a positive integer, got ${count}`,
  );
});

test('/ai.txt Total-adapters matches the resolved count', async () => {
  const count = await expectedCount();
  const body = await GET().text();
  assert.ok(
    body.includes(`Total-adapters: ${count}`),
    `/ai.txt must advertise Total-adapters: ${count}`,
  );
});

test('the CLI catalogue blurb matches the resolved count', async () => {
  const count = await expectedCount();
  for (const file of ['data/cli.json', 'data/cli-seed.json']) {
    const raw = await fs.readFile(path.join(root, file), 'utf8');
    const m = raw.match(
      /Deterministic Python scheduler for CLI coding agents — (\d+) adapters/,
    );
    assert.ok(m, `${file} must carry the adapter-count blurb`);
    assert.equal(Number(m![1]), count, `${file} states ${m![1]}, expected ${count}`);
  }
});

test('the evaluation copy matches the resolved count', async () => {
  const count = await expectedCount();
  const raw = await fs.readFile(path.join(root, 'content', 'evaluation', 'index.mdx'), 'utf8');
  const claims = [
    /does the same thing across (\d+) different cli agents/,
    /claude code included as one of the (\d+),/,
    /there are (\d+) adapters in the registry/,
  ];
  for (const re of claims) {
    const m = raw.match(re);
    assert.ok(m, `content/evaluation/index.mdx must keep the counter matching ${re}`);
    assert.equal(Number(m![1]), count, `${re} states ${m![1]}, expected ${count}`);
  }
});

test('the repo README matches the resolved count', async () => {
  const count = await expectedCount();
  const raw = await fs.readFile(path.join(root, 'README.md'), 'utf8');
  /* Matched on the number and the word, not on the surrounding blurb:
     the sentence gets rewritten from time to time and the counter has
     to survive that, but a README that states a stale adapter count is
     the failure this test exists for. */
  const m = raw.match(/(\d+) adapters/);
  assert.ok(m, 'README.md must state the adapter count as "<n> adapters"');
  assert.equal(Number(m![1]), count, `README states ${m![1]}, expected ${count}`);
});
