/**
 * Sync the published Bernstein version into the four static
 * agent-discovery surfaces in public/.
 *
 * Version resolution order:
 *   1. The latest release tag from the GitHub releases API (live).
 *   2. The BERNSTEIN_VERSION constant in lib/version.ts (offline floor).
 *
 * The constant used to be the only source, which meant every release
 * needed a manual bump here; when that bump was missed the build
 * happily shipped a stale version to every discovery surface. The live
 * lookup removes that failure mode and the constant now only covers
 * air-gapped / rate-limited / offline builds.
 *
 * Those files are served statically and cannot import a TS
 * constant, so this script runs at build time (wired into the
 * `prebuild` npm step) and rewrites their version fields:
 *
 *   public/.well-known/agent-card.json      -> .version, .agentVersion
 *   public/.well-known/mcp/server-card.json -> .serverInfo.version
 *   public/structured-data.json             -> .softwareVersion
 *   public/openapi.yaml                     -> info.version
 *
 * It also writes `data/bernstein-version.json`, which is how rendered
 * components get a build-baked fallback instead of a hand-typed one.
 * The hero release pill previously fell back to a literal that had been
 * correct several releases earlier, so any visitor served from a cold
 * cache during a GitHub outage read a version that had not shipped in
 * months.
 *
 * Node built-ins only (fs, path, url) - no new dependencies. JSON
 * files are parsed/mutated/serialised so structure and key order are
 * preserved; the YAML file gets a single targeted line rewrite of the
 * top-level info.version field (no YAML parser required).
 *
 * A failed upstream lookup is NEVER fatal - it degrades to the
 * constant so an offline build still succeeds. The script exits
 * non-zero only when the constant cannot be read or a target field is
 * missing, so a moved file fails the build loudly.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const RELEASES_URL =
  'https://api.github.com/repos/sipyourdrink-ltd/bernstein/releases/latest';
/* Build-step budget. A slow or hanging GitHub call must not stall the
   whole build; on timeout we fall through to the constant. */
const UPSTREAM_TIMEOUT_MS = 5000;
/* Discovery surfaces carry a bare semver (no leading "v"), matching the
   shape openapi.yaml and the agent cards already used. */
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/** Read BERNSTEIN_VERSION from lib/version.ts by simple text match. */
async function readFallbackVersion() {
  const file = path.join(repoRoot, 'lib', 'version.ts');
  const src = await readFile(file, 'utf8');
  const m = src.match(
    /export\s+const\s+BERNSTEIN_VERSION\s*=\s*['"]([^'"]+)['"]/,
  );
  if (!m) {
    throw new Error(`Could not find BERNSTEIN_VERSION export in ${file}`);
  }
  return m[1];
}

/**
 * Latest published release tag, normalised to bare semver.
 *
 * Returns null on any failure (network, non-2xx, rate limit, malformed
 * payload, unexpected tag shape) so the caller can fall back. Honours
 * an optional GITHUB_TOKEN / GH_TOKEN for the 5000/hr authenticated
 * tier, matching lib/bernstein-version.ts - never a hard dependency.
 */
