/**
 * Build-time manifest of source-file mtimes for the sitemap route.
 *
 * Why this exists: `app/sitemap.xml/route.ts` derives `<lastmod>` for
 * every entry by stat-ing the source file the route renders from
 * (`app/<route>/page.tsx`, `lib/<helper>.ts`, etc.). That works in
 * `next dev` because the whole repo is on disk. In Next.js standalone
 * (the production deploy target) only `data/`, `public/`, and the
 * compiled chunks ship in the bundle, so `fs.stat('app/page.tsx')`
 * fails and the route emits no `<lastmod>` for that URL. The audit on
 * 2026-05-21 caught this: 44 of 126 sitemap URLs (35%) shipped without
 * lastmod in production, all of them on routes whose only candidate
 * source path was an `app/*.tsx` or `lib/*.ts` file that the
 * standalone bundle does not include.
 *
 * Fix: at prebuild time, snapshot the git lastmod of every source file
 * the sitemap route references into `data/source-mtimes.json`. The
 * `data/` directory is already traced into the standalone bundle (see
 * `data/ask-seed.json`, `data/adapters.json`, etc.), so the manifest
 * ships with the deploy and the route can resolve every entry without
 * touching un-shipped source.
 *
 * Format:
 *   { version: 1, builtAt: "YYYY-MM-DD", mtimes: { "<repo-relative path>": "YYYY-MM-DD" } }
 *
 * The value is W3C-flavoured day-precision (matches the existing
 * `toW3CDate` formatter in route.ts) to avoid spurious "page changed"
 * pings to engines on every redeploy.
 *
 * `builtAt` is derived, not a clock reading: it is the newest date in
 * `mtimes`. It used to be `new Date()`, which meant a prebuild rewrote
 * the committed manifest on any day the tracked files had not changed,
 * and the sitemap's last-resort `<lastmod>` (plus the `/humans.txt` and
 * `/rss.xml` build stamps that read it) moved without an edit behind
 * it. Deriving it from the tracked dates makes two prebuilds of the
 * same tree emit byte-identical manifests, so the file only shows up in
 * `git status` when a tracked source actually moved.
 *
 * Run: `node scripts/build-source-mtimes.mjs`
 *      (chained as a prebuild step in package.json).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/* Every source path referenced by `lib/sitemap.ts` (and any future
   inline candidate in `app/sitemap.xml/route.ts`) as a
   `lastModFromSource(...)` candidate. Keep this list aligned with the
   sitemap source; the unit test cross-checks the union.

   `/llms.txt`, `/llms-full.txt`, `/ai.txt` were dropped from the
   sitemap (issue #42) because they serve `x-robots-tag: noindex`; the
   corresponding source paths no longer need an mtime here. */
const TRACKED_PATHS = [
  'app/page.tsx',
  'app/cli-quickstart/page.tsx',
  'app/why-bernstein/page.tsx',
  'app/cost/page.tsx',
  'app/sponsors/page.tsx',
  'app/ask/page.tsx',
  'app/tools/agent-md-bench/page.tsx',
  'app/tools/orchestra/page.tsx',
  'data/ask-seed.json',
  'app/q/page.tsx',
  'app/spec-driven/page.tsx',
  'data/adapters.json',
  'app/vs/page.tsx',
  'lib/compare/data.ts',
  'app/compare/page.tsx',
];

/* Day-precision W3C ISO date, matching `toW3CDate` in the sitemap
   route. Day-precision avoids spurious "page changed" signals on a
   rebuild that does not touch the source. */
function toW3CDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Resolve a stable lastmod for `relPath`.
 *
 *   1. `git log -1 --format=%cI -- <path>` is the SoT - every commit
 *      that touches the file moves the date, and the value is
 *      identical across machines (so two parallel builds emit the
 *      same sitemap bytes).
 *   2. If the path is not tracked yet (fresh add staged but not
 *      committed) the file's fs mtime is a strictly-better-than-build
 *      fallback. The mtime drifts across machines but is still tied
 *      to a real edit.
 *   3. If neither works (file does not exist on disk and is not in
 *      git), the value is `null` and the sitemap route falls back to
 *      the manifest's `builtAt` (the newest date the other entries
 *      resolved to) rather than `undefined`. Never emit `undefined`:
 *      missing lastmod is the bug this script exists to fix.
 */
async function resolveMtime(relPath) {
  const absPath = path.join(repoRoot, relPath);
  try {
    const { stdout } = await execFileP(
      'git',
      ['log', '-1', '--format=%cI', '--', relPath],
      { cwd: repoRoot },
    );
    const trimmed = stdout.trim();
    if (trimmed) {
      const d = new Date(trimmed);
      if (!Number.isNaN(d.getTime())) return toW3CDate(d);
    }
  } catch {
    /* git missing or not a repo; fall through. */
  }
  try {
    const st = await stat(absPath);
    return toW3CDate(st.mtime);
  } catch {
    return null;
  }
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Newest date in the resolved `mtimes` map, or `null` when nothing
 * resolved. Day-precision ISO sorts chronologically as a string, so a
 * lexical sort is the chronological one - the same rule the
 * `/humans.txt` and `/rss.xml` routes apply when they read this file.
 */
function newestTrackedDate(mtimes) {
  const dates = Object.values(mtimes).filter(
    (value) => typeof value === 'string' && DAY_RE.test(value),
  );
  dates.sort();
  return dates.at(-1) ?? null;
}

/**
 * `builtAt` from the manifest already on disk, when it is present and
 * parses. Only used if not a single tracked path resolved (no git, no
 * files) - reusing the committed value keeps that degenerate case
 * byte-stable too instead of falling back to a moving clock.
 */
function previousBuiltAt(prevRaw) {
  if (!prevRaw) return null;
  try {
    const parsed = JSON.parse(prevRaw);
    const value = parsed?.builtAt;
    return typeof value === 'string' && DAY_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

async function main() {
  const mtimes = {};
  for (const rel of TRACKED_PATHS) {
    mtimes[rel] = await resolveMtime(rel);
  }

  const outPath = path.join(repoRoot, 'data', 'source-mtimes.json');

  let prev = '';
  try {
    prev = await readFile(outPath, 'utf8');
  } catch {
    /* fresh checkout, write it. */
  }

  /* Derived, never `new Date()`: same tree in, same bytes out. The
     clock is the last resort for a checkout where neither git nor the
     files nor a previous manifest can answer - at which point a
     manifest with no dates at all would be worse than a stamped one. */
  const builtAt =
    newestTrackedDate(mtimes) ?? previousBuiltAt(prev) ?? toW3CDate(new Date());

  const manifest = {
    version: 1,
    builtAt,
    mtimes,
  };

  const next = JSON.stringify(manifest, null, 2) + '\n';

  if (prev === next) {
    console.log('source-mtimes.json already in sync');
    return;
  }
  await writeFile(outPath, next, 'utf8');
  console.log(`source-mtimes.json written (${TRACKED_PATHS.length} entries)`);
}

main().catch((err) => {
  console.error(`build-source-mtimes failed: ${err.message}`);
  process.exit(1);
});
