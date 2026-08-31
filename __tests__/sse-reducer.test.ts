/**
 * Pure reducer tests for the docs-bot state machine.
 *
 * Tests cover every transition in the table at the top of
 * `components/docs-bot/sse-reducer.ts`. We import the reducer
 * directly — no React, no DOM — and run under `node --test
 * --experimental-strip-types` to match the existing test convention.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reducer } from '../components/docs-bot/sse-reducer.ts';
import type { DocsBotState, SseEvent } from '../components/docs-bot/types.ts';

function applyEvent(s: DocsBotState, event: SseEvent): DocsBotState {
  return reducer(s, { kind: 'EVENT', event });
}

test('initial state is idle with empty fields', () => {
  assert.equal(initialState.phase, 'idle');
  assert.equal(initialState.responseId, null);
  assert.equal(initialState.text, '');
  assert.equal(initialState.citations.size, 0);
  assert.deepEqual(initialState.followUps, []);
  assert.equal(initialState.error, null);
  assert.deepEqual(initialState.transcript, []);
  assert.equal(initialState.pendingQuery, null);
});

test('meta event transitions idle → streaming and stamps responseId/model', () => {
  const next = applyEvent(initialState, {
    type: 'meta',
    responseId: 'r-123',
    model: 'mistralai/ministral-8b-2512',
  });
  assert.equal(next.phase, 'streaming');
  assert.equal(next.responseId, 'r-123');
  assert.equal(next.model, 'mistralai/ministral-8b-2512');
});

test('token event appends to text', () => {
  const a = applyEvent(initialState, { type: 'meta', responseId: 'r', model: 'm' });
  const b = applyEvent(a, { type: 'token', delta: 'tasks ' });
  const c = applyEvent(b, { type: 'token', delta: 'live in ' });
  const d = applyEvent(c, { type: 'token', delta: '`.sdd/`.' });
  assert.equal(d.text, 'tasks live in `.sdd/`.');
  /* Earlier states must not have been mutated. */
  assert.equal(a.text, '');
  assert.equal(b.text, 'tasks ');
});

test('citation event upserts the citations map (new reference each time)', () => {
  const a = applyEvent(initialState, { type: 'meta', responseId: 'r', model: 'm' });
  const b = applyEvent(a, {
    type: 'citation',
    n: 1,
    title: 'state files',
    url: 'https://bernstein.run/blog/state-files',
    excerpt: 'tasks live in .sdd directories',
  });
  assert.notEqual(a.citations, b.citations); /* new reference */
  assert.equal(b.citations.size, 1);
  const c1 = b.citations.get(1);
  assert.ok(c1);
  assert.equal(c1!.title, 'state files');

  /* Upsert: same n, new metadata wins. */
  const c = applyEvent(b, {
    type: 'citation',
    n: 1,
    title: 'state files (updated)',
    url: 'https://bernstein.run/blog/state-files',
    excerpt: 'updated',
  });
  assert.equal(c.citations.get(1)!.title, 'state files (updated)');

  /* Second citation arrives. */
  const d = applyEvent(c, {
    type: 'citation',
    n: 2,
    title: 'cost-aware',
    url: 'https://bernstein.run/blog/cost-aware-routing',
    excerpt: 'haiku/sonnet/opus by complexity',
  });
  assert.equal(d.citations.size, 2);
});

test('done event with declined=false transitions to done and stores follow-ups', () => {
  const a = applyEvent(initialState, { type: 'meta', responseId: 'r', model: 'm' });
  const b = applyEvent(a, { type: 'token', delta: 'tasks live in .sdd' });
  const c = applyEvent(b, {
    type: 'done',
    costUsd: 0.0012,
    elapsedMs: 480,
    declined: false,
    followUps: ['how do plans work?', 'what is a worktree?', 'show cost reports'],
  });
  assert.equal(c.phase, 'done');
  assert.equal(c.costUsd, 0.0012);
  assert.equal(c.elapsedMs, 480);
  assert.deepEqual(c.followUps, [
    'how do plans work?',
    'what is a worktree?',
    'show cost reports',
  ]);
});

