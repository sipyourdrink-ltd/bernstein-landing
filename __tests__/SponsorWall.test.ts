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
 *   - 0-count: single full-width placeholder, no avatars rendered.
 *   - 1-count: real avatar + (MIN_VISIBLE - 1) placeholder filler.
 *   - 5-count: real avatars only, no placeholders.
 *   - 5-count: ordered by recognizability desc, then login asc.
 *   - placeholder copy is voice-correct (lowercase, no banned words).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWallSlots,
  isZeroCount,
  MIN_VISIBLE,
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

test('0 sponsors: returns a single placeholder slot', () => {
  const slots = buildWallSlots([]);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].kind, 'placeholder');
});

test('0 sponsors: placeholder copy mentions the homepage promise', () => {
  const slots = buildWallSlots([]);
  assert.equal(slots[0].kind, 'placeholder');
  if (slots[0].kind !== 'placeholder') return; /* type-narrow */
  assert.match(
    slots[0].caption,
    /first three sponsors get listed by name/i,
  );
});

test('0 sponsors: isZeroCount returns true', () => {
  assert.equal(isZeroCount([]), true);
});

test('placeholder copy is lowercase (voice rule from research)', () => {
  const slots = buildWallSlots([]);
  for (const slot of slots) {
    if (slot.kind !== 'placeholder') continue;
    /* Allow $ digits dollar amounts but no uppercase letters in the
       lowercase-voice copy — research file: "lowercase casual copy". */
    assert.equal(
      slot.caption,
      slot.caption.toLowerCase(),
      `placeholder caption should be all lowercase: ${JSON.stringify(slot.caption)}`,
    );
  }
});

test('placeholder copy avoids banned marketing words', () => {
  const banned = [
    'delve',
    'leverage',
    'harness',
    'robust',
    'comprehensive',
    'seamless',
    'transform',
    'unlock',
    'engagement',
    '10x',
    'roi',
    'thrilled',
  ];
  const slots = buildWallSlots([]);
  for (const slot of slots) {
    if (slot.kind !== 'placeholder') continue;
    const lc = slot.caption.toLowerCase();
    for (const word of banned) {
      assert.ok(
        !new RegExp(`\\b${word}\\b`).test(lc),
        `placeholder caption uses banned word "${word}": ${JSON.stringify(slot.caption)}`,
      );
    }
  }
});

/* -------------------------------------------------------------------- */
/* small-count behaviour (1 sponsor → 1 real + filler)                  */
/* -------------------------------------------------------------------- */

test('1 sponsor: returns 1 real cell + (MIN_VISIBLE - 1) placeholders', () => {
  const slots = buildWallSlots([mkSponsor({ login: 'alice' })]);
  assert.equal(slots.length, MIN_VISIBLE);
  assert.equal(slots[0].kind, 'sponsor');
  if (slots[0].kind === 'sponsor') {
    assert.equal(slots[0].login, 'alice');
  }
  /* Slots after the real sponsor are placeholders. */
  for (let i = 1; i < slots.length; i++) {
    assert.equal(slots[i].kind, 'placeholder', `slot ${i} should be a placeholder`);
  }
});

test('1 sponsor: real cell precedes filler cells (no leading placeholder)', () => {
  const slots = buildWallSlots([mkSponsor({ login: 'alice' })]);
  /* The very first cell must be the real sponsor — eye lands on a
     real name first, never on a placeholder. */
  assert.equal(slots[0].kind, 'sponsor');
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
/* edge: 4-count (one below MIN_VISIBLE) gets exactly one filler        */
/* -------------------------------------------------------------------- */

test('4 sponsors: 4 real cells + 1 placeholder = MIN_VISIBLE total', () => {
  const sponsors: Sponsor[] = ['alice', 'bob', 'carol', 'dave'].map(
    (login) => mkSponsor({ login }),
  );
  const slots = buildWallSlots(sponsors);
  assert.equal(slots.length, MIN_VISIBLE);
  const realCount = slots.filter((s) => s.kind === 'sponsor').length;
  const placeholderCount = slots.filter((s) => s.kind === 'placeholder').length;
  assert.equal(realCount, 4);
  assert.equal(placeholderCount, 1);
});

/* -------------------------------------------------------------------- */
/* edge: > MIN_VISIBLE returns all real, no filler                      */
/* -------------------------------------------------------------------- */

test('10 sponsors: 10 real cells, no placeholders', () => {
  const logins = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const sponsors: Sponsor[] = logins.map((login) => mkSponsor({ login }));
  const slots = buildWallSlots(sponsors);
  assert.equal(slots.length, 10);
  assert.equal(slots.every((s) => s.kind === 'sponsor'), true);
});
