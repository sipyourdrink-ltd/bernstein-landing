/**
 * The markdown view of a page: what `/api/_markdown` serves once
 * middleware has decided a request asked for markdown (either via
 * `Accept: text/markdown` negotiation or via an explicit `/*.md` URL twin),
 * plus the shared `enrichLlmsTxt` projection used by `/llms.txt`, `/`, and `/index.md`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { getAllSeedItems, getSeedItem } from './ask-seed.ts';
import {
  CANONICAL_PUBLIC_ORIGIN,
  markdownTargetFor,
  markdownTwinTargetFor,
  type MarkdownTarget,
  type StaticMarkdownPage,
} from './markdown-negotiation.ts';

const BLOG_DIR = path.resolve(process.cwd(), 'content', 'blog');

export const MARKDOWN_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/markdown; charset=utf-8',
  'Cache-Control': 'no-store',
  Vary: 'Accept',
  'Content-Signal': 'search=yes, ai-input=yes, ai-train=yes',
};

function estimateMarkdownTokens(body: string): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(body, 'utf8') / 4));
}

function markdown(
  body: string,
  status = 200,
  extraHeaders?: Readonly<Record<string, string>>,
): Response {
  return new Response(body, {
    status,
    headers: {
      ...MARKDOWN_HEADERS,
      'X-Markdown-Tokens': String(estimateMarkdownTokens(body)),
      ...extraHeaders,
    },
  });
}

/**
 * Idempotently enrich `buildLlmsTxt()` output with canonical site pages,
 * explicit `.md` twin entry points (for Claude `web_fetch` prior-URL
 * validation), `/llms-ctx.txt`, and `.well-known` discovery manifests,
 * strictly preserving the single-occurrence absolute URL invariant.
 */
export function enrichLlmsTxt(raw: string): string {
  const sitePageEntries: ReadonlyArray<{ url: string; line: string }> = [
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/q`,
      line: `- [Canonical answers](${CANONICAL_PUBLIC_ORIGIN}/q): Index of short, citable Q&A pages covering architecture, parallel agents, sandboxes, and offline audit verification`,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/q.md`,
      line: `- [Canonical answers (Markdown twin)](${CANONICAL_PUBLIC_ORIGIN}/q.md): Direct Markdown index of all \`/q/<slug>.md\` canonical answers`,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/cli-quickstart.md`,
      line: `- [CLI quickstart (Markdown twin)](${CANONICAL_PUBLIC_ORIGIN}/cli-quickstart.md): Five-minute install, config, run, and offline receipt verification walkthrough in plain Markdown`,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/cost.md`,
      line: `- [Cost methodology (Markdown twin)](${CANONICAL_PUBLIC_ORIGIN}/cost.md): Cheapest-passing-test routing heuristic and model-price table methodology in plain Markdown`,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/spec-driven`,
      line: `- [Spec-driven walkthrough](${CANONICAL_PUBLIC_ORIGIN}/spec-driven): Five-stage planning loop (spec, checklist, tasks, implement, review) with verified CLI commands`,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/spec/agent-failure-taxonomy/v0.1`,
      line: `- [Agent Failure Taxonomy v0.1](${CANONICAL_PUBLIC_ORIGIN}/spec/agent-failure-taxonomy/v0.1): Eight-category closed-set failure vocabulary mapped to NIST AI RMF 1.0 and ISO/IEC 42001`,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/spec/agent-failure-taxonomy/v0.1.md`,
      line: `- [Agent Failure Taxonomy v0.1 (Markdown twin)](${CANONICAL_PUBLIC_ORIGIN}/spec/agent-failure-taxonomy/v0.1.md): Full taxonomy table and schema fields in plain Markdown`,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/about`,
      line: `- [About & sourcing](${CANONICAL_PUBLIC_ORIGIN}/about): Maintainer identity, how comparison and benchmark claims are sourced, and bias disclosure`,
    },
  ];

  const resourceEntries: ReadonlyArray<{ url: string; line: string }> = [
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/llms-ctx.txt`,
      line: `- [Compact LLM Context](${CANONICAL_PUBLIC_ORIGIN}/llms-ctx.txt): Token-budgeted (< 18 KB) single-pass technical summary of Bernstein 4.0.2, MCP endpoints, and \`.md\` twin URLs`,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/.well-known/mcp.json`,
      line: `- [MCP Server Card (SEP-1649)](${CANONICAL_PUBLIC_ORIGIN}/.well-known/mcp.json): Pre-connection MCP discovery card pointing at \`https://mcp.bernstein.run/mcp\` and local \`bernstein mcp\``,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/.well-known/ai-catalog.json`,
      line: `- [AI Catalog (SEP-2127)](${CANONICAL_PUBLIC_ORIGIN}/.well-known/ai-catalog.json): Machine-readable AI capability catalog indexing this domain's MCP server cards`,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/.well-known/api-catalog`,
      line: `- [API Catalog (RFC 9727)](${CANONICAL_PUBLIC_ORIGIN}/.well-known/api-catalog): RFC 9264 linkset indexing every endpoint and discovery document served by this origin`,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/.well-known/skills.json`,
      line: `- [Host Skills Index](${CANONICAL_PUBLIC_ORIGIN}/.well-known/skills.json): Callable anonymous HTTP capabilities exposed on this origin`,
    },
    {
      url: `${CANONICAL_PUBLIC_ORIGIN}/.well-known/agent-skills/index.json`,
      line: `- [Agent Skills Discovery](${CANONICAL_PUBLIC_ORIGIN}/.well-known/agent-skills/index.json): Agent Skills v0.2.0 manifest with SHA-256 digests for SKILL.md artefacts`,
    },
  ];

  let out = raw;
  const existingUrls = new Set(out.match(/https?:\/\/[^)\s]+/g) ?? []);

  const missingSiteLines = sitePageEntries
    .filter((e) => !existingUrls.has(e.url))
    .map((e) => {
      existingUrls.add(e.url);
      return e.line;
    });

  if (missingSiteLines.length > 0 && out.includes('\n## Resources\n')) {
    out = out.replace('\n## Resources\n', `\n${missingSiteLines.join('\n')}\n\n## Resources\n`);
  }

  const missingResourceLines = resourceEntries
    .filter((e) => !existingUrls.has(e.url))
    .map((e) => {
      existingUrls.add(e.url);
      return e.line;
    });

  if (missingResourceLines.length > 0 && out.includes('\n## Primitives\n')) {
    out = out.replace('\n## Primitives\n', `\n${missingResourceLines.join('\n')}\n\n## Primitives\n`);
  }

  return out;
}

