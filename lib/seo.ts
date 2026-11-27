import { createHash } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { toHtml } from 'hast-util-to-html';
import type { PostIndex, FrontmatterT } from '@/lib/mdx';

export const SITE_URL = 'https://bernstein.run';
export const SITE_NAME = 'Bernstein';
export const AUTHOR = 'Alex Chernysh';
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const PERSON_ID = 'https://alexchernysh.com/#person';

export function buildBlogPostJsonLd(slug: string, fm: FrontmatterT, readingMinutes: number) {
  /* TechArticle is correct for the dev-tooling subject matter; we add
     mainEntityOfPage so the post URL is canonical inside the graph,
     dateModified (frontmatter `dateModified` when present - the sitemap
     and post pages already read it - falling back to datePublished so
     Search Console never guesses an update date) and an explicit image
     so AI-overviews have a hero to cite alongside the text. */
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${SITE_URL}/blog/${slug}#techarticle`,
    headline: fm.title,
    description: fm.description,
    datePublished: fm.date,
    dateModified: fm.dateModified ?? fm.date,
    author: {
      '@type': 'Person',
      '@id': PERSON_ID,
      name: AUTHOR,
      url: 'https://alexchernysh.com',
      sameAs: [
        'https://alexchernysh.com',
        'https://github.com/chernistry',
        'https://x.com/alex_chernysh',
        'https://mastodon.social/@alexchernysh',
        'https://bsky.app/profile/alex-chernysh.bsky.social',
      ],
    },
    publisher: {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: SITE_NAME,
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.svg` },
    },
    url: `${SITE_URL}/blog/${slug}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/blog/${slug}` },
    image: `${SITE_URL}${fm.cover ?? `/api/og?title=${encodeURIComponent(fm.title)}`}`,
    timeRequired: `PT${readingMinutes}M`,
    inLanguage: 'en',
    ...(fm.tags ? { keywords: fm.tags.join(', ') } : {}),
  };
}

/* BreadcrumbList - Home › Blog › <post>. Search engines render this as
   the breadcrumb chip under the SERP title. Keeps users oriented when
   the post-URL alone (e.g. /blog/orchestrator-on-someone-elses-box) is
   opaque. */
export function buildBlogPostBreadcrumbJsonLd(slug: string, title: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: title, item: `${SITE_URL}/blog/${slug}` },
    ],
  };
}

export function buildBlogIndexBreadcrumbJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
    ],
  };
}

export function buildBlogIndexJsonLd(posts: PostIndex[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${SITE_URL}/blog#blog`,
    name: `${SITE_NAME} Blog`,
    description:
      'Engineering deep-dives, community spotlights, and updates from the Bernstein project.',
    inLanguage: 'en',
    url: `${SITE_URL}/blog`,
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    author: {
      '@type': 'Person',
      '@id': PERSON_ID,
      name: AUTHOR,
      url: 'https://alexchernysh.com',
      sameAs: [
        'https://alexchernysh.com',
        'https://github.com/chernistry',
        'https://x.com/alex_chernysh',
        'https://mastodon.social/@alexchernysh',
        'https://bsky.app/profile/alex-chernysh.bsky.social',
      ],
    },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      '@id': `${SITE_URL}/blog/${p.slug}#blogposting`,
      headline: p.fm.title,
      description: p.fm.description,
      datePublished: p.fm.date,
      dateModified: p.fm.dateModified ?? p.fm.date,
      url: `${SITE_URL}/blog/${p.slug}`,
    })),
  };
}

/* Every absolute URL below is emitted exactly once. The discovery
   submitter that reads this file counts a repeated URL as a duplicate
   submission, so a link that could sit in two sections lives in the
   more specific one only: the feed under Resources (not Site pages),
   the changelog under Docs (not Optional). Adding a link that already
   appears elsewhere in the document re-opens that. */
