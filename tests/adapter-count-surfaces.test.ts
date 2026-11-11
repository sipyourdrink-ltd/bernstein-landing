/**
 * Generated catalogues and evaluation content retain the resolved count.
 * Public marketing copy uses the approximate "50+" claim instead.
 * Keep both contracts in sync without changing the generated data.
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

test('/ai.txt Total-adapters uses the approximate public claim', async () => {
  const body = await GET().text();
  assert.ok(
    body.includes('Total-adapters: 50+'),
    '/ai.txt must advertise Total-adapters: 50+',
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

test('the evaluation copy uses the approximate public claim', async () => {
  const raw = await fs.readFile(path.join(root, 'content', 'evaluation', 'index.mdx'), 'utf8');
  const claims = [
    /does the same thing across 50\+ different cli agents/,
    /claude code included as one of the 50\+,/,
    /there are 50\+ adapters in the registry/,
  ];
  for (const re of claims) {
    assert.match(raw, re, `content/evaluation/index.mdx must keep the counter matching ${re}`);
  }
});

test('the repo README uses the approximate public claim', async () => {
  const raw = await fs.readFile(path.join(root, 'README.md'), 'utf8');
  assert.match(raw, /50\+ adapters ship with/, 'README.md must advertise 50+ adapters');
});