export function isPublished(source: string): boolean {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!match) return false;
  return !/^draft:\s*true\s*$/m.test(match[1]!);
}

async function blogPostBody(slug: string): Promise<{ body: string; status: 200 | 404 }> {
  const file = path.resolve(BLOG_DIR, slug, 'index.mdx');
  if (path.dirname(path.dirname(file)) !== BLOG_DIR) {
    return { body: '# Not found\n', status: 404 };
  }

  let source: string;
  try {
    source = await fs.readFile(file, 'utf8');
  } catch {
    return { body: '# Not found\n', status: 404 };
  }

  if (!isPublished(source)) return { body: '# Not found\n', status: 404 };

  return { body: source, status: 200 };
}

async function qaIndexBody(): Promise<{ body: string; status: 200 }> {
  const items = await getAllSeedItems();
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const tag = item.tags[0] ?? 'other';
    const bucket = groups.get(tag) ?? [];
    bucket.push(item);
    groups.set(tag, bucket);
  }

  const sections = [...groups.entries()].map(([tag, groupItems]) => {
    const entries = groupItems
      .map(
        (it) =>
          `- [${it.q}](${CANONICAL_PUBLIC_ORIGIN}/q/${it.slug}) ([.md](${CANONICAL_PUBLIC_ORIGIN}/q/${it.slug}.md))`,
      )
      .join('\n');
    return `## ${tag} (${groupItems.length})\n\n${entries}`;
  });

  const body = [
    '# Canonical Answers - Bernstein',
    '',
    `Canonical URL: ${CANONICAL_PUBLIC_ORIGIN}/q`,
    `Markdown URL: ${CANONICAL_PUBLIC_ORIGIN}/q.md`,
    '',
    `${items.length} short, citable answers on Bernstein architecture, CLI usage, parallel git worktree agents, sandboxes, and offline audit verification. Fetch any \`/q/<slug>.md\` URL directly or negotiate \`Accept: text/markdown\` on \`/q/<slug>\`.`,
    '',
    ...sections,
    '',
  ].join('\n');

  return { body, status: 200 };
}

