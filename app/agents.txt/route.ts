/* /agents.txt - agent-discovery descriptor (agents.txt convention).
 *
 * Middleware DISCOVERY_PATHS and the next.config.mjs header overrides
 * both provisioned this path from day one, but no route or public file
 * ever existed, so the advertised URL 404ed. The body mirrors the
 * docs/agents.txt the bernstein repo ships, plus pointers to the richer
 * machine surfaces this site already serves.
 */
const CONTENT = `User-agent: *
Name: Bernstein
Description: The open-source governance layer for AI agents - no model in the coordination loop, so parallel runs in per-task git worktrees replay byte-identically; signed lineage and an opt-in HMAC audit chain, air-gap friendly
Status: beta (solo-maintained; pin the version you depend on)
Homepage: https://bernstein.run
Repository: https://github.com/sipyourdrink-ltd/bernstein
Package: https://pypi.org/project/bernstein/
Documentation: https://bernstein.readthedocs.io/
API: https://bernstein.readthedocs.io/en/latest/openapi-reference/
Author: Alex Chernysh <https://alexchernysh.com>
Author-X: https://x.com/alex_chernysh
License: Apache-2.0
Category: DeveloperTool, AIOrchestration, MultiAgent
Tags: multi-agent, orchestration, ai-coding, deterministic-scheduling, cli-agents, replay, lineage, provenance, audit

# Machine-readable surfaces on this host
LLM-summary: https://bernstein.run/llms.txt
LLM-full-reference: https://bernstein.run/llms-full.txt
AI-descriptor: https://bernstein.run/ai.txt
Agent-guide: https://bernstein.run/AGENTS.md
Agent-card (A2A): https://bernstein.run/.well-known/agent-card.json
MCP-server-card: https://bernstein.run/.well-known/mcp/server-card.json
OpenAPI: https://bernstein.run/openapi.yaml
`;

export function GET() {
  return new Response(CONTENT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
