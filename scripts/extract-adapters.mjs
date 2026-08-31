/**
 * Extract adapter metadata from the bernstein repo into a single SoT JSON.
 *
 * Source of truth is the bernstein adapters directory (sibling clone) +
 * the registry's `_ADAPTERS` dict. Output: `data/adapters.json`,
 * consumed by `app/vs/[slug]/page.tsx` at build time via
 * `generateStaticParams`.
 *
 * Why a sibling-clone scan and not a network fetch (cf. lib/adapter-count.ts):
 *   - vs-comparison pages need the FULL docstring text from each
 *     adapter's `.py`, not just the registry name. That text drives
 *     the per-page narrative (install command, model recommendation,
 *     "last verified" date) and the JSON-LD schema. Scanning the
 *     local clone is the simplest deterministic input.
 *   - the operator owns the bernstein repo on the same machine; this
 *     script never reaches the network. CI runs `git clone` of the
 *     bernstein master branch into a sibling dir.
 *
 * The output JSON honours the `ready: true|false` flag per adapter so
 * the operator can ramp pages weekly per the brief — only `ready`
 * entries appear in the sitemap and emit a static page.
 *
 * Run: `node scripts/extract-adapters.mjs`
 *      (chained as `prebuild` once committed.)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
/* Default sibling-clone path: ../bernstein. Override with
   BERNSTEIN_REPO env var when running from a temp worktree or CI. */
const BERNSTEIN_REPO =
  process.env.BERNSTEIN_REPO ?? path.resolve(ROOT, '..', 'bernstein');
const ADAPTER_DIR = path.join(
  BERNSTEIN_REPO,
  'src',
  'bernstein',
  'adapters',
);
const REGISTRY_PATH = path.join(ADAPTER_DIR, 'registry.py');
const OUT_FILE = path.join(ROOT, 'data', 'adapters.json');
const READY_FILE = path.join(ROOT, 'data', 'adapters-ready.json');
const OVERLAY_FILE = path.join(ROOT, 'data', 'adapters-overlay.json');

/**
 * Parse `_ADAPTERS = { "name": ClassName, ... }` from registry.py.
 * Same shape as `lib/adapter-count.ts` but yields the (name, class)
 * pairs instead of just a count.
 */
async function parseRegistry() {
  const text = await fs.readFile(REGISTRY_PATH, 'utf8');
  const idx = text.indexOf('_ADAPTERS:');
  if (idx < 0) throw new Error('registry.py: _ADAPTERS dict not found');
  const open = text.indexOf('{', idx);
  if (open < 0) throw new Error('registry.py: _ADAPTERS open brace not found');
  let depth = 0;
  let i = open;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error('registry.py: _ADAPTERS braces unbalanced');
  const block = text.slice(open + 1, i);
  /* match `    "name": ClassName,` */
  const re = /^\s*"([a-z_][a-z0-9_-]*)":\s*([A-Za-z0-9_]+)/gm;
  const out = [];
  let m;
  while ((m = re.exec(block)) !== null) {
    out.push({ name: m[1], cls: m[2] });
  }
  return out;
}

async function resolveAdapterFile(name, cls) {
  const text = await fs.readFile(REGISTRY_PATH, 'utf8');
  const re = new RegExp(
    `from\\s+bernstein\\.adapters\\.([a-z_][a-z0-9_]*)\\s+import\\s+${cls}\\b`,
  );
  const m = text.match(re);
  if (!m) return null;
  const fp = path.join(ADAPTER_DIR, `${m[1]}.py`);
  try {
    await fs.access(fp);
    return fp;
  } catch {
    return null;
  }
}

function extractTopDocstring(src) {
  const m = src.match(/^(?:r|R|u|U|b|B)?"""([\s\S]*?)"""/m);
  if (!m) return '';
  return m[1].trim();
}

function extractInstall(doc) {
  const lines = doc.split('\n');
  for (const raw of lines) {
    const line = raw.replace(/``+/g, '').trim();
    const m = line.match(/^(?:Install|Installation)[:\s]+(.+?)\.?$/i);
    if (m) {
      const txt = m[1].trim();
      const cut = txt.search(/\.\s+[A-Z]/);
      return cut > 0 ? txt.slice(0, cut).trim() : txt.replace(/\.$/, '').trim();
    }
  }
  for (const raw of lines) {
    const line = raw.replace(/``+/g, '').trim();
    if (/^(?:npm|pip|brew|cargo|curl|go install)\b/.test(line)) {
      return line.replace(/\.?$/, '').trim();
    }
    const m = line.match(/`([^`]*(?:npm|pip|brew|cargo|curl)\s[^`]+)`/);
    if (m) return m[1].trim();
  }
  return '';
}

function extractVerified(doc) {
  const m = doc.match(
    /Last verified against upstream\s+([^\n]+?)\s+on\s+(\d{4}-\d{2}-\d{2})/i,
  );
  if (!m) return null;
  return { upstream: m[1].trim().replace(/\.$/, ''), date: m[2] };
}

function categorize(name, doc) {
  const d = doc.toLowerCase();
  if (/\bclaude\b|anthropic/.test(d)) return 'claude-family';
  if (/\bopenai\b|\bcodex\b|\bgpt\b/.test(d)) return 'openai-family';
  if (/\bgoogle\b|\bgemini\b/.test(d)) return 'google-family';
  if (
    /\bopen[- ]?source\b|\bapache\b|\bmit license\b|github\.com/.test(d) &&
    !/\baws\b/.test(d)
  ) return 'opensource-family';
  if (/\bsovereign\b|\bclm\b|\bnim\b|\bnvidia\b/.test(d)) return 'sovereign-family';
  if (/\bcloud\b|\bworker\b|\bsdk\b/.test(d)) return 'cloud-sdk-family';
  return 'cli-family';
}

