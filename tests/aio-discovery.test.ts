/**
 * AIO discovery surface integrity tests:
 *   1. Middleware RFC 8288 Link headers never leak container bind origins
 *      (e.g. https://0.0.0.0:3000 observed on live standalone Docker) and
 *      advertise RFC 9727 api-catalog + llms.txt + agent/MCP cards.
 *   2. Middleware stamps Vary: Accept on HTML responses of negotiable
 *      paths (keeping HTML and Markdown cache entries separated) and
 *      stamps X-Robots-Tag: noindex, follow on machine-discovery files.
 *   3. /llms-full.txt carries Bernstein 4.0.x CLI facts, the Agent Failure
 *      Taxonomy v0.1 specification, complete site/discovery links, and
 *      zero duplicate absolute URLs in BASE_CONTENT.
 *   4. /agents.txt advertises the full host discovery surface set and
 *      every bernstein.run URL in it resolves on disk.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildAiDiscoveryLinkHeader,
  buildPageResponseHeaders,
  resolvePublicOrigin,
} from '../lib/markdown-negotiation.ts';

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

test('resolvePublicOrigin and RFC 8288 Link header never leak container 0.0.0.0:3000 origin', () => {
  assert.equal(resolvePublicOrigin(undefined), 'https://bernstein.run');
  assert.equal(resolvePublicOrigin(''), 'https://bernstein.run');
  assert.equal(resolvePublicOrigin('https://0.0.0.0:3000'), 'https://bernstein.run');
  assert.equal(resolvePublicOrigin('http://127.0.0.1:3000'), 'https://bernstein.run');
  assert.equal(resolvePublicOrigin('https://bernstein.run/'), 'https://bernstein.run');

  const link = buildAiDiscoveryLinkHeader(resolvePublicOrigin('https://0.0.0.0:3000'));
  assert.ok(!link.includes('0.0.0.0'), `Link header leaked container bind host: ${link}`);
  assert.ok(!link.includes(':3000'), `Link header leaked container port: ${link}`);

  for (const expected of [
    '<https://bernstein.run/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
    '<https://bernstein.run/llms.txt>; rel="ai-content"; type="text/plain"',
    '<https://bernstein.run/llms-full.txt>; rel="ai-content-full"; type="text/plain"',
    '<https://bernstein.run/.well-known/agent-card.json>; rel="agent-card"; type="application/json"',
    '<https://bernstein.run/.well-known/mcp/server-card.json>; rel="mcp-server"; type="application/json"',
  ]) {
    assert.ok(link.includes(expected), `Link header missing ${expected}; got: ${link}`);
  }

  for (const match of link.matchAll(/<https:\/\/bernstein\.run([^>]+)>/g)) {
    assert.ok(resolvesInRepo(match[1]!), `Link header target ${match[1]} does not resolve in repo`);
  }
});

test('middleware page headers set Vary: Accept on HTML negotiable paths and noindex on discovery paths', () => {
  /* HTML request from a named AI crawler on a negotiable path */
  const botOnAbout = buildPageResponseHeaders({
    pathname: '/about',
    userAgent: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  });
  assert.equal(botOnAbout['Vary'], 'Accept');
  assert.equal(botOnAbout['X-AI-Content-Available'], 'true');
  assert.ok(botOnAbout['Link']?.includes('https://bernstein.run/llms.txt'));
  assert.ok(botOnAbout['X-Robots-Tag']?.startsWith('index, follow'));

  /* Ordinary browser on `/` still gets Vary: Accept so caches separate HTML vs Markdown */
  const browserOnHome = buildPageResponseHeaders({
    pathname: '/',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36',
  });
  assert.equal(browserOnHome['Vary'], 'Accept');
  assert.equal(browserOnHome['X-AI-Content-Available'], undefined);

  /* Non-negotiable path (/cost) does not get spurious Vary: Accept */
  const browserOnCost = buildPageResponseHeaders({
    pathname: '/cost',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36',
  });
  assert.equal(browserOnCost['Vary'], undefined);

  /* Discovery surfaces get X-Robots-Tag: noindex, follow (never index, follow) */
  for (const disc of [
    '/llms.txt',
    '/llms-full.txt',
    '/robots.txt',
    '/ai.txt',
    '/agents.txt',
    '/auth.md',
    '/AGENTS.md',
    '/openapi.yaml',
    '/mcp-server.json',
    '/.well-known/api-catalog',
  ]) {
    const h = buildPageResponseHeaders({ pathname: disc, userAgent: 'Googlebot/2.1' });
    assert.equal(
      h['X-Robots-Tag'],
      'noindex, follow',
      `discovery path ${disc} must get noindex, follow rather than ${h['X-Robots-Tag']}`,
    );
  }

  /* middleware.ts must delegate to buildPageResponseHeaders and never read request.nextUrl.origin */
  const mwSrc = fs.readFileSync(path.join(REPO, 'middleware.ts'), 'utf8');
  assert.ok(
    !mwSrc.includes('nextUrl.origin'),
    'middleware.ts must not use request.nextUrl.origin (resolves to 0.0.0.0:3000 in standalone Docker)',
  );
  assert.match(mwSrc, /buildPageResponseHeaders/);
});

