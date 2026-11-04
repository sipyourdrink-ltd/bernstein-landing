import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Read the template without loading the MDX pipeline under strip-types.
const source = fs.readFileSync(path.resolve(process.cwd(), 'lib/seo.ts'), 'utf8');
const template = source.match(/return `(# Bernstein[\s\S]*?)\n`;/)?.[1];
assert.ok(template, 'buildLlmsTxt must return the site index template');

test('llms.txt includes each navigation entry point exactly once', () => {
  for (const entry of [
    '/cli-quickstart',
    'https://mcp.bernstein.run/verify',
    'https://github.com/sipyourdrink-ltd/bernstein/tree/main/docs',
    'https://deepwiki.com/sipyourdrink-ltd/bernstein',
  ]) {
    assert.equal(template.split(entry).length - 1, 1, `${entry} must appear exactly once`);
  }
});

test('llms.txt template does not repeat absolute URLs', () => {
  const urls = template.match(/https?:\/\/[^)\s]+/g) ?? [];
  assert.ok(urls.length > 0, 'the template must include absolute URLs');
  assert.equal(new Set(urls).size, urls.length, 'absolute URLs must be unique');
});
