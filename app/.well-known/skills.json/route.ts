/**
 * /.well-known/skills.json - what a caller can actually do here.
 *
 * The catalog at /.well-known/api-catalog says which APIs exist and
 * where they are described; this is one of the descriptions it points
 * at, and the only one written for a caller deciding whether to make a
 * request. Each entry names the method, the URL, what goes in and what
 * comes back.
 *
 * Both documents project from `lib/machine-surfaces.ts`. That is the
 * whole design: there is one list of what this host serves, and a
 * surface cannot advertise something the other has never heard of.
 * `tests/machine-surfaces.test.ts` resolves every URL in both against
 * the repo's routes, so neither can advertise a 404 either.
 *
 * The list here is the subset of endpoints a caller has a reason to
 * invoke - `agentCapability` in the shared module. /api/csp-report is
 * in the catalog and not here, because browsers post to it unprompted
 * and nothing else should.
 *
 * There is no auth. /auth.md says so at length, including which of
 * these carry a per-IP limiter.
 */
/* Relative import so the route can be exercised under
   `node --test --experimental-strip-types`. */
import { absolute, agentCapabilities } from '../../../lib/machine-surfaces.ts';

export function GET(): Response {
  const body = {
    skills: agentCapabilities().map((endpoint) => ({
      name: endpoint.name,
      description: endpoint.description,
      method: endpoint.method,
      url: absolute(endpoint.path),
      input: endpoint.input,
      output: endpoint.output,
    })),
  };

  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
