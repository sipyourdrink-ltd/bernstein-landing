/**
 * DocsBot state-machine integration tests.
 *
 * Test setup constraint: the existing test runner is `node --test
 * --experimental-strip-types` which doesn't ship a React DOM
 * renderer or jsdom. We don't add new test framework deps (per
 * RAG-004 ticket — the orchestrator owns deps), so this file
 * exercises the same state machine the React component uses,
 * driven by mock SSE events, without spinning a renderer.
 *
 * What's covered:
 *   - idle → streaming → done   (happy path, with citations)
 *   - idle → streaming → declined
 *   - idle → streaming → error
 *   - aborted → error code=ABORTED
 *
 * What's NOT covered here (move to Playwright e2e per ticket):
 *   - DOM rendering, focus management, popover paint timing,
 *     prefers-reduced-motion, slash-command modal trapping.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reducer } from '../components/docs-bot/sse-reducer.ts';
import type { DocsBotState, SseEvent } from '../components/docs-bot/types.ts';

/**
 * Drive a sequence of mock SSE events through the reducer the way a
 * live stream would. Returns the final state. Mirrors the wiring in
 * `DocsBot.tsx` so any drift in the dispatch shape would show up
 * here first.
 */
function runStream(events: SseEvent[]): DocsBotState {
  let s: DocsBotState = reducer(initialState, { kind: 'ASK', query: 'test' });
  for (const event of events) {
    s = reducer(s, { kind: 'EVENT', event });
  }
  return s;
}

test('idle → streaming → done pushes the answer into transcript and clears text', () => {
  /* Multi-turn shape (RAG-005): on `done` we roll the active text +
     citations into a transcript pair so the next ask starts on a
     fresh canvas. `text` and `citations` clear; `transcript` carries
     the prior turn for context replay on the next request. */
  const final = runStream([
    { type: 'meta', responseId: 'r-1', model: 'mock/m' },
    { type: 'token', delta: 'tasks live in ' },
    { type: 'token', delta: '`.sdd/` ' },
    { type: 'citation', n: 1, title: 'state', url: 'https://x.com/a', excerpt: 'sdd' },
    { type: 'token', delta: 'directories [1].' },
    { type: 'done', costUsd: 0.001, elapsedMs: 320, declined: false, followUps: ['a', 'b', 'c'] },
  ]);
  assert.equal(final.phase, 'done');
  assert.equal(final.text, '');
  assert.equal(final.citations.size, 0);
  assert.deepEqual(final.followUps, ['a', 'b', 'c']);
  assert.equal(final.responseId, 'r-1');
  assert.equal(final.transcript.length, 2);
  assert.equal(final.transcript[0].role, 'user');
  assert.equal(final.transcript[0].content, 'test');
  assert.equal(final.transcript[1].role, 'assistant');
  assert.equal(final.transcript[1].content, 'tasks live in `.sdd/` directories [1].');
  assert.equal(final.transcript[1].citations?.length, 1);
  assert.equal(final.transcript[1].citations?.[0].title, 'state');
});

test('decline path — phase becomes declined, follow-ups are cleared', () => {
  const final = runStream([
    { type: 'meta', responseId: 'r-d', model: 'mock/m' },
    { type: 'token', delta: 'no docs cover this query' },
    { type: 'done', costUsd: 0, elapsedMs: 180, declined: true, followUps: ['ignored'] },
  ]);
  assert.equal(final.phase, 'declined');
  assert.deepEqual(final.followUps, []);
});

test('error path — phase becomes error with code/message preserved', () => {
  const final = runStream([
    { type: 'meta', responseId: 'r-e', model: 'mock/m' },
    { type: 'token', delta: 'partial token' },
    { type: 'error', code: 'SERVICE_UNAVAILABLE', message: 'gateway down' },
  ]);
  assert.equal(final.phase, 'error');
  assert.equal(final.error?.code, 'SERVICE_UNAVAILABLE');
  assert.equal(final.error?.message, 'gateway down');
  /* The partial text is kept so a developer or curious user can see
     what landed before the break. */
  assert.equal(final.text, 'partial token');
});