async function fetchLatestVersion() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'bernstein-landing-build/1.0 (+https://bernstein.run)',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(RELEASES_URL, { headers, signal: ac.signal });
    if (!res.ok) {
      console.warn(`  ! releases API returned ${res.status}; using fallback`);
      return null;
    }
    const data = await res.json();
    const tag = typeof data?.tag_name === 'string' ? data.tag_name.trim() : '';
    const bare = tag.replace(/^v/i, '');
    if (!SEMVER_RE.test(bare)) {
      console.warn(`  ! unexpected release tag ${JSON.stringify(tag)}; using fallback`);
      return null;
    }
    return bare;
  } catch (err) {
    console.warn(`  ! releases API unreachable (${err.message}); using fallback`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Live version when reachable, constant otherwise. Never throws on network. */
async function resolveVersion() {
  const fallback = await readFallbackVersion();
  const live = await fetchLatestVersion();
  if (live === null) {
    console.log(`Resolved version ${fallback} (offline floor from lib/version.ts)`);
    return fallback;
  }
  if (live !== fallback) {
    console.log(
      `Resolved version ${live} from GitHub releases (lib/version.ts floor is ${fallback})`,
    );
  } else {
    console.log(`Resolved version ${live} from GitHub releases`);
  }
  return live;
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

/** Update a nested string field inside a JSON file. */
async function syncJsonField(relPath, version, getCurrent, setNext, label) {
  const absPath = path.join(repoRoot, relPath);
  const raw = await readFile(absPath, 'utf8');
  const data = JSON.parse(raw);

  const current = getCurrent(data);
  if (typeof current !== 'string') {
    throw new Error(`Missing or non-string ${label} in ${relPath}`);
  }
  setNext(data, version);

  // Preserve 2-space indent and a trailing newline (repo convention).
  const next = JSON.stringify(data, null, 2) + '\n';
  await writeIfChanged(absPath, next, raw, label);
}

/**
 * Update the BERNSTEIN_VERSION literal in lib/version.ts.
 *
 * The constant is the offline floor for this very script and for the
 * runtime JSON-LD softwareVersion. Before this target existed the
 * literal only moved on manual bumps, so the homepage JSON-LD published
 * a different version from the build-synced public/ files whenever the
 * bump was missed. A targeted line rewrite keeps the constant pinned to
 * the live tag on every online build; an offline build leaves it as-is.
 */
async function syncVersionTs(version) {
  const absPath = path.join(repoRoot, 'lib', 'version.ts');
  const raw = await readFile(absPath, 'utf8');
  const re = /(export\s+const\s+BERNSTEIN_VERSION\s*=\s*['"])[^'"]+(['"])/;
  if (!re.test(raw)) {
    throw new Error('Could not find BERNSTEIN_VERSION literal in lib/version.ts');
  }
  const next = raw.replace(re, `$1${version}$2`);
  await writeIfChanged(absPath, next, raw, 'BERNSTEIN_VERSION');
}

/** Update the top-level `info.version` field in the OpenAPI YAML. */
async function syncOpenApiYaml(relPath, version) {
  const absPath = path.join(repoRoot, relPath);
  const raw = await readFile(absPath, 'utf8');
  // Match a `version:` key indented under `info:` (two-space indent),
  // not the top-level `openapi:` line. Replace only the value.
  const re = /^(\s{2}version:\s*).*$/m;
  if (!re.test(raw)) {
    throw new Error(`Could not find info.version line in ${relPath}`);
  }
  const next = raw.replace(re, `$1${version}`);
  await writeIfChanged(absPath, next, raw, 'info.version');
}

/**
 * The build-baked version, imported by rendered components that need a
 * fallback when the request-time release lookup fails.
 *
 * Carries the version and nothing else: a timestamp would rewrite the
 * file on every build and turn an unchanged version into a diff.
 */
async function writeVersionJson(version) {
  const absPath = path.join(repoRoot, 'data', 'bernstein-version.json');
  const next = `${JSON.stringify({ version }, null, 2)}\n`;
  const prev = await readFile(absPath, 'utf8').catch(() => '');
  await writeIfChanged(absPath, next, prev, 'version');
}

async function main() {
  const version = await resolveVersion();
  console.log(`Syncing agent-discovery surfaces to version ${version}`);

  await syncVersionTs(version);
  await writeVersionJson(version);

  /* The card carries the agent version under two keys: `version` is the
     one it has always shipped, `agentVersion` is the name the A2A card
     spec uses. Both are written from the same resolved value so the
     spec-named field cannot drift away from the historical one, and the
     read guard fails the build if either key is dropped from the file. */
  await syncJsonField(
    'public/.well-known/agent-card.json',
    version,
    (d) => (typeof d.agentVersion === 'string' ? d.version : undefined),
    (d, v) => {
      d.version = v;
      d.agentVersion = v;
    },
    '.version / .agentVersion',
  );

  await syncJsonField(
    'public/.well-known/mcp/server-card.json',
    version,
    (d) => d.serverInfo?.version,
    (d, v) => {
      d.serverInfo.version = v;
    },
    '.serverInfo.version',
  );

  /* structured-data.json carried a hand-edited softwareVersion that had
     already drifted two minor releases behind the tag it claimed. It is
     resolved here with the other discovery surfaces so the literal
     cannot go stale on its own. The node is located by @type rather
     than by array index so a future reorder of @graph does not silently
     write the field onto the wrong node. */
  await syncJsonField(
    'public/structured-data.json',
    version,
    (d) => d['@graph']?.find((n) => n['@type'] === 'SoftwareApplication')?.softwareVersion,
    (d, v) => {
      d['@graph'].find((n) => n['@type'] === 'SoftwareApplication').softwareVersion = v;
    },
    '.softwareVersion',
  );

  /* The three surfaces below were left out of the original sync and
     each carried a hand-edited literal that had drifted to 3.7.0 while
     the tag moved on. They are resolved here for the same reason
     structured-data.json is: a version literal nothing rewrites is a
     version literal that goes stale silently. */
  await syncJsonField(
    'public/agents.json',
    version,
    (d) => d.info?.version,
    (d, v) => {
      d.info.version = v;
    },
    '.info.version',
  );

  await syncJsonField(
    'public/.well-known/agents.json',
    version,
    (d) => d.info?.version,
    (d, v) => {
      d.info.version = v;
    },
    '.info.version',
  );

  await syncJsonField(
    'public/mcp-catalog.json',
    version,
    (d) => d.version,
    (d, v) => {
      d.version = v;
    },
    '.version',
  );

  await syncOpenApiYaml('public/openapi.yaml', version);

  console.log('Version sync complete.');
}

main().catch((err) => {
  console.error(`sync-version failed: ${err.message}`);
  process.exit(1);
});
