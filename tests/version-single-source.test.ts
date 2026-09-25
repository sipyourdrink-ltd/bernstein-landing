/**
 * Guard against the version literal going back to two hand-maintained
 * copies.
 *
 * `lib/version.ts` exports the one `BERNSTEIN_VERSION` literal (the
 * offline floor). `scripts/sync-version.mjs` resolves the live release
 * tag and writes it into every static discovery surface plus
 * `data/bernstein-version.json`, the build-baked fallback the rendered
 * components read. Before that pipeline existed, the hero's release
 * pill and the JSON-LD `softwareVersion` each carried their own
 * hand-typed literal, and the two drifted the moment one was bumped
 * without the other.
 *
 * This test does not re-derive the version pipeline; it pins that the
 * three rendered-component call sites still read the single generated
 * source (`data/bernstein-version.json`) rather than a re-typed
 * literal, and that `lib/version.ts` still exports exactly one
 * `BERNSTEIN_VERSION` literal for the offline floor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const read = (file: string): string =>
  fs.readFileSync(path.resolve(REPO_ROOT, file), 'utf8');

const VERSION_LITERAL_RE = /export\s+const\s+BERNSTEIN_VERSION\s*=\s*['"]([^'"]+)['"]/g;

test('lib/version.ts exports exactly one BERNSTEIN_VERSION literal', () => {
  const src = read('lib/version.ts');
  const matches = [...src.matchAll(VERSION_LITERAL_RE)];
  assert.equal(
    matches.length,
    1,
    'lib/version.ts must define BERNSTEIN_VERSION exactly once - it is the offline floor for every other surface',
  );
  assert.match(matches[0][1], /^\d+\.\d+\.\d+$/);
});

/**
 * Rendered components that display a version must read the build-baked
 * `data/bernstein-version.json` (or fetch it live and fall back to that
 * file), never a re-typed semver literal.
 */
const RENDERED_VERSION_SURFACES = [
  'components/landing/HeroV2.tsx',
  'components/seo/SoftwareApplicationJsonLd.tsx',
];

test('rendered version surfaces import the single generated source, not a literal', () => {
  for (const file of RENDERED_VERSION_SURFACES) {
    const src = read(file);
    assert.match(
      src,
      /from ['"]@\/data\/bernstein-version\.json['"]/,
      `${file} must import data/bernstein-version.json rather than hard-coding a version string`,
    );
    assert.doesNotMatch(
      src,
      /['"]v?\d+\.\d+\.\d+['"]/,
      `${file} contains a literal semver string - it must read the version from data/bernstein-version.json instead`,
    );
  }
});

test('every static discovery surface synced by scripts/sync-version.mjs carries the same version', () => {
  const version = (JSON.parse(read('data/bernstein-version.json')) as { version: string })
    .version;
  assert.match(version, /^\d+\.\d+\.\d+$/);

  const jsonSurfaces: Array<{ file: string; get: (d: unknown) => unknown }> = [
    { file: 'public/.well-known/agent-card.json', get: (d) => (d as any).version },
    { file: 'public/.well-known/agent-card.json', get: (d) => (d as any).agentVersion },
    {
      file: 'public/.well-known/mcp/server-card.json',
      get: (d) => (d as any).serverInfo.version,
    },
    {
      file: 'public/structured-data.json',
      get: (d) =>
        (d as any)['@graph'].find((n: any) => n['@type'] === 'SoftwareApplication')
          .softwareVersion,
    },
    { file: 'public/agents.json', get: (d) => (d as any).info.version },
    { file: 'public/.well-known/agents.json', get: (d) => (d as any).info.version },
    { file: 'public/mcp-server.json', get: (d) => (d as any).version },
  ];

  for (const { file, get } of jsonSurfaces) {
    const data = JSON.parse(read(file));
    assert.equal(
      get(data),
      version,
      `${file} version has drifted from data/bernstein-version.json (${version}) - re-run scripts/sync-version.mjs`,
    );
  }

  const openapi = read('public/openapi.yaml');
  assert.match(
    openapi,
    new RegExp(`^\\s{2}version:\\s*${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm'),
    `public/openapi.yaml info.version has drifted from data/bernstein-version.json (${version})`,
  );
});
