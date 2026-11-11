/**
 * Keeps /privacy equal to what the code does.
 *
 * Collects, from the site's source, every key passed to
 * localStorage/sessionStorage getItem/setItem/removeItem and every
 * analytics event the site can emit (`data-umami-event` attributes and
 * `umami.track(...)` calls). Fails when a storage key is not named on
 * the privacy page, when an event outside the allowed set appears, or
 * when the page and the code disagree about cookies and session storage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIRS = ['app', 'components', 'lib'];
const SOURCE_FILES = ['middleware.ts'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

/** The only custom analytics event the privacy page describes. */
const ALLOWED_EVENTS = new Set(['outbound-click']);
/** The only property that event may carry. */
const ALLOWED_EVENT_PROPS = new Set(['destination']);

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
}

const files: string[] = [];
for (const d of SOURCE_DIRS) walk(path.join(ROOT, d), files);
for (const f of SOURCE_FILES) files.push(path.join(ROOT, f));
/* The privacy page is prose about the keys, not a user of them. */
const PROSE = new Set(['app/privacy/page.tsx']);
const sources = new Map(
  files
    .map((f) => path.relative(ROOT, f))
    .filter((rel) => !PROSE.has(rel))
    .map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')] as const),
);

/** Strip block and line comments so prose about storage is not counted. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/* `const NAME = 'value'` anywhere in the source, so an identifier passed
   to getItem/track can be resolved to the literal it stands for. */
const constants = new Map<string, string>();
for (const src of sources.values()) {
  for (const m of src.matchAll(/\bconst\s+([A-Z_][A-Z0-9_]*)\s*(?::\s*string\s*)?=\s*'([^']*)'/g)) {
    constants.set(m[1], m[2]);
  }
}

function resolve(arg: string, where: string): string {
  const a = arg.trim();
  /* '${NAME}' inside a template string that builds an inline script */
  let m = /^'\$\{([A-Z_][A-Z0-9_]*)\}'$/.exec(a);
  if (m && constants.has(m[1])) return constants.get(m[1])!;
  m = /^['"]([^'"$]*)['"]$/.exec(a);
  if (m) return m[1];
  if (constants.has(a)) return constants.get(a)!;
  assert.fail(`${where}: cannot resolve the storage key or event name ${a}; use a literal or a top-level const`);
}

const storageKeys = new Map<string, string>();
let sessionStorageUsed = false;
const cookieAccess: string[] = [];
const events = new Map<string, string>();
const eventProps: string[] = [];

for (const [rel, src] of sources) {
  const body = code(src);
  for (const m of body.matchAll(/\b(localStorage|sessionStorage)\s*\??\.\s*(\w+)\s*\(([^,)]*)/g)) {
    const [, store, method, arg] = m;
    assert.ok(
      ['getItem', 'setItem', 'removeItem'].includes(method),
      `${rel}: ${store}.${method} - storage must go through getItem/setItem/removeItem so this test can see the key`,
    );
    if (store === 'sessionStorage') sessionStorageUsed = true;
    storageKeys.set(resolve(arg, rel), rel);
  }
  if (/\b(local|session)Storage\s*\[/.test(body)) assert.fail(`${rel}: bracket access to web storage`);
  if (/document\s*\.\s*cookie|cookieStore|\bcookies\s*\(\s*\)|set-cookie/i.test(body)) cookieAccess.push(rel);

  for (const m of body.matchAll(/data-umami-event(-[\w-]+)?\s*=\s*(\{[^}]*\}|"[^"]*"|'[^']*')/g)) {
    if (m[1]) eventProps.push(`${rel}: data-umami-event${m[1]}`);
    else events.set(resolve(m[2].replace(/^\{|\}$/g, ''), rel), rel);
  }
  for (const m of body.matchAll(/umami\s*\??\.\s*track\s*\(\s*([^,)]+)\s*(?:,\s*\{([^}]*)\})?/g)) {
    events.set(resolve(m[1], rel), rel);
    for (const prop of (m[2] ?? '').split(',').map((p) => p.split(':')[0].trim()).filter(Boolean)) {
      if (!ALLOWED_EVENT_PROPS.has(prop)) eventProps.push(`${rel}: event property ${prop}`);
    }
  }
}

