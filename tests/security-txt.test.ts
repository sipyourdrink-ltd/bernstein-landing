/**
 * /.well-known/security.txt freshness guard.
 *
 * RFC 9116 section 2.5.5 asks that `Expires` be less than one year in
 * the future: a value parked years out defeats the freshness signal the
 * field exists for, and conformance parsers flag it. The file lives at
 * `public/.well-known/security.txt` and is served verbatim, so the
 * value is a hand-edited literal.
 *
 * Stamping it at build time was the obvious fix and is the wrong one:
 * it would rewrite a committed file on every build, so the file would
 * churn on deploys that changed nothing, and the served value would
 * depend on when the deploy ran rather than on what the repo says.
 * The literal stays; this test is what notices when it drifts.
 *
 * The three properties, all checked against the clock at test-run time
 * (which is the point - the file does not change, the calendar does):
 *
 *   1. `Expires` parses as an RFC 3339 timestamp, and appears exactly
 *      once. RFC 9116 section 2.5.5 makes the field mandatory and
 *      forbids repeating it.
 *   2. It is in the future. A past `Expires` means the whole file is
 *      to be considered stale by anyone reading it.
 *   3. It is at most 366 days ahead (a year, leap-safe). This is the
 *      direction the file drifted before: pushed far out to avoid
 *      rotation toil.
 *
 * Plus a lead-time check, so the failure lands while the file is still
 * conformant rather than on the day it stops being: the suite goes red
 * `RENEWAL_LEAD_DAYS` before expiry, which is the reminder to bump the
 * literal forward.
 *
 * Runs under `node --test`. Reads the file directly - no deps, no
 * network, nothing to boot.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SECURITY_TXT_PATH = path.resolve(
  process.cwd(),
  'public',
  '.well-known',
  'security.txt',
);

/** RFC 9116 section 2.5.5's "less than a year", with the leap day. */
const MAX_WINDOW_DAYS = 366;

/** How much runway to demand before the file goes non-conformant. */
const RENEWAL_LEAD_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function readSecurityTxt(): string {
  return fs.readFileSync(SECURITY_TXT_PATH, 'utf8');
}

/**
 * Every `Expires` value in a security.txt body, in file order.
 *
 * Field names are case-insensitive per RFC 9116; comment lines (`#`)
 * and blank lines are skipped, so the explanatory header above the
 * fields cannot be mistaken for one. Returns the raw values - parsing
 * is the caller's job so a malformed value fails a named test rather
 * than being silently dropped here.
 */
export function expiresValues(raw: string): string[] {
  const out: string[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^Expires\s*:\s*(.+?)\s*$/i);
    if (match) out.push(match[1]);
  }
  return out;
}

/** Days from `now` to `date`; negative once `date` is in the past. */
function daysUntil(date: Date, now: Date): number {
  return (date.getTime() - now.getTime()) / DAY_MS;
}

test('security.txt exists at public/.well-known/security.txt', () => {
  assert.ok(
    fs.existsSync(SECURITY_TXT_PATH),
    `expected ${SECURITY_TXT_PATH} to exist`,
  );
});

test('security.txt carries exactly one Expires field', () => {
  const values = expiresValues(readSecurityTxt());
  assert.equal(
    values.length,
    1,
    `RFC 9116 section 2.5.5 requires exactly one Expires field; found ${values.length}`,
  );
});

test('Expires parses as an RFC 3339 timestamp', () => {
  const [value] = expiresValues(readSecurityTxt());
  assert.match(
    value,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    `Expires must be an RFC 3339 timestamp with an offset; got ${JSON.stringify(value)}`,
  );
  const parsed = new Date(value);
  assert.ok(
    !Number.isNaN(parsed.getTime()),
    `Expires does not parse as a date: ${JSON.stringify(value)}`,
  );
});

test('Expires is in the future', () => {
  const [value] = expiresValues(readSecurityTxt());
  const expires = new Date(value);
  const now = new Date();
  assert.ok(
    expires.getTime() > now.getTime(),
    `Expires (${value}) is in the past - the file reads as stale to anyone ` +
      'fetching it. Move the literal forward in public/.well-known/security.txt.',
  );
});

test(`Expires is at most ${MAX_WINDOW_DAYS} days out`, () => {
  const [value] = expiresValues(readSecurityTxt());
  const ahead = daysUntil(new Date(value), new Date());
  assert.ok(
    ahead <= MAX_WINDOW_DAYS,
    `Expires (${value}) is ${Math.round(ahead)} days out; RFC 9116 section 2.5.5 ` +
      `asks for under a year (${MAX_WINDOW_DAYS} days here). Pull the literal back.`,
  );
});

test(`Expires keeps at least ${RENEWAL_LEAD_DAYS} days of lead time`, () => {
  const [value] = expiresValues(readSecurityTxt());
  const ahead = daysUntil(new Date(value), new Date());
  assert.ok(
    ahead >= RENEWAL_LEAD_DAYS,
    `Expires (${value}) is only ${Math.round(ahead)} days out. Bump it forward ` +
      `(and keep the new value under ${MAX_WINDOW_DAYS} days) before it lapses.`,
  );
});

test('expiresValues skips comments and blank lines', () => {
  const raw = [
    '# Expires: 1999-01-01T00:00:00.000Z',
    '',
    'Contact: mailto:someone@example.com',
    'Expires: 2027-06-30T23:59:59.000Z',
    '',
  ].join('\n');
  assert.deepEqual(expiresValues(raw), ['2027-06-30T23:59:59.000Z']);
});

test('expiresValues is case-insensitive on the field name', () => {
  assert.deepEqual(
    expiresValues('expires: 2027-06-30T23:59:59.000Z\n'),
    ['2027-06-30T23:59:59.000Z'],
  );
});
