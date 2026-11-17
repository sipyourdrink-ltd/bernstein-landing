import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import matter from 'gray-matter';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fixtures: Array<{ slug: string; cover: string; sha256: string }> =
  JSON.parse(readFileSync('tests/fixtures/blog-covers.json', 'utf8'));

function load(file: string, mocks: Record<string, unknown> = {}) {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports, module: { exports }, React, console, process,
    require: (name: string) => {
      if (name in mocks) return mocks[name];
      if (name === 'next/image') {
        return function TestImage({ unoptimized: _unoptimized, preload: _preload, ...props }: any) {
          return React.createElement('img', props);
        };
      }
      if (name.startsWith('@/')) {
        return new Proxy({}, { get: () => ({ children }: any) => children ?? null });
      }
      return require(name);
    },
  }, { filename: file });
  return exports;
}

const fm = {
  title: 'Example article', description: 'Example description', date: '2026-11-17',
  cover: '/blog/covers/01-strangers-ninety-minutes.png',
  coverAlt: 'A maze of paths with a terracotta route.',
};

test('cover frontmatter requires a local PNG and its nonempty alt text together', () => {
  const { Frontmatter } = load('lib/mdx.ts');
  assert.equal(Frontmatter.safeParse(fm).success, true);
  const { cover: _cover, coverAlt: _alt, ...withoutCover } = fm;
  assert.equal(Frontmatter.safeParse(withoutCover).success, true);
  assert.equal(Frontmatter.safeParse({ ...fm, coverAlt: undefined }).success, false);
  assert.equal(Frontmatter.safeParse({ ...fm, coverAlt: ' ' }).success, false);
  assert.equal(Frontmatter.safeParse({ ...fm, cover: undefined }).success, false);
  assert.equal(Frontmatter.safeParse({ ...fm, cover: '/blog/covers/example.svg' }).success, false);
});

test('each selected post references its unchanged cover with dimensions and alt text', () => {
  assert.equal(fixtures.length, 19);
  assert.equal(new Set(fixtures.map((f) => f.slug)).size, 19);
  for (const fixture of fixtures) {
    const data = matter(readFileSync(`content/blog/${fixture.slug}/index.mdx`, 'utf8')).data;
    assert.equal(data.cover, fixture.cover, fixture.slug);
    assert.ok(data.coverAlt?.trim(), fixture.slug);
    const png = readFileSync(`public${fixture.cover}`);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    assert.equal(createHash('sha256').update(png).digest('hex'), fixture.sha256, fixture.slug);
  }
});

test('blog cards show the selected cover and retain cards without covers', () => {
  const { BlogCard } = load('components/blog/BlogCard.tsx');
  const post = { slug: 'example', fm, readingMinutes: 1 };
  const html = renderToStaticMarkup(BlogCard({ post }));
  assert.ok(html.includes(`src="${fm.cover}"`));
  assert.ok(html.includes(`alt="${fm.coverAlt}"`));
  assert.ok(html.includes('width="1200" height="630"'));
  const noCover = renderToStaticMarkup(BlogCard({ post: { ...post, fm: { ...fm, cover: undefined, coverAlt: undefined } } }));
  assert.ok(!noCover.includes('<img'));
  assert.ok(noCover.includes(fm.title));
});

test('articles use the cover for the visible image and both social cards, with a fallback', async () => {
  let currentFm: Record<string, unknown> = fm;
  const post = () => ({ fm: currentFm, readingMinutes: 1, tableOfContents: [], mdx: null });
  const { generateMetadata, default: BlogPost } = load('app/blog/[slug]/page.tsx', {
    '@/lib/mdx': { getPost: async () => post(), getAllPosts: async () => [{ ...post(), slug: 'example' }] },
    '@/lib/seo': { SITE_URL: 'https://bernstein.run', AUTHOR: 'Example author' },
    '@/lib/clusters': { pickSiblings: () => [] },
    '@/lib/utm': { withUtm: (url: string) => url },
  });
  const props = { params: Promise.resolve({ slug: 'example' }) };
  const metadata = await generateMetadata(props);
  for (const kind of ['openGraph', 'twitter']) {
    assert.equal(metadata[kind].images[0].url, fm.cover);
    assert.equal(metadata[kind].images[0].alt, fm.coverAlt);
  }
  const html = renderToStaticMarkup(await BlogPost(props));
  assert.ok(html.includes(`src="${fm.cover}"`));
  assert.ok(html.includes(`alt="${fm.coverAlt}"`));
  currentFm = { ...fm, cover: undefined, coverAlt: undefined };
  const fallback = await generateMetadata(props);
  for (const kind of ['openGraph', 'twitter']) {
    assert.equal(fallback[kind].images[0].url, `/api/og?title=${encodeURIComponent(fm.title)}`);
  }
  assert.ok(!renderToStaticMarkup(await BlogPost(props)).includes('<img'));
});