async function qaItemBody(slug: string): Promise<{ body: string; status: 200 | 404 }> {
  const item = await getSeedItem(slug);
  if (!item) return { body: '# Not found\n', status: 404 };

  const related = item.related.map((r) =>
    r.startsWith('/') ? `${CANONICAL_PUBLIC_ORIGIN}${r}` : `${CANONICAL_PUBLIC_ORIGIN}/q/${r}`,
  );

  const lines = [
    `# ${item.q}`,
    '',
    `Canonical URL: ${CANONICAL_PUBLIC_ORIGIN}/q/${item.slug}`,
    `Markdown URL: ${CANONICAL_PUBLIC_ORIGIN}/q/${item.slug}.md`,
    item.tags.length > 0 ? `Tags: ${item.tags.join(', ')}` : null,
    '',
    item.a,
    ...(related.length > 0 ? ['', '## Related', '', ...related.map((u) => `- ${u}`)] : []),
    '',
  ].filter((x): x is string => x !== null);

  return { body: lines.join('\n'), status: 200 };
}

const STATIC_MARKDOWN_PAGES: Readonly<Record<StaticMarkdownPage, string>> = {
  about: `# about bernstein.run

Canonical URL: https://bernstein.run/about

## who

bernstein.run is the project site for [bernstein](https://github.com/sipyourdrink-ltd/bernstein), an open-source governance layer for ai agents (claude code, codex, cursor, aider, gemini cli, and the rest of the 55 selectable cli agent adapter names work out of the box). built and maintained by [alex chernysh](https://alexchernysh.com) as a solo project, self-bootstrapped, apache 2.0.

- GitHub: https://github.com/chernistry
- X: https://x.com/alex_chernysh
- PyPI: https://pypi.org/project/bernstein/
- Contact: forte@bernstein.run

## why this project exists

bernstein is a deterministic python scheduler in front of whichever cli coding agents you already trust, with parallel git worktrees, lint/type/test quality gates, and an opt-in hmac-chained audit log plus signed receipts so runs are reproducible and checkable offline.

## how content is sourced & bias disclosure

every blog post carries a publish date in frontmatter. comparisons under \`/vs\` cite upstream documentation directly; numbers on \`/benchmarks\` label simulation vs community \`bernstein cost --json\` runs; model prices on \`/cost\` record capture dates. because the author builds bernstein, comparison pages link upstream docs at the top so claims can be audited directly; report inaccuracies at https://github.com/sipyourdrink-ltd/bernstein/issues.
`,
  cost: `# cost

Canonical URL: https://bernstein.run/cost

the bernstein router picks the cheapest model that still passes your tests on each task. the interactive calculator on https://bernstein.run/cost lets you enter your monthly claude, codex, or cursor bills and see what the math suggests for your repo. heuristic, not a promise.

## how the band is computed

- **routable fraction (40-80% heuristic):** fraction of tasks bernstein can route from a flagship tier to a cheaper tier without failing lint, type-check, or test gates. on repos with flaky tests, cheaper models fail gates and fall back to the premium model, pushing savings toward zero; on repos with tight tests and mechanical refactors, savings skew higher.
- **per-task cost spread (~75% blended saving on routable tasks):** flagship and cheap-tier models typically sit one to two orders of magnitude apart on input pricing per 1m tokens. on a $600/month combined claude + codex + cursor bill, that heuristic suggests roughly $180-360/month shifted as a band rather than a single point estimate.
- **static cascade vs contextual bandit:** bernstein defaults to a deterministic static routing cascade over task complexity, scope, and role. passing \`--routing bandit\` enables a linucb contextual bandit (\`src/bernstein/core/routing/bandit_router.py\`) whose reward weights gate pass rate against normalised token cost.
- **auditable price sources:** model prices on \`/cost\` refresh every six hours from the openrouter catalogue (with a dated committed fallback) and link directly to https://claude.com/pricing, https://platform.openai.com/docs/pricing, https://ai.google.dev/gemini-api/docs/pricing, and https://openrouter.ai/models.
- **real repo measurement:** install with \`pipx install bernstein\` and run \`bernstein cost\` after a run to read actual per-model and per-task spend from \`.sdd/metrics/\` on disk.
`,
  'cli-quickstart': `# cli quickstart

Canonical URL: https://bernstein.run/cli-quickstart

Five minutes from a clean checkout to a verified run (Python 3.12+, Apache 2.0).

## 1. install Bernstein

\`\`\`bash
pipx install bernstein
# alternatives: uv tool install bernstein | pip install bernstein
\`\`\`

## 2. initialise the workspace

\`\`\`bash
cd /path/to/your/project
bernstein init
bernstein doctor
\`\`\`

Creates \`.sdd/\` (state, backlog, metrics, traces), \`bernstein.yaml\`, \`templates/\`, and \`.sdd/config.yaml\`.

## 3. configure agents in bernstein.yaml

\`\`\`yaml
goal: "Add JWT auth to the /login endpoint"
cli: claude          # one of 55 selectable adapter names, or auto
model: sonnet
team: [backend, qa]
max_agents: 6
budget: "$5"
\`\`\`

## 4. run a goal

\`\`\`bash
bernstein run --dry-run
bernstein run --plan-only
bernstein run --audit --goal "Add JWT auth to the /login endpoint"
\`\`\`

Key flags: \`--dry-run\` (zero token spend preview), \`--plan-only\` (inspect decomposed plan and exit), \`--auto-approve\`, \`--profile airgap\` (with \`--allow-network\`), \`--audit\` (enable HMAC-chained audit log under \`.sdd/audit/\`).

## 5. inspect status and verify offline

\`\`\`bash
bernstein status
bernstein live
bernstein audit verify
bernstein verify receipt <receipt.json> --public-key <key.pub.pem>
\`\`\`

## connect an agent over mcp

\`\`\`bash
claude mcp add --transport http bernstein https://mcp.bernstein.run/mcp
\`\`\`

Read-only anonymous Streamable HTTP verifier tools: \`verify_receipt\`, \`explain_receipt\`, \`verify_chain\`, \`list_presets\`, \`get_preset\`, \`list_adapters\`. Browser verifier: https://mcp.bernstein.run/verify.
`,
  'spec-driven': `# Spec-driven development with Bernstein: a walkthrough

Canonical URL: https://bernstein.run/spec-driven

Loop: \`spec -> checklist -> tasks -> implement -> review\`. Decomposing a free-text goal is one LLM call; starting from a hand-written \`plan.yaml\` makes the entire chain deterministic Python. All state lives on disk under \`.sdd/\`.

## Stage 1: Spec - state the intent
\`\`\`bash
bernstein init && bernstein run --goal "<goal>"
\`\`\`

## Stage 2: Checklist - review the decomposed plan
\`\`\`bash
bernstein run --plan-only   # or --dry-run for scheduling + cost preview
\`\`\`

## Stage 3: Tasks - the graph the scheduler builds
\`\`\`bash
bernstein run --from-plan plan.yaml
\`\`\`

## Stage 4: Implement - one agent per worktree
Each eligible task runs in an isolated git worktree under \`.sdd/worktrees/\` with role-based model routing (or \`--routing bandit\`).

## Stage 5: Review - gates, then the merge decision
\`\`\`bash
bernstein approve <task-id>   # or bernstein reject
bernstein wrap-up
\`\`\`

State directories: \`.sdd/runtime/\` (backlog, tokens, WAL), \`.sdd/audit/\` (opt-in HMAC-chained JSONL log), \`.sdd/metrics/\` (cost ledger for \`bernstein cost\`).
`,
  'agent-failure-taxonomy-v0.1': `# CLI Coding Agent Failure Taxonomy v0.1

Canonical URL: https://bernstein.run/spec/agent-failure-taxonomy/v0.1
JSON Schema: https://bernstein.run/spec/agent-failure-taxonomy/v0.1.json
Changelog: https://bernstein.run/spec/agent-failure-taxonomy/CHANGELOG.md
Version: 0.1.0 | Published: 2026-05-19 | License: CC BY 4.0

Closed-set eight-category vocabulary for classifying failed or degraded CLI coding agent task outcomes, cross-referenced to NIST AI RMF 1.0 and ISO/IEC 42001.

## Categories (in gating priority order)

| Priority | ID | Severity | NIST AI RMF | ISO/IEC 42001 | Operational Signal |
| --- | --- | --- | --- | --- | --- |
| 1 | \`test_regression\` | critical | validity, robustness | A.6.2.5 (regression handling) | previously-green tests fail after the agent run |
| 2 | \`timeout\` | high | validity, robustness | A.6.2.7 (resource budgeting) | wall-clock or turn-count limit reached before completion signals satisfied |
| 3 | \`scope_creep\` | high | validity, security | A.7.2 (data and asset boundaries) | diff touches paths outside the declared owned_files set |
| 4 | \`conflict\` | high | robustness | A.6.2.8 (concurrency control) | merge or apply step fails because of an overlapping edit by another agent |
| 5 | \`hallucination\` | high | validity, security | A.6.2.9 (factuality and grounding) | code does not compile, or imports/calls reference non-existent symbols |
| 6 | \`orientation_miss\` | medium | validity | A.6.2.4 (performance evaluation of AI components) | more than half of turns spent in exploration before any artefact is produced |
| 7 | \`incomplete\` | medium | validity | A.6.2.6 (output verification) | one or more required completion signals are missing at run end |
| 8 | \`context_miss\` | medium | validity | A.5.2 (training and contextual data adequacy) | agent explicitly reports missing information or misreads the brief |

## Required Schema Fields

\`task_id\`, \`category\`, \`severity\` (\`low\` | \`medium\` | \`high\` | \`critical\`). Optional: \`details\`, \`files_involved\`, \`agent\`, \`model\`, \`trace_url\`, \`timestamp\`. Successful tasks emit no failure record.
`,
  'agent-md-bench': `# agent-md-bench - AGENTS.md / CLAUDE.md linter

Canonical URL: https://bernstein.run/tools/agent-md-bench

100% client-side browser utility (no login, nothing leaves the page) that counts tokens and bytes, checks per-agent context budgets, and flags parser quirks across CLI coding agents:

- **claude code**: 200-line soft cap; YAML frontmatter is ignored and burns tokens; subdirectory \`CLAUDE.md\` requires \`--add-dir\`.
- **cursor**: \`.mdc\` requires YAML frontmatter; legacy \`.cursorrules\` is undocumented; <= 500 lines per \`.mdc\`.
- **codex (openai)**: reads \`AGENTS.md\` only; dense bullet lists parse cleaner than prose walls.
- **aider**: reads \`CONVENTIONS.md\` only when listed in \`.aider.conf.yml\` (ignores \`AGENTS.md\` / \`CLAUDE.md\`).
- **gemini cli**: reads \`GEMINI.md\` (case-sensitive on Linux).
- **opencode**: reads \`AGENTS.md\` by convention.
- **cross-cutting**: non-standard \`max-tool-budget\` directive, HTML comments burning tokens, prompt-cache penalty above 16 KB, missing \`## Build & test\` section.

Adapter implementations: https://github.com/sipyourdrink-ltd/bernstein/tree/main/src/bernstein/adapters
`,
};

