#!/usr/bin/env node
/* Fetch every published identifier in data/published-urls.json and fail
   unless each one resolves the way the manifest says it should:

     schema    200, application/schema+json, body $id equal to the URL
     document  2xx
     redirect  301 to the manifest target, and the target itself answers 2xx

   Redirects are not followed on the site itself, so a 404 behind a
   catch-all redirect cannot pass as a resolving identifier.

   Usage:
     node scripts/check-published-urls.mjs                 # live site
     node scripts/check-published-urls.mjs --base http://localhost:3000
     node scripts/check-published-urls.mjs --skip-targets  # do not fetch docs targets */

import { loadManifest, ORIGIN, pathOf, SCHEMA_CONTENT_TYPE } from '../lib/published-urls.mjs';

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const base = (baseIdx >= 0 ? args[baseIdx + 1] : ORIGIN).replace(/\/$/, '');
const skipTargets = args.includes('--skip-targets');

/* A per-run namespace such as /spdx/{id} is checked with a sample value. */
const SAMPLE_ID = 'example-run-id';

/* Site redirects that are not identifiers but must keep resolving. */
const EXTRA = [{ url: `${ORIGIN}/pricing`, kind: 'redirect', target: `${ORIGIN}/cost` }];

async function get(url, redirect) {
  return fetch(url, { redirect, headers: { 'user-agent': 'bernstein-published-url-check' } });
}

async function check(entry) {
  const path = pathOf(entry.url).replace('{id}', SAMPLE_ID);
  const res = await get(base + path, 'manual');
  const status = res.status;
  if (status < 200 || status >= 400) return `HTTP ${status}`;

  if (entry.kind === 'schema') {
    if (status !== 200) return `HTTP ${status}, expected 200`;
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith(SCHEMA_CONTENT_TYPE)) return `content-type ${type}`;
    const id = (await res.json()).$id;
    if (id !== entry.url) return `$id ${id}`;
    return null;
  }
  if (entry.kind === 'redirect') {
    if (status !== 301) return `HTTP ${status}, expected 301`;
    const location = new URL(res.headers.get('location') ?? '', base + path).href;
    const expected = entry.target.startsWith(ORIGIN) ? base + pathOf(entry.target) : entry.target;
    if (location !== expected) return `location ${location}, expected ${expected}`;
    if (skipTargets) return null;
    const target = await get(expected.split('#')[0], 'follow');
    if (!target.ok) return `target ${expected} answered HTTP ${target.status}`;
    return null;
  }
  return status >= 300 ? `HTTP ${status}, expected 2xx` : null;
}

const entries = [...loadManifest().entries, ...EXTRA];
const results = await Promise.all(
  entries.map(async (e) => [e, await check(e).catch((err) => String(err))]),
);
let failed = 0;
for (const [entry, problem] of results) {
  if (problem) failed += 1;
  console.log(`${problem ? 'FAIL' : 'ok  '}  ${entry.kind.padEnd(8)}  ${pathOf(entry.url)}${problem ? `  ${problem}` : ''}`);
}
console.log(`\n${entries.length - failed}/${entries.length} resolve against ${base}`);
process.exit(failed ? 1 : 0);
