import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadManifest, pathOf, publishedRedirects, publishedSchemaHeaders } from '../lib/published-urls.mjs'

// Published identifiers must resolve. The live check is
// scripts/check-published-urls.mjs; this proves, offline and per PR, that
// the build will serve every manifest entry.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = loadManifest()
const byKind = (kind: string) => manifest.entries.filter((e: { kind: string }) => e.kind === kind)

test('every schema entry is a public file whose $id is its URL', () => {
  for (const entry of byKind('schema')) {
    const file = join(ROOT, 'public', pathOf(entry.url))
    assert.ok(existsSync(file), `missing public${pathOf(entry.url)}`)
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).$id, entry.url)
  }
})

test('every schema entry gets the schema media type', () => {
  const sources = publishedSchemaHeaders(manifest).map((h: { source: string }) => h.source)
  assert.deepEqual(sources, byKind('schema').map((e: { url: string }) => pathOf(e.url)))
})

test('every redirect entry is a 301 to its target', () => {
  const redirects = publishedRedirects(manifest)
  assert.equal(redirects.length, byKind('redirect').length)
  for (const r of redirects) {
    assert.equal(r.statusCode, 301)
    assert.ok(r.destination.startsWith('https://'), r.destination)
    assert.ok(!r.source.includes('{'), `unconverted placeholder in ${r.source}`)
  }
})

test('document entries are served by this site', () => {
  for (const entry of byKind('document')) {
    const path = pathOf(entry.url)
    const served = path === '/' || existsSync(join(ROOT, 'public', path))
    assert.ok(served, `nothing serves ${path}`)
  }
})

test('the skills catalog is a valid empty v1 catalog', () => {
  const catalog = JSON.parse(readFileSync(join(ROOT, 'public/skills-catalog.json'), 'utf8'))
  assert.deepEqual(Object.keys(catalog).sort(), ['entries', 'generated_at', 'version'])
  assert.equal(catalog.version, 1)
  assert.ok(Array.isArray(catalog.entries))
})

test('next.config.mjs wires the published URLs and /pricing', () => {
  const config = readFileSync(join(ROOT, 'next.config.mjs'), 'utf8')
  assert.match(config, /\.\.\.publishedRedirects\(\)/)
  assert.match(config, /\.\.\.publishedSchemaHeaders\(\)/)
  assert.match(config, /source: '\/pricing',\s*destination: '\/cost',\s*statusCode: 301/)
})
