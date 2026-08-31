/**
 * ReadTheCode data tests — entries, voice, external-link derivation.
 *
 * The runner is `node --test --experimental-strip-types`, no jsdom.
 * Per the established pattern (BetaNotice, SponsorWall, sse-reducer),
 * the load-bearing logic lives in a sister `.ts`
 * (read-the-code-data.ts); the JSX shell is verified with `next build`.
 *
 * The point of these cases is the contract that keeps the strip cheap
 * to extend: a new code-browsing surface must be addable by appending
 * ONE entry to READ_THE_CODE_ENTRIES, with no component edit. The
 * tests below assert on the array's shape rather than on any specific
 * link, so adding an entry does not break them — only breaking the
 * shape does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  READ_THE_CODE_ENTRIES,
  READ_THE_CODE_LABEL,
  isExternalEntry,
  type ReadTheCodeEntry,
} from '../components/landing/read-the-code-data.ts';

/* -------------------------------------------------------------------- */

test('label is lowercase and carries no marketing voice', () => {
  assert.equal(READ_THE_CODE_LABEL, READ_THE_CODE_LABEL.toLowerCase());
  assert.ok(!/[!?]/.test(READ_THE_CODE_LABEL));
});

test('every entry is fully populated and lowercase-voiced', () => {
  assert.ok(READ_THE_CODE_ENTRIES.length >= 2);
  for (const e of READ_THE_CODE_ENTRIES) {
    assert.ok(e.label.length > 0, 'label must not be empty');
    assert.equal(e.label, e.label.toLowerCase(), `label "${e.label}" must be lowercase`);
    assert.ok(e.href.length > 0, `href missing for "${e.label}"`);
    assert.ok(
      /^(https?:\/\/|\/)/.test(e.href),
      `href for "${e.label}" must be absolute-external or root-relative`,
    );
    assert.ok(
      /^read-the-code-[a-z0-9-]+$/.test(e.event),
      `event "${e.event}" must be a read-the-code-* slug`,
    );
  }
});

test('labels, hrefs and events are unique', () => {
  const uniq = (xs: string[]) => new Set(xs).size === xs.length;
  const es = READ_THE_CODE_ENTRIES;
  assert.ok(uniq(es.map((e) => e.label)), 'duplicate label');
  assert.ok(uniq(es.map((e) => e.href)), 'duplicate href');
  assert.ok(uniq(es.map((e) => e.event)), 'duplicate umami event');
});

test('the generated code-map surface is present and points at the repo', () => {
  const deepwiki = READ_THE_CODE_ENTRIES.find((e) => e.href.includes('deepwiki.com'));
  assert.ok(deepwiki, 'deepwiki entry missing');
  assert.ok(deepwiki.href.includes('sipyourdrink-ltd/bernstein'));
});

test('isExternalEntry drives the target/rel treatment off the href alone', () => {
  const ext: ReadTheCodeEntry = {
    label: 'x',
    href: 'https://example.com',
    event: 'read-the-code-x',
  };
  const internal: ReadTheCodeEntry = {
    label: 'y',
    href: '/docs/cli',
    event: 'read-the-code-y',
  };
  assert.equal(isExternalEntry(ext), true);
  assert.equal(isExternalEntry(internal), false);
  /* No entry may be protocol-relative or javascript: — both would slip
     past the http(s) check and render without rel="noopener". */
  for (const e of READ_THE_CODE_ENTRIES) {
    assert.ok(!e.href.startsWith('//'), `protocol-relative href: ${e.href}`);
    assert.ok(!/^javascript:/i.test(e.href), `unsafe href: ${e.href}`);
  }
});
