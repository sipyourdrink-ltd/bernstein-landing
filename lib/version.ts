/* Offline floor for the published Bernstein CLI version advertised by
   the static agent-discovery surfaces in public/:
     - public/.well-known/agent-card.json      (.version)
     - public/.well-known/mcp/server-card.json (.serverInfo.version)
     - public/structured-data.json             (.softwareVersion)
     - public/agents.json                      (.info.version)
     - public/.well-known/agents.json          (.info.version)
     - public/mcp-catalog.json                 (.version)
     - public/openapi.yaml                     (info.version)
     - data/bernstein-version.json             (.version, build-baked
       fallback for the rendered release pill)

   These are static files served as-is, so they cannot import this
   constant at runtime. scripts/sync-version.mjs rewrites them at build
   time (via the prebuild npm step).

   This constant is NOT the primary source any more. The build script
   resolves the latest published release tag from the GitHub releases
   API on every build and only falls back to this value when the API is
   unreachable, rate-limited, or the build runs air-gapped. That keeps
   the discovery surfaces correct without a manual bump on every
   release - this line drifting stale no longer ships a stale version.

   Bump it anyway when convenient so air-gapped builds stay close to
   reality.

   Keep this file isolated: do not add unrelated exports here. */
export const BERNSTEIN_VERSION = '3.18.2';