test('/llms-full.txt includes 4.0.x verification commands, failure taxonomy v0.1, complete links, and unique BASE_CONTENT URLs', () => {
  const src = fs.readFileSync(path.join(REPO, 'app/llms-full.txt/route.ts'), 'utf8');
  const baseMatch = /const BASE_CONTENT = `([\s\S]*?)`;\n\n\/\* The comparison section/.exec(src);
  assert.ok(baseMatch, 'could not locate BASE_CONTENT template in app/llms-full.txt/route.ts');
  const base = baseMatch[1]!;

  /* 4.0.x signature commands and governance gates */
  for (const required of [
    'bernstein verify receipt',
    'bernstein verify run',
    'bernstein govern audit',
    'bernstein doctor',
    'bernstein live',
    'CLI Coding Agent Failure Taxonomy v0.1',
    'orientation_miss',
    'test_regression',
    'NIST AI RMF',
    'ISO/IEC 42001',
    'https://bernstein.run/q',
    'https://bernstein.run/cli-quickstart',
    'https://bernstein.run/spec-driven',
    'https://bernstein.run/spec/agent-failure-taxonomy/v0.1',
    'https://bernstein.run/spec/agent-failure-taxonomy/v0.1.json',
    'https://bernstein.run/tools/agent-md-bench',
    'https://bernstein.run/cost',
    'https://bernstein.run/about',
    'https://bernstein.run/.well-known/api-catalog',
    'https://bernstein.run/.well-known/skills.json',
    'https://bernstein.run/.well-known/agent-skills/index.json',
    'https://bernstein.run/auth.md',
  ]) {
    assert.ok(base.includes(required), `/llms-full.txt BASE_CONTENT must include "${required}"`);
  }

  /* Pre-4.0 future-tense alias wording ("is a deprecated alias, removed in 4.0.0") must be updated now that 4.0.0 shipped */
  assert.ok(
    !base.includes('is a deprecated alias, removed in 4.0.0') &&
      !base.includes('are deprecated aliases, removed in 4.0.0'),
    '/llms-full.txt still describes 4.0.0 alias removals in pre-4.0 present tense',
  );

  /* Single-URL invariant across BASE_CONTENT */
  const urls = base.match(/https?:\/\/[^)\s`]+/g) ?? [];
  const counts = new Map<string, number>();
  for (const u of urls) counts.set(u, (counts.get(u) ?? 0) + 1);
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1);
  assert.deepEqual(
    duplicates,
    [],
    `/llms-full.txt BASE_CONTENT repeats absolute URLs: ${JSON.stringify(duplicates)}`,
  );
});

test('/agents.txt advertises api-catalog, skills.json, agent-skills index, and auth.md with zero dead local URLs', () => {
  /* Read source directly: tests/project-description.test.ts requires
     app/agents.txt/route.ts to keep the `@/lib/project-description`
     bundler alias import, which node --experimental-strip-types does
     not resolve at runtime. */
  const body = fs.readFileSync(path.join(REPO, 'app/agents.txt/route.ts'), 'utf8');
  for (const required of [
    'https://bernstein.run/.well-known/api-catalog',
    'https://bernstein.run/.well-known/skills.json',
    'https://bernstein.run/.well-known/agent-skills/index.json',
    'https://bernstein.run/auth.md',
  ]) {
    assert.ok(body.includes(required), `/agents.txt must advertise ${required}`);
  }

  const localPaths = [...body.matchAll(/https:\/\/bernstein\.run(\/[^\s`'"]+)/g)].map((m) => m[1]!);
  assert.ok(localPaths.length >= 10);
  const dead = localPaths.filter((p) => !resolvesInRepo(p));
  assert.deepEqual(dead, [], `/agents.txt points at unserved local paths: ${dead.join(', ')}`);
});
