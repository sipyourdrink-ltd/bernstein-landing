import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/mdx';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts();
  const blogEntries = posts.map((post) => ({
    url: `https://bernstein.run/blog/${post.slug}`,
    lastModified: new Date(post.fm.date),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [
    { url: 'https://bernstein.run', lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: 'https://bernstein.run/blog', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: 'https://bernstein.run/blog/getting-started', lastModified: new Date('2026-04-14'), changeFrequency: 'monthly', priority: 0.85 },
    { url: 'https://bernstein.run/llms.txt', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
    { url: 'https://bernstein.run/llms-full.txt', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
    { url: 'https://bernstein.run/ai.txt', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    ...blogEntries.filter((e) => e.url !== 'https://bernstein.run/blog/getting-started'),
  ];
}
