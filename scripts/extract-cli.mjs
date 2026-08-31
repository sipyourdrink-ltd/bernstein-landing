/**
 * Extract bernstein CLI command + flag inventory into a JSON SoT.
 *
 * The output (`data/cli.json`) drives the static generated catalogue pages at
 * `app/docs/cli/[command]/page.tsx` and
 * `app/docs/cli/[command]/flags/[flag]/page.tsx`. ~250-300 pages
 * post-ramp.
 *
 * Strategy (in order):
 *   1. If `bernstein` is on PATH, shell out to `bernstein --version`
 *      to confirm it is callable, then iterate the seed catalog's
 *      subcommand list and probe `bernstein <cmd> --help` for each.
 *      Click prints a standard help body for subcommands so the
 *      parser yields per-flag detail.
 *   2. If bernstein is not installed (or live extract returns nothing),
 *      fall back to the seed catalog bundled in `data/cli-seed.json`
 *      (operator-curated subset of the most-googled commands). This
 *      keeps the build deterministic offline.
 *
 * The ramp gate works the same way as adapters: only commands listed
 * in `data/cli-ready.json` emit static pages and appear in the
 * sitemap.
 *
 * Run: `node scripts/extract-cli.mjs`
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'data', 'cli.json');
const READY_FILE = path.join(ROOT, 'data', 'cli-ready.json');
const SEED_FILE = path.join(ROOT, 'data', 'cli-seed.json');

const BERNSTEIN_BIN = process.env.BERNSTEIN_BIN ?? 'bernstein';
const TIMEOUT_MS = 8000;
const SKIP_CLI_EXTRACT = process.env.SKIP_CLI_EXTRACT === '1';

async function fileExists(file) {
  return fs.access(file).then(() => true).catch(() => false);
}

async function resolveBernsteinBin() {
  if (path.isAbsolute(BERNSTEIN_BIN) || BERNSTEIN_BIN.includes(path.sep)) {
    return fileExists(BERNSTEIN_BIN).then((exists) => (exists ? BERNSTEIN_BIN : null));
  }

  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, BERNSTEIN_BIN);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      /* try the next PATH entry */
    }
  }
  return null;
}

async function isCliCacheFresh(binaryPath) {
  try {
    const [outStat, binStat] = await Promise.all([
      fs.stat(OUT_FILE),
      fs.stat(binaryPath),
    ]);
    return outStat.mtimeMs >= binStat.mtimeMs;
  } catch {
    return false;
  }
}

function runBernstein(args) {
  return new Promise((resolve) => {
    const out = [];
    const err = [];
    let settled = false;
    let proc;
    try {
      proc = spawn(BERNSTEIN_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ ok: false, stdout: '', stderr: String(e), code: -1 });
      return;
    }
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill('SIGKILL'); } catch { /* ignore */ }
        resolve({ ok: false, stdout: out.join(''), stderr: 'timeout', code: -2 });
      }
    }, TIMEOUT_MS);
    proc.stdout.on('data', (chunk) => out.push(String(chunk)));
    proc.stderr.on('data', (chunk) => err.push(String(chunk)));
    proc.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout: '', stderr: String(e), code: -1 });
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        stdout: out.join(''),
        stderr: err.join(''),
        code: code ?? -1,
      });
    });
  });
}

/**
 * Parse a Click `--help` body into a structured command record.
 *
 * Click output convention:
 *   Usage: bernstein <cmd> [OPTIONS] ...
 *
 *     <description>
 *
 *   Options:
 *     --flag             help text
 *     --flag TYPE        help text                  [default: ...]
 *
 *   Commands:
 *     subcmd             help
 */
