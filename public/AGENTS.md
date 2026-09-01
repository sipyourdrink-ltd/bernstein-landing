# Bernstein

> The open-source governance layer for AI agents. CLI coding agents work out of the box (Claude Code, Codex, Gemini CLI, +40 more). No model in the coordination loop, so replaying a plan reproduces its task graph byte-identically. Signed lineage plus an opt-in HMAC audit chain a reviewer checks offline, without rerunning it. Cluster mode, air-gap deploy.

## What This Is

Bernstein is the open-source governance layer for AI agents. CLI coding agents work out of the box (Claude Code, Codex, Gemini CLI, and 40+ more). Scheduling is plain Python - no LLM in the coordination loop - so runs are reproducible end to end. It decomposes goals into tasks, assigns them to agents with appropriate models and roles, runs every task in its own git worktree behind lint/type/test gates, and merges verified results. An always-on lineage spine and replay journal record what happened; an opt-in HMAC-chained audit log and signed receipts let a reviewer who did not execute the run check it offline, without rerunning it. Signature and hash-chain checks read the on-disk records alone; the HMAC leg needs the key the chain was written with.

## How To Use

Install: `pipx install bernstein`

Run with a goal:
```
bernstein -g "Add JWT auth with refresh tokens, tests, and API docs"
```

Run with a plan file:
```
bernstein run plans/my-project.yaml
```

## API

Task server runs at http://127.0.0.1:8052:
- POST /tasks - create a task
- GET /tasks?status=open - list tasks
- POST /tasks/{id}/complete - mark done
- POST /tasks/{id}/fail - mark failed
- GET /status - system dashboard
- POST /bulletin - post cross-agent finding

## MCP Server

Bernstein exposes an MCP server (`bernstein mcp`, stdio or HTTP transport). Tools are advertised in three cumulative tiers (`--mcp-tier {core|standard|all}`, default `standard`):

- Core: bernstein_run, bernstein_status, bernstein_run_status
- Standard adds: bernstein_approve, bernstein_complete, bernstein_cancel, bernstein_claim, bernstein_post_message, bernstein_post_artifact, bernstein_task_capsule, bernstein_shutdown_orchestrator, load_skill
- All adds: bernstein_scenario, bernstein_verify_lineage

## Key Facts

- Status: beta - solo-maintained, under active development; pin the version you depend on
- License: Apache 2.0
- Language: Python 3.12+
- Adapters: 40+ CLI agent adapters (Claude Code, Codex, Gemini CLI, OpenAI Agents SDK, Cursor, Aider, Cloudflare Agents, GitHub Copilot, Droid, Crush, Auggie, Cline, and more)
- Cloud: Cloudflare Workers with Durable Workflows, V8 sandboxes, R2, D1, Vectorize
- State: File-based (.sdd/), not in-memory
- Orchestrator: Deterministic Python, zero LLM tokens on scheduling
- Always on: lineage spine, replay journal, per-task git worktree isolation, lint/type/test gates
- Opt-in: HMAC-chained audit log and signed receipts for offline verification
- Deployment: air-gap install profile available

## Author

- Alex Chernysh - https://alexchernysh.com
- GitHub - https://github.com/chernistry
- X - https://x.com/alex_chernysh
