/**
 * Regression guards for the /docs/cli/* generated catalogue pages.
 *
 * - asserts data/cli.json exists
 * - asserts at least one ready command exists (otherwise no static
 *   page is rendered and the generated catalogue pages is dark)
 * - asserts every "ready" command has flags or subcommands (a bare
 *   command page with neither is not useful for SEO)
 * - asserts no absolute home directory survived the extract (Click
 *   expands `~` against the invoking user, and these strings render
 *   verbatim on public pages)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA = path.resolve(process.cwd(), 'data', 'cli.json');

test('data/cli.json exists', async () => {
  const exists = await fs.access(DATA).then(() => true).catch(() => false);
  assert.ok(exists, `expected ${DATA} to exist; run \`node scripts/extract-cli.mjs\``);
});

test('cli.json has commands and at least one is ready', async () => {
  const raw = await fs.readFile(DATA, 'utf8');
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.commands), 'commands is an array');
  assert.ok(data.commands.length >= 5, 'at least 5 commands expected');
  const ready = data.commands.filter((c: any) => c.ready);
  assert.ok(ready.length >= 1, 'at least one command must be flagged ready in data/cli-ready.json');
});

test('every "ready" command has flags or subcommands', async () => {
  const raw = await fs.readFile(DATA, 'utf8');
  const data = JSON.parse(raw);
  const ready = data.commands.filter((c: any) => c.ready);
  for (const c of ready) {
    const hasContent = c.flags.length > 0 || c.subcommands.length > 0;
    assert.ok(hasContent, `ready command ${c.slug} has no flags AND no subcommands; not useful for SEO`);
  }
});

test('cli.json carries no absolute home directory', async () => {
  const raw = await fs.readFile(DATA, 'utf8');
  /* A live extract runs `bernstein <cmd> --help`, and Click renders
     `[default: ...]` with `~` already expanded against the invoking
     user. The catalogue then ships that path to every reader of
     /docs/cli/<command>. `scripts/extract-cli.mjs` rewrites these to
     `~`; this pins that it keeps happening. */
  const leaked = raw.match(/\/(?:Users|home)\/[A-Za-z0-9._-]+/g);
  assert.equal(
    leaked,
    null,
    `data/cli.json contains an absolute home path (${leaked?.[0]}); re-run \`node scripts/extract-cli.mjs\``,
  );
});
