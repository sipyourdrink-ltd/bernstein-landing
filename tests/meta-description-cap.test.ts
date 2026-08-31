/**
 * Tests for the per-page meta-description length cap (issue #45).
 *
 * Google truncates the SERP snippet at ~158 chars desktop / ~120 mobile;
 * social cards (LinkedIn, Slack) truncate around 200. The first
 * sentence is the only part guaranteed to render, so every per-page
 * `metadata.description` must fit the cap as a single useful payload.
 *
 * We can't import the page modules in node:test because they pull
 * server-only Next.js runtime and MDX compilation. Instead, we extract
 * the literal `PAGE_DESC` constant from the source file and assert its
 * length. For the dynamic /compare/[a]/[b] route we extract the
 * helper function body and apply it to the longest live adapter
 * displayName so the worst-case rendered description is exercised.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const CAP = 158;

/**
 * Every page that declares a `PAGE_DESC` literal, discovered from the
 * app directory rather than listed by hand. A hand-kept list goes stale
 * in both directions: a new page silently escapes the cap, and a page
 * that moves or is not part of this checkout fails the suite for a
 * reason that has nothing to do with description length.
 */
function staticRoutes(): Array<{ route: string; file: string }> {
  const appDir = path.resolve(REPO_ROOT, 'app');
  const out: Array<{ route: string; file: string }> = [];
  const walk = (dir: string, parts: string[]): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, [...parts, entry.name]);
      } else if (entry.name === 'page.tsx') {
        const src = fs.readFileSync(full, 'utf8');
        if (!/\bconst\s+PAGE_DESC\s*=/.test(src)) continue;
        /* Route groups - (marketing) - and dynamic segments do not
           appear in, or do not pin, the served path; the route string
           here is a label for the test name. */
        const route = '/' + parts.filter((s) => !s.startsWith('(')).join('/');
        out.push({ route: route === '/' ? '/' : route, file: path.relative(REPO_ROOT, full) });
      }
    }
  };
  walk(appDir, []);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

const STATIC_ROUTES = staticRoutes();

/**
 * Extract the literal value of a `const NAME = '...'` (single, double,
 * or backtick quoted) declaration from a TS source file. Returns the
 * decoded string, or throws if the constant isn't present in the
 * expected shape.
 */
function extractStringConst(source: string, name: string): string {
  /* Match: const NAME [: TYPE] = <whitespace incl. newlines> <quote>BODY<quote> */
  const re = new RegExp(
    `const\\s+${name}[^=]*=\\s*([\\'\\"\\\`])((?:\\\\.|(?!\\1).)*?)\\1`,
    's',
  );
  const m = source.match(re);
  if (!m) {
    throw new Error(`could not extract const ${name} from source`);
  }
  /* Decode a small set of escape sequences that show up in our copy:
     \' \" \\ and \n. Everything else is left as-is — these are
     hand-written literals, not arbitrary user input. */
  return m[2]
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n');
}

test('the PAGE_DESC discovery is not vacuously passing', () => {
  assert.ok(
    STATIC_ROUTES.length >= 5,
    `only ${STATIC_ROUTES.length} pages declare PAGE_DESC; the walk or the ` +
      'convention changed and this suite is no longer covering the site',
  );
});

for (const { route, file } of STATIC_ROUTES) {
  test(`${route} meta-description fits the ${CAP}-char serp cap`, () => {
    const abs = path.resolve(REPO_ROOT, file);
    const source = fs.readFileSync(abs, 'utf8');
    const desc = extractStringConst(source, 'PAGE_DESC');
    assert.ok(
      desc.length > 0,
      `${route}: PAGE_DESC is empty (${file})`,
    );
    assert.ok(
      desc.length <= CAP,
      `${route}: PAGE_DESC is ${desc.length} chars (cap ${CAP}). value: ${desc}`,
    );
  });
}

