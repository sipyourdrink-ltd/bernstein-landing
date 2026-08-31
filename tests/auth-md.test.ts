/**
 * /auth.md shape and honesty tests.
 *
 * The file's whole value is that it is true. A page that says "no
 * credentials" while a route quietly grew an API-key check is worse
 * than no page at all - it is a documented lie an agent will act on.
 * So the tests here are not spelling checks: each one reads the actual
 * route source it describes and fails when the two disagree.
 *
 * Three claims are pinned:
 *
 *   1. No route under app/api/ reads an Authorization header except
 *      /api/indexnow, which /auth.md names as the one gated endpoint.
 *   2. The per-IP limiter column matches which routes actually call a
 *      rate limiter.
 *   3. public/openapi.yaml still declares no security schemes, which is
 *      the premise of the "the OpenAPI document does not describe this
 *      host" section.
 *
 * Claim 1 is the load-bearing one. If a future route starts checking a
 * credential, this test fails and whoever added it has to decide
 * whether to document it or move it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GET } from '../app/auth.md/route.ts';

const API_DIR = path.resolve(process.cwd(), 'app', 'api');
const OPENAPI_PATH = path.resolve(process.cwd(), 'public', 'openapi.yaml');

/** Every route file under app/api/, keyed by its URL path. */
function apiRoutes(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string, urlParts: string[]): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        /* Folder names are percent-decoded to get the URL segment -
           app/api/%5Fsignals is served at /api/_signals. */
        walk(full, [...urlParts, decodeURIComponent(entry.name)]);
      } else if (/^route\.tsx?$/.test(entry.name)) {
        out.set(`/api/${urlParts.join('/')}`, fs.readFileSync(full, 'utf8'));
      }
    }
  };
  walk(API_DIR, []);
  return out;
}

/* The body is a module-level string literal, so one read at import
   time is enough and every test can treat it as a plain string. */
const BODY = await GET().text();

test('/auth.md serves 200 text/markdown with utf-8 charset', async () => {
  const res = GET();
  assert.equal(res.status, 200);
  const ct = res.headers.get('content-type') ?? '';
  assert.match(ct, /text\/markdown/);
  assert.match(ct, /charset=utf-8/i);
});

test('/auth.md is edge-cacheable like the other discovery surfaces', () => {
  const cc = GET().headers.get('cache-control') ?? '';
  assert.match(cc, /max-age=300/);
  assert.match(cc, /s-maxage=3600/);
});

test('/auth.md keeps the literal file name in the H1', () => {
  // The auth.md convention's validators identify the document by an H1
  // containing "auth.md" - a plain "# Authentication" heading reads
  // fine to a human and fails the machine check.
  assert.match(BODY.split('\n')[0]!, /^# .*auth\.md/im);
});

test('/auth.md states the core facts an agent came for', () => {
  const md = BODY;
  for (const phrase of [
    'There is none',
    'no API keys',
    '/openapi.yaml',
    'http://{host}:{port}',
    'POST /api/csp-report',
    'POST /api/blog/summary',
  ]) {
    assert.ok(md.includes(phrase), `/auth.md must state "${phrase}"`);
  }
});

test('no api route reads a credential except the one /auth.md names', () => {
  /* Reading an *inbound* credential means pulling the header off the
     request: `request.headers.get('authorization')`. That is the shape
     to match, and matching the bare word `Authorization` is not - four
     routes (notify, unsubscribe, stats, related) build an *outbound*
     `Authorization: Bearer` for Resend, the GitHub API and the
     retrieval gateway, which is the opposite direction and says nothing
     about what a caller needs. An earlier draft of this test flagged all
     four; the distinction is the point of the assertion, so it is
     encoded in the pattern rather than in an exclusion list. */
  const INBOUND_CREDENTIAL_READ =
    /\.headers\.get\(\s*['"`](?:authorization|proxy-authorization|x-api-key)['"`]/i;
  const gated: string[] = [];

  for (const [url, src] of apiRoutes()) {
    /* Strip block and line comments first. Several routes discuss auth
       in prose ("Unauthenticated by construction") and a prose mention
       is not a credential check. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (INBOUND_CREDENTIAL_READ.test(code)) gated.push(url);
  }

  assert.deepEqual(
    gated.sort(),
    ['/api/indexnow'],
    '/auth.md tells readers every endpoint on this host is anonymous except ' +
      '/api/indexnow. A route in this list that is not /api/indexnow means the ' +
      'page is now wrong - document the credential in app/auth.md/route.ts or ' +
      'move the endpoint off this host.',
  );
});

test('the per-IP limiter column matches the routes', () => {
  const md = BODY;
  const routes = apiRoutes();
  const LIMITER_CALL = /RateLimiter\.check\(|Limiter\.check\(|rateLimiter\.check\(/;

  /* url -> does /auth.md claim a limiter for it */
  const claims: Array<[string, boolean]> = [
    ['/api/blog/summary', false],
    ['/api/csp-report', true],
    ['/api/ask', true],
    ['/api/ask/summarise', false],
    ['/api/notify', true],
  ];

  for (const [url, claimed] of claims) {
    const src = routes.get(url);
    assert.ok(src, `${url} is described in /auth.md but no route file exists for it`);
    const actual = LIMITER_CALL.test(src);
    assert.equal(
      actual,
      claimed,
      `/auth.md says ${url} ${claimed ? 'has' : 'has no'} a per-IP limiter, but the ` +
        `route ${actual ? 'calls' : 'does not call'} one. Update the table in ` +
        'app/auth.md/route.ts.',
    );
    /* And the endpoint has to actually be named in the table. */
    assert.ok(
      md.includes(`POST ${url}`),
      `/auth.md must list POST ${url} in its write-endpoint table`,
    );
  }
});

test('openapi.yaml still declares no security schemes', () => {
  const yaml = fs.readFileSync(OPENAPI_PATH, 'utf8');
  assert.ok(
    !/^\s*securitySchemes:/m.test(yaml) && !/^security:/m.test(yaml),
    'public/openapi.yaml has grown a security scheme. /auth.md tells readers the ' +
      'document declares none and that access control is the operator\'s own host - ' +
      'reconcile the two before shipping.',
  );
});
