import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import nextConfig from '../next.config.mjs'

const require = createRequire(import.meta.url)
const loadCustomRoutes = require('next/dist/lib/load-custom-routes').default as (
  cfg: typeof nextConfig,
) => Promise<{
  headers: Array<{
    source: string
    has?: Array<{ type: string; key?: string; value?: string }>
    missing?: Array<{ type: string; key?: string; value?: string }>
    headers: Array<{ key: string; value: string }>
  }>
}>
const { pathToRegexp } = require('next/dist/compiled/path-to-regexp') as {
  pathToRegexp: (source: string) => RegExp
}

// The page CSP lives in a template literal inside next.config.mjs, which is
// not importable from a test without evaluating the whole Next config. Read
// the source and assert on the directive list directly — the point is that a
// directive cannot be dropped in an unrelated edit without a test noticing.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = readFileSync(join(ROOT, 'next.config.mjs'), 'utf8')

const cspLine = config
  .split('\n')
  .find((l) => l.includes("default-src 'self'") && l.includes('script-src'))

test('the page CSP is present in next.config.mjs', () => {
  assert.ok(cspLine, 'no Content-Security-Policy value found in next.config.mjs')
})

test('framing is denied by CSP, not only by X-Frame-Options', () => {
  // X-Frame-Options is legacy-UA coverage; modern browsers that see a CSP
  // ignore it. Without frame-ancestors the modern posture is "no restriction".
  assert.match(cspLine!, /frame-ancestors 'self';/)
  assert.match(config, /X-Frame-Options/)
})

test('the directives that carry the rest of the posture are still there', () => {
  for (const directive of [
    "default-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self';",
    'report-uri',
    'report-to csp-endpoint',
  ]) {
    assert.ok(cspLine!.includes(directive), `CSP lost: ${directive}`)
  }
})

test('CSP excludes retired ConvertKit origin and keeps connect-src/script-src tight', () => {
  const tokens = config.split(/[^a-z0-9.-]+/i)
  assert.ok(
    !tokens.some((token) => token === 'app.kit.com' || token === 'kit.com'),
    'next.config.mjs still allows legacy ConvertKit origin in CSP',
  )
  assert.match(config, /const scriptSrc = \[\s*"'self'",\s*"'unsafe-inline'",\s*\.\.\.\(isDev \? \["'unsafe-eval'"\] : \[\]\),\s*'https:\/\/analytics\.bernstein\.run',\s*\]/m)
  assert.match(config, /const connectSrc = \[\s*"'self'",\s*\.\.\.\(isDev \? \['ws:\/\/localhost:\*', 'ws:\/\/127\.0\.0\.1:\*'\] : \[\]\),\s*'https:\/\/analytics\.bernstein\.run',\s*\]/m)
})

test('next.config headers compile via Next loadCustomRoutes and enforce noindex + safe caching on .md twins and discovery files', async () => {
  const compiled = await loadCustomRoutes(nextConfig)

  function effectiveHeaders(pathname: string, accept = 'text/html,application/xhtml+xml,*/*;q=0.8') {
    const out = new Map<string, string>()
    for (const rule of compiled.headers) {
      if (!pathToRegexp(rule.source).test(pathname)) continue
      if (
        rule.has?.some(
          (c) => c.type === 'header' && c.key === 'accept' && c.value && !new RegExp(`^${c.value}$`).test(accept),
        )
      ) {
        continue
      }
      if (
        rule.missing?.some(
          (c) => c.type === 'header' && c.key === 'accept' && c.value && new RegExp(`^${c.value}$`).test(accept),
        )
      ) {
        continue
      }
      for (const h of rule.headers) out.set(h.key.toLowerCase(), h.value)
    }
    return out
  }

  /* Wave-2 JSON/txt discovery surfaces get X-Robots-Tag: noindex, follow */
  for (const disc of ['/llms-ctx.txt', '/spec/agent-failure-taxonomy/v0.1.json']) {
    assert.equal(effectiveHeaders(disc).get('x-robots-tag'), 'noindex, follow', `${disc} must be noindex, follow`)
  }

  /* Every explicit .md twin gets noindex, follow AND Cache-Control: no-store
     (including /blog/:slug.md so :slug in /blog/:slug cannot stamp s-maxage=600) */
  for (const mdTwin of [
    '/index.md',
    '/about.md',
    '/cost.md',
    '/cli-quickstart.md',
    '/spec-driven.md',
    '/spec/agent-failure-taxonomy/v0.1.md',
    '/tools/agent-md-bench.md',
    '/q.md',
    '/q/what-is-bernstein.md',
    '/blog/getting-started.md',
  ]) {
    const h = effectiveHeaders(mdTwin)
    assert.equal(h.get('x-robots-tag'), 'noindex, follow', `${mdTwin} must get X-Robots-Tag: noindex, follow`)
    assert.equal(h.get('cache-control'), 'no-store', `${mdTwin} must get Cache-Control: no-store`)
  }

  /* /auth.md and /AGENTS.md keep their discovery Cache-Control while remaining noindex, follow */
  for (const staticMd of ['/auth.md', '/AGENTS.md']) {
    const h = effectiveHeaders(staticMd)
    assert.equal(h.get('x-robots-tag'), 'noindex, follow', `${staticMd} must stay noindex, follow`)
    assert.match(h.get('cache-control') ?? '', /s-maxage=3600/, `${staticMd} must retain discovery s-maxage`)
  }

  /* Canonical HTML pages remain indexable and edge-cached for browsers */
  for (const htmlPage of ['/', '/cost', '/blog/getting-started']) {
    const h = effectiveHeaders(htmlPage)
    assert.match(h.get('x-robots-tag') ?? '', /^index, follow/, `${htmlPage} must remain index, follow`)
    assert.match(h.get('cache-control') ?? '', /s-maxage=600/, `${htmlPage} must retain browser s-maxage=600`)
  }
})
