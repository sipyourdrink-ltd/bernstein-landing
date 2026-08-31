import { getAllPosts, type PostIndex, type FrontmatterT } from '@/lib/mdx';

export const SITE_URL = 'https://bernstein.run';
export const SITE_NAME = 'Bernstein';
export const AUTHOR = 'Alex Chernysh';

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
    headline: fm.title,
    description: fm.description,
    datePublished: fm.date,
    dateModified: fm.dateModified ?? fm.date,
    author: {
      '@type': 'Person',
      name: AUTHOR,
      url: 'https://alexchernysh.com',
      sameAs: [
        'https://alexchernysh.com',
        'https://github.com/chernistry',
        'https://x.com/alex_chernysh',
      ],
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.svg` },
    },
    url: `${SITE_URL}/blog/${slug}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/blog/${slug}` },
    image: `${SITE_URL}/api/og?title=${encodeURIComponent(fm.title)}`,
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
    name: `${SITE_NAME} Blog`,
    url: `${SITE_URL}/blog`,
    author: {
      '@type': 'Person',
      name: AUTHOR,
      url: 'https://alexchernysh.com',
      sameAs: [
        'https://alexchernysh.com',
        'https://github.com/chernistry',
        'https://x.com/alex_chernysh',
      ],
    },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.fm.title,
      description: p.fm.description,
      datePublished: p.fm.date,
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
  const posts = await getAllPosts();
  const postList = posts
    .map((p) => `- [${p.fm.title}](${SITE_URL}/blog/${p.slug}): ${p.fm.description}`)
    .join('\n');

  return `# Bernstein

> Bernstein is the open-source governance layer for AI agents, with a deterministic scheduler driving CLI coding agents (Claude Code, Codex, Gemini CLI, and 40+ more). Scheduling is plain Python - no LLM in the coordination loop - so runs are reproducible end to end. Every task runs in its own git worktree behind lint/type/test gates. An always-on lineage spine and replay journal record what happened; an opt-in HMAC-chained audit log and signed receipts let a reviewer who did not execute the run check it offline, without rerunning it. Signature and hash-chain checks read the on-disk records alone; the HMAC leg needs the key the chain was written with. Cluster mode and an air-gap install profile included. Apache-2.0. Status: beta, solo-maintained - pin the version you depend on. Built by Alex Chernysh.

## What you get

- [No server to provision](${SITE_URL}/q/self-hosted-ai-coding-agent-orchestrator): State is file-based (\`.sdd/\`); the orchestrator and every agent it spawns run on your machine
- [Per-agent credential scoping](${SITE_URL}/q/how-does-bernstein-scope-permissions): An agent sees only the environment it declared needing, so one agent's keys stay out of the others' processes
- [Pluggable sandbox backends](${SITE_URL}/q/what-sandbox-backends-does-bernstein-support): Docker, E2B, Modal, Blaxel, Cloudflare, Daytona, Runloop, Vercel - on top of the local git-worktree default

Cloud artifact sinks, progressive skill packs, and Cloudflare cloud execution are available on top of the same defaults.

## Docs

- [Documentation](https://bernstein.readthedocs.io/): Full technical documentation
- [Architecture](https://bernstein.readthedocs.io/en/latest/ARCHITECTURE/): System architecture and design
- [Getting Started](https://bernstein.readthedocs.io/en/latest/GETTING_STARTED/): Installation and quickstart
- [Adapter Guide](https://bernstein.readthedocs.io/en/latest/ADAPTER_GUIDE/): Supported agents and how to add your own
- [API Reference](https://bernstein.readthedocs.io/en/latest/openapi-reference/): Task server REST API
- [Cloudflare Guide](https://bernstein.readthedocs.io/en/latest/cloudflare-overview/): Cloud execution on Cloudflare Workers
- [Configuration](https://bernstein.readthedocs.io/en/latest/CONFIG/): bernstein.yaml reference
- [CHANGELOG](https://bernstein.readthedocs.io/en/latest/CHANGELOG/): Release notes per version

## Site pages

- [Why Bernstein](${SITE_URL}/why-bernstein): What the governance layer covers, and what an auditable run buys you
- [Cost calculator](${SITE_URL}/cost): Token-bill estimator for a Bernstein run with the contextual bandit router enabled; shows the per-model cost band against an unrouted baseline
- [Adapter comparisons](${SITE_URL}/vs): Index of side-by-side feature matrices for every supported CLI agent (Aider, Claude Code, Codex, Cursor, Gemini, OpenAI Agents SDK, and more)
- [CLI quickstart](${SITE_URL}/cli-quickstart): Minimal walkthrough. Installing pipx, running the first task, reading the audit log
- [Ask the docs](${SITE_URL}/ask): DocsBot question surface backed by the readthedocs index plus blog content; cite-style answers with source chips
- [Sponsors](${SITE_URL}/sponsors): Public sponsors wall (GitHub Sponsors / OpenCollective integrations) and the sponsorship tier breakdown
- [Tools - agent.md bench](${SITE_URL}/tools/agent-md-bench): Free utility. Paste a project's agent file and get a token-cost estimate per supported model
- [Tools - orchestra picker](${SITE_URL}/tools/orchestra): Free utility. Pick an agent line-up for a stack and budget combination
- [Benchmark - cli agent orchestrators](${SITE_URL}/benchmarks/cli-agent-orchestrators): Reproducible 10-task eval across several tools. Published scores; bernstein loses 4 of the 10. Methodology and repro script linked.

## Resources

- [GitHub](https://github.com/sipyourdrink-ltd/bernstein): Source code and issues
- [PyPI](https://pypi.org/project/bernstein/): Python package
- [npm](https://www.npmjs.com/package/bernstein-orchestrator): Node.js wrapper
- [Full Technical Reference](${SITE_URL}/llms-full.txt): Comprehensive 600+ line reference for LLMs
- [OpenAPI Spec](${SITE_URL}/openapi.yaml): REST API specification
- [Agent Card (A2A)](${SITE_URL}/.well-known/agent-card.json): A2A protocol manifest
- [MCP Server Card](${SITE_URL}/.well-known/mcp/server-card.json): MCP server discovery card
- [Authentication](${SITE_URL}/auth.md): There is none. What is public, which write endpoints are anonymous, and why the OpenAPI document's server is the reader's own machine rather than this host
- [RSS Feed](${SITE_URL}/rss.xml): Blog updates

## Primitives

Canonical runnable examples for the four primitives an AI assistant needs to reason about Bernstein. Each bullet points at the stand-alone answer page; the same example is inlined underneath.

- [Adapter (claude_code)](${SITE_URL}/q/how-to-add-a-cli-adapter): Declaring a CLI agent in bernstein.yaml - name, adapter, role, model
- [plan.yaml](${SITE_URL}/q/how-to-write-a-bernstein-plan-yaml): Plan-file shape - stages, depends_on, per-step role and complexity
- [MCP server](${SITE_URL}/q/mcp-server-for-multi-agent-coding): Running Bernstein as an MCP server over stdio or HTTP, and the tool tiers
- [Worktree isolation](${SITE_URL}/q/git-worktree-parallel-ai-agents): One git worktree per task; the merge queue serializes results once the gates pass

### Adapter (claude_code)

\`\`\`yaml
# .sdd/bernstein.yaml
agents:
  - name: claude_code
    adapter: claude
    role: backend
    model: sonnet
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

- [Contributing](https://bernstein.readthedocs.io/en/latest/CONTRIBUTING/): How to contribute
- [License](https://github.com/sipyourdrink-ltd/bernstein/blob/main/LICENSE): Apache 2.0
`;
}
