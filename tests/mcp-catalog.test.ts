/**
 * `/mcp-catalog.json` is the default source of `bernstein mcp catalog`.
 * The client validates it strictly (`validate_catalog` in
 * `bernstein.core.protocols.mcp_catalog.manifest`, schema in
 * `docs/reference/mcp-catalog-schema.json`): one unknown or missing field
 * anywhere rejects the whole document and the client falls back to its
 * mirror or cache. The path once served a description of Bernstein's own
 * MCP server instead - a different document, now at `/mcp-server.json` -
 * and every fetch was rejected with nothing on this side noticing.
 *
 * These tests restate the client's rules so a document the client would
 * reject never ships. They run without a bernstein checkout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'public', 'mcp-catalog.json'), 'utf8'),
) as Record<string, unknown>;

const TOP_LEVEL = ['entries', 'generated_at', 'version'];
const ENTRY_REQUIRED = [
  'id',
  'name',
  'description',
  'homepage',
  'repository',
  'install_command',
  'version_pin',
  'transports',
  'verified_by_bernstein',
];
const ENTRY_OPTIONAL = ['auto_upgrade', 'signature', 'command', 'args', 'env'];
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const TRANSPORTS = new Set(['stdio', 'http', 'sse']);

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isStringList = (v: unknown, minItems: number) =>
  Array.isArray(v) && v.length >= minItems && v.every(isNonEmptyString);

test('the catalogue has exactly the top-level fields the client accepts', () => {
  assert.deepEqual(Object.keys(catalog).sort(), TOP_LEVEL);
  assert.equal(catalog.version, 1, 'the client understands schema version 1 only');
  assert.ok(isNonEmptyString(catalog.generated_at));
  assert.ok(
    !Number.isNaN(Date.parse(catalog.generated_at as string)),
    'generated_at is not an ISO-8601 timestamp',
  );
  assert.ok(Array.isArray(catalog.entries), 'entries must be a list');
});

test('every entry passes the client entry rules', () => {
  const entries = catalog.entries as Array<Record<string, unknown>>;
  const allowed = new Set([...ENTRY_REQUIRED, ...ENTRY_OPTIONAL]);
  const seen = new Set<string>();

  entries.forEach((entry, i) => {
    const at = `entries[${i}]`;
    assert.ok(entry && typeof entry === 'object' && !Array.isArray(entry), `${at} is not an object`);
    for (const key of ENTRY_REQUIRED) assert.ok(key in entry, `${at} missing ${key}`);
    for (const key of Object.keys(entry)) assert.ok(allowed.has(key), `${at} has unknown field ${key}`);

    for (const key of ['id', 'name', 'description', 'homepage', 'repository', 'version_pin']) {
      assert.ok(isNonEmptyString(entry[key]), `${at}.${key} must be a non-empty string`);
    }
    assert.match(entry.id as string, ID_PATTERN, `${at}.id`);
    assert.ok(!seen.has(entry.id as string), `${at} duplicates id ${entry.id}`);
    seen.add(entry.id as string);

    assert.ok(isStringList(entry.install_command, 1), `${at}.install_command must be an argv list`);
    assert.ok(isStringList(entry.transports, 1), `${at}.transports must be a non-empty list`);
    for (const t of entry.transports as string[]) {
      assert.ok(TRANSPORTS.has(t), `${at}.transports has unsupported value ${t}`);
    }
    assert.equal(typeof entry.verified_by_bernstein, 'boolean', `${at}.verified_by_bernstein`);

    if ('auto_upgrade' in entry) assert.equal(typeof entry.auto_upgrade, 'boolean', `${at}.auto_upgrade`);
    if ('signature' in entry) assert.ok(isNonEmptyString(entry.signature), `${at}.signature`);
    if ('command' in entry) assert.ok(isNonEmptyString(entry.command), `${at}.command`);
    if ('args' in entry) assert.ok(isStringList(entry.args, 0), `${at}.args`);
    if ('env' in entry) {
      const env = entry.env as Record<string, unknown>;
      assert.ok(env && typeof env === 'object' && !Array.isArray(env), `${at}.env must be an object`);
      for (const [k, v] of Object.entries(env)) {
        assert.ok(k.length > 0 && typeof v === 'string', `${at}.env[${k}] must map to a string`);
      }
    }
  });
});
