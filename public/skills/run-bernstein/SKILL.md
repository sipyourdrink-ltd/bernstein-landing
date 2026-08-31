---
name: run-bernstein
description: Install Bernstein locally and drive an orchestration run — parallel CLI coding agents in isolated git worktrees with a deterministic, replayable coordination loop.
---

# Run Bernstein

Bernstein is a deterministic orchestrator for CLI coding agents
(Claude Code, Codex, Gemini CLI, and 40+ more). There is no hosted
instance: the orchestrator runs on the machine where it is installed.
This skill covers getting from nothing to a supervised run.

## Install

```
pipx install bernstein
```

(or `uv tool install bernstein`). Air-gapped hosts can use the offline
wheelhouse profile — see the install docs.

## First run

```
cd your-repo
bernstein init
bernstein run "add input validation to the checkout form"
```

`init` writes the project seed; `run` plans the goal into tasks and
spawns agents in per-task git worktrees. No model sits in the
coordination loop, so a rerun of the same plan replays byte-identically
and diverging runs are detectable by hash.

## Watch and control

```
bernstein status      # task states, one line each
bernstein live        # dashboard TUI
bernstein stop        # halt the run
```

## MCP access

The package ships an MCP server (stdio transport) so an agent can drive
runs through tools instead of a shell:

```
bernstein mcp serve
```

Tool surface and card: https://bernstein.run/.well-known/mcp/server-card.json

## Where the docs are

- https://bernstein.readthedocs.io/ — full documentation
- https://github.com/sipyourdrink-ltd/bernstein — source, issues
- https://bernstein.run/llms.txt — this site's corpus index
