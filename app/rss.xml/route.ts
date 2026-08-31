import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAllPosts, type PostIndex } from '@/lib/mdx';
import { AUTHOR } from '@/lib/seo';

const SITE_URL = 'https://bernstein.run';
const FEED_URL = `${SITE_URL}/rss.xml`;
const EDITOR = `forte@bernstein.run (${AUTHOR})`;
const SELF_RSS_NS = {
  atom: 'http://www.w3.org/2005/Atom',
  media: 'http://search.yahoo.com/mrss/',
  dc: 'http://purl.org/dc/elements/1.1/',
  content: 'http://purl.org/rss/1.0/modules/content/',
  dcterms: 'http://purl.org/dc/terms/',
} as const;

/**
 * Escape an attribute / element value into XML-safe text.
 *
 * Order matters: `&` first, otherwise we re-encode the ampersands we just
 * inserted. Apostrophes and quotes are encoded too because the same helper
 * runs on attribute values (e.g. `media:content url=...`) where unescaped
 * quotes would close the attribute early.
 */
function escapeXml(text: string): string {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Wrap free-form text in CDATA so it can contain raw HTML / quotes /
 * angle brackets without breaking the XML parser. Splits any literal
 * `]]>` inside the payload across two CDATA blocks because that
 * sequence is the only thing that can prematurely terminate the
 * section. Empty / null payloads collapse to an empty CDATA so feed
 * validators don't complain about absent text nodes.
 */
function asCdata(text: string | null | undefined): string {
  const safe = String(text ?? '').replaceAll(']]>', ']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
}

/**
 * Day-precision build stamp, `YYYY-MM-DD`, or null when the manifest is
 * absent.
 *
 * The channel's `lastBuildDate` and copyright year were computed with
 * `new Date()` per request, which made every response a different byte
 * stream and the sha1 ETag below a validator that could never match -
 * a conditional GET always fell through to a full 200 (issue #112).
 *
 * The stamp comes from `data/source-mtimes.json`, the prebuild manifest
 * `app/sitemap.xml/route.ts` already reads for `<lastmod>`; that route
 * documents why the manifest exists and why `data/` is the only source
 * of build metadata the standalone bundle ships. The `mtimes` values are
 * git commit dates, so they are fixed by the commit and two builds of
 * the same tree agree; `builtAt` is the prebuild wall clock and is only
 * the fallback. ISO day strings sort chronologically, so the newest
 * tracked date is the last one after a plain sort.
 *
 * Cached at module scope: the manifest cannot change under a running
 * server.
 */
type SourceMtimeManifest = {
  builtAt?: string;
  mtimes?: Record<string, string | null>;
};

let _buildStampCache: string | null | undefined;

async function loadBuildStamp(): Promise<string | null> {
  if (_buildStampCache !== undefined) return _buildStampCache;
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), 'data', 'source-mtimes.json'),
      'utf8',
    );
    const manifest = JSON.parse(raw) as SourceMtimeManifest;
    const tracked = Object.values(manifest.mtimes ?? {}).filter(
      (value): value is string => typeof value === 'string' && value !== '',
    );
    _buildStampCache = tracked.sort().at(-1) ?? manifest.builtAt ?? null;
  } catch {
    /* Fresh checkout with no prebuild. The newest post date carries the
       channel dates on its own; nothing falls back to the clock. */
    _buildStampCache = null;
  }
  return _buildStampCache;
}

function toRfc822(date: string | Date): string {
  const d = date instanceof Date ? date : new Date(date);
  // toUTCString() already emits an RFC 822-ish "Mon, 06 May 2026 00:00:00 GMT"
  // string; node hands us a stable spelling across platforms so feed parsers
  // (Feedly, NetNewsWire) read it without TZ ambiguity.
  return d.toUTCString();
}

