#!/usr/bin/env node
/**
 * Regenerate `public/openapi.yaml` from the bernstein checkout.
 *
 * The document is served at https://bernstein.run/openapi.yaml and is
 * advertised from robots.txt, ai.txt, llms.txt, the agent card and the
 * API catalogue as the machine-readable description of the task server.
 * It was written by hand once and then drifted: it pinned an old
 * release and described seven endpoints out of four hundred and
 * fifty-five. An agent that reads a `service-desc` link and finds a
 * fraction of the surface has no way to know that is what happened.
 *
 * Source of truth: `docs/reference/openapi.json` in the bernstein repo,
 * which that project generates from its own routes.
 *
 * Two things are grafted back on, because they are true of this host
 * and not of the generated document:
 *
 *   servers          the task server runs on the reader's own machine,
 *                    so the entry is a URL template rather than a
 *                    hosted endpoint, and saying so is the whole point
 *                    of publishing the document here.
 *   /api/csp-report  the one path in this file that bernstein.run
 *                    itself answers. It carries its own `servers` entry
 *                    so the distinction survives.
 *
 * Tolerant by design: with no bernstein checkout reachable it warns and
 * leaves the committed document alone, the same contract as
 * `extract-adapters.mjs`.
 *
 * Run: `node scripts/sync-openapi.mjs` (wired into prebuild).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BERNSTEIN_REPO =
  process.env.BERNSTEIN_REPO ?? path.resolve(ROOT, '..', 'bernstein');

const UPSTREAM = path.join(BERNSTEIN_REPO, 'docs', 'reference', 'openapi.json');
const PYPROJECT = path.join(BERNSTEIN_REPO, 'pyproject.toml');
const TARGET = path.join(ROOT, 'public', 'openapi.yaml');

/** The path this origin answers, lifted from the committed document. */
const HOST_PATH = '/api/csp-report';

async function readVersion() {
  const raw = await fs.readFile(PYPROJECT, 'utf8');
  const m = raw.match(/^version\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error(`no version in ${PYPROJECT}`);
  return m[1];
}

async function main() {
  let upstream, version, current;
  try {
    [upstream, version, current] = await Promise.all([
      fs.readFile(UPSTREAM, 'utf8').then(JSON.parse),
      readVersion(),
      fs.readFile(TARGET, 'utf8').then((t) => YAML.parse(t)),
    ]);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.warn(
        `[openapi] bernstein repo missing at ${BERNSTEIN_REPO}; keeping committed public/openapi.yaml`,
      );
      return;
    }
    throw err;
  }

  const spec = { ...upstream };
  spec.info = { ...upstream.info, version };

  /* Licence and contact are ours to state and the generator does not
     emit them; carry whatever the committed document had. */
  for (const key of ['license', 'contact']) {
    if (current.info?.[key] && !spec.info[key]) spec.info[key] = current.info[key];
  }

  if (current.servers) spec.servers = current.servers;

  const hostPath = current.paths?.[HOST_PATH];
  if (!hostPath) {
    throw new Error(
      `${HOST_PATH} is missing from the committed document. It is the one path ` +
        'this origin answers and the generated spec does not describe it; ' +
        'restore it before regenerating, or drop this graft deliberately.',
    );
  }
  spec.paths = { ...upstream.paths, [HOST_PATH]: hostPath };

  const before = {
    version: current.info?.version,
    paths: Object.keys(current.paths ?? {}).length,
  };
  const next = YAML.stringify(spec, { lineWidth: 100 });
  if (next === (await fs.readFile(TARGET, 'utf8'))) {
    console.log(`[openapi] up to date (${version}, ${Object.keys(spec.paths).length} paths)`);
    return;
  }
  await fs.writeFile(TARGET, next, 'utf8');
  console.log(
    `[openapi] ${before.version} → ${version}, ${before.paths} → ${Object.keys(spec.paths).length} paths`,
  );
}

await main();
