import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

/**
 * Pure helpers for `app/sitemap-news.xml/route.ts`.
 *
 * Deliberately free of React / `next-mdx-remote` imports so the unit test
 * can `import` it under `node --test --experimental-strip-types` without
 * pulling in JSX-bearing component modules.
 *
 * The route handler does the actual `getAllPosts()` call and feeds the
 * result into `buildNewsSitemapBody()` here.
 */

export const NEWS_SITE_URL = 'https://bernstein.run';
export const NEWS_PUBLICATION_NAME = 'Bernstein';
export const NEWS_PUBLICATION_LANGUAGE = 'en';
export const NEWS_FRESHNESS_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
export const NEWS_MAX_ENTRIES = 1000; // Google News spec hard limit

const execFileP = promisify(execFile);

export type NewsPost = {
  slug: string;
  title: string;
  /** Frontmatter date string (YYYY-MM-DD or ISO). May be empty / unparseable. */
  date: string;
  tags?: string[];
};

export function escapeXml(text: string): string {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function toW3CIso(date: Date): string {
  // Full ISO-8601 (with TZ) is what Google News expects; date-only is also
  // valid, but day-precision means "this article was published at midnight"
  // which trips down-stream "is this fresh?" checks.
  return date.toISOString();
}

/**
 * Resolve a publication date for a post.
 *
 * Frontmatter `date` wins. If absent or unparseable, fall back to git mtime
 * via `git log -1 --format=%cI`. If git is not on PATH or the file is not
 * tracked, the post is skipped silently rather than crashing the route.
 */
export async function resolvePublicationDate(
  post: NewsPost,
  blogDir: string,
): Promise<Date | null> {
  const fmDate = new Date(post.date);
  if (post.date && !Number.isNaN(fmDate.getTime())) return fmDate;

  const filePath = path.join(blogDir, post.slug, 'index.mdx');
  try {
    const { stdout } = await execFileP('git', ['log', '-1', '--format=%cI', '--', filePath], {
      cwd: process.cwd(),
    });
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    const gitDate = new Date(trimmed);
    return Number.isNaN(gitDate.getTime()) ? null : gitDate;
  } catch {
    return null;
  }
}

type NewsEntry = {
  url: string;
  title: string;
  publicationDate: Date;
  keywords: string[];
};

export async function selectFreshEntries(
  posts: NewsPost[],
  now: Date,
  blogDir: string,
): Promise<NewsEntry[]> {
  const cutoff = now.getTime() - NEWS_FRESHNESS_WINDOW_MS;
  const entries: NewsEntry[] = [];

  for (const post of posts) {
    const publicationDate = await resolvePublicationDate(post, blogDir);
    if (!publicationDate) continue;
    if (publicationDate.getTime() < cutoff) continue;
    entries.push({
      url: `${NEWS_SITE_URL}/blog/${post.slug}`,
      title: post.title,
      publicationDate,
      keywords: post.tags ?? [],
    });
    if (entries.length >= NEWS_MAX_ENTRIES) break;
  }

  return entries;
}

export function renderNewsSitemapXml(entries: NewsEntry[]): string {
  const urlEntries = entries
    .map((e) => {
      const lines: string[] = [
        '  <url>',
        `    <loc>${escapeXml(e.url)}</loc>`,
        '    <news:news>',
        '      <news:publication>',
        `        <news:name>${escapeXml(NEWS_PUBLICATION_NAME)}</news:name>`,
        `        <news:language>${escapeXml(NEWS_PUBLICATION_LANGUAGE)}</news:language>`,
        '      </news:publication>',
        `      <news:publication_date>${escapeXml(toW3CIso(e.publicationDate))}</news:publication_date>`,
        `      <news:title>${escapeXml(e.title)}</news:title>`,
      ];
      if (e.keywords.length > 0) {
        lines.push(`      <news:keywords>${escapeXml(e.keywords.join(', '))}</news:keywords>`);
      }
      lines.push('    </news:news>', '  </url>');
      return lines.join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    urlEntries,
    '</urlset>',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export function computeXmlEtag(body: string): string {
  return `"${createHash('sha1').update(body).digest('hex')}"`;
}

/**
 * One-shot helper used both by the route handler and the test suite.
 * Pass a frozen `now` from tests for deterministic output.
 */
export async function buildNewsSitemapBody(
  posts: NewsPost[],
  now: Date,
  blogDir: string,
): Promise<{ xml: string; etag: string }> {
  const entries = await selectFreshEntries(posts, now, blogDir);
  const xml = renderNewsSitemapXml(entries);
  return { xml, etag: computeXmlEtag(xml) };
}
