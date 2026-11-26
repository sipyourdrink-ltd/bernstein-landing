/**
 * /ai.txt route shape tests.
 *
 * The /ai.txt descriptor advertises an Allow-list of stable URLs that
 * AI crawlers can fetch. Every Allow line MUST resolve on production
 * (no 404s) so the descriptor stays internally consistent.
 *
 * History: an earlier revision listed `Allow: /index.html` even though
 * the Next.js App Router serves the canonical root at `/` and never
 * synthesises an `/index.html` route. This test pins that the line
 * stays gone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GET } from '../app/ai.txt/route.ts';

const REPO = process.cwd();
const APP = path.join(REPO, 'app');
const PUBLIC = path.join(REPO, 'public');

function resolvesInRepo(urlPath: string): boolean {
  const clean = urlPath.split(/[?#]/)[0]!;
  if (clean === '/' || clean === '') {
    return fs.existsSync(path.join(APP, 'page.tsx'));
  }
  const pubFile = path.join(PUBLIC, clean);
  if (fs.existsSync(pubFile) && fs.statSync(pubFile).isFile()) return true;
  const appDir = path.join(APP, ...clean.split('/').filter(Boolean));
  return ['route.ts', 'route.tsx', 'page.tsx'].some((f) => fs.existsSync(path.join(appDir, f)));
}

async function readBody(): Promise<string> {
  const res = GET();
  return await res.text();
}

test('/ai.txt does not advertise /index.html (App Router has no index.html route)', async () => {
  const body = await readBody();
  assert.ok(
    !body.includes('/index.html'),
    '/ai.txt must not include an Allow line for /index.html (404 on prod)',
  );
});

test('/ai.txt serves text/plain with utf-8 charset', () => {
  const res = GET();
  const ct = res.headers.get('content-type') ?? '';
  assert.match(ct, /text\/plain/);
  assert.match(ct, /charset=utf-8/i);
});

test('/ai.txt Permissions block lists stable canonical URLs only', async () => {
  const body = await readBody();
  /* Pin a baseline of routes that DO exist and SHOULD remain advertised.
     If any of these are removed the test fails loudly so an operator
     reconsiders before shipping. */
  const expectedAllows = [
    '/llms.txt',
    '/llms-ctx.txt',
    '/llms-full.txt',
    '/ai.txt',
    '/agents.txt',
    '/robots.txt',
    '/sitemap.xml',
    '/auth.md',
    '/.well-known/api-catalog',
    '/.well-known/ai-catalog.json',
    '/.well-known/mcp.json',
    '/.well-known/skills.json',
    '/.well-known/agent-skills/index.json',
    '/.well-known/http-message-signatures-directory',
    '/mcp-server.json',
    '/spec/agent-failure-taxonomy/v0.1.json',
  ];
  for (const allowedPath of expectedAllows) {
    assert.ok(
      body.includes(`Allow: ${allowedPath}`),
      `/ai.txt must advertise Allow: ${allowedPath}`,
    );
  }

  const allowLines = [...body.matchAll(/^Allow:\s*(\S+)\s*$/gm)].map((m) => m[1]!);
  assert.ok(allowLines.length >= expectedAllows.length);
  const dead = allowLines.filter((p) => !resolvesInRepo(p));
  assert.deepEqual(
    dead,
    [],
    `/ai.txt advertises Allow paths that nothing in app/ or public/ serves: ${dead.join(', ')}`,
  );
});
