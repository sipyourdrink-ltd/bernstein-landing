/**
 * Tests for lib/utm.ts — outbound-link UTM tagging helper.
 *
 * Run via the project test script (``node --test
 * --experimental-strip-types``). No vitest, no jsdom — the helper is
 * pure string-in / string-out so the URL constructor is the only
 * dependency.
 *
 * Coverage:
 *   1. Adds all five UTM params when none are present.
 *   2. Idempotent — wrapping an already-tagged URL is a no-op.
 *   3. Operator-tagged params win (existing values are not
 *      overwritten).
 *   4. Hash + existing query string round-trip intact.
 *   5. URL-encodes values containing spaces / ampersands / commas.
 *   6. Non-http schemes (mailto:, tel:, javascript:) and bare hash
 *      fragments pass through unchanged.
 *   7. Failure-soft on malformed input.
 *   8. Snapshot of a representative GitHub outbound href confirming the
 *      exact wire-format the analytics dashboard will see.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withUtm } from '../lib/utm.ts';

const BASE_OPTS = {
  source: 'bernstein.run',
  medium: 'outbound-link',
  campaign: 'hero-cta',
} as const;

test('adds all five UTM params when none are present', () => {
  const got = withUtm('https://github.com/sipyourdrink-ltd/bernstein', {
    ...BASE_OPTS,
    content: 'view-on-github',
    term: 'star',
  });
  const url = new URL(got);
  assert.equal(url.searchParams.get('utm_source'), 'bernstein.run');
  assert.equal(url.searchParams.get('utm_medium'), 'outbound-link');
  assert.equal(url.searchParams.get('utm_campaign'), 'hero-cta');
  assert.equal(url.searchParams.get('utm_content'), 'view-on-github');
  assert.equal(url.searchParams.get('utm_term'), 'star');
});

test('idempotent — wrapping an already-tagged URL is a no-op', () => {
  const once = withUtm('https://github.com/sipyourdrink-ltd/bernstein', BASE_OPTS);
  const twice = withUtm(once, BASE_OPTS);
  assert.equal(once, twice);
});

test('operator-tagged params win over withUtm defaults', () => {
  const operatorTagged =
    'https://saashub.com/bernstein?utm_source=badge&utm_campaign=badge';
  const got = withUtm(operatorTagged, BASE_OPTS);
  const url = new URL(got);
  /* Existing operator values must be preserved. */
  assert.equal(url.searchParams.get('utm_source'), 'badge');
  assert.equal(url.searchParams.get('utm_campaign'), 'badge');
  /* Missing params get filled in. */
  assert.equal(url.searchParams.get('utm_medium'), 'outbound-link');
});

test('hash fragment round-trips intact', () => {
  const got = withUtm('https://github.com/sipyourdrink-ltd/bernstein#mentioned-in', {
    ...BASE_OPTS,
    campaign: 'hero-rail-featured',
  });
  assert.match(got, /#mentioned-in$/);
  const url = new URL(got);
  assert.equal(url.hash, '#mentioned-in');
  assert.equal(url.searchParams.get('utm_campaign'), 'hero-rail-featured');
});

test('preserves existing non-UTM query params', () => {
  const got = withUtm(
    'https://github.com/sipyourdrink-ltd/bernstein/pulls?q=is%3Apr+is%3Aclosed',
    { ...BASE_OPTS, campaign: 'hero-rail-prs' },
  );
  const url = new URL(got);
  assert.equal(url.searchParams.get('q'), 'is:pr is:closed');
  assert.equal(url.searchParams.get('utm_campaign'), 'hero-rail-prs');
});

test('URL-encodes values with spaces and ampersands', () => {
  const got = withUtm('https://example.com/x', {
    source: 'bernstein.run & friends',
    medium: 'outbound-link',
    campaign: 'campaign with spaces',
  });
  /* Must NOT contain a raw space or unencoded ``&`` inside the value. */
  assert.match(got, /utm_source=bernstein\.run\+%26\+friends/);
  assert.match(got, /utm_campaign=campaign\+with\+spaces/);
});

test('non-http schemes pass through unchanged', () => {
  for (const url of [
    'mailto:forte@bernstein.run',
    'tel:+15551234567',
    'javascript:void(0)',
    '#anchor',
  ]) {
    assert.equal(withUtm(url, BASE_OPTS), url);
  }
});

test('relative paths starting with / are tagged as relative', () => {
  /* Internal relative hrefs shouldn't be passed to ``withUtm`` in
     practice, but if they are, the helper must round-trip them as
     relative — never inject the bernstein.run origin. */
  const got = withUtm('/blog/getting-started', BASE_OPTS);
  assert.equal(got.startsWith('/blog/getting-started'), true);
  assert.equal(got.includes('utm_source=bernstein.run'), true);
  assert.equal(got.startsWith('https://'), false);
});

test('bare relative paths without leading / are returned verbatim', () => {
  /* Defence against template bugs — never silently rewrite a path that
     can't be unambiguously interpreted as a relative URL. */
  assert.equal(withUtm('not-a-url', BASE_OPTS), 'not-a-url');
});

test('empty string passes through', () => {
  assert.equal(withUtm('', BASE_OPTS), '');
});

test('snapshot — canonical hero CTA href stays stable on the wire', () => {
  /* Locks the exact wire format the analytics dashboard joins on. If
     this snapshot needs to change, the cross-property attribution panel
     query needs to change with it. */
  const got = withUtm('https://github.com/sipyourdrink-ltd/bernstein', {
    source: 'bernstein.run',
    medium: 'outbound-link',
    campaign: 'hero-cta',
  });
  assert.equal(
    got,
    'https://github.com/sipyourdrink-ltd/bernstein?utm_source=bernstein.run&utm_medium=outbound-link&utm_campaign=hero-cta',
  );
});

test('snapshot — footer href with hash + utm round-trip is stable', () => {
  const got = withUtm(
    'https://github.com/sipyourdrink-ltd/bernstein#mentioned-in',
    {
      source: 'bernstein.run',
      medium: 'outbound-link',
      campaign: 'hero-rail-featured',
    },
  );
  assert.equal(
    got,
    'https://github.com/sipyourdrink-ltd/bernstein?utm_source=bernstein.run&utm_medium=outbound-link&utm_campaign=hero-rail-featured#mentioned-in',
  );
});
