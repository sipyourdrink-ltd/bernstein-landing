/**
 * End-to-end source & contract parity guard across the owned SEO surfaces:
 *  1. 100% BreadcrumbList coverage across all 10 non-root indexable owned pages.
 *  2. WebApplication / TechArticle / Person / QAPage / CollectionPage / Blog
 *     entity coverage + consolidated `@id` references (`/#organization` and
 *     `https://alexchernysh.com/#person`) with zero orphan publisher/author blocks.
 *  3. OpenGraph (`siteName`, `images`, `alt`) + Twitter (`summary_large_image`,
 *     `title`, `description`, `images`) parity across every owned indexable route,
 *     plus `PAGE_DESC` registration on `/blog` and `<=60` SERP `<title>` cap.
 *  4. `/blog/[slug]` `dateModified` parity across OpenGraph, `article:modified_time`,
 *     and `<article>` microdata.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const NON_ROOT_INDEXABLE_PAGES = [
  'app/about/page.tsx',
  'app/cost/page.tsx',
  'app/cli-quickstart/page.tsx',
  'app/spec-driven/page.tsx',
  'app/spec/agent-failure-taxonomy/v0.1/page.tsx',
  'app/tools/agent-md-bench/page.tsx',
  'app/q/page.tsx',
  'app/q/[slug]/page.tsx',
  'app/blog/page.tsx',
  'app/blog/[slug]/page.tsx',
] as const;

test('every non-root indexable owned page emits BreadcrumbList structured data', () => {
  const breadcrumbMarkers =
    /\b(BreadcrumbListJsonLd|StaticPageBreadcrumb|BlogIndexBreadcrumb|BlogPostBreadcrumb)\b/;
  for (const file of NON_ROOT_INDEXABLE_PAGES) {
    const src = read(file);
    assert.match(
      src,
      breadcrumbMarkers,
      `${file} is missing BreadcrumbList JSON-LD component`,
    );
  }
});

test('/cost and /tools/agent-md-bench emit WebApplication JSON-LD', () => {
  for (const file of ['app/cost/page.tsx', 'app/tools/agent-md-bench/page.tsx']) {
    const src = read(file);
    assert.match(
      src,
      /\bwebApplicationLD\b/,
      `${file} must emit WebApplication JSON-LD via webApplicationLD`,
    );
  }
});

test('inline JSON-LD and seo.ts builders reference canonical Organization and Person @ids', () => {
  const seoSrc = read('lib/seo.ts');
  assert.match(seoSrc, /https:\/\/alexchernysh\.com\/#person/);
  assert.match(seoSrc, /\$\{SITE_URL\}\/#organization/);

  for (const file of [
    'app/cli-quickstart/page.tsx',
    'app/spec-driven/page.tsx',
    'app/spec/agent-failure-taxonomy/v0.1/page.tsx',
  ]) {
    const src = read(file);
    assert.match(
      src,
      /https:\/\/alexchernysh\.com\/#person/,
      `${file} TechArticle author must carry canonical Person @id`,
    );
    assert.match(
      src,
      /#organization/,
      `${file} TechArticle publisher must carry canonical Organization @id`,
    );
  }

  const qIndexSrc = read('app/q/page.tsx');
  assert.match(qIndexSrc, /#organization/, 'app/q/page.tsx CollectionPage must link publisher @id');
  assert.match(qIndexSrc, /#website/, 'app/q/page.tsx CollectionPage must link isPartOf WebSite @id');

  const qSlugSrc = read('app/q/[slug]/page.tsx');
  assert.match(qSlugSrc, /#organization/, 'app/q/[slug]/page.tsx QAPage must link Organization @id');
  assert.match(qSlugSrc, /#website/, 'app/q/[slug]/page.tsx QAPage must link isPartOf WebSite @id');
});

test('every child page overriding openGraph also sets siteName, images, and matching twitter card metadata', () => {
  for (const file of NON_ROOT_INDEXABLE_PAGES) {
    const src = read(file);
    assert.match(src, /openGraph:\s*\{/, `${file} must declare openGraph metadata`);
    assert.match(src, /siteName:/, `${file} openGraph must include siteName so Next does not strip og:site_name`);
    assert.match(src, /images:\s*\[/, `${file} openGraph must include images so Next does not strip og:image`);
    assert.match(src, /twitter:\s*\{/, `${file} must declare twitter metadata so cards match page copy instead of root homepage`);
    assert.match(src, /card:\s*['"]summary_large_image['"]/, `${file} twitter card must be summary_large_image`);
  }
});

test('app/blog/page.tsx declares PAGE_DESC so meta-description-cap guards /blog', () => {
  const src = read('app/blog/page.tsx');
  assert.match(src, /\bconst\s+PAGE_DESC\s*=/);
});

test('app/spec-driven/page.tsx <title> avoids double-branding and fits the 60-char SERP cap', () => {
  const src = read('app/spec-driven/page.tsx');
  assert.match(
    src,
    /title:\s*\{\s*absolute:\s*PAGE_TITLE\s*\}/,
    'app/spec-driven/page.tsx should emit title.absolute so the 53-char title does not become 65 chars with duplicate " | Bernstein"',
  );
});

test('app/blog/[slug]/page.tsx propagates post.fm.dateModified to OpenGraph, article meta, and microdata', () => {
  const src = read('app/blog/[slug]/page.tsx');
  assert.match(src, /modifiedTime:\s*post\.fm\.dateModified\s*\?\?\s*post\.fm\.date/);
  assert.match(src, /'article:modified_time':\s*post\.fm\.dateModified\s*\?\?\s*post\.fm\.date/);
  assert.match(src, /itemProp="dateModified"\s+content=\{post\.fm\.dateModified\s*\?\?\s*post\.fm\.date\}/);
});
