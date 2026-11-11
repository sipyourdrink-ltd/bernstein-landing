/**
 * SponsorWall behaviour tests — render-shape via the pure helpers.
 *
 * The runner is `node --test --experimental-strip-types`, no jsdom.
 * Per the established pattern (sse-reducer.test.ts, AnswerStream
 * tokenise tests, CitationChip tests), the load-bearing logic lives
 * in a sister `.ts` so we can assert on the slot list the wall
 * computes without spinning a renderer. The actual JSX/HTML output
 * is verified manually with `next dev` and `next build`.
 *
 * Cases covered (matching the operator's spec):
 *   - 0-count: no slots.
 *   - 1-count and 4-count: real avatars only, no filler.
 *   - 5-count: ordered by recognizability desc, then login asc.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWallSlots,
  isZeroCount,
  orderSponsors,
  type Sponsor,
} from '../components/landing/sponsor-wall-data.ts';

function mkSponsor(over: Partial<Sponsor> & { login: string }): Sponsor {
  return {
    login: over.login,
    name: over.name ?? over.login,
    avatarUrl: over.avatarUrl ?? `https://avatars.githubusercontent.com/${over.login}`,
    profileUrl: over.profileUrl ?? `https://github.com/${over.login}`,
    recognizability: over.recognizability ?? 0,
  };
}

/* -------------------------------------------------------------------- */
/* zero-count behaviour                                                 */
/* -------------------------------------------------------------------- */

test('0 sponsors: returns no slots', () => {
  assert.equal(buildWallSlots([]).length, 0);
});

test('0 sponsors: isZeroCount returns true', () => {
  assert.equal(isZeroCount([]), true);
});

/* -------------------------------------------------------------------- */
/* small-count behaviour (1 sponsor → 1 real cell, no filler)         */
/* -------------------------------------------------------------------- */

test('1 sponsor: returns exactly 1 real cell', () => {
  const slots = buildWallSlots([mkSponsor({ login: 'alice' })]);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].kind, 'sponsor');
  if (slots[0].kind === 'sponsor') {
    assert.equal(slots[0].login, 'alice');
  }
});

test('1 sponsor: isZeroCount returns false', () => {
  assert.equal(isZeroCount([mkSponsor({ login: 'alice' })]), false);
});

/* -------------------------------------------------------------------- */
/* normal-count behaviour (5 sponsors → 5 real, no filler)              */
/* -------------------------------------------------------------------- */

test('5 sponsors: returns exactly 5 real cells, no placeholders', () => {
  const sponsors: Sponsor[] = ['alice', 'bob', 'carol', 'dave', 'eve'].map(
    (login) => mkSponsor({ login }),
  );
  const slots = buildWallSlots(sponsors);
  assert.equal(slots.length, 5);
  for (let i = 0; i < slots.length; i++) {
    assert.equal(slots[i].kind, 'sponsor', `slot ${i} should be a sponsor`);
  }
});

test('5 sponsors: ordering is alphabetical when recognizability is 0 across the board', () => {
  /* Input deliberately scrambled. */
  const sponsors: Sponsor[] = ['eve', 'alice', 'dave', 'bob', 'carol'].map(
    (login) => mkSponsor({ login }),
  );
  const ordered = orderSponsors(sponsors);
  assert.deepEqual(
    ordered.map((s) => s.login),
    ['alice', 'bob', 'carol', 'dave', 'eve'],
  );
});

test('5 sponsors: high-recognizability sponsors come first', () => {
  /* `zelda` has the highest recognizability and is alphabetically last
     — order must put her on top regardless. */
  const sponsors: Sponsor[] = [
    mkSponsor({ login: 'alice', recognizability: 1 }),
    mkSponsor({ login: 'bob', recognizability: 0 }),
    mkSponsor({ login: 'zelda', recognizability: 100 }),
    mkSponsor({ login: 'carol', recognizability: 0 }),
    mkSponsor({ login: 'dave', recognizability: 1 }),
  ];
  const ordered = orderSponsors(sponsors);
  assert.deepEqual(
    ordered.map((s) => s.login),
    /* zelda(100), alice(1), dave(1), bob(0), carol(0) — alpha tiebreak */
    ['zelda', 'alice', 'dave', 'bob', 'carol'],
  );
});

test('5 sponsors: ordering is case-insensitive in the alpha tiebreak', () => {
  /* Mixed-case logins should still sort by case-folded login. */
  const sponsors: Sponsor[] = [
    mkSponsor({ login: 'Bob' }),
    mkSponsor({ login: 'alice' }),
    mkSponsor({ login: 'CAROL' }),
    mkSponsor({ login: 'dave' }),
    mkSponsor({ login: 'eve' }),
  ];
  const ordered = orderSponsors(sponsors);
  assert.deepEqual(
    ordered.map((s) => s.login.toLowerCase()),
    ['alice', 'bob', 'carol', 'dave', 'eve'],
  );
});

test('orderSponsors does not mutate the input array', () => {
  const sponsors: Sponsor[] = ['eve', 'alice', 'dave'].map((login) => mkSponsor({ login }));
  const before = sponsors.map((s) => s.login);
  orderSponsors(sponsors);
  const after = sponsors.map((s) => s.login);
  assert.deepEqual(after, before);
});

/* -------------------------------------------------------------------- */
/* edge: 4-count gets no filler                                        */
/* -------------------------------------------------------------------- */

test('4 sponsors: 4 real cells, no placeholders', () => {
  const sponsors: Sponsor[] = ['alice', 'bob', 'carol', 'dave'].map(
    (login) => mkSponsor({ login }),
  );
  const slots = buildWallSlots(sponsors);
  assert.equal(slots.length, 4);
  assert.equal(slots.every((s) => s.kind === 'sponsor'), true);
});

/* -------------------------------------------------------------------- */
/* edge: 10-count returns all real                                     */
/* -------------------------------------------------------------------- */

test('10 sponsors: 10 real cells, no placeholders', () => {
  const logins = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const sponsors: Sponsor[] = logins.map((login) => mkSponsor({ login }));
  const slots = buildWallSlots(sponsors);
  assert.equal(slots.length, 10);
  assert.equal(slots.every((s) => s.kind === 'sponsor'), true);
});
