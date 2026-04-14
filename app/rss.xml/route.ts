import { getAllPosts } from '@/lib/mdx';

const SITE_URL = 'https://bernstein.run';

export async function GET() {
  const posts = await getAllPosts();

  const items = posts
    .map(
      (post) => `
    <item>
      <title><![CDATA[${post.fm.title}]]></title>
      <description><![CDATA[${post.fm.description}]]></description>
      <link>${SITE_URL}/blog/${post.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${post.slug}</guid>
      <pubDate>${new Date(post.fm.date).toUTCString()}</pubDate>
      ${post.fm.tags?.map((t: string) => `<category>${t}</category>`).join('\n      ') ?? ''}
    </item>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Bernstein Blog</title>
    <description>Technical articles about multi-agent orchestration for AI coding agents</description>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <managingEditor>alex@bernstein.run (Alex Chernysh)</managingEditor>
    <webMaster>alex@bernstein.run (Alex Chernysh)</webMaster>
    <ttl>1440</ttl>${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