const privacy = fs.readFileSync(path.join(ROOT, 'app/privacy/page.tsx'), 'utf8');

test('the scan finds the storage keys and the event it is meant to find', () => {
  /* Guards the scanner itself: if a refactor hides these from the
     regexes, every other assertion here would pass vacuously. */
  assert.ok(storageKeys.has('umami:disabled'), [...storageKeys.keys()].join(', '));
  assert.ok(storageKeys.has('beta-notice:dismissed'), [...storageKeys.keys()].join(', '));
  assert.ok(events.has('outbound-click'), [...events.keys()].join(', '));
});

test('every web-storage key the code uses is named on /privacy', () => {
  for (const [key, rel] of storageKeys) {
    assert.ok(privacy.includes(key), `${key} (used in ${rel}) is not named on app/privacy/page.tsx`);
  }
});

test('every key named on /privacy as a storage entry is still used', () => {
  for (const m of privacy.matchAll(/<code>([a-z][\w-]*:[\w:-]+)<\/code>/g)) {
    assert.ok(storageKeys.has(m[1]), `/privacy names ${m[1]}, which no code reads or writes`);
  }
});

test('session storage matches the page', () => {
  assert.equal(sessionStorageUsed, false, 'code uses sessionStorage; update /privacy, which says it is not used');
  assert.match(privacy, /uses no session storage/);
});

test('cookies match the page', () => {
  assert.deepEqual(cookieAccess, [], 'code touches cookies; /privacy says the site sets and reads none');
  assert.match(privacy, /sets no cookies/);
});

test('only the allowed analytics event is emitted, with only the allowed property', () => {
  for (const [name, rel] of events) {
    assert.ok(ALLOWED_EVENTS.has(name), `${rel} emits ${name}, which /privacy does not describe`);
    assert.ok(privacy.includes(name), `${name} is not named on /privacy`);
  }
  assert.deepEqual(eventProps, []);
});

test('the analytics script tag matches the page', () => {
  const layout = sources.get('app/layout.tsx')!;
  const host = /src="https:\/\/([^/"]+)\/script\.js"/.exec(layout)?.[1];
  assert.ok(host, 'analytics script tag not found in app/layout.tsx');
  assert.ok(privacy.includes(host), `/privacy does not name the analytics host ${host}`);
  /* Measurements beyond page views would need their own sentence. */
  assert.doesNotMatch(layout, /data-performance|data-tag=|data-auto-track="false"/);
  assert.match(layout, /data-before-send=/, 'the opt-out hook is not wired to the tracker');
});

test('the routes that receive visitor input are named on the page', () => {
  /* Text typed into the docs assistant and the e-mail form goes to these
     same-origin routes; the page says so by path. */
  const ask = sources.get('components/docs-bot/useSseStream.ts') ?? '';
  assert.match(ask, /const ENDPOINT = '\/api\/ask'/, 'docs assistant endpoint moved; update this test and /privacy');
  const notifyCallers = [...sources].filter(([, src]) => /fetch\('\/api\/notify'/.test(src));
  assert.ok(notifyCallers.length > 0, 'no caller of /api/notify found; update this test and /privacy');
  for (const route of ['/api/ask', '/api/notify', '/api/csp-report']) {
    assert.ok(privacy.includes(route), `/privacy does not name ${route}`);
  }
});

test('humans.txt names the same mail service and CDN as /privacy', () => {
  const humans = sources.get('app/humans.txt/route.ts')!;
  for (const field of ['Email', 'CDN']) {
    const value = new RegExp(`'${field}: ([^']+)'`).exec(humans)?.[1];
    assert.ok(value, `humans.txt has no ${field} line`);
    assert.ok(privacy.includes(value), `humans.txt says ${field}: ${value}, which /privacy does not name`);
  }
});
