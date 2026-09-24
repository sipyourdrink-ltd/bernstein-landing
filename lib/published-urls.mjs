/* Published identifiers must resolve.

   The bernstein package writes absolute https://bernstein.run/ URLs into
   what it signs and exports: predicate types, schema $id values,
   namespaces, catalog URLs. `data/published-urls.json` is the package's
   own manifest of those URLs (docs/reference/published-urls.json in the
   bernstein repo, copied here by scripts/sync-published-urls.mjs), and the
   package's test suite keeps it equal to the set of literals it emits.

   Each entry is served one of three ways:
     schema    the JSON Schema file under public/, whose $id is the URL
     document  a file or page this site already serves
     redirect  a 301 to the docs section that defines the identifier

   Plain .mjs so next.config.mjs, the node tests and the scripts can all
   import it without a build step. */

import { readFileSync } from 'node:fs';

export const ORIGIN = 'https://bernstein.run';
export const SCHEMA_CONTENT_TYPE = 'application/schema+json';

const MANIFEST_URL = new URL('../data/published-urls.json', import.meta.url);

export function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_URL, 'utf8'));
}

/** Path of a manifest URL on this site: `https://bernstein.run/a/b` -> `/a/b`. */
export function pathOf(url) {
  if (!url.startsWith(`${ORIGIN}/`)) throw new Error(`not a ${ORIGIN} URL: ${url}`);
  return url.slice(ORIGIN.length);
}

/** Next.js redirect entries for every `redirect` identifier. A `{id}`
    placeholder in the manifest (a per-run namespace) becomes a `:id`
    segment, so every concrete value redirects to the one definition. */
export function publishedRedirects(manifest = loadManifest()) {
  return manifest.entries
    .filter((e) => e.kind === 'redirect')
    .map((e) => ({
      source: pathOf(e.url).replace('{id}', ':id'),
      destination: e.target,
      statusCode: 301,
    }));
}

/** Header entries giving every published schema its schema media type.
    Next's static server infers from the extension, which gives
    application/json for `.json` and octet-stream for an extensionless $id
    such as /schemas/scorecard/v1. A preset Content-Type wins. */
export function publishedSchemaHeaders(manifest = loadManifest()) {
  return manifest.entries
    .filter((e) => e.kind === 'schema')
    .map((e) => ({
      source: pathOf(e.url),
      headers: [
        { key: 'Content-Type', value: `${SCHEMA_CONTENT_TYPE}; charset=utf-8` },
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=86400' },
      ],
    }));
}