test('abort during stream — phase becomes error code=ABORTED', () => {
  let s = reducer(initialState, { kind: 'ASK', query: 'test' });
  s = reducer(s, { kind: 'EVENT', event: { type: 'meta', responseId: 'r', model: 'm' } });
  s = reducer(s, { kind: 'EVENT', event: { type: 'token', delta: 'half-streamed' } });
  s = reducer(s, { kind: 'ABORTED' });
  assert.equal(s.phase, 'error');
  assert.equal(s.error?.code, 'ABORTED');
});

test('SSE wire shape — citation event does NOT modify text', () => {
  /* Regression guard for the cite event path: only `token` events
     should append to `text`; citation metadata lands in the map.
     Without this guard a future refactor might glue both into one
     handler and start double-rendering the marker. */
  const a = reducer(initialState, { kind: 'EVENT', event: { type: 'meta', responseId: 'r', model: 'm' } });
  const b = reducer(a, {
    kind: 'EVENT',
    event: { type: 'citation', n: 1, title: 't', url: 'u', excerpt: 'e' },
  });
  assert.equal(b.text, '');
  assert.equal(b.citations.size, 1);
});

test('back-to-back ASK actions reset streaming state but preserve transcript', () => {
  /* Multi-turn invariant: ASK resets the active stream fields but
     keeps `transcript` so the user can stack follow-ups. The recap
     UI reads from transcript; the next stream lands in a fresh
     `text` / `citations` pair. */
  let s = runStream([
    { type: 'meta', responseId: 'r1', model: 'm' },
    { type: 'token', delta: 'first' },
    { type: 'done', costUsd: 0.001, elapsedMs: 120, declined: false, followUps: [] },
  ]);
  assert.equal(s.phase, 'done');
  assert.equal(s.transcript.length, 2);
  /* Second ASK — should clear text, citations, and reset phase. */
  s = reducer(s, { kind: 'ASK', query: 'next' });
  assert.equal(s.phase, 'idle');
  assert.equal(s.text, '');
  assert.equal(s.citations.size, 0);
  assert.equal(s.responseId, null);
  /* Transcript preserved across ASK so the wire-side history can be
     built from it. */
  assert.equal(s.transcript.length, 2);
  /* pendingQuery captures the new ask so the next `done` knows what
     to push as the user side of the new pair. */
  assert.equal(s.pendingQuery, 'next');
});

test('two-turn flow accumulates transcript across two completes', () => {
  /* idle → streaming → done (push pair 1) → ASK 'follow up'
     → streaming → done (push pair 2) → transcript holds both pairs. */
  let s = reducer(initialState, { kind: 'ASK', query: 'q1' });
  s = reducer(s, { kind: 'EVENT', event: { type: 'meta', responseId: 'r1', model: 'm' } });
  s = reducer(s, { kind: 'EVENT', event: { type: 'token', delta: 'a1' } });
  s = reducer(s, {
    kind: 'EVENT',
    event: { type: 'done', costUsd: 0.001, elapsedMs: 100, declined: false, followUps: [] },
  });
  assert.equal(s.transcript.length, 2);
  assert.equal(s.text, '');
  /* Second turn. */
  s = reducer(s, { kind: 'ASK', query: 'q2' });
  assert.equal(s.transcript.length, 2); /* preserved through ASK */
  s = reducer(s, { kind: 'EVENT', event: { type: 'meta', responseId: 'r2', model: 'm' } });
  s = reducer(s, { kind: 'EVENT', event: { type: 'token', delta: 'a2' } });
  s = reducer(s, {
    kind: 'EVENT',
    event: { type: 'done', costUsd: 0.001, elapsedMs: 100, declined: false, followUps: [] },
  });
  assert.equal(s.transcript.length, 4);
  assert.equal(s.transcript[0].content, 'q1');
  assert.equal(s.transcript[1].content, 'a1');
  assert.equal(s.transcript[2].content, 'q2');
  assert.equal(s.transcript[3].content, 'a2');
});