export async function buildLlmsTxt(): Promise<string> {
  const { getAllPosts } = await import('@/lib/mdx');
  const posts = await getAllPosts();
  const postList = posts
    .map((p) => `- [${p.fm.title}](${SITE_URL}/blog/${p.slug}): ${p.fm.description}`)
    .join('\n');

  return `# Bernstein

> Bernstein is an open-source governance layer for AI agents, with a deterministic scheduler driving CLI coding agents (Claude Code, Codex, Gemini CLI, and others). Scheduling is plain Python - no LLM in the coordination loop - so runs are reproducible end to end. Every task runs in its own git worktree behind lint/type/test gates. An always-on lineage spine and replay journal record what happened; an opt-in HMAC-chained audit log and signed receipts let a reviewer who did not execute the run check it offline, without rerunning it. Signature and hash-chain checks read the on-disk records alone; the HMAC leg needs the key the chain was written with. Cluster mode and an air-gap install profile included. Apache-2.0. Status: beta, solo-maintained - pin the version you depend on. Built by Alex Chernysh.

## What you get

- [No server to provision](${SITE_URL}/q/self-hosted-ai-coding-agent-orchestrator): State is file-based (\`.sdd/\`); the orchestrator and every agent it spawns run on your machine
- [Per-agent credential scoping](${SITE_URL}/q/how-does-bernstein-scope-permissions): An agent sees only the environment it declared needing, so one agent's keys stay out of the others' processes
- [Pluggable sandbox backends](${SITE_URL}/q/what-sandbox-backends-does-bernstein-support): Docker, E2B, Modal, Blaxel, Cloudflare, Daytona, Runloop, Vercel - on top of the local git-worktree default

Cloud artifact sinks, progressive skill packs, and Cloudflare cloud execution are available on top of the same defaults.

## Docs

- [Repository docs](https://github.com/sipyourdrink-ltd/bernstein/tree/main/docs): Markdown docs that ship with the source
- [Documentation](https://docs.bernstein.run/): Full technical documentation
- [Architecture](https://docs.bernstein.run/en/latest/architecture/): System architecture and design
- [Getting Started](https://docs.bernstein.run/en/latest/getting-started/): Installation and quickstart
- [Adapter Guide](https://docs.bernstein.run/en/latest/adapters/ADAPTER_GUIDE/): Supported agents and how to add your own
- [API Reference](https://docs.bernstein.run/en/latest/reference/openapi-reference/): Task server REST API
- [Cloudflare Guide](https://docs.bernstein.run/en/latest/cloudflare/cloudflare-overview/): Cloud execution on Cloudflare Workers
- [Configuration](https://docs.bernstein.run/en/latest/operations/CONFIG/): bernstein.yaml reference
- [CHANGELOG](https://docs.bernstein.run/en/latest/CHANGELOG/): Release notes per version

## Site pages

- [Cost calculator](${SITE_URL}/cost): Token-bill estimator for a Bernstein run with the contextual bandit router enabled; shows the per-model cost band against an unrouted baseline
- [Adapter comparisons](${SITE_URL}/vs): Index of side-by-side feature matrices for every supported CLI agent (Aider, Claude Code, Codex, Cursor, Gemini, OpenAI Agents SDK, and more)
- [CLI quickstart](${SITE_URL}/cli-quickstart): Minimal walkthrough. Installing pipx, running the first task, reading the audit log
- [Ask the docs](${SITE_URL}/#ask): DocsBot question surface backed by the readthedocs index plus blog content; cite-style answers with source chips
- [Sponsors](${SITE_URL}/sponsors): Public sponsors wall (GitHub Sponsors)
- [Tools - agent.md bench](${SITE_URL}/tools/agent-md-bench): Free utility. Paste a project's agent file and get a token-cost estimate per supported model
- [Benchmarks](${SITE_URL}/benchmarks): Simulated parallel-scheduling speedup model plus a community cost benchmark, each labelled by source

## Resources

- [Ask DeepWiki](https://deepwiki.com/sipyourdrink-ltd/bernstein): Question answering over the repository
- [GitHub](https://github.com/sipyourdrink-ltd/bernstein): Source code and issues
- [PyPI](https://pypi.org/project/bernstein/): Python package
- [npm](https://www.npmjs.com/package/bernstein-orchestrator): Node.js wrapper
- [Full Technical Reference](${SITE_URL}/llms-full.txt): Comprehensive 600+ line reference for LLMs
- [OpenAPI Spec](${SITE_URL}/openapi.yaml): REST API specification
- [Agent Card (A2A)](${SITE_URL}/.well-known/agent-card.json): A2A protocol manifest
- [MCP Server Card](${SITE_URL}/.well-known/mcp/server-card.json): MCP server discovery card
- [MCP (remote, read-only)](https://mcp.bernstein.run/mcp): Streamable HTTP endpoint, anonymous - verify run receipts, list presets and adapters
- [Verify a run receipt](https://mcp.bernstein.run/verify): Run-receipt verifier
- [Authentication](${SITE_URL}/auth.md): There is none. What is public, which write endpoints are anonymous, and why the OpenAPI document's server is the reader's own machine rather than this host
- [RSS Feed](${SITE_URL}/rss.xml): Blog updates

## Primitives

Canonical runnable examples for the four primitives an AI assistant needs to reason about Bernstein. Each bullet points at the stand-alone answer page; the same example is inlined underneath.

- [Adapter (claude_code)](${SITE_URL}/q/how-to-add-a-cli-adapter): Routing a role to a CLI agent in bernstein.yaml - cli, model, effort
- [plan.yaml](${SITE_URL}/q/how-to-write-a-bernstein-plan-yaml): Plan-file shape - stages, depends_on, per-step role and complexity
- [MCP server](${SITE_URL}/q/mcp-server-for-multi-agent-coding): Running Bernstein as an MCP server over stdio or HTTP, and the tool tiers
- [Worktree isolation](${SITE_URL}/q/git-worktree-parallel-ai-agents): One git worktree per task; the merge queue serializes results once the gates pass

### Adapter (claude_code)

\`\`\`yaml
# bernstein.yaml
role_model_policy:
  backend:
    cli: claude
    model: sonnet
    effort: high
\`\`\`

### plan.yaml

\`\`\`yaml
# plans/auth.yaml
name: "Add authentication"
stages:
  - name: api
    steps:
      - goal: "Implement /login endpoint"
        role: backend
        complexity: medium
  - name: tests
    depends_on: [api]
    steps:
      - goal: "Integration tests for /login"
        role: qa
\`\`\`

Run with: \`bernstein run plans/auth.yaml\`

### MCP server

\`\`\`bash
# Expose Bernstein as an MCP server (stdio transport)
bernstein mcp

# Or HTTP transport on :8053
bernstein mcp --transport http --port 8053
\`\`\`

Exposed tools (default \`standard\` tier; \`--mcp-tier {core|standard|all}\` widens or narrows the list): \`bernstein_run\`, \`bernstein_status\`, \`bernstein_run_status\`, \`bernstein_approve\`, \`bernstein_complete\`, \`bernstein_cancel\`, \`bernstein_claim\`, \`bernstein_post_message\`, \`bernstein_post_artifact\`, \`bernstein_task_capsule\`, \`bernstein_shutdown_orchestrator\`, \`load_skill\`.

### Worktree isolation

\`\`\`bash
# Default: every task gets its own git worktree under .sdd/worktrees/
bernstein -g "refactor auth module"

# Bernstein creates .sdd/worktrees/<session-id>/ for each agent
ls .sdd/worktrees/
# task-001-backend-refactor-auth/
# task-002-qa-test-refactor/
\`\`\`

Each agent commits to its own branch; merge queue serializes results into the trunk after quality gates pass.

${posts.length > 0 ? `## Blog\n\n${postList}\n` : ''}
## Author

- [Alex Chernysh](https://alexchernysh.com): Author of Bernstein, homepage and portfolio
- [Alex on GitHub](https://github.com/chernistry): Source of Bernstein and other open-source projects
- [Alex on X](https://x.com/alex_chernysh): @alex_chernysh - short notes and updates

## Optional

- [Contributing](https://docs.bernstein.run/en/latest/contributing/): How to contribute
- [License](https://github.com/sipyourdrink-ltd/bernstein/blob/main/LICENSE): Apache 2.0
`;
}

// ---------------------------------------------------------------------------
// RSS 2.0 full-content feed helpers (consumed by app/rss.xml/route.ts)
// ---------------------------------------------------------------------------

export type RssPost = {
  slug: string;
  fm: {
    title: string;
    description: string;
    date: string;
    dateModified?: string;
    cover?: string;
    coverAlt?: string;
    tags?: string[];
  };
  contentHtml?: string;
};

const FEED_URL = `${SITE_URL}/rss.xml`;
const EDITOR = `forte@bernstein.run (${AUTHOR})`;
const SELF_RSS_NS = {
  atom: 'http://www.w3.org/2005/Atom',
  media: 'http://search.yahoo.com/mrss/',
  dc: 'http://purl.org/dc/elements/1.1/',
  content: 'http://purl.org/rss/1.0/modules/content/',
  dcterms: 'http://purl.org/dc/terms/',
} as const;

function escapeRssXml(text: string): string {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function asCdata(text: string | null | undefined): string {
  const safe = String(text ?? '').replaceAll(']]>', ']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
}

function parseValidDate(date: string | Date | null | undefined): Date | null {
  if (date == null) return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toRfc822(date: string | Date): string | null {
  const d = parseValidDate(date);
  return d ? d.toUTCString() : null;
}

/**
 * Convert custom MDX tags used in `content/blog/*` (`<Lead>`, `<Callout>`,
 * `<Mermaid>`) into standard Markdown constructs before `remark-parse`.
 */
function preprocessMdxForFeed(mdxSource: string, postUrl: string): string {
  let out = mdxSource;

  out = out.replace(/<Lead>\s*([\s\S]*?)\s*<\/Lead>/g, (_m, inner: string) => inner.trim());

  out = out.replace(
    /<Callout\b([^>]*)>\s*([\s\S]*?)\s*<\/Callout>/g,
    (_m, attrs: string, inner: string) => {
      const titleMatch = attrs.match(/\btitle=(['"])([\s\S]*?)\1/);
      const title = titleMatch ? titleMatch[2].trim() : '';
      const bodyLines = inner
        .trim()
        .split(/\r?\n/)
        .map((line) => (line.trim() === '' ? '>' : `> ${line}`));
      if (title) {
        return [`> **${title}**`, '>', ...bodyLines].join('\n');
      }
      return bodyLines.join('\n');
    },
  );

  out = out.replace(
    /<Mermaid\b[\s\S]*?\bchart=(['"])([\s\S]*?)\1[\s\S]*?\/>/g,
    (_m, _q: string, chart: string) =>
      `\`\`\`mermaid\n${chart.trim()}\n\`\`\`\n\n[View diagram on bernstein.run](${postUrl})`,
  );

  return out;
}

function absolutizeFeedUrls(html: string): string {
  return html
    .replace(/\bhref="\/(?!\/)([^"]*)"/g, `href="${SITE_URL}/$1"`)
    .replace(/\bsrc="\/(?!\/)([^"]*)"/g, `src="${SITE_URL}/$1"`);
}

const feedHtmlCache = new Map<string, string>();

/**
 * Render a blog post's raw MDX body into reader-safe, sanitized HTML
 * suitable for `<content:encoded>`, with internal links resolved to
 * `https://bernstein.run/...`.
 */
export async function renderPostMdxToFeedHtml(
  mdxSource: string,
  postUrl: string,
): Promise<string> {
  const cacheKey = createHash('sha1')
    .update(postUrl)
    .update('\0')
    .update(mdxSource)
    .digest('hex');
  const cached = feedHtmlCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const normalized = preprocessMdxForFeed(mdxSource, postUrl);
  const mdast = unified().use(remarkParse).use(remarkGfm).parse(normalized);
  const hast = await unified()
    .use(remarkRehype)
    .use(rehypeSanitize, defaultSchema as never)
    .run(mdast);
  const html = absolutizeFeedUrls(toHtml(hast as never)).trim();
  feedHtmlCache.set(cacheKey, html);
  return html;
}

export function buildRssItemXml(post: RssPost): string {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const pubDate = toRfc822(post.fm.date);
  const modifiedDate = parseValidDate(post.fm.dateModified ?? post.fm.date) ?? parseValidDate(post.fm.date);
  const modifiedIso = modifiedDate ? modifiedDate.toISOString() : null;
  const tags = post.fm.tags ?? [];
  const mediaUrl = post.fm.cover
    ? `${SITE_URL}${post.fm.cover}`
    : `${SITE_URL}/api/og?title=${encodeURIComponent(post.fm.title)}`;
  const mediaDesc = post.fm.coverAlt ?? post.fm.description;
  const bodyHtml =
    post.contentHtml && post.contentHtml.trim().length > 0
      ? post.contentHtml
      : `<p>${escapeRssXml(post.fm.description)}</p>`;

  const lines: (string | null)[] = [
    '    <item>',
    `      <title>${asCdata(post.fm.title)}</title>`,
    `      <link>${escapeRssXml(url)}</link>`,
    `      <guid isPermaLink="true">${escapeRssXml(url)}</guid>`,
    pubDate ? `      <pubDate>${escapeRssXml(pubDate)}</pubDate>` : null,
    `      <dc:creator>${asCdata(AUTHOR)}</dc:creator>`,
    modifiedIso ? `      <dcterms:modified>${escapeRssXml(modifiedIso)}</dcterms:modified>` : null,
    `      <description>${asCdata(post.fm.description)}</description>`,
    `      <content:encoded>${asCdata(bodyHtml)}</content:encoded>`,
    `      <media:content url="${escapeRssXml(mediaUrl)}" medium="image" type="image/png" width="1200" height="630">`,
    `        <media:title type="plain">${asCdata(post.fm.title)}</media:title>`,
    `        <media:description type="plain">${asCdata(mediaDesc)}</media:description>`,
    '      </media:content>',
    ...tags.map((t) => `      <category>${asCdata(t)}</category>`),
    '    </item>',
  ];

  return lines.filter((line): line is string => line !== null).join('\n');
}

export function buildRssFeedXml(posts: RssPost[], buildStamp: string | null): string {
  const itemsXml = posts.map(buildRssItemXml).join('\n');

  const newestPubIso = posts
    .map((p) => parseValidDate(p.fm.date)?.toISOString() ?? null)
    .filter((v): v is string => v !== null)
    .sort()
    .at(-1) ?? null;
  const newestModifiedIso =
    posts
      .map((p) => (parseValidDate(p.fm.dateModified ?? p.fm.date) ?? parseValidDate(p.fm.date))?.toISOString() ?? null)
      .filter((v): v is string => v !== null)
      .sort()
      .at(-1) ?? null;
  const stampDate = buildStamp ? parseValidDate(`${buildStamp}T00:00:00Z`) : null;
  const stampIso = stampDate ? stampDate.toISOString() : null;
  const channelIso =
    [newestPubIso, newestModifiedIso, stampIso]
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null;

  const lastBuildDate = channelIso ? toRfc822(new Date(channelIso)) : null;
  const lastPubDate = newestPubIso
    ? toRfc822(new Date(newestPubIso))
    : lastBuildDate;
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
    `    <link>${escapeRssXml(`${SITE_URL}/blog`)}</link>`,
    `    <description>${asCdata('Engineering deep-dives, community spotlights, and updates from the Bernstein project - an open-source governance layer for AI agents.')}</description>`,
    '    <language>en-us</language>',
    `    <copyright>${asCdata(copyright)}</copyright>`,
    `    <managingEditor>${escapeRssXml(EDITOR)}</managingEditor>`,
    `    <webMaster>${escapeRssXml(EDITOR)}</webMaster>`,
    lastPubDate ? `    <pubDate>${escapeRssXml(lastPubDate)}</pubDate>` : null,
    lastBuildDate
      ? `    <lastBuildDate>${escapeRssXml(lastBuildDate)}</lastBuildDate>`
      : null,
    '    <ttl>60</ttl>',
    '    <generator>bernstein.run/rss</generator>',
    `    <atom:link href="${escapeRssXml(FEED_URL)}" rel="self" type="application/rss+xml"/>`,
    '    <image>',
    `      <url>${escapeRssXml(`${SITE_URL}/favicon.svg`)}</url>`,
    `      <title>${asCdata('Bernstein Blog')}</title>`,
    `      <link>${escapeRssXml(`${SITE_URL}/blog`)}</link>`,
    '    </image>',
    itemsXml,
    '  </channel>',
    '</rss>',
  ];

  return lines.filter((line): line is string => line !== null).join('\n');
}