function parseClickHelp(body) {
  const lines = body.split('\n');
  let usage = '';
  let description = '';
  const flags = [];
  const subcommands = [];

  let mode = 'header';
  const descriptionLines = [];
  let pendingFlag = null;

  function flushFlag() {
    if (pendingFlag) {
      flags.push(pendingFlag);
      pendingFlag = null;
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() && mode === 'header') continue;

    if (line.startsWith('Usage:')) {
      usage = line.slice('Usage:'.length).trim();
      mode = 'description';
      continue;
    }

    if (/^Options:/i.test(line)) { flushFlag(); mode = 'options'; continue; }
    if (/^Commands:/i.test(line)) { flushFlag(); mode = 'commands'; continue; }
    if (/^Arguments:/i.test(line)) { flushFlag(); mode = 'arguments'; continue; }

    if (mode === 'description') {
      if (line.trim()) descriptionLines.push(line.trim());
      continue;
    }

    if (mode === 'options') {
      const m = line.match(/^\s{2,}(--?[a-zA-Z0-9_][a-zA-Z0-9_-]*(?:[,\s]+--?[a-zA-Z0-9_][a-zA-Z0-9_-]*)?)\s*([A-Z][A-Z0-9_]*(?:\[[^\]]+\])?)?\s+(.*)$/);
      if (m) {
        flushFlag();
        const flagSpec = m[1].trim();
        const type = m[2] ? m[2].trim() : '';
        const help = m[3].trim();
        const flagNames = flagSpec.split(/[,\s]+/).filter(Boolean);
        pendingFlag = {
          spec: flagSpec,
          flags: flagNames,
          primary: flagNames.find((f) => f.startsWith('--')) ?? flagNames[0],
          type,
          help,
          default: null,
        };
        const dm = help.match(/\[default:\s*([^\]]+)\]/);
        if (dm) pendingFlag.default = dm[1].trim();
      } else if (pendingFlag && /^\s{4,}/.test(line)) {
        pendingFlag.help = `${pendingFlag.help} ${line.trim()}`.trim();
      }
      continue;
    }

    if (mode === 'commands') {
      const m = line.match(/^\s{2,}([a-zA-Z][a-zA-Z0-9_-]*)\s+(.*)$/);
      if (m) {
        subcommands.push({ name: m[1], help: m[2].trim() });
      }
      continue;
    }
  }
  flushFlag();
  description = descriptionLines.join(' ').trim();
  return { usage, description, flags, subcommands };
}

function stripAnsi(s) {
  /* eslint-disable-next-line no-control-regex */
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Rewrite absolute home directories to `~`.
 *
 * Click renders `[default: ...]` and several help strings by expanding
 * paths against the invoking user's home, so a live extract bakes the
 * machine it ran on into the catalogue. `data/cli.json` renders on the
 * public CLI generated catalogue pages, so those strings ship: the committed file
 * carried `/Users/<name>/.config/bernstein/projects.toml` on the fleet
 * config flag, which is both a leak of the operator's account name and
 * wrong for every reader.
 *
 * Two passes, because either can miss on its own:
 *   1. the running user's own homedir (covers `/root` in a container
 *      and any non-standard home location);
 *   2. the conventional macOS / Linux shapes, so a catalogue extracted
 *      on one machine is still normalised when re-checked on another.
 *
 * The lookbehind keeps the match anchored to a path start, so a
 * substring inside a longer token is left alone.
 */
const HOME_DIR = os.homedir();

function normalizeHomePaths(s) {
  let out = s;
  if (HOME_DIR && HOME_DIR !== '/' && HOME_DIR !== path.sep) {
    out = out.split(HOME_DIR).join('~');
  }
  return out.replace(
    /(?<![\w~.-])\/(?:Users|home)\/[A-Za-z0-9._-]+(?![\w-])/g,
    '~',
  );
}

/** Apply `normalizeHomePaths` to every string in a JSON-shaped value. */
function normalizeDeep(value) {
  if (typeof value === 'string') return normalizeHomePaths(value);
  if (Array.isArray(value)) return value.map(normalizeDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normalizeDeep(v)]),
    );
  }
  return value;
}

/**
 * Re-normalise the committed catalogue in place.
 *
 * Every early return in `main()` routes through here. Skipping the
 * extract must not also skip the sanitiser: a leaked path committed by
 * an earlier extract would otherwise survive every build that runs
 * without `bernstein` on PATH, which is most of them.
 */
async function normalizeCommitted(reason) {
  // eslint-disable-next-line no-console
  console.warn(`[cli] ${reason}`);
  let raw;
  try {
    raw = await fs.readFile(OUT_FILE, 'utf8');
  } catch {
    return;
  }
  let next;
  try {
    /* No trailing newline: match `main()`'s writer byte for byte so a
       re-normalisation pass produces a value diff and nothing else. */
    next = JSON.stringify(normalizeDeep(JSON.parse(raw)), null, 2);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cli] committed catalogue is not parseable JSON:', e?.message ?? e);
    return;
  }
  if (next === raw) return;
  await fs.writeFile(OUT_FILE, next, 'utf8');
  // eslint-disable-next-line no-console
  console.log('[cli] normalised absolute home paths in committed data/cli.json');
}

