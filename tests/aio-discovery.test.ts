/**
 * AIO discovery surface integrity tests (Wave 1 + Wave 2):
 *   1. Middleware RFC 8288 Link headers never leak container bind origins
 *      (e.g. https://0.0.0.0:3000 observed on live standalone Docker),
 *      emit per-page `.md` alternate + `rel="describedby"` links for ALL
 *      clients on twin-backed HTML pages, and cleanly merge with the 5
 *      site-discovery links on AI-bot requests (case-insensitive UA match,
 *      zero duplicate `/llms.txt` targets).
 *   2. Middleware stamps Vary: Accept on HTML responses of negotiable
 *      paths and stamps X-Robots-Tag: noindex, follow on discovery files
 *      (including `/llms-ctx.txt`, `/.well-known/mcp.json`,
 *      `/.well-known/ai-catalog.json`, `/spec/agent-failure-taxonomy/v0.1.json`).
 *   3. `/llms-ctx.txt` serves compact (< 18 KB) 4.0.2 single-pass context
 *      with explicit `https://bernstein.run/*.md` twin URLs for Claude
 *      `web_fetch`'s URL prior-appearance validator.
 *   4. SEP-1649 `/.well-known/mcp.json` and SEP-2127 `/.well-known/ai-catalog.json`
 *      conform to schema, set CORS `*`, avoid loopback URLs, and resolve.
 *   5. `/llms-full.txt`, `/agents.txt`, and `/robots.txt` stay complete,
 *      Crawl-delay free (`robots.txt`), and free of duplicate URLs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GET as llmsCtxGET } from '../app/llms-ctx.txt/route.ts';
import { GET as mcpWellKnownGET } from '../app/.well-known/mcp.json/route.ts';
import { GET as aiCatalogGET } from '../app/.well-known/ai-catalog.json/route.ts';
import { GET as robotsGET } from '../app/robots.txt/route.ts';
import {
  buildAiDiscoveryLinkHeader,
  buildPageResponseHeaders,
  isAiBotUserAgent,
  markdownTwinTargetFor,
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
  if (markdownTwinTargetFor(clean)?.target) return true;
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
    '<https://bernstein.run/llms.txt>;',
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

test('isAiBotUserAgent matches case-insensitively including Wave-2 crawlers', () => {
  for (const ua of [
    'Mozilla/5.0 (compatible; ClaudeBot/1.0)',
    'claudebot/1.0',
    'anthropic-ai',
    'Claude-User/1.0',
    'Gemini-Deep-Research/1.0',
    'gemini-deep-research',
    'MistralAI-Bot/1.0',
    'Google-CloudVertexBot',
  ]) {
    assert.equal(isAiBotUserAgent(ua), true, `should match AI bot UA: ${ua}`);
  }
  assert.equal(
    isAiBotUserAgent('Mozilla/5.0 AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36'),
    false,
  );
});

test('middleware page headers emit per-page .md alternate + describedby Link for ALL clients and merge cleanly for AI bots', () => {
  /* Ordinary client (e.g. Claude Code / Codex CLI / browser without bot UA) on twin-backed routes */
  for (const [pathname, twinUrl] of [
    ['/', 'https://bernstein.run/index.md'],
    ['/about', 'https://bernstein.run/about.md'],
    ['/cost', 'https://bernstein.run/cost.md'],
    ['/cli-quickstart', 'https://bernstein.run/cli-quickstart.md'],
    ['/spec-driven', 'https://bernstein.run/spec-driven.md'],
    ['/spec/agent-failure-taxonomy/v0.1', 'https://bernstein.run/spec/agent-failure-taxonomy/v0.1.md'],
    ['/tools/agent-md-bench', 'https://bernstein.run/tools/agent-md-bench.md'],
    ['/q', 'https://bernstein.run/q.md'],
    ['/q/what-is-bernstein', 'https://bernstein.run/q/what-is-bernstein.md'],
    ['/blog/v4-0-release', 'https://bernstein.run/blog/v4-0-release.md'],
  ] as const) {
    const h = buildPageResponseHeaders({ pathname, userAgent: 'curl/8.7.1' });
    assert.equal(
      h['Link'],
      `<${twinUrl}>; rel="alternate"; type="text/markdown", <https://bernstein.run/llms.txt>; rel="describedby"`,
      `non-bot Link header mismatch on ${pathname}`,
    );
  }

  /* Named AI crawler on /about merges per-page .md alternate + 5 discovery links with ZERO duplicate /llms.txt target */
  const botOnAbout = buildPageResponseHeaders({
    pathname: '/about',
    userAgent: 'Mozilla/5.0 (compatible; claudebot/1.0; +claudebot@anthropic.com)',
  });
  assert.equal(botOnAbout['Vary'], 'Accept');
  assert.equal(botOnAbout['X-AI-Content-Available'], 'true');
  const botLinks = botOnAbout['Link'] ?? '';
  assert.ok(botLinks.includes('<https://bernstein.run/about.md>; rel="alternate"; type="text/markdown"'));
  assert.ok(botLinks.includes('<https://bernstein.run/.well-known/api-catalog>; rel="api-catalog"'));
  const llmsOccurrences = [...botLinks.matchAll(/<https:\/\/bernstein\.run\/llms\.txt>/g)].length;
  assert.equal(llmsOccurrences, 1, `merged Link header must not duplicate /llms.txt: ${botLinks}`);
  assert.match(botLinks, /<https:\/\/bernstein\.run\/llms\.txt>; rel="[^"]*describedby[^"]*"/);
  assert.match(botLinks, /<https:\/\/bernstein\.run\/llms\.txt>; rel="[^"]*ai-content[^"]*"/);

  /* Non-negotiable path (/cost) does not get Vary: Accept, while / does */
  assert.equal(buildPageResponseHeaders({ pathname: '/', userAgent: 'Chrome/135' })['Vary'], 'Accept');
  assert.equal(buildPageResponseHeaders({ pathname: '/cost', userAgent: 'Chrome/135' })['Vary'], undefined);

  /* Discovery surfaces (including Wave-2 surfaces) get X-Robots-Tag: noindex, follow */
  for (const disc of [
    '/llms.txt',
    '/llms-ctx.txt',
    '/llms-full.txt',
    '/robots.txt',
    '/ai.txt',
    '/agents.txt',
    '/auth.md',
    '/AGENTS.md',
    '/openapi.yaml',
    '/mcp-server.json',
    '/spec/agent-failure-taxonomy/v0.1.json',
    '/.well-known/api-catalog',
    '/.well-known/ai-catalog.json',
    '/.well-known/mcp.json',
  ]) {
    const h = buildPageResponseHeaders({ pathname: disc, userAgent: 'Googlebot/2.1' });
    assert.equal(
      h['X-Robots-Tag'],
      'noindex, follow',
      `discovery path ${disc} must get noindex, follow rather than ${h['X-Robots-Tag']}`,
    );
  }

  /* middleware.ts must rewrite explicit .md twins unconditionally and never read request.nextUrl.origin */
  const mwSrc = fs.readFileSync(path.join(REPO, 'middleware.ts'), 'utf8');
  assert.ok(!mwSrc.includes('nextUrl.origin'), 'middleware.ts must not use request.nextUrl.origin');
  assert.match(mwSrc, /markdownTwinTargetFor/, 'middleware.ts must handle explicit .md twin paths');
  assert.match(mwSrc, /buildPageResponseHeaders/);
});

