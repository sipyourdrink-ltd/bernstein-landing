/**
 * /why-bernstein JSON-LD validity tests.
 *
 * Currently pins down only the SoftwareSourceCode block. The FAQPage
 * JSON-LD on /why-bernstein and /cost was removed 2026-05-21 because
 * Google restricted FAQPage rich results to government and healthcare
 * authorities in Aug 2023, so the matching tests are gone too. If a
 * future schema type (Article with inline Question/Answer, QAPage on
 * a dedicated route) lands, add the new shape tests here.
 *
 * Implementation note: we read the page source directly (no SSR
 * roundtrip) and pull the const literal via regex. The page is a
 * server component whose JSON-LD bodies are top-level constants, so
 * the source file IS the surface to test.
 *
 * To eval a TS-source literal that references imported identifiers
 * (e.g. `AUTHOR`), we wrap the eval in a Function whose argument list
 * binds those identifiers to lightweight stand-ins. The set of
 * imports is small and stable; if the page grows new ones, add them
 * to the WIRES map below.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const PAGE_PATH = path.resolve(
  process.cwd(),
  'app',
  'why-bernstein',
  'page.tsx',
);

/* Imported identifiers the JSON-LD literals may reference. Stand-ins
 * are lifted directly from lib/seo.ts so the test stays in sync with
 * production values. */
const WIRES = {
  AUTHOR: 'Alex Chernysh',
  SITE_URL: 'https://bernstein.run',
  SITE_NAME: 'Bernstein',
  PAGE_URL: 'https://bernstein.run/why-bernstein',
  PAGE_TITLE: 'why bernstein',
  PAGE_DESC: 'desc',
  PRICE_TABLE_DATE: '2026-05-08',
};

/* Pull the literal value of a top-level `const NAME = <literal>;`. We
 * accept either an object literal `{...}` or an array literal `[...]`.
 * We grab the longest matching balanced-brace span; the regex below
 * uses lazy `[\s\S]*?` and matches against the *whole* file — this
 * works because the named consts are unique. */
function extractConstLiteral(source: string, name: string): string | null {
  /* Find the start of the const declaration. */
  const startRe = new RegExp(`const\\s+${name}\\s*=\\s*`, 'm');
  const startMatch = source.match(startRe);
  if (!startMatch || startMatch.index === undefined) return null;
  const after = source.slice(startMatch.index + startMatch[0].length);
  if (after.length === 0) return null;
  const opener = after[0];
  if (opener !== '{' && opener !== '[') return null;
  const closer = opener === '{' ? '}' : ']';

  /* Walk the string tracking balanced openers/closers and respecting
     string-literal contents (so braces inside text don't throw the
     count off). */
  let depth = 0;
  let i = 0;
  let inString: string | null = null;
  let escape = false;
  for (; i < after.length; i++) {
    const ch = after[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        i += 1; // include closer
        break;
      }
    }
  }
  if (depth !== 0) return null;
  return after.slice(0, i);
}

async function loadPageSource(): Promise<string> {
  return fs.readFile(PAGE_PATH, 'utf8');
}

/* Eval a TS literal in the test context. We bind WIRES into the
 * Function's argument list so any `AUTHOR` / `SITE_URL` references
 * resolve. Safe because the input is our own source file, never user
 * input. */
function evalLiteral(literal: string): unknown {
  const argNames = Object.keys(WIRES) as Array<keyof typeof WIRES>;
  const argValues = argNames.map((k) => WIRES[k]);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function(...argNames, `return ${literal};`);
  return fn(...argValues);
}

test('SoftwareSourceCode block parses and has the required schema.org fields', async () => {
  const source = await loadPageSource();
  const literal = extractConstLiteral(source, 'SOFTWARE_SOURCE_CODE_JSONLD');
  assert.ok(
    literal,
    'SOFTWARE_SOURCE_CODE_JSONLD const must exist in app/why-bernstein/page.tsx',
  );

  const obj = evalLiteral(literal!) as Record<string, unknown>;
  assert.equal(obj['@context'], 'https://schema.org');
  assert.equal(obj['@type'], 'SoftwareSourceCode');
  assert.equal(typeof obj.name, 'string');
  assert.equal(typeof obj.codeRepository, 'string');
  assert.match(
    String(obj.codeRepository),
    /github\.com\/sipyourdrink-ltd\/bernstein/,
  );
  assert.equal(obj.programmingLanguage, 'Python');
  assert.match(String(obj.license), /apache\.org\/licenses\/LICENSE-2\.0/);
  assert.equal(typeof obj.description, 'string');
  assert.ok(
    String(obj.description).length >= 40,
    'description must be a real sentence, not a stub',
  );
  /* author is a Person node with a name. */
  const author = obj.author as Record<string, unknown> | undefined;
  assert.ok(author);
  assert.equal(author!['@type'], 'Person');
  assert.equal(typeof author!.name, 'string');
});

/* FAQPage shape tests removed 2026-05-21 with the FAQPage JSON-LD
 * itself. Restore from git history if a successor schema type lands. */
