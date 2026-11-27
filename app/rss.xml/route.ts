import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { BLOG_DIR, getAllPosts } from '@/lib/mdx';
import {
  SITE_URL,
  buildRssFeedXml,
  renderPostMdxToFeedHtml,
  type RssPost,
} from '@/lib/seo';

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
    _buildStampCache = null;
  }
  return _buildStampCache;
}

function computeEtag(body: string): string {
  return `"${createHash('sha1').update(body).digest('hex')}"`;
}

export async function GET(request: Request): Promise<Response> {
  const posts = await getAllPosts();
  const rssPosts: RssPost[] = await Promise.all(
    posts.map(async (p) => {
      let contentHtml: string | undefined;
      try {
        const raw = await fs.readFile(path.join(BLOG_DIR, p.slug, 'index.mdx'), 'utf8');
        const { content } = matter(raw);
        contentHtml = await renderPostMdxToFeedHtml(
          content,
          `${SITE_URL}/blog/${p.slug}`,
        );
      } catch {
        contentHtml = undefined;
      }
      return {
        slug: p.slug,
        fm: p.fm,
        contentHtml,
      };
    }),
  );

  const xml = buildRssFeedXml(rssPosts, await loadBuildStamp());
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