test('done event with declined=true transitions to declined and clears follow-ups', () => {
  const a = applyEvent(initialState, { type: 'meta', responseId: 'r', model: 'm' });
  const b = applyEvent(a, { type: 'token', delta: 'no docs match this query' });
  const c = applyEvent(b, {
    type: 'done',
    costUsd: 0.0001,
    elapsedMs: 220,
    declined: true,
    followUps: ['ignored on decline'],
  });
  assert.equal(c.phase, 'declined');
  assert.deepEqual(c.followUps, []);
  /* Decline keeps the partial reason text so debugging is possible. */
  assert.equal(c.text, 'no docs match this query');
});

test('error event transitions to error from any phase', () => {
  const a = applyEvent(initialState, { type: 'meta', responseId: 'r', model: 'm' });
  const b = applyEvent(a, { type: 'token', delta: 'partial...' });
  const c = applyEvent(b, {
    type: 'error',
    code: 'SERVICE_UNAVAILABLE',
    message: 'gateway down',
  });
  assert.equal(c.phase, 'error');
  assert.equal(c.error?.code, 'SERVICE_UNAVAILABLE');
  assert.equal(c.error?.message, 'gateway down');
});

test('ABORTED action sets error.code=ABORTED', () => {
  const a = applyEvent(initialState, { type: 'meta', responseId: 'r', model: 'm' });
  const b = reducer(a, { kind: 'ABORTED' });
  assert.equal(b.phase, 'error');
  assert.equal(b.error?.code, 'ABORTED');
});

test('ASK action resets to idle with empty fields', () => {
  const a = applyEvent(initialState, { type: 'meta', responseId: 'r', model: 'm' });
  const b = applyEvent(a, { type: 'token', delta: 'tasks' });
  const c = applyEvent(b, {
    type: 'done',
    costUsd: 0.001,
    elapsedMs: 300,
    declined: false,
    followUps: ['x'],
  });
  const d = reducer(c, { kind: 'ASK', query: 'next question' });
  assert.equal(d.phase, 'idle');
  assert.equal(d.text, '');
  assert.equal(d.citations.size, 0);
  assert.equal(d.responseId, null);
  assert.deepEqual(d.followUps, []);
});

test('RESET action returns the initial state', () => {
  const a = applyEvent(initialState, { type: 'meta', responseId: 'r', model: 'm' });
  const b = applyEvent(a, { type: 'token', delta: 'partial' });
  const c = reducer(b, { kind: 'RESET' });
  assert.equal(c.phase, 'idle');
  assert.equal(c.text, '');
  assert.equal(c.responseId, null);
});

test('done after ASK pushes user→assistant pair into transcript and clears active text', () => {
  /* The multi-turn lifecycle: ASK records pendingQuery, the stream
     populates text + citations, and `done` rolls the pair into
     transcript so the next ask reads from a fresh canvas. */
  let s = reducer(initialState, { kind: 'ASK', query: 'how do plans work?' });
  s = applyEvent(s, { type: 'meta', responseId: 'r', model: 'm' });
  s = applyEvent(s, { type: 'token', delta: 'plans declare ' });
  s = applyEvent(s, { type: 'token', delta: 'tasks [1].' });
  s = applyEvent(s, {
    type: 'citation',
    n: 1,
    title: 'plan files',
    url: 'https://example.com/plan',
    excerpt: 'plans drive bernstein',
  });
  s = applyEvent(s, {
    type: 'done',
    costUsd: 0.001,
    elapsedMs: 200,
    declined: false,
    followUps: ['x'],
  });
  assert.equal(s.phase, 'done');
  /* Active stream cleared: */
  assert.equal(s.text, '');
  assert.equal(s.citations.size, 0);
  assert.equal(s.pendingQuery, null);
  /* Transcript carries both turns: */
  assert.equal(s.transcript.length, 2);
  assert.equal(s.transcript[0].role, 'user');
  assert.equal(s.transcript[0].content, 'how do plans work?');
  assert.equal(s.transcript[1].role, 'assistant');
  assert.equal(s.transcript[1].content, 'plans declare tasks [1].');
  assert.equal(s.transcript[1].citations?.length, 1);
  assert.equal(s.transcript[1].citations?.[0].n, 1);
  assert.equal(s.transcript[1].responseId, 'r');
});

