/**
 * /llms-ctx.txt - compact, token-budgeted (< 18 KB) single-pass technical
 * context document for AI assistants and coding agents.
 *
 * Why this exists alongside /llms.txt and /llms-full.txt:
 *   - /llms.txt is a link index; answering deep CLI or architecture questions
 *     from it requires multiple follow-up fetches.
 *   - /llms-full.txt is the exhaustive 700+ line archive (including all Q&A
 *     bodies and blog posts), which exceeds single-tool context caps in many
 *     web-fetch harnesses.
 *   - /llms-ctx.txt packs the high-signal technical facts of Bernstein 4.0.2
 *     into ~1.5k tokens AND explicitly lists every `https://bernstein.run/*.md`
 *     twin URL so assistants whose `web_fetch` tool enforces prior-URL
 *     appearance (such as Claude) can fetch any `.md` twin directly.
 */
import { PROJECT_ONE_LINER, PROJECT_OVERVIEW } from '../../lib/project-description.ts';
import { BERNSTEIN_VERSION } from '../../lib/version.ts';

const CONTENT = `# Bernstein - Compact Technical Context (v${BERNSTEIN_VERSION})

> ${PROJECT_ONE_LINER}

${PROJECT_OVERVIEW}

## Core Facts

- **Latest release**: \`${BERNSTEIN_VERSION}\` (install/upgrade from latest 4.x release; Apache-2.0; Python 3.12+; solo-maintained beta by Alex Chernysh - pin versions in CI)
- **Install**: \`pipx install bernstein\` (also \`uv tool install bernstein\` or \`pip install bernstein\`)
- **Workspace state**: On-disk files under \`.sdd/\` (\`.sdd/runtime/\` backlog & WAL, \`.sdd/worktrees/\` isolated per-task git worktrees, \`.sdd/audit/\` daily UTC HMAC-chained JSONL logs, \`.sdd/metrics/\` per-model cost ledger). No database or hosted control-plane server required.
- **Deterministic coordination**: Plain Python tick loop, task store, dependency graph, and merge queue - zero LLM tokens spent on scheduling. A hand-written \`plan.yaml\` reproduces the same task graph across runs.
- **Adapters (55 selectable CLI agent adapter names)**: Claude Code (\`claude\`), Codex CLI (\`codex\`), Gemini CLI (\`gemini\`), OpenAI Agents SDK (\`openai_agents\`), Cursor, Aider, GitHub Copilot, Amp, Kiro, Kilo, Qwen, Goose, Ollama (local models), OpenHands, OpenCode, Cline, Droid, Crush, Auggie, Mistral, Junie, Devin terminal, Amazon Q Developer, Pydantic AI, Antigravity, Generic CLI wrapper, plus leaf orchestrator delegation adapters (Composio \`@aoagents/ao\`, Ralphex).
- **Sandboxes & storage**: Default local git worktrees; pluggable \`SandboxBackend\` for Docker, Podman, E2B, Modal, Blaxel, Cloudflare, Daytona, Runloop, Vercel; \`BufferedSink\` artifact storage for local disk, S3, GCS, Azure Blob, Cloudflare R2; \`--profile airgap\` denies outbound network by default.
- **Provenance & offline verification**: Lineage spine and replay journal are always on. Passing \`--audit\` (or \`BERNSTEIN_AUDIT=1\`) enables the HMAC-chained audit log and signed Ed25519 receipts checkable offline without rerunning tasks.

## Key CLI Commands (Bernstein ${BERNSTEIN_VERSION})

\`\`\`bash
pipx install bernstein
bernstein init                                              # create .sdd/ + bernstein.yaml
bernstein doctor                                            # check workspace, adapters, and env readiness
bernstein run --dry-run --goal "refactor auth"              # zero-token scheduling + cost preview
bernstein run --plan-only --goal "refactor auth"            # inspect decomposed plan and exit
bernstein run --from-plan plans/auth.yaml --audit           # deterministic plan run with HMAC audit log
bernstein status                                            # one-shot run, task, and spend summary
bernstein live                                              # Textual terminal TUI (or: bernstein gui serve)
bernstein cost                                              # per-agent, per-model, per-task spend breakdown
bernstein audit verify                                      # verify .sdd/audit/ HMAC chain and Merkle seal
bernstein verify run <run-id>                               # emit / verify run receipt
bernstein verify receipt <receipt.json> --public-key <pem>  # offline Ed25519 provenance + integrity check
bernstein govern audit --strict                             # policy conformance (exit 0 pass, 1 fail, 2 unmeasured/usage)
bernstein replay <run-id> --verify                          # recompute journal Merkle head offline
\`\`\`

## MCP & Agent Discovery Endpoints

- **Remote read-only MCP server (Streamable HTTP, anonymous)**: \`claude mcp add --transport http bernstein https://mcp.bernstein.run/mcp\` - exposes \`verify_receipt\`, \`explain_receipt\`, \`verify_chain\`, \`list_presets\`, \`get_preset\`, \`list_adapters\`. Browser receipt verifier: https://mcp.bernstein.run/verify
- **Local orchestration MCP server (stdio or HTTP)**: \`bernstein mcp [--mcp-tier core|standard|all]\` - full tool schemas at https://bernstein.run/mcp-server.json
- **Pre-connection discovery cards**:
  - SEP-1649 MCP Server Card: https://bernstein.run/.well-known/mcp.json
  - SEP-2127 AI Catalog: https://bernstein.run/.well-known/ai-catalog.json
  - RFC 9727 API Catalog: https://bernstein.run/.well-known/api-catalog
  - A2A Agent Card: https://bernstein.run/.well-known/agent-card.json
  - Host Callable Skills: https://bernstein.run/.well-known/skills.json
  - Agent Skills v0.2.0 SHA-256 Index: https://bernstein.run/.well-known/agent-skills/index.json
  - Authentication Policy (none required): https://bernstein.run/auth.md

## CLI Coding Agent Failure Taxonomy v0.1 (CC BY 4.0)

Eight closed-set failure categories in gating priority order, cross-referenced to NIST AI RMF 1.0 and ISO/IEC 42001 (JSON Schema: https://bernstein.run/spec/agent-failure-taxonomy/v0.1.json):
1. \`test_regression\` (critical) - previously-green tests fail after agent run (ISO 42001 A.6.2.5)
2. \`timeout\` (high) - wall-clock or turn budget exhausted (ISO 42001 A.6.2.7)
3. \`scope_creep\` (high) - diff modifies files outside declared \`owned_files\` (ISO 42001 A.7.2)
4. \`conflict\` (high) - concurrent agent merge collision (ISO 42001 A.6.2.8)
5. \`hallucination\` (high) - non-existent symbols/APIs or uncompilable output (ISO 42001 A.6.2.9)
6. \`orientation_miss\` (medium) - >50% of turns spent exploring with no artefact (ISO 42001 A.6.2.4)
7. \`incomplete\` (medium) - voluntary stop with completion signals missing (ISO 42001 A.6.2.6)
8. \`context_miss\` (medium) - missing documentation context or misread brief (ISO 42001 A.5.2)

## Markdown Twins (.md)

Fetch any page below directly as clean \`text/markdown\` (no HTML chrome, works without custom \`Accept\` headers; individual Q&A leaves follow \`/q/<slug>.md\` and blog posts follow \`/blog/<slug>.md\`):

- Site Index: https://bernstein.run/index.md
- CLI Quickstart: https://bernstein.run/cli-quickstart.md
- About & Sourcing: https://bernstein.run/about.md
- Cost & Routing Heuristic: https://bernstein.run/cost.md
- Spec-Driven Walkthrough: https://bernstein.run/spec-driven.md
- Agent Failure Taxonomy v0.1: https://bernstein.run/spec/agent-failure-taxonomy/v0.1.md
- Agent Instruction Linter (agent-md-bench): https://bernstein.run/tools/agent-md-bench.md
- Canonical Answers Index: https://bernstein.run/q.md

## Canonical References

- Documentation: https://docs.bernstein.run/
- Source Repository: https://github.com/sipyourdrink-ltd/bernstein
- PyPI Package: https://pypi.org/project/bernstein/
- Full LLM Reference: https://bernstein.run/llms-full.txt
`;

export function GET(): Response {
  return new Response(CONTENT, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
