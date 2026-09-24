#!/usr/bin/env node
/* Copy the published-identifier manifest and the JSON Schemas it names from
   a bernstein checkout into this site.

     data/published-urls.json   <- docs/reference/published-urls.json
     public/<url path>          <- each `schema` entry's `source`

   Each schema's $id is its URL, so the file served at that path must be the
   document the id names. A published version is immutable: a change ships
   as a new file with a new version in its path, never as an edit to an
   existing one. This script refuses to overwrite a differing copy for that
   reason; delete the local file deliberately if a re-publish is intended.

   Usage: node scripts/sync-published-urls.mjs /path/to/bernstein */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathOf } from '../lib/published-urls.mjs';

const core = process.argv[2];
if (!core) {
  console.error('usage: sync-published-urls.mjs /path/to/bernstein');
  process.exit(2);
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestSrc = join(core, 'docs/reference/published-urls.json');
const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));

let rc = 0;
for (const entry of manifest.entries) {
  if (entry.kind !== 'schema') continue;
  const src = join(core, entry.source);
  const dst = join(ROOT, 'public', pathOf(entry.url));
  const schema = JSON.parse(readFileSync(src, 'utf8'));
  if (schema.$id !== entry.url) {
    console.error(`${entry.source}: $id ${schema.$id} does not equal ${entry.url}`);
    rc = 1;
    continue;
  }
  if (existsSync(dst) && !readFileSync(dst).equals(readFileSync(src))) {
    console.error(`refusing to overwrite published schema ${pathOf(entry.url)} (content differs)`);
    rc = 1;
    continue;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`synced ${pathOf(entry.url)}`);
}
copyFileSync(manifestSrc, join(ROOT, 'data/published-urls.json'));
console.log('synced data/published-urls.json');
process.exit(rc);