test('/llms-ctx.txt is < 18 KB, carries 4.0.2 + MCP + taxonomy facts, and lists explicit /*.md twin URLs', async () => {
  const res = llmsCtxGET();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/plain;\s*charset=utf-8$/i);
  assert.match(res.headers.get('cache-control') ?? '', /max-age=86400/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, follow');

  const body = await res.text();
  const bytes = Buffer.byteLength(body, 'utf8');
  assert.ok(bytes > 2000 && bytes < 18 * 1024, `/llms-ctx.txt must stay compact (< 18 KB), got ${bytes} bytes`);
  assert.ok(!/[\u2013\u2014\u2015]/.test(body), '/llms-ctx.txt must use ASCII hyphens only');

  for (const required of [
    '4.0.2',
    'pipx install bernstein',
    'bernstein init',
    'bernstein run',
    'bernstein verify receipt',
    'bernstein govern audit --strict',
    'bernstein doctor',
    'bernstein live',
    '55',
    '.sdd/',
    'https://mcp.bernstein.run/mcp',
    '## Markdown Twins (.md)',
    'https://bernstein.run/index.md',
    'https://bernstein.run/cli-quickstart.md',
    'https://bernstein.run/about.md',
    'https://bernstein.run/cost.md',
    'https://bernstein.run/spec-driven.md',
    'https://bernstein.run/spec/agent-failure-taxonomy/v0.1.md',
    'https://bernstein.run/tools/agent-md-bench.md',
    'https://bernstein.run/q.md',
  ]) {
    assert.ok(body.includes(required), `/llms-ctx.txt missing "${required}"`);
  }

  const urls = body.match(/https?:\/\/[^)\s`]+/g) ?? [];
  assert.equal(new Set(urls).size, urls.length, '/llms-ctx.txt must not repeat absolute URLs');
});

test('SEP-1649 /.well-known/mcp.json and SEP-2127 /.well-known/ai-catalog.json conform to spec with CORS and zero loopback URLs', async () => {
  const mcpRes = mcpWellKnownGET();
  assert.equal(mcpRes.status, 200);
  assert.match(mcpRes.headers.get('content-type') ?? '', /^application\/json;\s*charset=utf-8$/i);
  assert.equal(mcpRes.headers.get('access-control-allow-origin'), '*');
  assert.match(mcpRes.headers.get('cache-control') ?? '', /s-maxage=3600/);

  const mcpText = await mcpRes.text();
  assert.ok(!/127\.0\.0\.1|localhost|0\.0\.0\.0/i.test(mcpText), 'mcp.json must not contain loopback URLs');
  const mcp = JSON.parse(mcpText) as Record<string, any>;
  assert.equal(mcp.$schema, 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json');
  assert.equal(mcp.name, 'run.bernstein/bernstein');
  assert.equal(mcp.title, 'Bernstein MCP Server');
  assert.equal(mcp.version, '4.0.2');
  assert.ok(typeof mcp.description === 'string' && mcp.description.length > 0 && mcp.description.length <= 100);
  assert.equal(mcp.websiteUrl, 'https://bernstein.run');
  assert.deepEqual(mcp.repository, {
    url: 'https://github.com/sipyourdrink-ltd/bernstein',
    source: 'github',
  });
  assert.equal(mcp.remotes?.[0]?.type, 'streamable-http');
  assert.equal(mcp.remotes?.[0]?.url, 'https://mcp.bernstein.run/mcp');
  assert.deepEqual(mcp.remotes?.[0]?.supportedProtocolVersions, ['2025-06-18', '2025-03-26']);
  assert.equal(mcp._meta?.['run.bernstein/stdio']?.command, 'bernstein');
  assert.equal(mcp._meta?.['run.bernstein/stdio']?.fullSpecUrl, 'https://bernstein.run/mcp-server.json');

  const catRes = aiCatalogGET();
  assert.equal(catRes.status, 200);
  assert.match(catRes.headers.get('content-type') ?? '', /^application\/ai-catalog\+json;\s*charset=utf-8$/i);
  assert.equal(catRes.headers.get('access-control-allow-origin'), '*');
  const cat = JSON.parse(await catRes.text()) as {
    specVersion: string;
    entries: Array<{ identifier: string; type: string; url: string }>;
  };
  assert.equal(cat.specVersion, '1.0');
  assert.deepEqual(
    cat.entries.map((e) => e.url),
    [
      'https://bernstein.run/.well-known/mcp.json',
      'https://bernstein.run/.well-known/mcp/server-card.json',
    ],
  );
  for (const entry of cat.entries) {
    const rel = new URL(entry.url).pathname;
    assert.ok(resolvesInRepo(rel), `ai-catalog entry ${entry.url} does not resolve in repo`);
  }
});

test('/llms-full.txt, /agents.txt, and /robots.txt stay complete and free of Crawl-delay / duplicate URLs', async () => {
  const src = fs.readFileSync(path.join(REPO, 'app/llms-full.txt/route.ts'), 'utf8');
  const baseMatch = /const BASE_CONTENT = `([\s\S]*?)`;\n\n\/\* The comparison section/.exec(src);
  assert.ok(baseMatch, 'could not locate BASE_CONTENT template in app/llms-full.txt/route.ts');
  const base = baseMatch[1]!;

  for (const required of [
    'bernstein verify receipt',
    'bernstein verify run',
    'bernstein govern audit',
    'bernstein doctor',
    'bernstein live',
    'CLI Coding Agent Failure Taxonomy v0.1',
    'https://bernstein.run/llms-ctx.txt',
    'https://bernstein.run/.well-known/mcp.json',
    'https://bernstein.run/.well-known/ai-catalog.json',
    'https://bernstein.run/.well-known/api-catalog',
    'https://bernstein.run/.well-known/skills.json',
    'https://bernstein.run/.well-known/agent-skills/index.json',
    'https://bernstein.run/auth.md',
  ]) {
    assert.ok(base.includes(required), `/llms-full.txt BASE_CONTENT must include "${required}"`);
  }

  const urls = base.match(/https?:\/\/[^)\s`]+/g) ?? [];
  const counts = new Map<string, number>();
  for (const u of urls) counts.set(u, (counts.get(u) ?? 0) + 1);
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1);
  assert.deepEqual(
    duplicates,
    [],
    `/llms-full.txt BASE_CONTENT repeats absolute URLs: ${JSON.stringify(duplicates)}`,
  );

  const agentsBody = fs.readFileSync(path.join(REPO, 'app/agents.txt/route.ts'), 'utf8');
  for (const required of [
    'https://bernstein.run/llms-ctx.txt',
    'https://bernstein.run/.well-known/mcp.json',
    'https://bernstein.run/.well-known/ai-catalog.json',
    'https://bernstein.run/.well-known/api-catalog',
    'https://bernstein.run/.well-known/skills.json',
    'https://bernstein.run/.well-known/agent-skills/index.json',
    'https://bernstein.run/auth.md',
  ]) {
    assert.ok(agentsBody.includes(required), `/agents.txt must advertise ${required}`);
  }
  const localPaths = [...agentsBody.matchAll(/https:\/\/bernstein\.run(\/[^\s`'"]+)/g)].map((m) => m[1]!);
  assert.deepEqual(localPaths.filter((p) => !resolvesInRepo(p)), []);

  const robotsBody = await (await robotsGET()).text();
  assert.ok(!/crawl-delay/i.test(robotsBody), 'robots.txt must not set Crawl-delay on AI crawlers');
});
