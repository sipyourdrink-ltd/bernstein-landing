/**
 * `public/openapi.yaml` and `public/mcp-catalog.json` describe software
 * that lives in another repository, and both are advertised from
 * robots.txt, ai.txt, the agent card and the API catalogue as machine
 * surfaces an agent may act on.
 *
 * They rotted once, quietly: the catalogue named twelve MCP tools while
 * the server registered twenty-five, and the API document described
 * seven endpoints out of four hundred and fifty-five. Nothing failed,
 * because nothing was checking. `scripts/sync-mcp-catalog.mjs` and
 * `scripts/sync-openapi.mjs` regenerate both from the bernstein
 * checkout, and these tests are the part that runs where that checkout
 * is absent - CI, a contributor's clone - and still notices.
 *
 * What they can prove without upstream:
 *
 *   1. Both documents claim the release the rest of the site claims.
 *      `scripts/sync-version.mjs` resolves that from the published
 *      releases, so it stays current with no checkout at all; a
 *      document left behind is a document nobody regenerated.
 *   2. Both are structurally whole - every tool carries a callable
 *      contract, every advertised path has an operation.
 *   3. Neither has collapsed to a token subset. This is the assertion
 *      that would have caught the original drift: a document describing
 *      a fraction of the surface reads, to a client, exactly like a
 *      document describing all of it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const ROOT = process.cwd();

const version = (
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bernstein-version.json'), 'utf8')) as {
    version: string;
  }
).version;

const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'public', 'mcp-catalog.json'), 'utf8'),
) as {
  version: string;
  tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
};

const openapi = YAML.parse(
  fs.readFileSync(path.join(ROOT, 'public', 'openapi.yaml'), 'utf8'),
) as {
  openapi: string;
  info: { version: string; title: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, Record<string, unknown>>;
};

/* Floors, not exact counts. An exact count turns every upstream release
   into a red build for no reason; a floor only fires when a document has
   lost most of what it describes, which is the failure that happened. */
const MIN_TOOLS = 20;
const MIN_PATHS = 100;

test('the MCP catalogue claims the release the rest of the site claims', () => {
  assert.equal(
    catalog.version,
    version,
    'public/mcp-catalog.json is behind data/bernstein-version.json. Run ' +
      '`node scripts/sync-mcp-catalog.mjs` against a bernstein checkout.',
  );
});

test('the OpenAPI document claims the release the rest of the site claims', () => {
  assert.equal(
    openapi.info.version,
    version,
    'public/openapi.yaml is behind data/bernstein-version.json. Run ' +
      '`node scripts/sync-openapi.mjs` against a bernstein checkout.',
  );
});

test('every catalogued tool carries a contract a client can call', () => {
  assert.ok(Array.isArray(catalog.tools), 'mcp-catalog.json: tools[] missing');
  const seen = new Set<string>();
  for (const tool of catalog.tools) {
    assert.match(tool.name, /^[a-z][a-z0-9_]*$/, `tool name is not a callable identifier: ${tool.name}`);
    assert.ok(!seen.has(tool.name), `duplicate tool ${tool.name}`);
    seen.add(tool.name);
    assert.ok(
      typeof tool.description === 'string' && tool.description.length > 0,
      `${tool.name}: no description; a client has nothing to show`,
    );
    assert.equal(
      (tool.input_schema as { type?: string })?.type,
      'object',
      `${tool.name}: input_schema is not a JSON Schema object`,
    );
  }
});

test('the catalogue still describes the whole tool set', () => {
  assert.ok(
    catalog.tools.length >= MIN_TOOLS,
    `mcp-catalog.json lists ${catalog.tools.length} tools (floor ${MIN_TOOLS}). ` +
      'A catalogue that has shrunk to a subset tells a client the missing tools ' +
      'do not exist. Regenerate it before shipping.',
  );
});

test('the OpenAPI document still describes the whole API', () => {
  const count = Object.keys(openapi.paths ?? {}).length;
  assert.ok(
    count >= MIN_PATHS,
    `public/openapi.yaml describes ${count} paths (floor ${MIN_PATHS}). ` +
      'A service-desc link pointing at a fraction of the surface is ' +
      'indistinguishable, to a caller, from one pointing at all of it.',
  );
});

test('every advertised path carries at least one operation', () => {
  const METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);
  const empty = Object.entries(openapi.paths ?? {})
    .filter(([, item]) => !Object.keys(item ?? {}).some((k) => METHODS.has(k)))
    .map(([p]) => p);
  assert.deepEqual(empty, [], 'paths advertised with no operation on them');
});

test('the document says the task server runs on the reader machine, not here', () => {
  /* The whole reason this file is published from bernstein.run rather
     than only from the package: a reader who finds a REST spec assumes
     a hosted endpoint. The `servers` template says otherwise, and the
     one path this origin does answer carries its own entry. */
  assert.ok(openapi.servers?.length, 'openapi.yaml: no servers block');
  assert.match(openapi.servers![0].url, /\{host\}/, 'the task-server entry is not a URL template');
  assert.ok(
    openapi.paths['/api/csp-report'],
    '/api/csp-report is the one path this origin answers and it is gone from the document',
  );
});