/* ---------------------------------------------------------------------------
 * research-006 — preview lifecycle integration tests.
 *
 * These exercise the same event sequence DocsBot.tsx subscribes to,
 * verifying the new `preview-streaming` / `preview-complete` phases
 * and the previewText / previewCitations state plumbing.
 * --------------------------------------------------------------------------- */

test('preview-streaming phase activates on first preview-token', () => {
  const final = runStream([
    { type: 'preview-token', delta: 'fast preview ' },
  ]);
  assert.equal(final.phase, 'preview-streaming');
  assert.equal(final.previewText, 'fast preview ');
});

test('preview-complete phase after preview-done(declined=false)', () => {
  const final = runStream([
    { type: 'preview-token', delta: 'preview body [1].' },
    { type: 'preview-citation', n: 1, title: 'p', url: 'https://x/p', excerpt: 'p' },
    { type: 'preview-done', declined: false, costUsd: 0.0001, elapsedMs: 80 },
  ]);
  assert.equal(final.phase, 'preview-complete');
  assert.equal(final.previewDeclined, false);
  assert.equal(final.previewText, 'preview body [1].');
  assert.equal(final.previewCitations.size, 1);
});

test('preview survives meta → streaming transition (collapsed-pill UI)', () => {
  /* The full-path `meta` arrives after a successful preview. The
     reducer transitions to `streaming` but PRESERVES the preview text
     and citations so the soft-collapse block keeps rendering. */
  const final = runStream([
    { type: 'preview-token', delta: 'preview content' },
    { type: 'preview-done', declined: false, costUsd: 0.0001, elapsedMs: 60 },
    { type: 'meta', responseId: 'r-1', model: 'mock/m' },
  ]);
  assert.equal(final.phase, 'streaming');
  assert.equal(final.previewText, 'preview content');
  assert.equal(final.previewDeclined, false);
});

test('preview-done(declined=true) clears previewText so UI hides block', () => {
  const final = runStream([
    { type: 'preview-token', delta: 'partial preview' },
    { type: 'preview-done', declined: true, costUsd: 0, elapsedMs: 40 },
  ]);
  assert.equal(final.phase, 'preview-complete');
  assert.equal(final.previewDeclined, true);
  assert.equal(final.previewText, '');
  assert.equal(final.previewCitations.size, 0);
});

test('ASK after a preview-completed turn resets all preview state', () => {
  /* Multi-turn: a fresh ASK must scrub previewText/previewCitations
     so the next ask doesn't render a stale preview from the previous
     turn under the new question. */
  let s = runStream([
    { type: 'preview-token', delta: 'old preview [1].' },
    { type: 'preview-citation', n: 1, title: 'old', url: 'https://x/o', excerpt: 'o' },
    { type: 'preview-done', declined: false, costUsd: 0.0001, elapsedMs: 80 },
    { type: 'meta', responseId: 'r1', model: 'm' },
    { type: 'token', delta: 'old full answer' },
    { type: 'done', costUsd: 0.001, elapsedMs: 300, declined: false, followUps: [] },
  ]);
  assert.equal(s.transcript.length, 2);
  /* Second ASK — preview state must reset to blank. */
  s = reducer(s, { kind: 'ASK', query: 'next' });
  assert.equal(s.previewText, '');
  assert.equal(s.previewCitations.size, 0);
  assert.equal(s.previewDeclined, null);
  assert.equal(s.transcript.length, 2);
});

test('decline does NOT push into transcript', () => {
  /* A declined turn can't help a follow-up — stacking refusals as
     "context" only confuses the model. The reducer keeps transcript
     untouched on decline. */
  let s = reducer(initialState, { kind: 'ASK', query: 'q1' });
  s = reducer(s, { kind: 'EVENT', event: { type: 'meta', responseId: 'r', model: 'm' } });
  s = reducer(s, { kind: 'EVENT', event: { type: 'token', delta: 'no docs' } });
  s = reducer(s, {
    kind: 'EVENT',
    event: { type: 'done', costUsd: 0, elapsedMs: 50, declined: true, followUps: [] },
  });
  assert.equal(s.phase, 'declined');
  assert.equal(s.transcript.length, 0);
});
