/**
 * FUNDING.yml shape tests.
 *
 * The file lives at .github/FUNDING.yml and is read by GitHub when it
 * renders the "Sponsor" button on the repo. The order of keys matters:
 * GitHub picks the FIRST entry as the default "Sponsor" target. Per
 * the deep-research plan we want `github: chernistry` first, then
 * polar, then open_collective. This test pins that ordering so a
 * future drive-by edit can't silently demote github sponsors.
 *
 * Why a hand-rolled YAML reader rather than `js-yaml`:
 *   - no new npm deps (constraint).
 *   - FUNDING.yml is by spec a flat map of `key: value` lines plus
 *     `github: [list]` — no anchors, no nested structures. The
 *     subset is small enough to parse safely with a regex pass.
 *   - The test asserts exact byte-shape (key order, value strings)
 *     so any structural drift is loud.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FUNDING_PATH = path.resolve(
  process.cwd(),
  '.github',
  'FUNDING.yml',
);

interface ParsedFunding {
  /** Ordered list of (key, value) pairs as they appear in the file.
   *  We keep order because the test cares about it. */
  entries: Array<{ key: string; value: string }>;
  /** Same as `entries` but indexed for cheap lookup. */
  byKey: Record<string, string>;
}

/**
 * Parse a FUNDING.yml file's flat key:value lines. Skips comments
 * (#-prefixed) and blank lines. Throws on duplicate keys (GitHub
 * silently drops the second one but we want the test to scream so a
 * merge conflict can't sneak in two `github:` lines). Tolerant of
 * trailing whitespace and CRLF.
 */
export function parseFundingYml(raw: string): ParsedFunding {
  const out: ParsedFunding = { entries: [], byKey: {} };
  const seen = new Set<string>();
  const lines = raw.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    /* Match `key: value` where value can be a bareword, quoted, or a
       JSON-style list. Lists are valid for `github` ("list of
       usernames") but bernstein only uses the bareword shape, which
       this regex covers. */
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*$/);
    if (!match) {
      throw new Error(`unparseable FUNDING.yml line: ${JSON.stringify(rawLine)}`);
    }
    const [, key, value] = match;
    if (seen.has(key)) {
      throw new Error(`duplicate FUNDING.yml key: ${key}`);
    }
    seen.add(key);
    /* Strip optional surrounding quotes for the value. */
    const stripped = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    out.entries.push({ key, value: stripped });
    out.byKey[key] = stripped;
  }
  return out;
}

test('FUNDING.yml exists at .github/FUNDING.yml', () => {
  assert.ok(
    fs.existsSync(FUNDING_PATH),
    `expected ${FUNDING_PATH} to exist`,
  );
});

test('FUNDING.yml parses cleanly (flat key:value shape)', () => {
  const raw = fs.readFileSync(FUNDING_PATH, 'utf8');
  const parsed = parseFundingYml(raw);
  assert.ok(
    parsed.entries.length >= 1,
    'FUNDING.yml must contain at least one entry',
  );
});

test('FUNDING.yml first entry is github (the GitHub Sponsor button defaults to it)', () => {
  const raw = fs.readFileSync(FUNDING_PATH, 'utf8');
  const parsed = parseFundingYml(raw);
  assert.equal(
    parsed.entries[0].key,
    'github',
    'FUNDING.yml must start with `github: ...` so the GitHub Sponsor button hits Alex personally',
  );
});

test('FUNDING.yml github value is `chernistry`', () => {
  const raw = fs.readFileSync(FUNDING_PATH, 'utf8');
  const parsed = parseFundingYml(raw);
  assert.equal(
    parsed.byKey.github,
    'chernistry',
    'FUNDING.yml github key must point at chernistry (the maintainer GH login)',
  );
});

test('FUNDING.yml polar value is `bernstein` when polar is configured', () => {
  /* polar is optional; the test only enforces the value shape WHEN
     the key is present. If a future operator removes polar this test
     stays green (intentional — polar is monetization optionality, not
     a hard requirement). */
  const raw = fs.readFileSync(FUNDING_PATH, 'utf8');
  const parsed = parseFundingYml(raw);
  if ('polar' in parsed.byKey) {
    assert.equal(parsed.byKey.polar, 'bernstein');
  }
});

test('FUNDING.yml open_collective value is `bernstein` when configured', () => {
  const raw = fs.readFileSync(FUNDING_PATH, 'utf8');
  const parsed = parseFundingYml(raw);
  if ('open_collective' in parsed.byKey) {
    assert.equal(parsed.byKey.open_collective, 'bernstein');
  }
});

test('FUNDING.yml ordering: github precedes polar precedes open_collective', () => {
  const raw = fs.readFileSync(FUNDING_PATH, 'utf8');
  const parsed = parseFundingYml(raw);
  const keys = parsed.entries.map((e) => e.key);
  const githubIdx = keys.indexOf('github');
  const polarIdx = keys.indexOf('polar');
  const ocIdx = keys.indexOf('open_collective');
  /* github first is non-negotiable. */
  assert.equal(githubIdx, 0);
  /* polar before open_collective when both are present. */
  if (polarIdx !== -1 && ocIdx !== -1) {
    assert.ok(polarIdx < ocIdx, 'polar must precede open_collective');
  }
});

test('parseFundingYml rejects duplicate keys', () => {
  const dup = 'github: a\ngithub: b\n';
  assert.throws(() => parseFundingYml(dup), /duplicate/);
});

test('parseFundingYml ignores comments and blank lines', () => {
  const raw = '# header\n\ngithub: chernistry\n# trailing\n';
  const parsed = parseFundingYml(raw);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.byKey.github, 'chernistry');
});