test('ASK preserves transcript so follow-ups can replay context', () => {
  /* The recap UI reads from `transcript`; ASK must not wipe it or
     the operator's "follow up on the X above" loses its anchor. */
  let s = reducer(initialState, { kind: 'ASK', query: 'first' });
  s = applyEvent(s, { type: 'meta', responseId: 'r1', model: 'm' });
  s = applyEvent(s, { type: 'token', delta: 'answer one' });
  s = applyEvent(s, {
    type: 'done',
    costUsd: 0.001,
    elapsedMs: 200,
    declined: false,
    followUps: [],
  });
  assert.equal(s.transcript.length, 2);
  /* Now ask a follow-up. */
  s = reducer(s, { kind: 'ASK', query: 'second' });
  assert.equal(s.phase, 'idle');
  assert.equal(s.text, '');
  assert.equal(s.transcript.length, 2);
  assert.equal(s.pendingQuery, 'second');
});

/* ---------------------------------------------------------------------------
 * research-006 — progressive TTFT preview reducer transitions.
 *
 * The four cases below cover the failure-mode matrix from the brief:
 *
 *   1. preview ok / full ok        — both render; preview kept (collapsed)
 *   2. preview ok / full decline   — preview kept, full goes to declined
 *                                    (the brief's "do NOT replace with
 *                                    DeclineCard" rule)
 *   3. preview decline / full ok   — preview hidden, full streams normally
 *   4. both decline                — preview hidden, regular DeclineCard
 *
 * Tests dispatch raw SSE events through the reducer and assert the
 * post-state. No DOM, no React.
 * --------------------------------------------------------------------------- */

test('preview ok / full ok — both stream, preview kept after full done', () => {
  let s = reducer(initialState, { kind: 'ASK', query: 'preview happy' });
  /* Preview frames first. */
  s = applyEvent(s, { type: 'preview-token', delta: 'fast preview ' });
  assert.equal(s.phase, 'preview-streaming');
  s = applyEvent(s, { type: 'preview-token', delta: 'cites [1].' });
  s = applyEvent(s, {
    type: 'preview-citation',
    n: 1,
    title: 'preview src',
    url: 'https://x.com/p',
    excerpt: 'p',
  });
  s = applyEvent(s, {
    type: 'preview-done',
    declined: false,
    costUsd: 0.0001,
    elapsedMs: 90,
  });
  assert.equal(s.phase, 'preview-complete');
  assert.equal(s.previewDeclined, false);
  assert.equal(s.previewText, 'fast preview cites [1].');
  assert.equal(s.previewCitations.size, 1);

  /* Regular full path begins. */
  s = applyEvent(s, { type: 'meta', responseId: 'r-1', model: 'mock/m' });
  assert.equal(s.phase, 'streaming');
  /* Preview kept so the UI can render the soft-collapsed block. */
  assert.equal(s.previewText, 'fast preview cites [1].');
  assert.equal(s.previewCitations.size, 1);
  s = applyEvent(s, { type: 'token', delta: 'full answer here [1].' });
  s = applyEvent(s, {
    type: 'citation',
    n: 1,
    title: 'full src',
    url: 'https://x.com/f',
    excerpt: 'f',
  });
  s = applyEvent(s, {
    type: 'done',
    costUsd: 0.001,
    elapsedMs: 380,
    declined: false,
    followUps: [],
  });
  assert.equal(s.phase, 'done');
  /* Preview kept across done so the collapsed-pill UI can keep rendering. */
  assert.equal(s.previewDeclined, false);
  assert.equal(s.previewText, 'fast preview cites [1].');
});

