#!/usr/bin/env node
/**
 * Regenerate the two MCP documents the site serves from the bernstein
 * checkout. They are different documents with different readers:
 *
 *   public/mcp-catalog.json - the catalogue of installable MCP servers
 *     that `bernstein mcp catalog` fetches by default. Its shape is
 *     fixed by `docs/reference/mcp-catalog-schema.json` in the bernstein
 *     repo and the client rejects the whole document on one unknown or
 *     missing field, so it is generated, never edited. Entries come from
 *     the manifests the wheel bundles
 *     (`src/bernstein/core/protocols/mcp_catalog/manifests/*.yaml`), the
 *     same files the client validates offline.
 *
 *   public/mcp-server.json - the description of Bernstein's own MCP
 *     server: its tools and their argument schemas. It was hand-written
 *     once and then rotted: it pinned an old release and named twelve
 *     tools while the server exposed twenty-five. A document that says a
 *     client can call a tool that is not there is worse than no document,
 *     because the client acts on it.
 *
 * Source of truth for the server tools: `src/bernstein/mcp/tool_schemas/*.json`.
 * Those files are the schemas the server registers, so a tool that
 * ships has a file here and a tool that is removed loses one. The
 * release string comes from that repo's `pyproject.toml`. Everything
 * else in the server document - the prose, the author block, the links -
 * is editorial and is preserved from the committed copy; this script
 * rewrites `version` and `tools` and nothing else.
 *
 * The catalogue's `generated_at` moves only when its entries change, so
 * a rebuild with nothing new leaves the file byte-identical.
 *
 * Tolerant by design: with no bernstein checkout reachable it warns and
 * leaves the committed catalogue alone, the same contract as
 * `extract-adapters.mjs`. The published site keeps whatever was last
 * generated rather than losing the document.
 *
 * Run: `node scripts/sync-mcp-catalog.mjs` (wired into prebuild).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* Same resolution as extract-adapters.mjs: a sibling checkout, or
   BERNSTEIN_REPO when running from a temp worktree or CI. */
const BERNSTEIN_REPO =
  process.env.BERNSTEIN_REPO ?? path.resolve(ROOT, '..', 'bernstein');

const SCHEMA_DIR = path.join(BERNSTEIN_REPO, 'src', 'bernstein', 'mcp', 'tool_schemas');
const PYPROJECT = path.join(BERNSTEIN_REPO, 'pyproject.toml');
const MANIFEST_DIR = path.join(
  BERNSTEIN_REPO, 'src', 'bernstein', 'core', 'protocols', 'mcp_catalog', 'manifests',
);
const SERVER_CARD = path.join(ROOT, 'public', 'mcp-server.json');
const CATALOG = path.join(ROOT, 'public', 'mcp-catalog.json');

/* Schema version the bernstein client accepts (manifest.py). */
const CATALOG_SCHEMA_VERSION = 1;

async function readVersion() {
  const raw = await fs.readFile(PYPROJECT, 'utf8');
  const m = raw.match(/^version\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error(`no version in ${PYPROJECT}`);
  return m[1];
}

/**
 * One catalogue entry per registered tool schema.
 *
 * The schema file is a JSON Schema for the tool's arguments: `title` is
 * the tool name and `description` is the sentence the client shows. The
 * remaining keys are the argument schema itself, which goes out as
 * `input_schema` - so the catalogue carries the same contract the
 * server validates against rather than a paraphrase of it.
 */
async function readTools() {
  const files = (await fs.readdir(SCHEMA_DIR)).filter((f) => f.endsWith('.json')).sort();
  const tools = [];
  for (const file of files) {
    const schema = JSON.parse(await fs.readFile(path.join(SCHEMA_DIR, file), 'utf8'));
    const name = schema.title ?? file.replace(/\.json$/, '');
    const { $schema, title, description, ...inputSchema } = schema;
    if (!description) {
      throw new Error(`${file}: no description; the catalogue entry would be blank`);
    }
    tools.push({ name, description, input_schema: inputSchema });
  }
  return tools;
}

/**
 * One catalogue entry per bundled manifest, sorted by file name - the
 * order the client's own loader uses.
 */
async function readEntries() {
  const files = (await fs.readdir(MANIFEST_DIR)).filter((f) => f.endsWith('.yaml')).sort();
  return Promise.all(
    files.map(async (file) => YAML.parse(await fs.readFile(path.join(MANIFEST_DIR, file), 'utf8'))),
  );
}

async function readJsonOrNull(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

/** Write `data` to `file` when it differs; report whether it did. */
async function writeIfChanged(file, data) {
  const next = `${JSON.stringify(data, null, 2)}\n`;
  const prev = await fs.readFile(file, 'utf8').catch(() => null);
  if (next === prev) return false;
  await fs.writeFile(file, next, 'utf8');
  return true;
}

async function syncServerCard(version, tools) {
  const card = JSON.parse(await fs.readFile(SERVER_CARD, 'utf8'));
  const before = { version: card.version, count: card.tools?.length ?? 0 };
  card.version = version;
  card.tools = tools;
  if (await writeIfChanged(SERVER_CARD, card)) {
    console.log(
      `[mcp-server] ${before.version} → ${version}, ${before.count} → ${tools.length} tools`,
    );
  } else {
    console.log(`[mcp-server] up to date (${version}, ${tools.length} tools)`);
  }
}

async function syncCatalog(entries) {
  const prev = await readJsonOrNull(CATALOG);
  const unchanged =
    prev?.version === CATALOG_SCHEMA_VERSION &&
    JSON.stringify(prev.entries) === JSON.stringify(entries);
  const catalog = {
    version: CATALOG_SCHEMA_VERSION,
    generated_at: unchanged
      ? prev.generated_at
      : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    entries,
  };
  const wrote = await writeIfChanged(CATALOG, catalog);
  console.log(`[mcp-catalog] ${wrote ? 'regenerated' : 'up to date'} (${entries.length} entries)`);
}

async function main() {
  let version, tools, entries;
  try {
    [version, tools, entries] = await Promise.all([readVersion(), readTools(), readEntries()]);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.warn(
        `[mcp-catalog] bernstein repo missing at ${BERNSTEIN_REPO}; keeping committed public/mcp-catalog.json and public/mcp-server.json`,
      );
      return;
    }
    throw err;
  }
  await syncServerCard(version, tools);
  await syncCatalog(entries);
}

await main();
