/**
 * Tests for the RSS 2.0 feed (`app/rss.xml/route.ts`).
 *
 * Ensures:
 *  - `<content:encoded>` renders real sanitized HTML from the post MDX body
 *    (handling `<Lead>`, `<Callout>`, `<Mermaid>`, GFM lists/code/links)
 *    rather than duplicating the 1-sentence frontmatter description.
 *  - Root-relative links (`href="/..."`) and images (`src="/..."`) inside
 *    feed HTML resolve to absolute `https://bernstein.run/...` URLs so
 *    external feed readers and AI ingesters never hit broken relative paths.
 *  - `<dcterms:modified>` and channel `<lastBuildDate>` honour
 *    `fm.dateModified` when present.
 *  - `<media:content>` uses `fm.cover` (and `fm.coverAlt`) when present,
 *    falling back to `/api/og?title=...` only when `cover` is absent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

import {
  buildBlogIndexJsonLd,
  buildBlogPostJsonLd,
  buildRssFeedXml,
  buildRssItemXml,
  renderPostMdxToFeedHtml,
  type RssPost,
} from '../lib/seo.ts';

test('renderPostMdxToFeedHtml converts Lead, Callout, Mermaid, GFM, and relative links to clean absolute HTML', async () => {
  const mdx = [
    '<Lead>',
    'Bernstein runs [CLI quickstart](/cli-quickstart) tasks deterministically.',
    '</Lead>',
    '',
    '<Callout title="Install latest 4.x" tone="warning">',
    'Use `pipx install bernstein` rather than pinning `4.0.0`.',
    '</Callout>',
    '',
    '## Architecture',
    '',
    '- Worktree isolation',
    '- **Signed** receipts',
    '',
    "<Mermaid chart='flowchart LR\n  A --> B' />",
  ].join('\n');

  const html = await renderPostMdxToFeedHtml(
    mdx,
    'https://bernstein.run/blog/sample-post',
  );

  assert.match(html, /<a href="https:\/\/bernstein\.run\/cli-quickstart">CLI quickstart<\/a>/);
  assert.match(html, /<blockquote>[\s\S]*<strong>Install latest 4\.x<\/strong>/);
  assert.match(html, /<code>pipx install bernstein<\/code>/);
  assert.match(html, /<h2>Architecture<\/h2>/);
  assert.match(html, /<ul>[\s\S]*<li>Worktree isolation<\/li>/);
  assert.match(html, /<strong>Signed<\/strong>/);
  assert.match(html, /flowchart LR/);
  assert.doesNotMatch(html, /<Lead|<Callout|<Mermaid/);
});

test('buildItemXml emits full HTML in content:encoded, honours dateModified, and prefers fm.cover', async () => {
  const bodyHtml = await renderPostMdxToFeedHtml(
    'Full article body paragraph one.\n\nSecond paragraph with `bernstein audit verify` and [cost](/cost).',
    'https://bernstein.run/blog/v4-0-release',
  );
  const post: RssPost = {
    slug: 'v4-0-release',
    fm: {
      title: 'Bernstein 4.0.0',
      description: 'Short teaser sentence.',
      date: '2026-11-22',
      dateModified: '2026-11-24',
      cover: '/blog/covers/20-v4-0-release.png',
      coverAlt: 'Workflow graph halted by a vertical gate bar.',
      tags: ['release', 'governance'],
    },
    contentHtml: bodyHtml,
  };

  const xml = buildRssItemXml(post);

  assert.match(xml, /<description><!\[CDATA\[Short teaser sentence\.\]\]><\/description>/);
  assert.match(xml, /<content:encoded><!\[CDATA\[[\s\S]*Full article body paragraph one\./);
  assert.match(xml, /https:\/\/bernstein\.run\/cost/);
  assert.doesNotMatch(
    xml,
    /<content:encoded><!\[CDATA\[Short teaser sentence\.\]\]><\/content:encoded>/,
    'content:encoded must contain full rendered post HTML, not repeat description',
  );
  assert.match(xml, /<dcterms:modified>2026-11-24T00:00:00\.000Z<\/dcterms:modified>/);
  assert.match(
    xml,
    /<media:content url="https:\/\/bernstein\.run\/blog\/covers\/20-v4-0-release\.png"/,
  );
  assert.match(
    xml,
    /<media:description type="plain"><!\[CDATA\[Workflow graph halted by a vertical gate bar\.\]\]><\/media:description>/,
  );
});

test('every published blog post on disk renders non-empty RSS HTML distinct from its 1-line description', async () => {
  const blogDir = path.resolve(process.cwd(), 'content', 'blog');
  const entries = await fs.readdir(blogDir, { withFileTypes: true });
  const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  assert.ok(slugs.length >= 15);

  const rssPosts: RssPost[] = [];
  for (const slug of slugs) {
    const raw = await fs.readFile(path.join(blogDir, slug, 'index.mdx'), 'utf8');
    const { data, content } = matter(raw);
    if (data.draft) continue;
    const html = await renderPostMdxToFeedHtml(
      content,
      `https://bernstein.run/blog/${slug}`,
    );
    assert.ok(html.length > String(data.description).length, `${slug}: rendered HTML must exceed description`);
    assert.doesNotMatch(html, /<(Lead|Callout|Mermaid)\b/, `${slug}: raw MDX component leaked into RSS HTML`);
    rssPosts.push({
      slug,
      fm: {
        title: String(data.title),
        description: String(data.description),
        date: String(data.date),
        dateModified: data.dateModified ? String(data.dateModified) : undefined,
        cover: data.cover ? String(data.cover) : undefined,
        coverAlt: data.coverAlt ? String(data.coverAlt) : undefined,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      },
      contentHtml: html,
    });
  }

  const xml = buildRssFeedXml(rssPosts, '2026-10-14');
  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /<atom:link href="https:\/\/bernstein\.run\/rss\.xml" rel="self"/);
});

test('buildBlogPostJsonLd and buildBlogIndexJsonLd emit canonical Organization and Person @ids', () => {
  const postLd = buildBlogPostJsonLd(
    'v4-0-release',
    {
      title: 'Bernstein 4.0.0',
      description: 'Release notes.',
      date: '2026-11-22',
      dateModified: '2026-11-24',
      cover: '/blog/covers/20-v4-0-release.png',
      coverAlt: 'Cover alt',
      tags: ['release'],
    },
    4,
  );
  assert.equal(postLd['@id'], 'https://bernstein.run/blog/v4-0-release#techarticle');
  assert.equal((postLd.author as Record<string, unknown>)['@id'], 'https://alexchernysh.com/#person');
  assert.equal((postLd.publisher as Record<string, unknown>)['@id'], 'https://bernstein.run/#organization');

  const indexLd = buildBlogIndexJsonLd([
    {
      slug: 'v4-0-release',
      fm: {
        title: 'Bernstein 4.0.0',
        description: 'Release notes.',
        date: '2026-11-22',
        dateModified: '2026-11-24',
      },
      readingMinutes: 4,
    },
  ]);
  assert.equal(indexLd['@id'], 'https://bernstein.run/blog#blog');
  assert.equal((indexLd.publisher as Record<string, unknown>)['@id'], 'https://bernstein.run/#organization');
  assert.equal((indexLd.author as Record<string, unknown>)['@id'], 'https://alexchernysh.com/#person');
  assert.equal(indexLd.blogPost[0].dateModified, '2026-11-24');
});

test('buildRssFeedXml degrades cleanly instead of throwing 500 when a post date is malformed', () => {
  const xml = buildRssFeedXml(
    [
      {
        slug: 'bad-date-post',
        fm: {
          title: 'Malformed date post',
          description: 'Still renders without RangeError.',
          date: 'not-a-valid-date',
          dateModified: 'also-invalid',
        },
        contentHtml: '<p>Body</p>',
      },
    ],
    'invalid-stamp',
  );
  assert.match(xml, /<title><!\[CDATA\[Malformed date post\]\]><\/title>/);
  assert.doesNotMatch(xml, /<pubDate>Invalid Date<\/pubDate>/);
  assert.doesNotMatch(xml, /<dcterms:modified>/);
});
