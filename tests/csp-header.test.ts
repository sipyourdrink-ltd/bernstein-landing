import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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
    'report-uri',
    'report-to csp-endpoint',
  ]) {
    assert.ok(cspLine!.includes(directive), `CSP lost: ${directive}`)
  }
})
