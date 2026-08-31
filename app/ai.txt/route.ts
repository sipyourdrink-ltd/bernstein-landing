/* Adapter count comes from the build-baked figure in
   data/adapter-count.json, written by scripts/sync-adapter-count.mjs
   from the same registry parse the request-time helper uses. It used to
   be a literal here and disagreed with the CLI catalogue, the repo
   README and the /why-bernstein copy at the same time. */
import adapterCount from '../../data/adapter-count.json' with { type: 'json' };

const CONTENT = `# AI Information for bernstein.run

User-agent: *
Organization: Bernstein (open-source project)
Contact: https://github.com/sipyourdrink-ltd/bernstein/issues
Description: Bernstein is the open-source governance layer for AI agents (Claude Code, Codex, Gemini CLI, and 40+ more). Scheduling is plain Python - no LLM in the coordination loop - so runs are reproducible end to end. Every task runs in its own git worktree behind lint/type/test gates. An always-on lineage spine and replay journal record what happened; an opt-in HMAC-chained audit log and signed receipts let a reviewer who did not execute the run check it offline, without rerunning it. Signature and hash-chain checks read the on-disk records alone; the HMAC leg needs the key the chain was written with. Cluster mode and an air-gap install profile included. Apache-2.0.

# Permissions
Crawl-delay: 0
Allow: /llms.txt
Allow: /llms-full.txt
Allow: /ai.txt
Allow: /robots.txt
Allow: /sitemap.xml
Allow: /structured-data.json
Allow: /openapi.yaml
Allow: /agents.json
Allow: /AGENTS.md
Allow: /.well-known/agent-card.json
Allow: /.well-known/mcp/server-card.json
Allow: /auth.md

# Content metadata
Primary-language: en
Content-type: documentation, software, developer-tools
License: Apache 2.0
Source-code: https://github.com/sipyourdrink-ltd/bernstein
Package: https://pypi.org/project/bernstein/
Documentation: https://bernstein.readthedocs.io/
Release-notes: https://bernstein.readthedocs.io/en/latest/CHANGELOG/
Issue-tracker: https://github.com/sipyourdrink-ltd/bernstein/issues
Contact-email: forte@bernstein.run

# Key facts for AI systems
Product-name: Bernstein
Product-type: The open-source governance layer for AI agents with offline-verifiable run records
Status: beta (solo-maintained; pin the version you depend on)
Primary-use-cases: Parallel feature work across many CLI agents, reproducible unattended CI fleets with per-agent credential scoping, audit-and-replay of past runs
Install-command: pipx install bernstein
Supported-agents: Claude Code, Codex CLI, Gemini CLI, OpenAI Agents SDK, Cursor, Aider, Amp, Kiro, Kilo, Qwen, Goose, Ollama, Cody, Continue, OpenCode, OpenHands, Open Interpreter, IaC, GitHub Copilot, Droid (Factory AI), Crush (Charm), Auggie (Augment), Kimi, Kimchi, Rovo Dev (Atlassian), Cline, Codebuff, Pi, Mistral, Muse Code, Plandex, Junie, gptme, Letta Code, Devin terminal, Amazon Q Developer, CLM, agy, aichat, Pydantic AI, Antigravity, Python runtime, Computer use, Autohand, Forge, Hermes, Generic
Delegated-orchestrators: Composio (@aoagents/ao), Ralphex (umputun/ralphex)
Total-adapters: ${adapterCount.count}
Agent-plugin-manifests: plugin.json and mcp.json at the repository root (Agent Plugins v1.0.0 schema)
Cloud-execution: Cloudflare Workers, Durable Workflows, V8 sandboxes
MCP-transport: HTTP remote transport for cloud-based MCP servers
Orchestrator-type: Deterministic Python code (no LLM-based scheduling)
Always-on: Deterministic plain-Python scheduling, lineage spine, replay journal, per-task git worktree isolation, lint/type/test gates
Opt-in: HMAC-chained audit log and signed receipts for offline verification
Key-features: Pluggable sandbox backends (worktree, Docker, E2B, Modal, Blaxel, Cloudflare, Daytona, Runloop, Vercel), quality gates, cost-aware routing, MCP/A2A protocol support, air-gap install profile
Author: Alex Chernysh
Author-homepage: https://alexchernysh.com
Author-github: https://github.com/chernistry
Author-x: https://x.com/alex_chernysh
`;

export function GET() {
  return new Response(CONTENT, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
