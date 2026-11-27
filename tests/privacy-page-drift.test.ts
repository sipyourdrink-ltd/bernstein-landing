import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { checkPrivacyDrift } from './helpers/privacy-drift.ts';
import { checkPublishedPrivacySurfaces } from './helpers/privacy-surfaces.ts';

const privacyPath = 'app/privacy/page.tsx';
const eventPath = 'lib/analytics/outbound.ts';
const installEventPath = 'lib/analytics/events.ts';
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
  assert.ok(result.storageKeys.has('umami.disabled'));
  assert.ok(result.events.get('outbound-click')?.has('destination'));
  assert.ok(result.events.get('install-snippet-copy')?.has('method'));
  assert.ok(result.events.get('ai-referral')?.has('source'));
});

const fixture = new Map([
  [privacyPath, sources.get(privacyPath)!],
  [eventPath, sources.get(eventPath)!],
  ...(sources.has(installEventPath) ? [[installEventPath, sources.get(installEventPath)!] as const] : []),
  [fixturePath, [
    "import { OUTBOUND_CLICK_EVENT as outboundClick } from '../lib/analytics/outbound';",
    "import { AI_REFERRAL_EVENT as aiReferral, INSTALL_COPY_EVENT as installCopy } from '../lib/analytics/events';",
    "const dismissed = 'beta-notice:dismissed';",
    "window.localStorage?.setItem(dismissed, '1');",
    "localStorage.getItem('umami:disabled');",
    "localStorage.getItem('umami.disabled');",
    "window.umami?.track(outboundClick, { destination: 'example.test' });",
    "window.umami?.track(installCopy, { method: 'pipx' });",
    "window.umami?.track(aiReferral, { source: 'claude.ai' });",
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
    "localStorage.getItem('umami.disabled');",
    "localStorage.getItem('umami.disabled');\nwindow.localStorage.setItem('example:preference', '1');",
  );
  assert.match(issuesFor(changed), /public\/privacy-fixture\.js:7:.*example:preference.*not documented/);
});

test('reports writing to either read-only opt-out key', () => {
  for (const key of ['umami:disabled', 'umami.disabled']) {
    const changed = new Map(fixture).set(
      fixturePath,
      fixture.get(fixturePath)! + `\nwindow.localStorage.setItem('${key}', '1');`,
    );
    assert.match(issuesFor(changed), /public\/privacy-fixture\.js:10:.*read-only/);
  }
});

test('resolves immutable property names and nested browser globals', () => {
  const controls = [
    "const trackerProperty = 'umami';",
    "const trackMethod = 'track';",
    "const storageProperty = 'localStorage';",
    "const browser = globalThis.window;",
    "browser[trackerProperty]?.[trackMethod]('outbound-click', { destination: 'example.test' });",
    "window.document.defaultView[storageProperty].getItem('beta-notice:dismissed');",
  ].join('\n');
  const original = fixture.get(fixturePath)! + '\n' + controls;
  const changed = new Map(fixture).set(fixturePath, original);
  assert.equal(issuesFor(changed), '');
  changed.set(fixturePath, original.replace("[trackMethod]('outbound-click'", "[trackMethod]('example-event'"));
  assert.match(issuesFor(changed), /public\/privacy-fixture\.js:14:.*example-event.*not documented/);
  changed.set(fixturePath, original.replace(".getItem('beta-notice:dismissed')", ".getItem('example:preference')"));
  assert.match(issuesFor(changed), /public\/privacy-fixture\.js:15:.*example:preference.*not documented/);
  changed.set(fixturePath, original.replace("const trackerProperty", "let trackerProperty"));
  assert.match(issuesFor(changed), /public\/privacy-fixture\.js:14:.*browser property.*immutable const/);
  changed.set(fixturePath, original + "\nconst cookieProperty = 'cookie';\nwindow.document[cookieProperty];");
  assert.match(issuesFor(changed), /public\/privacy-fixture\.js:17:.*cookie access/);
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
  assert.match(issues, /public\/privacy-fixture\.js:10:.*sessionStorage/);
  for (const line of [11, 12, 14, 15, 16]) {
    assert.match(issues, new RegExp('public/privacy-fixture\\.js:' + line + ':.*cookie', 'i'));
  }
});

test('reports an added event and an added event field with their source lines', () => {
  const name = replaceFixture(
    'track(outboundClick,',
    "track(outboundClick, { destination: 'example.test' });\nwindow.umami?.track('example-event',",
  );
  assert.match(issuesFor(name), /public\/privacy-fixture\.js:8:.*example-event.*not documented/);
  const field = replaceFixture(
    "{ destination: 'example.test' }",
    "{ destination: 'example.test',\n  format: 'text' }",
  );
  assert.match(issuesFor(field), /public\/privacy-fixture\.js:8:.*format.*not documented/);
});

test('reports a stale documented event when removed from browser source', () => {
  const withoutInstall = replaceFixture("window.umami?.track(installCopy, { method: 'pipx' });", '');
  assert.match(issuesFor(withoutInstall), /app\/privacy\/page\.tsx:\d+: documented browser event install-snippet-copy is unused/);
  const withoutAi = replaceFixture("window.umami?.track(aiReferral, { source: 'claude.ai' });", '');
  assert.match(issuesFor(withoutAi), /app\/privacy\/page\.tsx:\d+: documented browser event ai-referral is unused/);
});

test('rejects both a mutable exported event and a shadowing mutable event', () => {
  const changed = new Map(fixture).set(eventPath, sources.get(eventPath)!
    .replace('export const OUTBOUND_CLICK_EVENT', 'export let OUTBOUND_CLICK_EVENT'));
  assert.match(issuesFor(changed), /public\/privacy-fixture\.js:7:.*immutable const/);
  const shadowed = replaceFixture(
    'window.umami?.track(outboundClick,',
    "function onClick() {\n  let outboundClick = 'outbound-click';\n  window.umami?.track(outboundClick,",
  );
  const closed = new Map(shadowed).set(fixturePath, shadowed.get(fixturePath)! + '\n}');
  assert.match(issuesFor(closed), /public\/privacy-fixture\.js:9:.*immutable const/);
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
    assert.match(issues, /public\/privacy-fixture\.js:10:/, code);
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
  privacyPath, 'app/layout.tsx', 'lib/analytics/disable.ts', 'lib/analytics/events.ts', 'next.config.mjs', 'app/humans.txt/route.ts',
  'components/docs-bot/useSseStream.ts', 'components/landing/EmailCapture.tsx',
  'components/landing/EmailStrip.tsx', 'components/blog/ArticleCompression.tsx',
];
const surfaceFixture = new Map(surfaceFiles.map((filename) => [filename, sources.get(filename)!]));

test('reports script, hook, endpoint and service drift at the changed source', () => {
  for (const [filename, before, after, diagnostic] of [
    ['app/layout.tsx', 'https://analytics.bernstein.run/script.js', 'https://analytics.example.test/script.js', /host.*analytics\.example\.test/],
    ['app/layout.tsx', 'data-domains="bernstein.run"', 'data-domains="bernstein.run,localhost"', /data-domains/],
    ['app/layout.tsx', 'data-do-not-track="true"', 'data-do-not-track="false"', /data-do-not-track/],
    ['app/layout.tsx', 'data-exclude-hash="true"', 'data-exclude-hash="false"', /data-exclude-hash/],
    ['app/layout.tsx', 'data-before-send={UMAMI_BEFORE_SEND}', "data-before-send='anotherHook'", /before-send/],
    ['app/layout.tsx', 'data-before-send={UMAMI_BEFORE_SEND}', 'data-performance="true" data-before-send={UMAMI_BEFORE_SEND}', /analytics measurements/],
    ['lib/analytics/disable.ts', "[\n  'utm_source',", "[\n  'q',", /allowed query parameters/],
    ['lib/analytics/disable.ts', "x.hash = '';", "x.hash = x.hash;", /strip the hash/],
    ['lib/analytics/disable.ts', "function cleanRef(r) {\n    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(r)) return '';", "function cleanRef(r) {\n    if (false) return '';", /referrer cleaner/],
    ['lib/analytics/disable.ts', 'out.referrer = cleanRef(out.referrer)', 'out.referrer = clean(out.referrer)', /strip query parameters from the referrer/],
    ['lib/analytics/disable.ts', 'window.navigator.globalPrivacyControl === true', 'window.navigator.globalPrivacyControl === false', /GPC, DNT/],
    ['lib/analytics/disable.ts', '} catch (_) { return null; }', '} catch (_) { }', /storage error/],
    ['lib/analytics/disable.ts', 'out.url === lastView', 'out.url !== lastView', /duplicate page views/],
    ['lib/analytics/disable.ts', 'out.url = clean(out.url)', 'clean(out.url)', /strip query parameters/],
    ['lib/analytics/disable.ts', 'return out;', 'return payload;', /return the cleaned payload/],
    ['lib/analytics/disable.ts', 'return x.toString();', 'return u;', /return the cleaned address/],
    ['lib/analytics/events.ts', "AI_REFERRER_HOSTS = [\n  'claude.ai',", "AI_REFERRER_HOSTS = [\n  'example.ai',", /AI_REFERRER_HOSTS enum values disagree/],
    ['components/docs-bot/useSseStream.ts', "'/api/ask'", "'/api/questions'", /\/api\/questions.*not documented/],
    ['components/landing/EmailCapture.tsx', "'/api/notify'", "'/api/ask'", /does not match \/api\/notify/],
    ['next.config.mjs', "'/api/csp-report'", "'/api/report'", /\/api\/report.*not documented/],
    ['next.config.mjs', "'https://analytics.bernstein.run',\n    ].join(' ');", "'https://analytics.bernstein.run',\n      'https://app.kit.com',\n    ].join(' ');", /CSP scriptSrc origin .* is not documented/],
    ['next.config.mjs', "form-action 'self';", "form-action 'self' https://app.kit.com;", /CSP form-action external origin .* is not allowed/],
    ['app/humans.txt/route.ts', 'Email: Resend', 'Email: Example Mail', /Example Mail.*not named/],
    ['app/humans.txt/route.ts', 'CDN: Cloudflare', 'CDN: Resend', /Resend.*not named as the CDN/],
  ] as const) {
    const original = sources.get(filename)!;
    assert.ok(original.includes(before), before);
    const line = original.slice(0, original.indexOf(before)).split('\n').length;
    const changed = new Map(surfaceFixture).set(filename, original.replace(before, after));
    const issues = checkPublishedPrivacySurfaces(changed);
    assert.ok(
      issues.some((issue) => issue.startsWith(`${filename}:`) && Number.parseInt(issue.split(':')[1]!, 10) >= line && diagnostic.test(issue)),
      `${filename} (${before} -> ${after}) line=${line}:\n${issues.join('\n')}`,
    );
  }
});

test('reports deduplication moved before URL cleaning', () => {
  const filename = 'lib/analytics/disable.ts';
  const original = sources.get(filename)!;
  const lines = original.split('\n');
  const urlLine = lines.findIndex((line) => line.includes('if (out.url) out.url'));
  assert.ok(urlLine >= 0);
  const cleaning = lines.splice(urlLine, 2);
  const returnLine = lines.findIndex((line) => line.includes('return out;'));
  assert.ok(returnLine > urlLine);
  lines.splice(returnLine, 0, ...cleaning);
  const issues = checkPublishedPrivacySurfaces(new Map(surfaceFixture).set(filename, lines.join('\n')));
  assert.ok(issues.some((issue) => issue.startsWith(`${filename}:${urlLine + 1}:`) && /duplicate page views/.test(issue)), issues.join('\n'));
});

test('checks browser sends in imported client modules and public scripts', () => {
  const client = 'components/ClientFixture.tsx';
  const helper = 'lib/client-send-fixture.ts';
  const script = 'public/send-fixture.js';
  const fixture = new Map(surfaceFixture)
    .set(client, "'use client';\nimport { send } from '@/lib/client-send-fixture';\nsend();")
    .set(helper, "export const send = () => fetch('/api/notify', { method: 'POST', body: 'example' });")
    .set(script, "fetch('/api/blog/summary', { method: 'POST', body: 'example' });");
  assert.deepEqual(checkPublishedPrivacySurfaces(fixture), []);
  fixture.set(helper, fixture.get(helper)!.replace('/api/notify', '/api/example'));
  fixture.set(script, fixture.get(script)!.replace('/api/blog/summary', '/api/example'));
  const issues = checkPublishedPrivacySurfaces(fixture);
  for (const filename of [helper, script]) {
    assert.ok(issues.some((issue) => issue.startsWith(`${filename}:1:`) && issue.includes('/api/example')), issues.join('\n'));
  }
});

test('reports a known sender with options that cannot be checked', () => {
  const filename = 'components/landing/EmailCapture.tsx';
  const original = sources.get(filename)!;
  const line = original.split('\n').findIndex((text) => text.includes("fetch('/api/notify'")) + 1;
  const changed = checkPublishedPrivacySurfaces(new Map(surfaceFixture).set(filename, original.replace("method: 'POST'", 'method: HTTP_METHOD')));
  assert.ok(changed.some((issue) => issue.startsWith(`${filename}:${line}:`) && /request method or body/.test(issue)), changed.join('\n'));
});

test('reports input route drift at the source line of a rendered inline script', () => {
  const filename = 'components/InlineSendFixture.tsx';
  const original = [
    'const script = `',
    "  const endpoint = '/api/notify';",
    "  fetch(endpoint, { method: 'POST', body: 'example' });",
    '`;',
    'export const fixture = <script dangerouslySetInnerHTML={{ __html: script }} />;',
  ].join('\n');
  const fixture = new Map(surfaceFixture).set(filename, original);
  assert.deepEqual(checkPublishedPrivacySurfaces(fixture), []);
  fixture.set(filename, original.replace('/api/notify', '/api/example'));
  assert.deepEqual(checkPublishedPrivacySurfaces(fixture), [
    `${filename}:2: input route /api/example is not documented on /privacy`,
  ]);
});