function buildItemXml(post: PostIndex): string {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const pubDate = toRfc822(post.fm.date);
  const tags = post.fm.tags ?? [];
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(post.fm.title)}`;

  const lines: (string | null)[] = [
    '    <item>',
    `      <title>${asCdata(post.fm.title)}</title>`,
    `      <link>${escapeXml(url)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
    `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
    `      <dc:creator>${asCdata(AUTHOR)}</dc:creator>`,
    `      <dcterms:modified>${escapeXml(new Date(post.fm.date).toISOString())}</dcterms:modified>`,
    `      <description>${asCdata(post.fm.description)}</description>`,
    /* content:encoded duplicates the description for now - until we have
       full-article HTML rendering inside the route handler, this at least
       satisfies aggregators (Flipboard, Apple News) that drop items with
       no <content:encoded>. */
    `      <content:encoded>${asCdata(post.fm.description)}</content:encoded>`,
    /* media:content advertises the per-post OG image as the canonical
       enclosure; MSN Start in particular refuses to ingest a feed without
       at least one media:content per item. medium="image" + width/height
       are the minimum fields its validator checks. */
    `      <media:content url="${escapeXml(ogImage)}" medium="image" type="image/png" width="1200" height="630">`,
    `        <media:title type="plain">${asCdata(post.fm.title)}</media:title>`,
    `        <media:description type="plain">${asCdata(post.fm.description)}</media:description>`,
    '      </media:content>',
    ...tags.map((t) => `      <category>${asCdata(t)}</category>`),
    '    </item>',
  ];

  return lines.filter((line): line is string => line !== null).join('\n');
}

function buildFeedXml(posts: PostIndex[], buildStamp: string | null): string {
  const itemsXml = posts.map(buildItemXml).join('\n');

  /* Channel date: the later of the newest post and the build stamp, so
     a deploy that only edited page copy still moves the feed forward.
     Both sides are ISO strings, which sort chronologically. Day-precision
     stamps are read as UTC midnight so the RFC 822 spelling does not
     depend on the server's timezone. `getAllPosts()` sorts newest
     first. */
  const newestPostIso =
    posts.length > 0 ? new Date(posts[0].fm.date).toISOString() : null;
  const stampIso = buildStamp
    ? new Date(`${buildStamp}T00:00:00Z`).toISOString()
    : null;
  const channelIso =
    [newestPostIso, stampIso]
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null;

  const lastBuildDate = channelIso ? toRfc822(new Date(channelIso)) : null;
  const lastPubDate = newestPostIso
    ? toRfc822(new Date(newestPostIso))
    : lastBuildDate;
  /* No dated source at all (no manifest, no posts) means no year to
     claim - the notice still names the holder and the licence. */
  const copyright = channelIso
    ? `Copyright ${channelIso.slice(0, 4)} ${AUTHOR}. Apache 2.0 licensed.`
    : `Copyright ${AUTHOR}. Apache 2.0 licensed.`;

  const namespaceAttrs = Object.entries(SELF_RSS_NS)
    .map(([prefix, uri]) => `xmlns:${prefix}="${uri}"`)
    .join('\n     ');

  const lines: (string | null)[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rss version="2.0"\n     ${namespaceAttrs}>`,
    '  <channel>',
    `    <title>${asCdata('Bernstein Blog')}</title>`,
    `    <link>${escapeXml(`${SITE_URL}/blog`)}</link>`,
    `    <description>${asCdata('Engineering deep-dives, community spotlights, and updates from the Bernstein project - the open-source governance layer for AI agents.')}</description>`,
    '    <language>en-us</language>',
    `    <copyright>${asCdata(copyright)}</copyright>`,
    `    <managingEditor>${escapeXml(EDITOR)}</managingEditor>`,
    `    <webMaster>${escapeXml(EDITOR)}</webMaster>`,
    lastPubDate ? `    <pubDate>${escapeXml(lastPubDate)}</pubDate>` : null,
    lastBuildDate
      ? `    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>`
      : null,
    '    <ttl>60</ttl>',
    '    <generator>bernstein.run/rss</generator>',
    `    <atom:link href="${escapeXml(FEED_URL)}" rel="self" type="application/rss+xml"/>`,
    `    <image>`,
    `      <url>${escapeXml(`${SITE_URL}/favicon.svg`)}</url>`,
    `      <title>${asCdata('Bernstein Blog')}</title>`,
    `      <link>${escapeXml(`${SITE_URL}/blog`)}</link>`,
    '    </image>',
    itemsXml,
    '  </channel>',
    '</rss>',
  ];

  return lines.filter((line): line is string => line !== null).join('\n');
}

function computeEtag(body: string): string {
  return `"${createHash('sha1').update(body).digest('hex')}"`;
}

export async function GET(request: Request): Promise<Response> {
  const posts = await getAllPosts();
  const xml = buildFeedXml(posts, await loadBuildStamp());
  const etag = computeEtag(xml);

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
      },
    });
  }

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      ETag: etag,
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  });
}
