import { NextResponse } from 'next/server';

/**
 * /api/health - lightweight liveness + version surface.
 *
 * Used by:
 *   - the docker HEALTHCHECK in the Dockerfile (wget probe; only
 *     cares about the 200, not the body)
 *   - the compose-level healthcheck in docker-compose.yml (same
 *     wget probe; gates `condition: service_healthy` consumers)
 *   - the blue-green deploy script on the host
 *     (polls for "healthy" + matches the build SHA against the image
 *     it just pulled, so a stale container is never promoted)
 *   - operator curls during incident response
 *
 * Contract (do not change without updating the deploy script):
 *   - 200 OK
 *   - JSON body: { status: 'ok', sha: <string>, ts: <iso-8601> }
 *   - `sha` is the build SHA, sourced from BUILD_SHA env (set by the
 *     image build at GH Actions time via `--build-arg GIT_SHA=...`).
 *     Empty string when the env is missing (local `npm run dev`,
 *     pre-pipeline test runs). Empty is honest, not a fabricated value.
 *
 * Why force-dynamic:
 *   - The route must reflect process-level liveness at request time.
 *     Caching it at the edge (or pre-rendering) would lie about the
 *     state of THIS container during a blue-green flip - the deploy
 *     script polls THIS container's loopback, not the edge, but we
 *     still want any external probe (CF, uptime monitor) to see the
 *     live state.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      sha: process.env.BUILD_SHA || '',
      ts: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
