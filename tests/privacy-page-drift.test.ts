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
import ts from 'typescript';

const ROOT = process.cwd();
const SOURCE_DIRS = ['app', 'components', 'lib', 'public'];
const SOURCE_FILES = ['middleware.ts', 'next.config.mjs'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

/** The only custom analytics event the privacy page describes. */
const ALLOWED_EVENTS = new Set(['outbound-click']);
/** The only property that event may carry. */
const ALLOWED_EVENT_PROPS = new Set(['destination']);

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name)) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) out.push(full);
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

// Resolve the event from its actual exporting module, not an unrelated const
// with the same name elsewhere in the tree.
const eventModule = ts.createSourceFile('outbound.ts', sources.get('lib/analytics/outbound.ts')!, ts.ScriptTarget.Latest, true);
const eventDeclarations = eventModule.statements.filter(ts.isVariableStatement)
  .filter((statement) => statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
  .flatMap((statement) => statement.declarationList.declarations)
  .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'OUTBOUND_CLICK_EVENT');
assert.equal(eventDeclarations.length, 1, 'lib/analytics/outbound.ts: export one documented event const');
const eventInitializer = eventDeclarations[0].initializer;
assert.ok(eventInitializer && ts.isStringLiteral(eventInitializer), 'lib/analytics/outbound.ts: event const must be a literal');
const documentedEvent = eventInitializer.text;
assert.ok(ALLOWED_EVENTS.has(documentedEvent), 'lib/analytics/outbound.ts: undocumented event const');

