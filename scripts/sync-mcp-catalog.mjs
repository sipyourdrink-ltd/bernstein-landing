#!/usr/bin/env node
/**
 * Regenerate `public/mcp-catalog.json` from the bernstein checkout.
 *
 * The catalogue is served at https://bernstein.run/mcp-catalog.json and
 * is advertised from robots.txt, ai.txt and the agent card, so an MCP
 * client can read the tool set without installing anything. It was
 * hand-written once and then rotted: it pinned an old release and named
 * twelve tools while the server exposed twenty-five. A document that
 * says a client can call a tool that is not there is worse than no
 * document, because the client acts on it.
 *
 * Source of truth: `src/bernstein/mcp/tool_schemas/*.json` in the
 * bernstein repo. Those files are the schemas the server registers, so
 * a tool that ships has a file here and a tool that is removed loses
 * one. The release string comes from that repo's `pyproject.toml`.
 *
 * Everything else in the catalogue - the prose, the author block, the
 * links - is editorial and is preserved from the committed copy. This
 * script rewrites `version` and `tools` and nothing else.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* Same resolution as extract-adapters.mjs: a sibling checkout, or
   BERNSTEIN_REPO when running from a temp worktree or CI. */
const BERNSTEIN_REPO =
  process.env.BERNSTEIN_REPO ?? path.resolve(ROOT, '..', 'bernstein');

const SCHEMA_DIR = path.join(BERNSTEIN_REPO, 'src', 'bernstein', 'mcp', 'tool_schemas');
const PYPROJECT = path.join(BERNSTEIN_REPO, 'pyproject.toml');
const CATALOG = path.join(ROOT, 'public', 'mcp-catalog.json');

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

async function main() {
  let version, tools;
  try {
    [version, tools] = await Promise.all([readVersion(), readTools()]);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.warn(
        `[mcp-catalog] bernstein repo missing at ${BERNSTEIN_REPO}; keeping committed public/mcp-catalog.json`,
      );
      return;
    }
    throw err;
  }

  const catalog = JSON.parse(await fs.readFile(CATALOG, 'utf8'));
  const before = { version: catalog.version, count: catalog.tools?.length ?? 0 };
  catalog.version = version;
  catalog.tools = tools;

  const next = `${JSON.stringify(catalog, null, 2)}\n`;
  if (next === (await fs.readFile(CATALOG, 'utf8'))) {
    console.log(`[mcp-catalog] up to date (${version}, ${tools.length} tools)`);
    return;
  }
  await fs.writeFile(CATALOG, next, 'utf8');
  console.log(
    `[mcp-catalog] ${before.version} → ${version}, ${before.count} → ${tools.length} tools`,
  );
}

await main();
