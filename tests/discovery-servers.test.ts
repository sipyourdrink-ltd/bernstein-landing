/**
 * Regression guard for the endpoints the discovery documents advertise.
 *
 * `public/openapi.yaml`, `public/agents.json` and
 * `public/.well-known/agents.json` each declare a `servers` block. All
 * three once carried a single hardcoded `http://127.0.0.1:8052`, which
 * reads to any client as "this is where the API lives" — so a generated
 * SDK, an agent runtime, or anything else that trusts the document
 * pointed itself at the reader's own loopback and failed with a
 * connection error rather than a useful one.
 *
 * The shape that is actually true is a URL *template*: Bernstein's task
 * server runs on the operator's machine, there is no hosted instance,
 * and the host and port are theirs to fill in. OpenAPI 3.0 server
 * variables say exactly that, and this test pins it — a bare loopback
 * `url` must never come back, and the default must stay inside a
 * `variables` block where it is documentation rather than a claim.
 *
 * The two `agents.json` copies exist because the file is fetched both
 * from the site root and from `/.well-known/`. Nothing keeps them in
 * step, so the second test compares them: a fix applied to one copy and
 * not the other is the likeliest way this regresses.
 *
 * Reading YAML without a dependency: the `servers` block is a flat,
 * fully-known fragment, so the test slices it out and parses the two
 * fields it cares about rather than pulling in a YAML parser for one
 * assertion.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const OPENAPI_PATH = path.resolve(process.cwd(), 'public', 'openapi.yaml');
const AGENTS_PATHS = [
  path.resolve(process.cwd(), 'public', 'agents.json'),
  path.resolve(process.cwd(), 'public', '.well-known', 'agents.json'),
];

/**
 * A `url` value that names a loopback interface directly, rather than
 * through a substitutable variable. `{host}` is fine; `127.0.0.1` is
 * not.
 */
const BARE_LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:|\/|$)/i;

/** Every `url:` value under the `servers:` key of the OpenAPI document. */
function openApiServerUrls(raw: string): string[] {
  const lines = raw.split('\n');
  const start = lines.findIndex((line) => /^servers:\s*$/.test(line));
  assert.notEqual(start, -1, 'public/openapi.yaml has no top-level `servers:` key');

  const urls: string[] = [];
  for (const line of lines.slice(start + 1)) {
    // The block ends at the next top-level key.
    if (/^\S/.test(line)) break;
    const match = /^\s*-?\s*url:\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/.exec(line);
    if (match) urls.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  assert.ok(urls.length > 0, 'public/openapi.yaml declares no server url');
  return urls;
}

test('no discovery document advertises a bare loopback as its server', () => {
  const offenders: string[] = [];

  for (const url of openApiServerUrls(fs.readFileSync(OPENAPI_PATH, 'utf8'))) {
    if (BARE_LOOPBACK.test(url)) offenders.push(`public/openapi.yaml -> ${url}`);
  }

  for (const file of AGENTS_PATHS) {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      servers?: Array<{ url?: unknown }>;
    };
    for (const server of doc.servers ?? []) {
      if (typeof server.url === 'string' && BARE_LOOPBACK.test(server.url)) {
        offenders.push(`${path.relative(process.cwd(), file)} -> ${server.url}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'A discovery document names a loopback address as its server url. There is no ' +
      'hosted task server, so the url must stay a template (http://{host}:{port}) ' +
      'with the loopback default declared under `variables`.',
  );
});

test('the server template keeps its host and port substitutable', () => {
  for (const url of openApiServerUrls(fs.readFileSync(OPENAPI_PATH, 'utf8'))) {
    assert.match(
      url,
      /\{host\}/,
      `public/openapi.yaml server url "${url}" has no {host} variable, so a reader cannot point it at their own install`,
    );
  }
});

test('both agents.json copies stay byte-identical', () => {
  const [root, wellKnown] = AGENTS_PATHS.map((file) => fs.readFileSync(file, 'utf8'));
  assert.equal(
    root,
    wellKnown,
    'public/agents.json and public/.well-known/agents.json have drifted. Both are ' +
      'served and clients pick either one, so an edit has to land in both.',
  );
});
