import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import matter from 'gray-matter';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function loadComponent(file: string) {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    code,
    {
      exports,
      module: { exports },
      React,
      console,
      process,
      require: (name: string) => {
        if (name === 'next/image') {
          return function TestImage({
            unoptimized: _unoptimized,
            preload: _preload,
            ...props
          }: any) {
            return React.createElement('img', props);
          };
        }
        if (name === 'next/link') {
          return function TestLink({ href, children, ...props }: any) {
            return React.createElement('a', { href, ...props }, children);
          };
        }
        return require(name);
      },
    },
    { filename: file },
  );
  return exports;
}

test('exactly three blog posts are flagged featured: true', () => {
  const blogDir = path.resolve('content/blog');
  const slugs = readdirSync(blogDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const featured = slugs
    .map((slug) => {
      const raw = readFileSync(path.join(blogDir, slug, 'index.mdx'), 'utf8');
      const { data } = matter(raw);
      return { slug, date: String(data.date ?? ''), featured: data.featured === true };
    })
    .filter((p) => p.featured)
    .sort((a, b) => b.date.localeCompare(a.date));

  assert.equal(featured.length, 3);
  assert.deepEqual(
    featured.map((p) => p.slug),
    ['v4-0-release', 'v3-14-159-pi', 'v3-x-recap'],
  );
});

test('FeaturedPosts caps rendered cards at 3 even if passed 4+ posts', () => {
  const { FeaturedPosts, MAX_FEATURED_POSTS } = loadComponent(
    'components/landing/FeaturedPosts.tsx',
  );
  assert.equal(MAX_FEATURED_POSTS, 3);

  const sample = ['a', 'b', 'c', 'd'].map((id, idx) => ({
    slug: `post-${id}`,
    readingMinutes: idx + 1,
    fm: {
      title: `Post ${id}`,
      description: `Description ${id}`,
      date: `2026-11-0${idx + 1}`,
      featured: true,
      cover: '/blog/covers/20-v4-0-release.png',
      coverAlt: 'Example diagram.',
    },
  }));

  const html = renderToStaticMarkup(React.createElement(FeaturedPosts, { posts: sample }));
  assert.match(html, /3\s*pieces,\s*<em>hand-picked<\/em>\./);
  assert.equal((html.match(/class="v2-blog-pick"/g) ?? []).length, 3);
  assert.ok(!html.includes('/blog/post-d'));
  assert.ok(html.includes('href="/blog"'));
});

test('v4-0-release has a 1200x630 PNG cover and links to releases/latest', () => {
  const raw = readFileSync('content/blog/v4-0-release/index.mdx', 'utf8');
  const { data, content } = matter(raw);

  assert.equal(data.cover, '/blog/covers/20-v4-0-release.png');
  assert.ok(typeof data.coverAlt === 'string' && data.coverAlt.trim().length > 10);

  const png = readFileSync(`public${data.cover}`);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);

  const hrefs = Array.from(
    content.matchAll(/\]\((https:\/\/[^)\s]+)\)/g),
    (m) => new URL(m[1]),
  );
  assert.ok(
    hrefs.some(
      (u) =>
        u.hostname === 'github.com' &&
        u.pathname === '/sipyourdrink-ltd/bernstein/releases/latest',
    ),
    'v4-0-release must direct readers to releases/latest for installs/upgrades',
  );
  assert.ok(
    hrefs.some(
      (u) =>
        u.hostname === 'github.com' &&
        u.pathname === '/sipyourdrink-ltd/bernstein/releases/tag/v4.0.0',
    ),
  );
});