test('preview ok / full decline — preview kept, full goes to declined', () => {
  /* The brief explicitly: "what if full RAG declines after a successful
     preview? we now have *two* answers — keep the preview (with caveat
     copy), do not switch to DeclineCard." We model that as: phase moves
     to 'declined' for the regular path's data, but previewDeclined
     stays false and previewText stays populated. The UI logic in
     DocsBot reads both. */
  let s = reducer(initialState, { kind: 'ASK', query: 'q' });
  s = applyEvent(s, { type: 'preview-token', delta: 'preview answer [1].' });
  s = applyEvent(s, {
    type: 'preview-citation',
    n: 1,
    title: 'p',
    url: 'https://x/p',
    excerpt: 'p',
  });
  s = applyEvent(s, {
    type: 'preview-done',
    declined: false,
    costUsd: 0.0001,
    elapsedMs: 90,
  });
  s = applyEvent(s, { type: 'meta', responseId: 'r', model: 'm' });
  s = applyEvent(s, { type: 'token', delta: 'no docs cover this' });
  s = applyEvent(s, {
    type: 'done',
    costUsd: 0,
    elapsedMs: 220,
    declined: true,
    followUps: [],
  });
  assert.equal(s.phase, 'declined');
  /* Preview survives the full-side decline — the UI uses these to
     render "we have a quick answer; the deep search couldn't ground
     anything more". */
  assert.equal(s.previewDeclined, false);
  assert.equal(s.previewText, 'preview answer [1].');
  assert.equal(s.previewCitations.size, 1);
});

test('preview decline / full ok — preview hidden, full renders normally', () => {
  let s = reducer(initialState, { kind: 'ASK', query: 'q' });
  /* Preview begins streaming, then declines. The reducer clears
     previewText so the UI hides the preview block. */
  s = applyEvent(s, { type: 'preview-token', delta: 'partial' });
  assert.equal(s.phase, 'preview-streaming');
  s = applyEvent(s, {
    type: 'preview-done',
    declined: true,
    costUsd: 0,
    elapsedMs: 50,
  });
  assert.equal(s.phase, 'preview-complete');
  assert.equal(s.previewDeclined, true);
  assert.equal(s.previewText, '');
  assert.equal(s.previewCitations.size, 0);

  /* Full path streams normally. */
  s = applyEvent(s, { type: 'meta', responseId: 'r', model: 'm' });
  s = applyEvent(s, { type: 'token', delta: 'full answer' });
  s = applyEvent(s, {
    type: 'done',
    costUsd: 0.001,
    elapsedMs: 300,
    declined: false,
    followUps: [],
  });
  assert.equal(s.phase, 'done');
  /* previewDeclined stays true so the UI keeps the block hidden. */
  assert.equal(s.previewDeclined, true);
});

test('preview decline / full decline — DeclineCard takes over, preview hidden', () => {
  let s = reducer(initialState, { kind: 'ASK', query: 'q' });
  s = applyEvent(s, {
    type: 'preview-done',
    declined: true,
    costUsd: 0,
    elapsedMs: 30,
  });
  s = applyEvent(s, { type: 'meta', responseId: 'r', model: 'm' });
  s = applyEvent(s, { type: 'token', delta: 'i do not have docs that answer this' });
  s = applyEvent(s, {
    type: 'done',
    costUsd: 0,
    elapsedMs: 200,
    declined: true,
    followUps: [],
  });
  assert.equal(s.phase, 'declined');
  /* Preview hidden + DeclineCard wins. */
  assert.equal(s.previewDeclined, true);
  assert.equal(s.previewText, '');
});

/* ---------------------------------------------------------------------------
 * decline-replace — structured decline.
 *
 * The gateway emits `decline-replace` (full decline copy + up to 3
 * URL-deduped retriever suggestions) BEFORE its legacy decline token
 * fallback. The reducer must swap `text` for the decline copy, pin the
 * suggestions for DeclineCard, and drop the legacy tokens that follow
 * so older-client back-compat frames don't double-render the copy.
 * --------------------------------------------------------------------------- */

