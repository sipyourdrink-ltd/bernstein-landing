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

import { GET } from '../app/ai.txt/route.ts';

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
    '/llms-full.txt',
    '/ai.txt',
    '/robots.txt',
    '/sitemap.xml',
  ];
  for (const path of expectedAllows) {
    assert.ok(
      body.includes(`Allow: ${path}`),
      `/ai.txt must keep advertising Allow: ${path}`,
    );
  }
});