/** Every tracker reference is denied unless its entire use is inspectable. */
function scanEventCalls(body: string, rel: string): void {
  const kind = /\.[jt]sx$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(rel, body, ts.ScriptTarget.Latest, true, kind);
  const where = (node: ts.Node): string =>
    `${rel}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;

  // This is the only non-call tracker reference in the current public code.
  // Match the declaration itself, never exempt a whole file or interface.
  function isTrackerType(node: ts.Node): boolean {
    const property = node.parent;
    const iface = property?.parent;
    const block = iface?.parent;
    const declaration = block?.parent;
    return rel === 'lib/analytics/outbound.ts'
      && ts.isPropertySignature(property) && property.name === node
      && property.getText(source) === 'umami?: {\n      track: (event: string, data?: Record<string, string>) => void;\n    };'
      && ts.isInterfaceDeclaration(iface) && iface.name.text === 'Window'
      && ts.isModuleBlock(block)
      && ts.isModuleDeclaration(declaration) && declaration.name.getText(source) === 'global'
      && !!declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword);
  }

  const eventBindings: ts.Node[] = [];
  function collectBindings(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === 'OUTBOUND_CLICK_EVENT') {
      const parent = node.parent;
      if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)
        || ts.isImportSpecifier(parent) || ts.isImportClause(parent)
        || ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent)
        || ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) && parent.name === node) {
        eventBindings.push(parent);
      }
    }
    ts.forEachChild(node, collectBindings);
  }
  collectBindings(source);

  function checkEventBinding(node: ts.Node): void {
    const binding = eventBindings[0];
    assert.ok(eventBindings.length === 1 && binding && ts.isImportSpecifier(binding)
      && !binding.propertyName && !binding.isTypeOnly, `${where(node)}: use the documented event const without aliases or shadowing`);
    const declaration = binding.parent.parent.parent;
    assert.ok(ts.isImportDeclaration(declaration) && !declaration.importClause?.isTypeOnly
      && ts.isStringLiteral(declaration.moduleSpecifier)
      && declaration.moduleSpecifier.text === '@/lib/analytics/outbound',
    `${where(node)}: import the documented event const from its source`);
  }

  function checkTrackerReference(node: ts.Node): void {
    if (isTrackerType(node)) return;
    const tracker = node.parent;
    const method = tracker?.parent;
    const call = method?.parent;
    assert.ok(ts.isIdentifier(node) && ts.isPropertyAccessExpression(tracker)
      && tracker.name === node && ts.isIdentifier(tracker.expression)
      && tracker.expression.text === 'window' && !tracker.questionDotToken
      && ts.isPropertyAccessExpression(method) && method.expression === tracker
      && method.name.text === 'track' && !!method.questionDotToken
      && ts.isCallExpression(call) && call.expression === method && !call.questionDotToken,
    `${where(node)}: unapproved tracker reference; use window.umami?.track with the documented event and inline data`);
    assert.equal(call.arguments.length, 2, `${where(call)}: unexpected analytics arguments`);
    const [event, data] = call.arguments;
    assert.ok(ts.isIdentifier(event) && event.text === 'OUTBOUND_CLICK_EVENT',
      `${where(event)}: use the documented event const`);
    checkEventBinding(event);
    assert.ok(ts.isObjectLiteralExpression(data),
      `${where(data)}: event data must be an inline object literal so every field can be checked`);
    for (const prop of data.properties) {
      assert.ok(ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop),
        `${where(prop)}: analytics data must use explicit properties, without spreads or methods`);
      assert.ok(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name),
        `${where(prop)}: analytics property names must be literal`);
      assert.ok(ALLOWED_EVENT_PROPS.has(prop.name.text), `${where(prop)}: event property ${prop.name.text}`);
    }
    events.set(documentedEvent, where(call));
  }

  function visit(node: ts.Node): void {
    if ((ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && node.text === 'umami') {
      checkTrackerReference(node);
    }
    // A computed global key could resolve to the tracker without spelling its
    // name in an AST token. Require static non-tracker keys on global objects.
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)
      && ['window', 'globalThis', 'self'].includes(node.expression.text)) {
      assert.ok(ts.isStringLiteral(node.argumentExpression)
        && node.argumentExpression.text !== 'umami', `${where(node)}: uninspectable global property access`);
    }
    // Source strings can become executable inline scripts. Do not silently
    // accept a tracker reference hidden inside one. The existing opt-out key
    // is data; its exact declaration is the only literal exception.
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (/\bumami\b/.test(node.text)) {
        const declaration = node.parent;
        assert.ok(rel === 'lib/analytics/disable.ts' && node.text === 'umami:disabled'
          && ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)
          && declaration.name.text === 'UMAMI_DISABLED_KEY' && declaration.initializer === node,
        `${where(node)}: tracker text outside the explicit opt-out key declaration`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

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
}

// Parse original source: stripping comments with regex can corrupt strings and
// erase code. Include the privacy page here; only storage prose is excluded.
for (const file of files) {
  scanEventCalls(fs.readFileSync(file, 'utf8'), path.relative(ROOT, file));
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
    assert.ok(
      privacy.includes(`<code data-storage-key>${key}</code>`),
      `${key} (used in ${rel}) is not listed as a storage entry on app/privacy/page.tsx`,
    );
  }
});

test('every key named on /privacy as a storage entry is still used', () => {
  for (const m of privacy.matchAll(/<code data-storage-key>([^<]+)<\/code>/g)) {
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

test('published browser code emits only the described event and property', () => {
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


test('browser analytics opt-out and URL handling are described without server guarantees', () => {
  const hook = sources.get('lib/analytics/disable.ts')!;
  assert.match(hook, /STRIPPED_URL_PARAMS = \['q', 'ask'\]/);
  assert.match(hook, /getItem\('\$\{UMAMI_DISABLED_KEY\}'\) === 'true'/);
  assert.match(privacy, /localStorage\.setItem\(&apos;umami:disabled&apos;, &apos;true&apos;\)/);
  assert.match(privacy, /does not control this server request/);
  assert.match(privacy, /automatically\s+sends its question/);
  assert.match(privacy, /text still being typed is not/);
});


test('event drift scanning rejects data passed through a variable', () => {
  assert.throws(
    () => scanEventCalls(
      "import { OUTBOUND_CLICK_EVENT } from '@/lib/analytics/outbound'; const eventData = { destination, query: window.location.search }; window.umami?.track(OUTBOUND_CLICK_EVENT, eventData);",
      'event-probe.ts',
    ),
    /event data must be an inline object literal/,
  );
});

const rejectedTrackerReferences = [
  ['literal bracket method', "window.umami?.['track'](OUTBOUND_CLICK_EVENT, { destination });"],
  ['computed bracket method', 'window.umami?.[method](OUTBOUND_CLICK_EVENT, { destination });'],
  ['bracket tracker property', "window['umami']?.track(OUTBOUND_CLICK_EVENT, { destination });"],
  ['object alias', 'const u = window.umami; u?.track(OUTBOUND_CLICK_EVENT, { destination });'],
  ['method alias', 'const track = window.umami?.track; track?.(OUTBOUND_CLICK_EVENT, { destination });'],
  ['destructuring tracker methods', 'const { track } = window.umami; track(OUTBOUND_CLICK_EVENT, { destination });'],
  ['destructuring the tracker', 'const { umami: u } = window; u.track(OUTBOUND_CLICK_EVENT, { destination });'],
  ['passing the tracker', 'send(window.umami);'],
  ['passing a method', 'send(window.umami?.track);'],
  ['bare tracker identifier', 'umami.track(OUTBOUND_CLICK_EVENT, { destination });'],
  ['another tracker method', 'window.umami?.identify({ query });'],
  ['noncanonical optional call', 'window.umami?.track?.(OUTBOUND_CLICK_EVENT, { destination });'],
  ['extra event field', 'window.umami?.track(OUTBOUND_CLICK_EVENT, { destination, query });'],
  ['spread event data', 'window.umami?.track(OUTBOUND_CLICK_EVENT, { ...eventData });'],
  ['computed event field', 'window.umami?.track(OUTBOUND_CLICK_EVENT, { [field]: destination });'],
  ['event data method', 'window.umami?.track(OUTBOUND_CLICK_EVENT, { destination() { return query; } });'],
  ['non-inline event data', 'window.umami?.track(OUTBOUND_CLICK_EVENT, eventData);'],
  ['missing event data', 'window.umami?.track(OUTBOUND_CLICK_EVENT);'],
  ['extra argument', 'window.umami?.track(OUTBOUND_CLICK_EVENT, { destination }, query);'],
  ['undocumented event', "window.umami?.track('other-event', { destination });"],
  ['tracker inside a payload', 'window.umami?.track(OUTBOUND_CLICK_EVENT, { destination: window.umami });'],
  ['computed global key', "window['uma' + 'mi']?.track(OUTBOUND_CLICK_EVENT, { destination });"],
  ['variable global key', 'window[key]?.track(OUTBOUND_CLICK_EVENT, { destination });'],
  ['inline script string', 'const script = "window.umami.track(OUTBOUND_CLICK_EVENT, { query })";'],
  ['inline script template', 'const script = `window.umami.track(OUTBOUND_CLICK_EVENT, { query: ${query} })`;'],
  ['shadowed event const', "function send(OUTBOUND_CLICK_EVENT) { window.umami?.track(OUTBOUND_CLICK_EVENT, { destination }); }"],
] as const;

const canonicalTrackerCall = `import { OUTBOUND_CLICK_EVENT } from '@/lib/analytics/outbound';
window.umami?.track(OUTBOUND_CLICK_EVENT, { destination });`;

test('event drift scanning accepts the canonical call', () => {
  assert.doesNotThrow(() => scanEventCalls(canonicalTrackerCall, 'event-probe.ts'));
});

test('tracker type and opt-out exceptions do not exempt runtime references', () => {
  for (const rel of ['lib/analytics/outbound.ts', 'lib/analytics/disable.ts']) {
    const body = sources.get(rel)!;
    assert.doesNotThrow(() => scanEventCalls(body, rel));
    assert.throws(() => scanEventCalls(`${body}\nsend(window.umami);`, rel), /unapproved tracker reference/);
  }
});

for (const [label, body] of rejectedTrackerReferences) {
  test(`event drift scanning rejects ${label}`, () => {
    assert.throws(() => scanEventCalls(
      `${canonicalTrackerCall}\n${body}`,
      'event-probe.ts',
    ), /event-probe\.ts:\d+:/);
  });
}
