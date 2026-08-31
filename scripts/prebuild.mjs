#!/usr/bin/env node
/**
 * Pre-build pipeline.
 *
 * Each step regenerates one machine-readable surface from a source of
 * truth outside the site: the adapter catalogue, the CLI reference, the
 * version stamp, file mtimes for sitemap lastmod. Steps are ordered but
 * independent — a later one never reads an earlier one's output.
 *
 * Some steps ship with the host rather than with this repository (the
 * retrieval index and the comparison dataset are built from data the
 * host holds). Those scripts are absent here by design. A missing step
 * is announced and skipped so a checkout of this repository builds on
 * its own; a step that is present and fails still fails the build.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const STEPS = [
  'scripts/build-docs-index.mjs',
  'scripts/extract-adapters.mjs',
  'scripts/extract-cli.mjs',
  'scripts/gen-compare-data.mjs',
  'scripts/sync-adapter-count.mjs',
  'scripts/sync-version.mjs',
  'scripts/build-source-mtimes.mjs',
];

let skipped = 0;
for (const step of STEPS) {
  if (!existsSync(step)) {
    console.log(`prebuild: skipping ${step} (host-supplied, not in this checkout)`);
    skipped += 1;
    continue;
  }
  console.log(`prebuild: ${step}`);
  const r = spawnSync(process.execPath, [step], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`prebuild: ${step} exited ${r.status}`);
    process.exit(r.status ?? 1);
  }
}
console.log(`prebuild: ${STEPS.length - skipped}/${STEPS.length} steps ran`);
