/**
 * Submit changed URLs to IndexNow after a successful `next build`.
 *
 * IndexNow is a free, no-account-required URL-submission protocol
 * supported by Bing, Yandex, Naver, Seznam, and Yep (Brave Search).
 * Google does NOT participate. One POST notifies all participating
 * engines through a federated relay.
 *
 * Strategy:
 *   1. Read the freshly-built static page list from `.next/server/app`
 *      (Next.js standalone) and from the route handlers' `loc` lines
 *      in `/sitemap.xml` (rendered separately).
 *   2. Diff against `data/last-sitemap-snapshot.json` (committed, but
 *      ignored by the build pipeline if missing).
 *   3. POST the diff (added + modified URLs) to
 *      `https://api.indexnow.org/indexnow` plus the Bing webmaster
 *      `/indexnow` endpoint as a backup channel.
 *   4. Update the snapshot file so the next build only reports new
 *      changes.
 *
 * Failure mode: log + continue. IndexNow failures must never block a
 * deploy. Quota guard: cap submissions at 10k URLs/day.
 *
 * Run: `node scripts/submit-indexnow.mjs`
 *      (chained as a postbuild step in package.json once committed.)
 *
 * An ownership-proof file must already be served at `/{key}.txt` from
 * `public/`: a 32-hex filename whose body is the same string. Whoever
 * holds the key can submit URL-change notices for the host, so the
 * files are supplied by the deployment rather than committed. When a
 * host serves more than one, this script picks the first alphabetically
 * as the canonical key; with none present it warns and returns without
 * blocking the deploy.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SNAPSHOT_FILE = path.join(ROOT, 'data', 'last-sitemap-snapshot.json');
const SITE_URL = process.env.SITE_URL ?? 'https://bernstein.run';
const SITE_HOST = new URL(SITE_URL).host;
const DAILY_QUOTA = 10000;

/**
 * Endpoints. The api.indexnow.org relay forwards to all participating
 * engines (Bing, Yandex, Naver, Seznam, Yep). Bing's own endpoint is
 * kept as a backup; both honour the same payload shape.
 */
const ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
];

/* If a runtime-configured endpoint list ever lands, prefer it over the
   hard-coded list above. Today the cache is read only when explicitly
   enabled with `INDEXNOW_USE_CACHE=1`. */
async function endpointsFromCache() {
  if (process.env.INDEXNOW_USE_CACHE !== '1') return null;
  /* future: hook up shared cache. Stub for now. */
  return null;
}

async function pickKey() {
  const entries = await fs.readdir(PUBLIC_DIR);
  const keyFiles = entries
    .filter((f) => /^[a-f0-9]{32}\.txt$/.test(f))
    .sort();
  if (keyFiles.length === 0) {
    throw new Error(
      `No IndexNow key file found in ${PUBLIC_DIR}. Generate one (32-hex-char filename, file content equals the key) per https://www.bing.com/indexnow/getstarted.`,
    );
  }
  const file = keyFiles[0];
  const key = file.replace(/\.txt$/, '');
  return { key, file: `${SITE_URL}/${file}` };
}

/**
 * Pull (loc, lastmod) pairs from the live sitemap. The site exposes a
 * dynamic sitemap at /sitemap.xml; we hit it locally via the build
 * output. If the build has been deployed already (typical CI flow),
 * we instead fetch from $SITE_URL/sitemap.xml.
 *
 * lastmod matters: IndexNow's purpose is notifying CHANGED content,
 * and a URL-set diff only catches additions. Snapshotting the pair
 * lets an edited page at an existing URL reach the retrieval layer
 * too. A <url> block with no <lastmod> maps to null.
 */
async function fetchSitemapEntries() {
  const url = `${SITE_URL}/sitemap.xml`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'bernstein-landing-indexnow/1.0' } });
    if (!r.ok) return [];
    const xml = await r.text();
    const out = [];
    const blockRe = /<url>([\s\S]*?)<\/url>/g;
    let m;
    while ((m = blockRe.exec(xml)) !== null) {
      const block = m[1];
      const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
      if (!loc) continue;
      const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? null;
      out.push({ loc, lastmod });
    }
    return out;
  } catch (e) {
    console.warn('[indexnow] failed to fetch sitemap:', e?.message ?? e);
    return [];
  }
}

/**
 * Previous (loc, lastmod) map. Reads the current v2 shape
 * ({ entries: { url: lastmod|null } }) and migrates the legacy v1
 * shape ({ urls: [...] }) as lastmod-unknown entries, so the first
 * build after the format change does not re-submit the whole site.
 */
