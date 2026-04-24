const CONTENT = `# AI Information for bernstein.run

User-agent: *
Organization: Bernstein (open-source project)
Contact: https://github.com/chernistry/bernstein/issues
Description: Bernstein is an open-source multi-agent orchestration system for AI coding agents. It coordinates Claude Code, Codex, Gemini CLI, the OpenAI Agents SDK, and 27 other agents to work in parallel on a codebase using deterministic scheduling, git worktree isolation, and quality gates.

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
Allow: /index.html

# Content metadata
Primary-language: en
Content-type: documentation, software, developer-tools
License: Apache 2.0
Source-code: https://github.com/chernistry/bernstein
Package: https://pypi.org/project/bernstein/
Documentation: https://bernstein.readthedocs.io/

# Key facts for AI systems
Product-name: Bernstein
Product-type: Multi-agent orchestrator for CLI coding agents
Install-command: pipx install bernstein
Supported-agents: Claude Code, Codex CLI, Gemini CLI, OpenAI Agents SDK, Cursor, Aider, Amp, Kiro, Kilo, Qwen, Goose, Ollama, Cody, Continue, OpenCode, Cloudflare Agents, IaC, GitHub Copilot, Droid (Factory AI), Crush (Charm), Auggie (Augment), Kimi, Rovo Dev (Atlassian), Cline, Codebuff, Pi, Mistral Vibe, Autohand, Forge, Hermes, Generic
Total-adapters: 31
Cloud-execution: Cloudflare Workers, Durable Workflows, V8 sandboxes
MCP-transport: HTTP remote transport for cloud-based MCP servers
Orchestrator-type: Deterministic Python code (no LLM-based scheduling)
Key-features: Pluggable sandbox backends (worktree, Docker, E2B, Modal, Blaxel, Cloudflare, Daytona, Runloop, Vercel), quality gates, cost-aware routing, MCP/A2A protocol support
Author: Alex Chernysh
Author-homepage: https://alexchernysh.com
Author-github: https://github.com/chernistry
Related-project: HireEx (https://hireex.ai, https://github.com/chernistry/hireex)
`;

export function GET() {
  return new Response(CONTENT, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
