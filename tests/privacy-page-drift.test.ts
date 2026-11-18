import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { checkPrivacyDrift } from './helpers/privacy-drift.ts';
import { checkPublishedPrivacySurfaces } from './helpers/privacy-surfaces.ts';

const privacyPath = 'app/privacy/page.tsx';
const eventPath = 'lib/analytics/outbound.ts';
const fixturePath = 'public/privacy-fixture.js';
const sourceExtension = /\.[cm]?[jt]sx?$/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filename);
    return sourceExtension.test(filename) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(filename)
      ? [filename] : [];
  });
}

const filenames = ['app', 'components', 'lib', 'public'].flatMap(sourceFiles)
  .concat('middleware.ts', 'next.config.mjs').sort();
const sources = new Map(filenames.map((filename) => [filename, readFileSync(filename, 'utf8')]));

test('public storage and browser events match the published privacy page', () => {
  const result = checkPrivacyDrift(sources);
  assert.deepEqual(result.issues, []);
  assert.ok(result.storageKeys.has('beta-notice:dismissed'));
  assert.ok(result.storageKeys.has('umami:disabled'));
  assert.ok(result.events.get('outbound-click')?.has('destination'));
});

const fixture = new Map([
  [privacyPath, sources.get(privacyPath)!],
  [eventPath, sources.get(eventPath)!],
  [fixturePath, [
    "import { OUTBOUND_CLICK_EVENT as outboundClick } from '../lib/analytics/outbound';",
    "const dismissed = 'beta-notice:dismissed';",
    "window.localStorage?.setItem(dismissed, '1');",
    "localStorage.getItem('umami:disabled');",
    "window.umami?.track(outboundClick, { destination: 'example.test' });",
  ].join('\n')],
]);

function replaceFixture(before: string, after: string): ReadonlyMap<string, string> {
  const original = fixture.get(fixturePath)!;
  assert.ok(original.includes(before));
  return new Map(fixture).set(fixturePath, original.replace(before, after));
}

function issuesFor(source: ReadonlyMap<string, string>): string {
  return checkPrivacyDrift(source).issues.join('\n');
}

test('recognizes literal and imported immutable events, ignoring prose and comments', () => {
  assert.equal(issuesFor(fixture), '');
  const changed = replaceFixture(
    'window.umami?.track(outboundClick,',
    "// window.umami.track('example-comment', {});\nwindow['umami']?.['track']?.('outbound-click',",
  );
  assert.equal(issuesFor(changed), '');
});

test('reports an added storage key at the call site', () => {
  const changed = replaceFixture(
    "localStorage.getItem('umami:disabled');",
    "localStorage.getItem('umami:disabled');\nwindow.localStorage.setItem('example:preference', '1');",
  );
  assert.match(issuesFor(changed), /public\/privacy-fixture\.js:5:.*example:preference.*not documented/);
});

test('reports a stale documented key at its privacy entry', () => {
  const changed = replaceFixture("window.localStorage?.setItem(dismissed, '1');", '');
  const line = sources.get(privacyPath)!.split('\n').findIndex((text) => text.includes('data-storage-key>beta-notice:dismissed')) + 1;
  assert.ok(line > 0);
  assert.equal(issuesFor(changed), `${privacyPath}:${line}: documented storage key beta-notice:dismissed is unused`);
});

test('reports session storage and cookies in ordinary runtime forms', () => {
  const changed = new Map(fixture).set(fixturePath, [
    fixture.get(fixturePath)!,
    "sessionStorage['getItem']('umami:disabled');",
    "document['cookie'];",
    "request.headers.get('Cookie');",
    "import { cookies as readCookies } from 'next/headers';",
    "readCookies();",
    "new Headers({ 'Set-Cookie': 'example=1' });",
    "new Response(null, { headers: [['Set-Cookie', 'example=1']] });",
  ].join('\n'));
  const issues = issuesFor(changed);
  assert.match(issues, /public\/privacy-fixture\.js:6:.*sessionStorage/);
  for (const line of [7, 8, 10, 11, 12]) {
    assert.match(issues, new RegExp('public/privacy-fixture\\.js:' + line + ':.*cookie', 'i'));
  }
});

test('reports an added event and an added event field with their source lines', () => {
  const name = replaceFixture('track(outboundClick,', "track('example-event',");
  assert.match(issuesFor(name), /public\/privacy-fixture\.js:5:.*example-event.*not documented/);
  const field = replaceFixture(
    "{ destination: 'example.test' }",
    "{ destination: 'example.test',\n  format: 'text' }",
  );
  assert.match(issuesFor(field), /public\/privacy-fixture\.js:6:.*format.*not documented/);
});

test('rejects both a mutable exported event and a shadowing mutable event', () => {
  const changed = new Map(fixture).set(eventPath, sources.get(eventPath)!
    .replace('export const OUTBOUND_CLICK_EVENT', 'export let OUTBOUND_CLICK_EVENT'));
  assert.match(issuesFor(changed), /public\/privacy-fixture\.js:5:.*immutable const/);
  const shadowed = replaceFixture(
    'window.umami?.track(outboundClick,',
    "function onClick() {\n  let outboundClick = 'outbound-click';\n  window.umami?.track(outboundClick,",
  );
  const closed = new Map(shadowed).set(fixturePath, shadowed.get(fixturePath)! + '\n}');
  assert.match(issuesFor(closed), /public\/privacy-fixture\.js:7:.*immutable const/);
});

