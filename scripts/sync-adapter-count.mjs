/**
 * Store the resolved registry count in data/adapter-count.json and keep
 * the selectable-name wording consistent in the README, About page and
 * CLI catalogues. The registry count excludes generic and mock.
 *
 * Resolution order (identical arithmetic to `lib/adapter-count.ts`,
 * because both import `lib/adapter-count-core.mjs`):
 *   1. `registry.py` + `capability_profile.py` fetched from the
 *      bernstein repo.
 *   2. FALLBACK_COUNT from the core module (offline / air-gapped / rate
 *      limited builds).
 *
 * Outputs:
 *   data/adapter-count.json         the build-baked registry count
 *   data/cli-seed.json              CLI catalogue blurb, seed copy
 *   data/cli.json                   CLI catalogue blurb, generated copy
 *                                   (runs after scripts/extract-cli.mjs
 *                                   so a fresh extract is corrected too)
 *   README.md                       repo blurb
 *   app/about/page.tsx              /about body copy
 *
 * A failed upstream lookup is NEVER fatal - it degrades to the constant
 * so an offline build still succeeds. The script exits non-zero when a
 * targeted counter phrase is missing, so re-worded copy fails the build
 * loudly instead of silently keeping a stale number.
 *
 * Node built-ins only (fs, path, url) - no new dependencies, and no
 * TypeScript, so plain `node` runs it in the node:22-alpine base image.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REGISTRY_URL,
  PROFILES_URL,
  FALLBACK_COUNT,
  countAdapters,
} from '../lib/adapter-count-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/* Build-step budget. A slow or hanging raw.githubusercontent call must
   not stall the whole build; on timeout we fall through to the
   constant. Wider than the 2s request-time ceiling because a build has
   no user waiting on the render. */
const UPSTREAM_TIMEOUT_MS = 5000;

const OUT_FILE = path.join(repoRoot, 'data', 'adapter-count.json');

const SELECTABLE_NAME_COUNT = 55;
const SELECTABLE_NAME_FILES = [
  'README.md',
  'app/about/page.tsx',
  'data/cli-seed.json',
  'data/cli.json',
];

/** Fetch one raw source file under a shared abort signal, or null. */
async function fetchSource(url, signal) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'bernstein-landing-build/1.0 (+https://bernstein.run)' },
    signal,
  });
  if (!res.ok) {
    console.warn(`  ! ${url} returned ${res.status}`);
    return null;
  }
  return res.text();
}

/**
 * Live count when reachable, the core module's floor otherwise.
 * Never throws on network.
 */
async function resolveCount() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const [registrySource, profileSource] = await Promise.all([
      fetchSource(REGISTRY_URL, ac.signal),
      fetchSource(PROFILES_URL, ac.signal),
    ]);
    if (registrySource === null || profileSource === null) {
      console.log(`Resolved adapter count ${FALLBACK_COUNT} (offline floor)`);
      return FALLBACK_COUNT;
    }
    const count = countAdapters(registrySource, profileSource);
    if (count === null) {
      console.warn('  ! registry parsed to nothing trustworthy; using fallback');
      console.log(`Resolved adapter count ${FALLBACK_COUNT} (offline floor)`);
      return FALLBACK_COUNT;
    }
    if (count !== FALLBACK_COUNT) {
      console.log(
        `Resolved adapter count ${count} from the registry (core floor is ${FALLBACK_COUNT})`,
      );
    } else {
      console.log(`Resolved adapter count ${count} from the registry`);
    }
    return count;
  } catch (err) {
    console.warn(`  ! registry unreachable (${err.message}); using fallback`);
    console.log(`Resolved adapter count ${FALLBACK_COUNT} (offline floor)`);
    return FALLBACK_COUNT;
  } finally {
    clearTimeout(timer);
  }
}

/** Write text only if it changed; report what happened. */
async function writeIfChanged(absPath, next, prev, label) {
  const rel = path.relative(repoRoot, absPath);
  if (next === prev) {
    console.log(`  = ${rel} (${label} already in sync)`);
    return;
  }
  await writeFile(absPath, next, 'utf8');
  console.log(`  + ${rel} (${label} updated)`);
}

/**
 * The build-baked figure. Deliberately carries the count and nothing
 * else: a timestamp or a "source" field would rewrite the file on every
 * build and turn an unchanged number into a diff.
 */
async function writeCountJson(count) {
  const next = `${JSON.stringify({ count }, null, 2)}\n`;
  const prev = await readFile(OUT_FILE, 'utf8').catch(() => '');
  await writeIfChanged(OUT_FILE, next, prev, 'count');
}

async function syncSelectableNameCount(file) {
  const absPath = path.join(repoRoot, file);
  const raw = await readFile(absPath, 'utf8');
  const pattern = /\b\d+(?= selectable CLI agent adapter names\b)/gi;
  if (raw.match(pattern)?.length !== 1) {
    throw new Error(`${file}: expected one selectable CLI agent adapter name count`);
  }
  const next = raw.replace(pattern, String(SELECTABLE_NAME_COUNT));
  await writeIfChanged(absPath, next, raw, 'selectable name count');
}

async function main() {
  const count = await resolveCount();
  await writeCountJson(count);
  for (const file of SELECTABLE_NAME_FILES) {
    await syncSelectableNameCount(file);
  }

  console.log('Adapter-count sync complete.');
}

main().catch((err) => {
  console.error(`sync-adapter-count failed: ${err.message}`);
  process.exit(1);
});
