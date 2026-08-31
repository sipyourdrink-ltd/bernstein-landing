/**
 * /robots.txt rendering tests.
 *
 * There was no test that rendered the file itself - `tests/ai-bots.test.ts`
 * pins the crawler list the route iterates, and `tests/ai-txt.test.ts` pins
 * the sibling descriptor, but the rendered robots.txt body was unasserted.
 * The content-signal declaration is the first thing in this file whose exact
 * spelling is load-bearing to an outside reader, so it gets a test and the
 * rest of the body gets the baseline assertions that were missing.
 *
 * Content signals (content-signals.org) are parsed by string match. A crawler
 * looking for `ai-train=yes` will not recognise `ai-train = yes`,
 * `ai-train=YES`, or a line that lost its comma separators, and an
 * unrecognised signal reads as "not stated" rather than as an error - so a
 * typo here fails silently and permanently. Hence the exact-spelling
 * assertion rather than a loose regex.
 *
 * The per-group assertion is the other half. RFC 9309 section 2.2.1 gives a
 * crawler exactly one group with no inheritance from `User-agent: *`, so a
 * signal that appears only in the wildcard group never reaches ClaudeBot,
 * GPTBot, or any other named crawler - which are the clients it is for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GET } from '../app/robots.txt/route.ts';
import { AI_BOTS } from '../lib/seo/ai-bots.ts';
import { DISCOVERY_DOCUMENTS, SITE_URL } from '../lib/machine-surfaces.ts';

/** The declaration, byte for byte. Do not "tidy" the spacing. */
const CONTENT_SIGNAL_LINE = 'Content-Signal: search=yes, ai-input=yes, ai-train=yes';

async function readBody(): Promise<string> {
  const res = await GET();
  return await res.text();
}

/**
 * Split the rendered file into user-agent groups. A group starts at a
 * `User-agent:` line and runs until the next one (or to the sitemap
 * trailer). Blank lines and comments are dropped - they carry no
 * directive.
 */
function groups(body: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const ua = /^User-agent:\s*(.+)$/i.exec(line);
    if (ua) {
      current = [];
      out.set(ua[1]!.trim(), current);
      continue;
    }
    if (current) current.push(line);
  }
  return out;
}

test('/robots.txt serves text/plain with utf-8 charset', async () => {
  const res = await GET();
  assert.equal(res.status, 200);
  const ct = res.headers.get('content-type') ?? '';
  assert.match(ct, /text\/plain/);
  assert.match(ct, /charset=utf-8/i);
});

test('/robots.txt declares the content signal, spelled exactly', async () => {
  const body = await readBody();
  assert.ok(
    body.includes(CONTENT_SIGNAL_LINE),
    `robots.txt must contain the line "${CONTENT_SIGNAL_LINE}" verbatim. ` +
      'Content signals are matched as literal strings; respacing, recasing, or ' +
      'dropping a comma turns the declaration into an unrecognised line, which ' +
      'reads as "not stated" and fails silently.',
  );
});

test('the wildcard group carries the content signal', async () => {
  const wildcard = groups(await readBody()).get('*');
  assert.ok(wildcard, 'robots.txt has no `User-agent: *` group');
  assert.ok(
    wildcard.includes(CONTENT_SIGNAL_LINE),
    'the content signal must sit inside the `User-agent: *` group, not only in ' +
      'the comment preamble - a signal outside a group is associated with no crawler',
  );
});

test('every named crawler group carries the content signal too', async () => {
  const parsed = groups(await readBody());
  const missing = AI_BOTS.filter((bot) => !(parsed.get(bot) ?? []).includes(CONTENT_SIGNAL_LINE));
  assert.deepEqual(
    missing,
    [],
    'RFC 9309 section 2.2.1: a crawler obeys exactly one group and inherits nothing ' +
      'from `User-agent: *`. These named groups would never see the declaration.',
  );
});

test('the signal is an opt-in - no directive says no', async () => {
  const body = await readBody();
  for (const denial of ['search=no', 'ai-input=no', 'ai-train=no']) {
    assert.ok(
      !body.includes(denial),
      `robots.txt declares ${denial}. This host publishes llms.txt, an agent card, ` +
        'an OpenAPI document and a skills index so machines can read it; a refusal ' +
        'here contradicts every other surface on the domain. If the policy really ' +
        'changed, update this test with it.',
    );
  }
});

test('/robots.txt still advertises the sitemap and the discovery surfaces', async () => {
  const body = await readBody();
  for (const expected of [
    'Sitemap: https://bernstein.run/sitemap.xml',
    'https://bernstein.run/llms.txt',
    'https://bernstein.run/openapi.yaml',
    'https://bernstein.run/.well-known/agent-card.json',
  ]) {
    assert.ok(body.includes(expected), `robots.txt must keep advertising ${expected}`);
  }
});

test('the discovery listing cannot fall behind the shared surface list', async () => {
  /* The block used to be six hand-maintained lines and had already
     drifted. It is generated from lib/machine-surfaces.ts now, and this
     asserts the generation actually covers everything - including the
     RFC 9727 catalog, which is the entry point a client reads first. */
  const body = await readBody();
  const missing = [
    '/.well-known/api-catalog',
    ...DISCOVERY_DOCUMENTS.map((doc) => doc.path),
  ].filter((path) => !body.includes(`${SITE_URL}${path}`));

  assert.deepEqual(
    missing,
    [],
    'robots.txt does not advertise every machine surface this site serves. The listing ' +
      'is generated, so a gap here means the generator stopped covering the list.',
  );
});

test('the discovery listing stays inside the comment block', async () => {
  /* Every generated line has to start with `#`. A directive-looking line
     loose in the preamble would be parsed as a rule against no
     user-agent, and RFC 9309 parsers differ on what they do with that. */
  const preamble = (await readBody()).split('User-agent:')[0] ?? '';
  for (const line of preamble.split('\n')) {
    if (line.trim() === '') continue;
    assert.ok(line.startsWith('#'), `preamble line is not a comment: ${line}`);
  }
});
