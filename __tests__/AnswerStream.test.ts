/**
 * AnswerStream tokeniser tests — `[n]` straddle handling.
 *
 * The component itself is a thin React wrapper; the load-bearing
 * logic is `tokeniseAnswer`, extracted into its own pure module so
 * we can unit-test it without a renderer. The straddle case is the
 * one the ticket explicitly calls out: a token boundary can land
 * inside a `[n]` marker, so the tokeniser must not flash a
 * half-baked literal.
 *
 * Filename note: ticket spec says `AnswerStream.test.tsx`, but our
 * test runner (`node --test --experimental-strip-types`) doesn't
 * load `.tsx` extensions — it sees JSX as an unknown file type
 * before stripping types. We rename to `.test.ts` (no JSX in this
 * file anyway) so the existing convention runs unchanged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokeniseAnswer } from '../components/docs-bot/tokenise-answer.ts';

test('plain text without markers tokenises to a single text segment', () => {
  const segs = tokeniseAnswer('tasks live in .sdd directories.');
  assert.deepEqual(segs, [{ kind: 'text', value: 'tasks live in .sdd directories.' }]);
});

test('single complete [n] marker becomes a chip segment', () => {
  const segs = tokeniseAnswer('tasks live in .sdd [1] directories.');
  assert.deepEqual(segs, [
    { kind: 'text', value: 'tasks live in .sdd ' },
    { kind: 'chip', n: 1 },
    { kind: 'text', value: ' directories.' },
  ]);
});

test('multiple markers are emitted in order', () => {
  const segs = tokeniseAnswer('a [1] b [2] c [3].');
  assert.equal(segs.length, 7);
  assert.equal(segs[0].kind, 'text');
  assert.equal(segs[1].kind, 'chip');
  assert.equal(segs[2].kind, 'text');
  assert.equal(segs[3].kind, 'chip');
  assert.equal(segs[5].kind, 'chip');
  /* Verify the n values land in order. */
  const chips = segs.filter((s) => s.kind === 'chip') as Array<{ kind: 'chip'; n: number }>;
  assert.deepEqual(chips.map((c) => c.n), [1, 2, 3]);
});

test('straddle: text ending with "[1" holds back the prefix until "]" arrives', () => {
  /* Simulates the streaming case: the running text only contains "[1"
     (closing bracket hasn't streamed yet). The tokeniser must not
     emit "[1" as literal text — it should hold the prefix back so a
     later token completes the marker without a flash. */
  const partial = tokeniseAnswer('tasks live in .sdd [1');
  /* The unfinished `[1` is held back; only the prefix preceding the
     `[` is emitted as a text segment. */
  assert.deepEqual(partial, [{ kind: 'text', value: 'tasks live in .sdd ' }]);

  /* Now the closing bracket lands. */
  const complete = tokeniseAnswer('tasks live in .sdd [1]');
  assert.deepEqual(complete, [
    { kind: 'text', value: 'tasks live in .sdd ' },
    { kind: 'chip', n: 1 },
  ]);
});

test('straddle inside [12]: prefix held back even with two-digit citations', () => {
  /* Just to make sure the tokeniser handles >9 citations. The hold-
     back logic checks for "]" up to a small look-ahead window. */
  const partial = tokeniseAnswer('alpha [12');
  assert.deepEqual(partial, [{ kind: 'text', value: 'alpha ' }]);
  const complete = tokeniseAnswer('alpha [12]');
  assert.deepEqual(complete, [
    { kind: 'text', value: 'alpha ' },
    { kind: 'chip', n: 12 },
  ]);
});

test('lone [ followed by non-digit text is rendered as literal "["', () => {
  /* Authors sometimes say "[citation needed]" in source docs. We
     should not eat the `[` if it doesn't look like a marker. */
  const segs = tokeniseAnswer('see [citation needed] line.');
  /* The tokeniser walks character-by-character: it tries the `[`,
     fails to find digits before `]`, emits `[` as literal, and
     continues. The exact segment grouping depends on the walker —
     we assert behaviour: no chip, no data loss. */
  const text = segs.map((s) => (s.kind === 'text' ? s.value : `<chip ${s.n}>`)).join('');
  assert.equal(text, 'see [citation needed] line.');
  assert.ok(segs.every((s) => s.kind === 'text'));
});

test('marker at start and end of string', () => {
  const segs = tokeniseAnswer('[1] start and end [2]');
  assert.equal(segs[0].kind, 'chip');
  assert.equal(segs[segs.length - 1].kind, 'chip');
});

test('streaming progression: append one char at a time, no segment glitches', () => {
  /* End-to-end straddle drill: imagine the gateway streamed
     "abc [1] def" one char at a time. After each char the running
     concat is fed to tokeniseAnswer; we verify there's never a
     state in which the literal "[" or "[1" leaks into the rendered
     text segments. */
  const target = 'abc [1] def';
  let leakedLiteralBracket = false;
  for (let i = 1; i <= target.length; i += 1) {
    const partial = target.slice(0, i);
    const segs = tokeniseAnswer(partial);
    const text = segs
      .filter((s) => s.kind === 'text')
      .map((s) => (s as { value: string }).value)
      .join('');
    /* The text should never contain "[" without a matching chip
       or non-digit char — because the marker isn't yet complete. */
    if (text.includes('[1') && !segs.some((s) => s.kind === 'chip')) {
      leakedLiteralBracket = true;
    }
  }
  assert.equal(leakedLiteralBracket, false);
});