async function loadSnapshot() {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, 'utf8');
    const data = JSON.parse(raw);
    const map = new Map();
    if (data?.entries && typeof data.entries === 'object') {
      for (const [u, lastmod] of Object.entries(data.entries)) {
        map.set(u, typeof lastmod === 'string' ? lastmod : null);
      }
    } else {
      for (const u of data?.urls ?? []) map.set(u, null);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function saveSnapshot(entries) {
  await fs.mkdir(path.dirname(SNAPSHOT_FILE), { recursive: true });
  const sorted = [...entries].sort((a, b) => a.loc.localeCompare(b.loc));
  const record = {};
  for (const { loc, lastmod } of sorted) record[loc] = lastmod;
  await fs.writeFile(
    SNAPSHOT_FILE,
    JSON.stringify({
      version: 2,
      generatedAt: new Date().toISOString(),
      entries: record,
    }, null, 2),
    'utf8',
  );
}

async function postBatch(endpoint, key, keyFile, urls) {
  /* IndexNow accepts up to 10k URLs per request. We chunk at 1k for
     network politeness and easier failure attribution. */
  const CHUNK = 1000;
  for (let i = 0; i < urls.length; i += CHUNK) {
    const slice = urls.slice(i, i + CHUNK);
    const body = JSON.stringify({
      host: SITE_HOST,
      key,
      keyLocation: keyFile,
      urlList: slice,
    });
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body,
      });
      const status = `${r.status} ${r.statusText}`;
      if (r.ok || r.status === 202) {
        // eslint-disable-next-line no-console
        console.log(`[indexnow] ${endpoint} chunk ${i / CHUNK + 1}: ok (${status}, ${slice.length} urls)`);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[indexnow] ${endpoint} chunk ${i / CHUNK + 1}: ${status} (${slice.length} urls)`);
      }
    } catch (e) {
      console.warn(`[indexnow] ${endpoint} chunk ${i / CHUNK + 1}: error`, e?.message ?? e);
    }
  }
}

async function main() {
  /* Submission is a deploy step, not a build step. `npm run build` runs
     this through `postbuild`, and CI runs `npm run build` on every push
     and pull request - so without this guard a green pull request would
     announce the production sitemap to the search engines. GitHub sets
     GITHUB_ACTIONS on every runner and nothing else does. */
  if (process.env.GITHUB_ACTIONS) {
    console.log('[indexnow] GitHub Actions: skipping submit (deploy-only step)');
    return;
  }

  const cachedEndpoints = await endpointsFromCache();
  const endpoints = cachedEndpoints ?? ENDPOINTS;

  let key, keyFile;
  try {
    ({ key, file: keyFile } = await pickKey());
  } catch (e) {
    console.warn('[indexnow]', e?.message ?? e);
    return; /* never block the deploy */
  }

  const live = await fetchSitemapEntries();
  if (live.length === 0) {
    console.warn('[indexnow] no sitemap URLs fetched; skipping submit');
    return;
  }

  const previous = await loadSnapshot();
  const liveLocs = new Set(live.map((e) => e.loc));
  const added = live.filter((e) => !previous.has(e.loc)).map((e) => e.loc);
  /* Changed = the URL existed last build AND its lastmod moved. A null
     on either side is treated as unchanged: the previous snapshot may
     be the lastmod-less v1 format, and a page with no <lastmod> gives
     us nothing to compare - submitting on null would re-submit the
     whole site on every build. */
  const changed = live
    .filter((e) => {
      if (!previous.has(e.loc)) return false;
      const prev = previous.get(e.loc);
      return prev !== null && e.lastmod !== null && prev !== e.lastmod;
    })
    .map((e) => e.loc);
  const removed = [...previous.keys()].filter((u) => !liveLocs.has(u));
  /* IndexNow only cares about additions and changes; removals are
     handled by the engines on next crawl. We do log them for the
     operator. */
  if (removed.length > 0) {
    console.log(`[indexnow] ${removed.length} URLs removed since last build (engines will drop them on next crawl).`);
  }

  const toSubmit = [...added, ...changed];
  if (toSubmit.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[indexnow] no URL changes since last build; nothing to submit');
    await saveSnapshot(live); /* still refresh the snapshot */
    return;
  }

  if (toSubmit.length > DAILY_QUOTA) {
    console.warn(
      `[indexnow] ${toSubmit.length} URL changes exceed DAILY_QUOTA (${DAILY_QUOTA}); truncating. Investigate why so many changed at once.`,
    );
    toSubmit.length = DAILY_QUOTA;
  }

  // eslint-disable-next-line no-console
  console.log(`[indexnow] submitting ${toSubmit.length} URLs (${added.length} new, ${changed.length} modified) to ${endpoints.length} endpoint(s)`);
  for (const endpoint of endpoints) {
    await postBatch(endpoint, key, keyFile, toSubmit);
  }

  await saveSnapshot(live);
}

main().catch((err) => {
  /* Any unhandled error is a non-fatal warning; never block deploy. */
  console.warn('[indexnow] submit failed:', err);
  process.exit(0);
});