const DISPLAY_NAME_OVERRIDES = {
  aichat: 'AIChat',
  aider: 'Aider',
  amp: 'Amp',
  auggie: 'Auggie (Augment Code)',
  autohand: 'Autohand Code',
  charm: 'Charm Crush',
  claude: 'Claude Code',
  cline: 'Cline',
  clm: 'CLM (sovereign LLM)',
  cloudflare: 'Cloudflare Agents SDK',
  codebuff: 'Codebuff',
  codex: 'OpenAI Codex',
  cody: 'Sourcegraph Cody',
  composio: 'Composio Agent Orchestrator',
  continue: 'Continue.dev',
  copilot: 'GitHub Copilot CLI',
  cursor: 'Cursor Agent',
  devin_terminal: 'Devin for Terminal',
  droid: 'Droid (Factory AI)',
  forge: 'Forge',
  gemini: 'Google Gemini CLI',
  goose: 'Goose',
  gptme: 'gptme',
  hermes: 'Hermes Agent (Nous Research)',
  iac: 'Terraform / Pulumi (IaC)',
  junie: 'JetBrains Junie',
  kilo: 'Kilo (Stackblitz)',
  kimi: 'Kimi',
  kiro: 'Kiro',
  letta_code: 'Letta Code',
  mistral: 'Mistral Vibe',
  mock: 'Mock (testing)',
  ollama: 'Ollama (local LLM)',
  open_interpreter: 'Open Interpreter',
  openai_agents: 'OpenAI Agents SDK',
  opencode: 'OpenCode',
  openhands: 'OpenHands',
  pi: 'Pi (pi-coding-agent)',
  plandex: 'Plandex',
  q_dev: 'AWS Q Developer',
  qwen: 'Qwen CLI',
  ralphex: 'Ralphex',
  rovo: 'Atlassian Rovo Dev',
};

function toSlug(name) {
  return name.replace(/_/g, '-');
}

async function loadReadyList() {
  try {
    const raw = await fs.readFile(READY_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data?.ready)) return new Set(data.ready);
  } catch {
    /* file is optional; default to "no entries ready". */
  }
  return new Set();
}

async function loadOverlay() {
  try {
    const raw = await fs.readFile(OVERLAY_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data?.entries ?? {};
  } catch {
    return {};
  }
}

async function main() {
  /* If the bernstein sibling repo is missing (Docker build context,
     CI without a sibling clone, etc.) and `data/adapters.json` is
     already committed, skip the extraction and let the build use the
     committed data. The operator regenerates locally before
     committing the JSON. */
  try {
    await fs.access(REGISTRY_PATH);
  } catch {
    const existing = await fs.access(OUT_FILE).then(() => true).catch(() => false);
    if (existing) {
      // eslint-disable-next-line no-console
      console.warn(
        `[adapters] bernstein repo missing at ${BERNSTEIN_REPO}; using committed data/adapters.json`,
      );
      return;
    }
    throw new Error(
      `[adapters] bernstein repo missing at ${BERNSTEIN_REPO} AND no committed data/adapters.json; cannot proceed`,
    );
  }

  const reg = await parseRegistry();
  const ready = await loadReadyList();
  const overlay = await loadOverlay();
  const adapters = [];
  for (const { name, cls } of reg) {
    if (name === 'mock') continue;
    const file = await resolveAdapterFile(name, cls);
    if (!file) {
      console.warn(`[adapters] no source file resolved for ${name} (${cls})`);
      continue;
    }
    const src = await fs.readFile(file, 'utf8');
    const doc = extractTopDocstring(src);
    const install = extractInstall(doc);
    const verified = extractVerified(doc);
    const slug = toSlug(name);
    const ov = overlay[slug] ?? overlay[name] ?? {};
    adapters.push({
      slug,
      name,
      cls,
      displayName: ov.displayName ?? DISPLAY_NAME_OVERRIDES[name] ?? cls.replace(/Adapter$/, ''),
      docstring: doc,
      install: ov.install ?? install,
      verified: ov.verified ?? verified,
      category: ov.category ?? categorize(name, doc),
      sourceFile: path.relative(BERNSTEIN_REPO, file),
      license: ov.license ?? null,
      auth: ov.auth ?? null,
      parallelSafe: ov.parallelSafe ?? null,
      mcpSupport: ov.mcpSupport ?? null,
      auditChain: ov.auditChain ?? false,
      homepage: ov.homepage ?? null,
      summary: ov.summary ?? null,
      whenToChoose: ov.whenToChoose ?? null,
      whenToChooseBernstein: ov.whenToChooseBernstein ?? null,
      ready: ready.has(slug),
    });
  }
  adapters.sort((a, b) => a.slug.localeCompare(b.slug));

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  const out = {
    version: 1,
    builtAt: new Date().toISOString(),
    bernsteinRepoPath: path.relative(ROOT, BERNSTEIN_REPO),
    adapters,
  };
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');

  const readyCount = adapters.filter((a) => a.ready).length;
  // eslint-disable-next-line no-console
  console.log(
    `[adapters] wrote ${adapters.length} adapters (${readyCount} ready) to ${path.relative(ROOT, OUT_FILE)}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[adapters] extract failed:', err);
  process.exit(1);
});