test('decline-replace swaps text for the decline copy and stores suggestions', () => {
  let s = reducer(initialState, { kind: 'ASK', query: 'q' });
  s = applyEvent(s, { type: 'meta', responseId: 'r', model: 'm' });
  s = applyEvent(s, { type: 'token', delta: 'partial ungrounded answer' });
  s = applyEvent(s, {
    type: 'decline-replace',
    text: 'no docs cover this. closest pages below.',
    suggestions: [
      {
        n: 1,
        title: 'worktree slots',
        url: 'https://bernstein.run/blog/worktrees',
        excerpt: 'per-task isolation',
        score: 0.62,
      },
      {
        n: 2,
        title: 'merge gates',
        url: 'https://bernstein.run/blog/merge-gates',
        excerpt: 'gated merges',
        score: 0.55,
      },
    ],
  });
  /* Partial answer REPLACED, not appended to. */
  assert.equal(s.text, 'no docs cover this. closest pages below.');
  assert.equal(s.declineReplaced, true);
  assert.equal(s.declineSuggestions.length, 2);
  assert.equal(s.declineSuggestions[0].url, 'https://bernstein.run/blog/worktrees');
  assert.equal(s.declineSuggestions[0].score, 0.62);
});

test('legacy decline tokens after decline-replace are ignored', () => {
  let s = reducer(initialState, { kind: 'ASK', query: 'q' });
  s = applyEvent(s, { type: 'meta', responseId: 'r', model: 'm' });
  s = applyEvent(s, { type: 'token', delta: 'partial' });
  s = applyEvent(s, {
    type: 'decline-replace',
    text: 'decline copy.',
    suggestions: [],
  });
  /* The gateway streams the decline copy again as token deltas for
     older clients; the reducer must not append them. */
  s = applyEvent(s, { type: 'token', delta: '\n\ndecline copy.' });
  assert.equal(s.text, 'decline copy.');
  /* done(declined) then routes to DeclineCard with the swapped text. */
  s = applyEvent(s, {
    type: 'done',
    costUsd: 0,
    elapsedMs: 210,
    declined: true,
    followUps: [],
  });
  assert.equal(s.phase, 'declined');
  assert.equal(s.text, 'decline copy.');
});

test('ASK after a decline-replace resets the flag and suggestions', () => {
  let s = reducer(initialState, { kind: 'ASK', query: 'q' });
  s = applyEvent(s, {
    type: 'decline-replace',
    text: 'decline copy.',
    suggestions: [
      { n: 1, title: 't', url: 'https://x.com/t', excerpt: 'e', score: 0.5 },
    ],
  });
  s = reducer(s, { kind: 'ASK', query: 'next question' });
  assert.equal(s.declineReplaced, false);
  assert.equal(s.declineSuggestions.length, 0);
  /* Tokens for the new turn append normally again. */
  s = applyEvent(s, { type: 'token', delta: 'fresh answer' });
  assert.equal(s.text, 'fresh answer');
});

test('citation event carries the rerank score through to the map', () => {
  const a = applyEvent(initialState, { type: 'meta', responseId: 'r', model: 'm' });
  const b = applyEvent(a, {
    type: 'citation',
    n: 1,
    title: 'scored',
    url: 'https://bernstein.run/blog/scored',
    excerpt: 'x',
    score: 0.73,
  });
  assert.equal(b.citations.get(1)!.score, 0.73);
});

test('full happy-path sequence produces grounded done state', () => {
  let s = initialState;
  s = applyEvent(s, { type: 'meta', responseId: 'r-42', model: 'mock/m' });
  s = applyEvent(s, { type: 'token', delta: 'tasks ' });
  s = applyEvent(s, { type: 'token', delta: 'live in ' });
  s = applyEvent(s, { type: 'token', delta: '.sdd/ ' });
  s = applyEvent(s, {
    type: 'citation',
    n: 1,
    title: 'state files',
    url: 'https://example.com/a',
    excerpt: 'sdd directories',
  });
  s = applyEvent(s, { type: 'token', delta: '[1].' });
  s = applyEvent(s, {
    type: 'done',
    costUsd: 0.0008,
    elapsedMs: 360,
    declined: false,
    followUps: ['follow-up one', 'follow-up two', 'follow-up three'],
  });
  assert.equal(s.phase, 'done');
  assert.equal(s.text, 'tasks live in .sdd/ [1].');
  assert.equal(s.citations.size, 1);
  assert.equal(s.followUps.length, 3);
});