test('reports runtime uses in the tracker type and opt-out source files', () => {
  for (const filename of [eventPath, 'lib/analytics/disable.ts']) {
    const original = sources.get(filename)!;
    const changed = new Map(fixture).set(filename, original + "\nconst tracker = window.umami;");
    assert.ok(issuesFor(changed).includes(`${filename}:${original.split('\n').length + 1}:`));
  }
});

test('rejects unsupported ordinary tracker calls and data with a diagnostic', () => {
  for (const [code, diagnostic] of [
    ['const tracker = window.umami;', /direct.*track/],
    ['const { umami } = window;', /direct.*track/],
    ['const track = window.umami?.track;', /direct.*track/],
    ['receive(window.umami);', /direct.*track/],
    ['window.umami?.[method](outboundClick, { destination });', /direct.*track/],
    ['window.umami?.track(outboundClick, eventData);', /inline object/],
    ['window.umami?.track(outboundClick, { ...eventData });', /named properties/],
    ['window.umami?.track(outboundClick, { [name]: value });', /named properties/],
    ['window.umami?.track(outboundClick, { destination() { return value; } });', /named properties/],
    ['window.umami?.track(outboundClick);', /two arguments/],
    ['window.umami?.track(outboundClick, { destination }, value);', /two arguments/],
  ] as const) {
    const changed = new Map(fixture).set(fixturePath, fixture.get(fixturePath)! + '\n' + code);
    const issues = issuesFor(changed);
    assert.match(issues, /public\/privacy-fixture\.js:6:/, code);
    assert.match(issues, diagnostic, code);
  }
});

test('reads declarative tracker event names and properties in JSX', () => {
  const filename = 'components/PrivacyFixture.tsx';
  const code = '<a data-umami-event="outbound-click" data-umami-event-destination="example.test" />';
  const changed = new Map(fixture).set(filename, code);
  assert.equal(issuesFor(changed), '');
  changed.set(filename, code.replace('-destination', '-format'));
  assert.match(issuesFor(changed), /components\/PrivacyFixture\.tsx:1:.*format.*not documented/);
});

test('an inline storage key reports the source line of the script', () => {
  const filename = 'components/PrivacyFixture.tsx';
  const changed = new Map(fixture).set(filename, [
    "const preference = 'example:preference';",
    'const script = `',
    "  localStorage.getItem('${preference}');",
    '`;',
    'export const fixture = <script dangerouslySetInnerHTML={{ __html: script }} />;',
  ].join('\n'));
  assert.match(issuesFor(changed), /components\/PrivacyFixture\.tsx:3:.*example:preference.*not documented/);
});

test('the tracker settings, input routes and service information match /privacy', () => {
  assert.deepEqual(checkPublishedPrivacySurfaces(sources), []);
});

const surfaceFiles = [
  privacyPath, 'app/layout.tsx', 'lib/analytics/disable.ts', 'next.config.mjs', 'app/humans.txt/route.ts',
  'components/docs-bot/useSseStream.ts', 'components/landing/EmailCapture.tsx',
  'components/landing/EmailStrip.tsx', 'components/blog/ArticleCompression.tsx',
];
const surfaceFixture = new Map(surfaceFiles.map((filename) => [filename, sources.get(filename)!]));

test('reports script, hook, endpoint and service drift at the changed source', () => {
  for (const [filename, before, after, diagnostic] of [
    ['app/layout.tsx', 'https://analytics.bernstein.run/script.js', 'https://analytics.example.test/script.js', /host.*analytics\.example\.test/],
    ['app/layout.tsx', 'data-before-send={UMAMI_BEFORE_SEND}', "data-before-send='anotherHook'", /before-send/],
    ['app/layout.tsx', 'data-before-send={UMAMI_BEFORE_SEND}', 'data-performance="true" data-before-send={UMAMI_BEFORE_SEND}', /analytics measurements/],
    ['lib/analytics/disable.ts', "['q', 'ask']", "['q', 'query']", /query parameters/],
    ['lib/analytics/disable.ts', 'out.url === lastView', 'out.url !== lastView', /duplicate page views/],
    ['components/docs-bot/useSseStream.ts', "'/api/ask'", "'/api/questions'", /\/api\/questions.*not documented/],
    ['components/landing/EmailCapture.tsx', "'/api/notify'", "'/api/ask'", /does not match \/api\/notify/],
    ['next.config.mjs', "'/api/csp-report'", "'/api/report'", /\/api\/report.*not documented/],
    ['app/humans.txt/route.ts', 'Email: Resend', 'Email: Example Mail', /Example Mail.*not named/],
    ['app/humans.txt/route.ts', 'CDN: Cloudflare', 'CDN: Resend', /Resend.*not named as the CDN/],
  ] as const) {
    const original = sources.get(filename)!;
    assert.ok(original.includes(before), before);
    const line = original.slice(0, original.indexOf(before)).split('\n').length;
    const changed = new Map(surfaceFixture).set(filename, original.replace(before, after));
    const issues = checkPublishedPrivacySurfaces(changed);
    assert.ok(issues.some((issue) => issue.startsWith(`${filename}:${line}:`) && diagnostic.test(issue)), issues.join('\n'));
  }
});
