import { getAllPosts, type PostIndex, type FrontmatterT } from '@/lib/mdx';

export const SITE_URL = 'https://bernstein.run';
export const SITE_NAME = 'Bernstein';
export const AUTHOR = 'Alex Chernysh';

export function buildBlogPostJsonLd(slug: string, fm: FrontmatterT, readingMinutes: number) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: fm.title,
    description: fm.description,
    datePublished: fm.date,
    author: { '@type': 'Person', name: AUTHOR, url: 'https://alexchernysh.com' },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    url: `${SITE_URL}/blog/${slug}`,
    timeRequired: `PT${readingMinutes}M`,
    ...(fm.tags ? { keywords: fm.tags.join(', ') } : {}),
  };
}

export function buildBlogIndexJsonLd(posts: PostIndex[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${SITE_NAME} Blog`,
    url: `${SITE_URL}/blog`,
    author: { '@type': 'Person', name: AUTHOR, url: 'https://alexchernysh.com' },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.fm.title,
      description: p.fm.description,
      datePublished: p.fm.date,
      url: `${SITE_URL}/blog/${p.slug}`,
    })),
  };
}

export async function buildLlmsTxt(): Promise<string> {
  const posts = await getAllPosts();
  const postList = posts
    .map((p) => `- [${p.fm.title}](${SITE_URL}/blog/${p.slug}): ${p.fm.description}`)
    .join('\n');

  return `# Bernstein

> Open-source multi-agent orchestration system for AI coding agents. Decomposes goals into parallel tasks, routes to optimal models, verifies via quality gates, merges results. 31 agent adapters, pluggable cloud sandboxes, cloud artifact sinks, progressive skill packs, Cloudflare cloud execution, deterministic Python scheduling. Apache 2.0. Built by Alex Chernysh.

## Docs

- [Documentation](https://bernstein.readthedocs.io/): Full technical documentation
- [Architecture](https://bernstein.readthedocs.io/en/latest/ARCHITECTURE/): System architecture and design
- [Getting Started](https://bernstein.readthedocs.io/en/latest/GETTING_STARTED/): Installation and quickstart
- [Adapter Guide](https://bernstein.readthedocs.io/en/latest/ADAPTER_GUIDE/): Supported agents and how to add your own
- [API Reference](https://bernstein.readthedocs.io/en/latest/openapi-reference/): Task server REST API
- [Cloudflare Guide](https://bernstein.readthedocs.io/en/latest/cloudflare-overview/): Cloud execution on Cloudflare Workers
- [Configuration](https://bernstein.readthedocs.io/en/latest/CONFIG/): bernstein.yaml reference

## Resources

- [GitHub](https://github.com/chernistry/bernstein): Source code and issues
- [PyPI](https://pypi.org/project/bernstein/): Python package
- [npm](https://www.npmjs.com/package/bernstein-orchestrator): Node.js wrapper
- [Full Technical Reference](${SITE_URL}/llms-full.txt): Comprehensive 600+ line reference for LLMs
- [OpenAPI Spec](${SITE_URL}/openapi.yaml): REST API specification
- [Agent Card (A2A)](${SITE_URL}/.well-known/agent-card.json): A2A protocol manifest
- [MCP Server Card](${SITE_URL}/.well-known/mcp/server-card.json): MCP server discovery card
- [RSS Feed](${SITE_URL}/rss.xml): Blog updates

${posts.length > 0 ? `## Blog\n\n${postList}\n` : ''}
## Author

- [Alex Chernysh](https://alexchernysh.com): Author of Bernstein, homepage and portfolio
- [Alex on GitHub](https://github.com/chernistry): Source of Bernstein and other open-source projects

## Related Projects

- [HireEx](https://hireex.ai): AI-powered hiring platform by the same author
- [HireEx on GitHub](https://github.com/chernistry/hireex): Open-source components for HireEx

## Optional

- [Changelog](https://bernstein.readthedocs.io/en/latest/CHANGELOG/): Version history
- [Contributing](https://bernstein.readthedocs.io/en/latest/CONTRIBUTING/): How to contribute
- [License](https://github.com/chernistry/bernstein/blob/main/LICENSE): Apache 2.0
`;
}
