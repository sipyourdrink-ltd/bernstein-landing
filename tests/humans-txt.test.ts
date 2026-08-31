/**
 * /humans.txt derived-line tests.
 *
 * Two lines in that file are claims about the build, and both used to
 * drift:
 *
 *   - `Framework: Next.js <version>` was a literal. It said 14 while the
 *     tree had moved on, which makes a discovery surface state something
 *     false about the deploy (issue #91).
 *   - `Last updated: <date>` was `new Date()` evaluated per request, so
 *     the body changed every day without an edit and no two responses
 *     from one build matched byte for byte (issue #112).
 *
 * Both now come from files the build owns - `package.json` and the
 * prebuild manifest `data/source-mtimes.json` - so this test asserts the
 * rendered lines against those files rather than against a constant, and
 * pins that no clock reading is reintroduced into the route.
 *
 * Runs under `node --test`. The route imports only `node:fs`/`node:path`,
 * so it can be imported directly without the `@/` alias resolution the
 * other route tests have to work around.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { GET } from '../app/humans.txt/route.ts';

const repoRoot = process.cwd();

async function readBody(): Promise<string> {
  return await GET().text();
}

async function readJson(relPath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(path.join(repoRoot, relPath), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

test('Framework line matches the next version pinned in package.json', async () => {
  const pkg = (await readJson('package.json')) as {
    dependencies: Record<string, string>;
  };
  const spec = pkg.dependencies.next;
  const match = /(\d+)\.(\d+)/.exec(spec);
  assert.ok(match, `package.json dependencies.next is unparseable: ${spec}`);

  const body = await readBody();
  assert.ok(
    body.includes(`Framework: Next.js ${match[1]}.${match[2]} (App Router)`),
    `humans.txt must advertise the pinned Next.js version (${spec}); got:\n${
      body.split('\n').find((l) => l.startsWith('Framework:')) ?? '<no line>'
    }`,
  );
});

test('Last updated line comes from the build manifest, not the clock', async () => {
  const manifest = (await readJson('data/source-mtimes.json')) as {
    builtAt: string;
    mtimes: Record<string, string | null>;
  };
  /* Same rule as the route: newest tracked git date, `builtAt` only as
     a fallback. Both are day-precision ISO, which sorts
     chronologically. */
  const tracked = Object.values(manifest.mtimes).filter(
    (value): value is string => typeof value === 'string' && value !== '',
  );
  const expected = tracked.sort().at(-1) ?? manifest.builtAt;

  const body = await readBody();
  assert.ok(
    body.includes(`Last updated: ${expected}`),
    `humans.txt must stamp Last updated from data/source-mtimes.json (${expected}); got:\n${
      body.split('\n').find((l) => l.startsWith('Last updated:')) ?? '<no line>'
    }`,
  );
});

test('route reads no clock (two builds of one commit must agree)', async () => {
  const src = await readFile(
    path.join(repoRoot, 'app', 'humans.txt', 'route.ts'),
    'utf8',
  );
  /* Comments are stripped first: the route's own docblock names the
     construct it replaced, and that prose is not a clock reading. */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.ok(
    !/new Date\(/.test(code),
    'humans.txt route must not construct a Date: request-time clock readings ' +
      'make the body differ between two responses from the same build',
  );

  /* Belt and braces - the rendered body is stable across calls. */
  assert.equal(await readBody(), await readBody());
});

test('/humans.txt serves text/plain with utf-8 charset', () => {
  const res = GET();
  const ct = res.headers.get('content-type') ?? '';
  assert.match(ct, /text\/plain/);
  assert.match(ct, /charset=utf-8/i);
});