export type SiteIndexBuilder = () => Promise<string>;

const defaultSiteIndex: SiteIndexBuilder = async () => {
  const { buildLlmsTxt } = await import('./seo.ts');
  return enrichLlmsTxt(await buildLlmsTxt());
};

async function resolveTargetBody(
  target: MarkdownTarget,
  buildSiteIndex: SiteIndexBuilder,
): Promise<{ body: string; status: 200 | 404 }> {
  switch (target.kind) {
    case 'site-index':
      return { body: await buildSiteIndex(), status: 200 };
    case 'blog-post':
      return blogPostBody(target.slug);
    case 'qa-index':
      return qaIndexBody();
    case 'qa-item':
      return qaItemBody(target.slug);
    case 'static-page':
      return { body: STATIC_MARKDOWN_PAGES[target.page], status: 200 };
  }
}

export async function serveMarkdown(
  requestedPath: string,
  buildSiteIndex: SiteIndexBuilder = defaultSiteIndex,
): Promise<Response> {
  const twin = markdownTwinTargetFor(requestedPath);
  if (twin) {
    if (!twin.target || !twin.canonicalPath) {
      return markdown('# Not found\n', 404, { 'X-Robots-Tag': 'noindex' });
    }
    const rendered = await resolveTargetBody(twin.target, buildSiteIndex);
    if (rendered.status === 404) {
      return markdown(rendered.body, 404, { 'X-Robots-Tag': 'noindex' });
    }
    return markdown(rendered.body, 200, {
      'X-Robots-Tag': 'noindex, follow',
      Link: `<${CANONICAL_PUBLIC_ORIGIN}${twin.canonicalPath}>; rel="canonical"`,
    });
  }

  const target = markdownTargetFor(requestedPath);
  if (!target) return markdown('# Not found\n', 404);

  const rendered = await resolveTargetBody(target, buildSiteIndex);
  return markdown(rendered.body, rendered.status);
}
