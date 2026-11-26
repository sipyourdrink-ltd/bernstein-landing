import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { enrichLlmsTxt } from '../lib/markdown-view.ts';

// Read the template without loading the MDX pipeline under strip-types,
// evaluating `${SITE_URL}` the same way `buildLlmsTxt()` does at runtime.
const source = fs.readFileSync(path.resolve(process.cwd(), 'lib/seo.ts'), 'utf8');
const rawTemplate = source.match(/return `(# Bernstein[\s\S]*?)\n`;/)?.[1];
assert.ok(rawTemplate, 'buildLlmsTxt must return the site index template');
const template = rawTemplate.replaceAll('${SITE_URL}', 'https://bernstein.run');

const enriched = enrichLlmsTxt(template);

test('llms.txt includes each navigation and machine-discovery entry point exactly once', () => {
  for (const entry of [
    '/cli-quickstart',
    '/q',
    '/about',
    '/spec-driven',
    '/spec/agent-failure-taxonomy/v0.1',
    '/tools/agent-md-bench',
    '/.well-known/api-catalog',
    '/.well-known/skills.json',
    '/.well-known/agent-skills/index.json',
    'https://mcp.bernstein.run/verify',
    'https://github.com/sipyourdrink-ltd/bernstein/tree/main/docs',
    'https://deepwiki.com/sipyourdrink-ltd/bernstein',
  ]) {
    assert.ok(enriched.includes(entry), `enriched llms.txt must include ${entry}`);
  }
  for (const exactUrl of [
    'https://bernstein.run/cli-quickstart',
    'https://bernstein.run/q',
    'https://bernstein.run/about',
    'https://bernstein.run/spec-driven',
    'https://bernstein.run/spec/agent-failure-taxonomy/v0.1',
    'https://bernstein.run/tools/agent-md-bench',
    'https://bernstein.run/.well-known/api-catalog',
    'https://bernstein.run/.well-known/skills.json',
    'https://bernstein.run/.well-known/agent-skills/index.json',
    'https://mcp.bernstein.run/verify',
  ]) {
    const urls = enriched.match(/https?:\/\/[^)\s]+/g) ?? [];
    assert.equal(
      urls.filter((u) => u === exactUrl).length,
      1,
      `${exactUrl} must appear exactly once in enriched llms.txt`,
    );
  }
});

test('enriched llms.txt never repeats absolute URLs even when applied twice (idempotent)', () => {
  const once = enrichLlmsTxt(template);
  const twice = enrichLlmsTxt(once);
  assert.equal(twice, once, 'enrichLlmsTxt must be idempotent across repeated or upstream-merged runs');

  const urls = once.match(/https?:\/\/[^)\s]+/g) ?? [];
  assert.ok(urls.length > 0, 'the template must include absolute URLs');
  assert.equal(new Set(urls).size, urls.length, 'absolute URLs must be unique');
});

test('app/llms.txt/route.ts serves enrichLlmsTxt so /llms.txt and / (Accept: text/markdown) match', () => {
  const routeSrc = fs.readFileSync(path.resolve(process.cwd(), 'app/llms.txt/route.ts'), 'utf8');
  assert.match(routeSrc, /enrichLlmsTxt/, 'app/llms.txt/route.ts must pass buildLlmsTxt through enrichLlmsTxt');
});
