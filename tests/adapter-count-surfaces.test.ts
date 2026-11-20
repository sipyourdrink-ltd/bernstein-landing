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

test('/ai.txt identifies what the public count measures', async () => {
  const body = await GET().text();
  assert.match(body, /^Selectable-CLI-agent-adapter-names: 55$/m);
});

test('the CLI catalogues describe the selectable names', async () => {
  for (const file of ['data/cli.json', 'data/cli-seed.json']) {
    const raw = await fs.readFile(path.join(root, file), 'utf8');
    assert.match(JSON.parse(raw).root.description, /55 selectable CLI agent adapter names/, file);
  }
});

test('the repo README describes the selectable names', async () => {
  const raw = await fs.readFile(path.join(root, 'README.md'), 'utf8');
  assert.match(raw, /55 selectable CLI agent adapter names/);
});