async function loadSeed() {
  try {
    const raw = await fs.readFile(SEED_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function tryLiveExtract() {
  /* probe whether bernstein is on PATH at all */
  const probe = await runBernstein(['--version']);
  if (!probe.ok) return null;

  const seed = await loadSeed();
  if (!seed) return null;

  const commands = [];
  for (const sub of seed.root.subcommands) {
    const r = await runBernstein([sub.name, '--help']);
    if (!r.ok) continue;
    const parsed = parseClickHelp(stripAnsi(r.stdout));
    const description = parsed.description || sub.help;
    commands.push({
      name: sub.name,
      summary: sub.help,
      usage: parsed.usage,
      description,
      flags: parsed.flags,
      subcommands: parsed.subcommands,
    });
  }
  if (commands.length === 0) return null;
  return { live: true, root: seed.root, commands };
}

async function loadReady() {
  try {
    const raw = await fs.readFile(READY_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data?.ready)) return new Set(data.ready);
  } catch { /* default empty */ }
  return new Set();
}

async function main() {
  const hasCommittedCli = await fileExists(OUT_FILE);
  if (SKIP_CLI_EXTRACT) {
    if (hasCommittedCli) {
      await normalizeCommitted('SKIP_CLI_EXTRACT=1; using committed data/cli.json');
      return;
    }
    // eslint-disable-next-line no-console
    console.warn('[cli] SKIP_CLI_EXTRACT=1 but data/cli.json is missing; extracting');
  }

  const binaryPath = await resolveBernsteinBin();
  if (binaryPath && hasCommittedCli && await isCliCacheFresh(binaryPath)) {
    await normalizeCommitted('data/cli.json is newer than bernstein binary; using cache');
    return;
  }

  /* If we already have a committed data/cli.json AND no live bernstein
     on PATH (typical Docker build context), skip extraction. The
     operator regenerates locally before committing. */
  const probe = await runBernstein(['--version']);
  const hasLiveBernstein = probe.ok;
  if (!hasLiveBernstein && hasCommittedCli) {
    await normalizeCommitted('bernstein not on PATH; using committed data/cli.json');
    return;
  }

  let extracted = null;
  try {
    extracted = await tryLiveExtract();
  } catch (e) {
    console.warn('[cli] live extract failed:', e?.message ?? e);
  }
  let source;
  if (extracted) {
    source = extracted;
  } else {
    const seed = await loadSeed();
    if (!seed) {
      console.error('[cli] no live bernstein on PATH and no seed file at', SEED_FILE);
      process.exit(1);
    }
    console.warn('[cli] using seed catalog (bernstein not on PATH)');
    source = { live: false, root: seed.root, commands: seed.commands };
  }
  const ready = await loadReady();

  const commands = source.commands.map((c) => {
    const cmdReady = ready.has(c.name);
    const flags = c.flags.map((f) => {
      const fname = (f.primary ?? '').replace(/^-+/, '');
      return {
        ...f,
        slug: fname,
        ready: cmdReady && (ready.has(`${c.name}/${fname}`) || ready.has(`${c.name}/*`)),
      };
    });
    return { ...c, slug: c.name, ready: cmdReady, flags };
  });

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  /* Sanitise on the way out, not per-field: Click expands `~` against
     the invoking user in help text, default values and usage lines
     alike, and every one of those strings renders on a public CLI page. */
  const out = normalizeDeep({
    version: 1,
    builtAt: new Date().toISOString(),
    source: source.live ? 'live' : 'seed',
    root: source.root,
    commands,
  });
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');

  const totalFlags = commands.reduce((acc, c) => acc + c.flags.length, 0);
  const readyCmds = commands.filter((c) => c.ready).length;
  const readyFlags = commands.reduce(
    (acc, c) => acc + c.flags.filter((f) => f.ready).length,
    0,
  );
  // eslint-disable-next-line no-console
  console.log(
    `[cli] wrote ${commands.length} commands (${totalFlags} flags total) to ${path.relative(ROOT, OUT_FILE)}; ready: ${readyCmds} cmds, ${readyFlags} flag pages [source: ${out.source}]`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[cli] extract failed:', err);
  /* Same defensive fall-back as extract-adapters.mjs: when the sibling
     bernstein checkout / `bernstein --help` are unavailable, the static
     bundle ships fine from the committed data/cli.json. */
  if (/ENOENT|spawn .* ENOENT|not found|Command failed/.test(String(err && err.message))) {
    // eslint-disable-next-line no-console
    console.warn('[cli] bernstein binary absent - using committed data/cli.json');
    process.exit(0);
  }
  process.exit(1);
});