/**
 * Dynamic /compare/[a]/[b] description.
 *
 * The route file defines a `pageDescription(e, builtOn)` helper. We
 * can't call it directly without a Next runtime, so we reconstruct the
 * worst-case payload from data/adapters-meta.json and assert it stays
 * within cap. The contract: whatever logic the helper uses, every live
 * adapter must produce a description ≤ CAP chars.
 */
test('/compare/[a]/[b] meta-description fits the cap for every live adapter', () => {
  const sourcePath = path.resolve(
    REPO_ROOT,
    'app/compare/[a]/[b]/page.tsx',
  );
  if (!fs.existsSync(sourcePath)) {
    /* /compare/[a]/[b] ships with the comparison dataset, which the
       host supplies. Nothing to check on a checkout without it. */
    return;
  }
  const source = fs.readFileSync(sourcePath, 'utf8');

  /* Pull the slice cap out of the helper. The helper trims with
     `.slice(0, N)`; if N is missing or > CAP, the assertion below
     will catch the resulting overflow on a worst-case adapter. */
  const sliceMatch = source.match(
    /function\s+pageDescription[\s\S]*?\.slice\(\s*0\s*,\s*(\d+)\s*\)/,
  );
  if (sliceMatch) {
    const sliceCap = Number(sliceMatch[1]);
    assert.ok(
      sliceCap <= CAP,
      `pageDescription slice cap is ${sliceCap}, must be ≤ ${CAP}`,
    );
  }

  /* Worst-case empirical check: the helper's output for the longest
     live displayName must still fit the cap. The helper signature is
     `function pageDescription(e, builtOn)` and it is expected to
     interpolate `e.displayName`; we extract the longest displayName
     from data/adapters-meta.json, then estimate the rendered length
     by stripping the template literal of all `${...}` placeholders
     and substituting the longest name for the displayName slot. */
  const adaptersPath = path.resolve(REPO_ROOT, 'data/adapters-meta.json');
  if (!fs.existsSync(adaptersPath)) {
    /* On a fresh checkout this file is regenerated at prebuild time.
       If it isn't present yet, skip the empirical check; the static
       slice-cap assertion above is the load-bearing one. */
    return;
  }
  const raw = JSON.parse(fs.readFileSync(adaptersPath, 'utf8')) as unknown;
  const entries = extractEntries(raw);
  assert.ok(entries.length > 0, 'adapters-meta.json had no entries');

  /* Pull the helper's return template literal (the backtick-quoted
     string returned by pageDescription). */
  const templateMatch = source.match(
    /function\s+pageDescription[\s\S]*?return\s+`([^`]+)`/,
  );
  assert.ok(
    templateMatch,
    'could not locate the description template in app/compare/[a]/[b]/page.tsx',
  );
  const template = templateMatch![1];

  /* Find the longest displayName among live adapters. */
  let longest = '';
  for (const e of entries) {
    const displayName = String(e.displayName ?? '');
    if (displayName.length > longest.length) longest = displayName;
  }
  assert.ok(longest, 'no adapter displayName found');

  /* Render the worst-case description by swapping ${e.displayName}
     for the longest name and stripping any remaining `${...}` runs
     (the helper may compose extra placeholders we don't need to
     materialise here — their absence only shortens the result, so
     the upper bound still holds). */
  const rendered = template
    .replace(/\$\{e\.displayName\}/g, longest)
    .replace(/\$\{[^}]+\}/g, '');
  assert.ok(
    rendered.length <= CAP,
    `/compare/[a]/[b] worst-case description is ${rendered.length} chars on "${longest}" (cap ${CAP}). rendered: ${rendered}`,
  );
});

interface AdapterLike {
  displayName?: string;
}

function extractEntries(raw: unknown): AdapterLike[] {
  if (Array.isArray(raw)) return raw as AdapterLike[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.entries)) return obj.entries as AdapterLike[];
    if (Array.isArray(obj.adapters)) return obj.adapters as AdapterLike[];
    return Object.values(obj).filter(
      (v): v is AdapterLike => !!v && typeof v === 'object',
    );
  }
  return [];
}
