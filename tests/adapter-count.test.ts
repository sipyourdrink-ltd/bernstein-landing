/**
 * Tests for `lib/adapter-count.ts::fetchAdapterCount`.
 *
 * The function fetches the bernstein registry.py from GitHub at request
 * time and counts top-level dict keys, excluding the placeholder entries
 * `generic` and `mock`. Every external dependency is mocked via
 * `globalThis.fetch` — no real network call is made.
 *
 * These tests previously asserted a "+1 for GenericAdapter" increment.
 * That was correct when `GenericAdapter` sat outside `_ADAPTERS`, and
 * silently became wrong once the registry gained a `"generic"` key: the
 * increment then double-counted it and the site published a figure two
 * higher than reality. The fixtures below cover both placeholders so the
 * exclusion cannot regress unnoticed.
 *
 * Coverage:
 *   - happy path: 5 agent keys in fixture → returns 5
 *   - fetch rejects → returns FALLBACK_COUNT (network down branch)
 *   - non-2xx response → returns FALLBACK_COUNT (4xx/5xx branch)
 *   - dict opens but never closes → returns FALLBACK_COUNT (truncated branch)
 *   - empty dict body → returns FALLBACK_COUNT (the regex matched zero
 *     keys, which means our parser found nothing it can trust)
 *   - real-shape fixture with comments and trailing newlines → still
 *     counts only the `"key":` lines we expect
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchAdapterCount,
  _FALLBACK_COUNT_FOR_TESTS as FALLBACK,
} from '../lib/adapter-count.ts';

type FetchFn = typeof globalThis.fetch;

function installFetch(fn: FetchFn): { restore: () => void } {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function ok(text: string): FetchFn {
  return (async () =>
    new Response(text, { status: 200, headers: { 'Content-Type': 'text/plain' } })) as FetchFn;
}

const FIXTURE_FIVE_KEYS = `
"""Adapter registry — look up CLI adapters by name."""

from bernstein.adapters.aider import AiderAdapter
from bernstein.adapters.claude import ClaudeCodeAdapter
from bernstein.adapters.codex import CodexAdapter
from bernstein.adapters.cursor import CursorAdapter
from bernstein.adapters.gemini import GeminiAdapter

_ADAPTERS: dict[str, type[CLIAdapter] | CLIAdapter] = {
    "aider": AiderAdapter,
    "claude": ClaudeCodeAdapter,
    "codex": CodexAdapter,
    "cursor": CursorAdapter,
    "gemini": GeminiAdapter,
}

def lookup(name): ...
`;

const FIXTURE_TRUNCATED = `
_ADAPTERS: dict[str, type[CLIAdapter] | CLIAdapter] = {
    "aider": AiderAdapter,
    "claude": ClaudeCodeAdapter,
    # file truncated mid-flight, no closing brace ever appears
`;

const FIXTURE_EMPTY_DICT = `
_ADAPTERS: dict[str, type[CLIAdapter] | CLIAdapter] = {
}
`;

/* Has comments referencing "key": shapes that must NOT match — the
   regex is anchored to a leading whitespace + quote, but a stray
   comment line is what would catch a sloppy implementation. */
/* Both placeholder keys present alongside real agents. This is the shape
   the live registry actually has, and the shape the old "+1 for
   GenericAdapter" arithmetic got wrong. */
const FIXTURE_WITH_PLACEHOLDERS = `
_ADAPTERS: dict[str, type[CLIAdapter] | CLIAdapter] = {
    "aider": AiderAdapter,
    "claude": ClaudeCodeAdapter,
    "codex": CodexAdapter,
    "generic": GenericAdapter,
    "mock": MockAgentAdapter,
}
`;

const FIXTURE_WITH_COMMENT_DECOY = `
_ADAPTERS: dict[str, type[CLIAdapter] | CLIAdapter] = {
    # the next line is "decoy": NotAnAdapter, which we should not count
    "real_one": RealAdapter,
    "second": SecondAdapter,
}
`;

test('fetchAdapterCount happy path: 5 agent keys -> 5', async () => {
  const stub = installFetch(ok(FIXTURE_FIVE_KEYS));
  try {
    const count = await fetchAdapterCount();
    assert.equal(count, 5, 'five agent keys, none of them placeholders');
  } finally {
    stub.restore();
  }
});

test('fetchAdapterCount excludes the generic and mock placeholders', async () => {
  const stub = installFetch(ok(FIXTURE_WITH_PLACEHOLDERS));
  try {
    const count = await fetchAdapterCount();
    assert.equal(
      count,
      3,
      'five keys minus generic and mock leaves three real agents',
    );
  } finally {
    stub.restore();
  }
});

test('fetchAdapterCount fallback: fetch rejects', async () => {
  const stub = installFetch((async () => {
    throw new Error('network down');
  }) as FetchFn);
  try {
    const count = await fetchAdapterCount();
    assert.equal(count, FALLBACK);
  } finally {
    stub.restore();
  }
});

test('fetchAdapterCount fallback: non-2xx response', async () => {
  const stub = installFetch(
    (async () =>
      new Response('not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      })) as FetchFn,
  );
  try {
    const count = await fetchAdapterCount();
    assert.equal(count, FALLBACK);
  } finally {
    stub.restore();
  }
});

test('fetchAdapterCount fallback: malformed input (dict never closes)', async () => {
  const stub = installFetch(ok(FIXTURE_TRUNCATED));
  try {
    const count = await fetchAdapterCount();
    assert.equal(count, FALLBACK);
  } finally {
    stub.restore();
  }
});

test('fetchAdapterCount fallback: dict body has no keys', async () => {
  const stub = installFetch(ok(FIXTURE_EMPTY_DICT));
  try {
    const count = await fetchAdapterCount();
    assert.equal(count, FALLBACK);
  } finally {
    stub.restore();
  }
});

test('fetchAdapterCount ignores comment decoys', async () => {
  const stub = installFetch(ok(FIXTURE_WITH_COMMENT_DECOY));
  try {
    const count = await fetchAdapterCount();
    assert.equal(count, 2, 'only the two real keys count; the comment is not one');
  } finally {
    stub.restore();
  }
});
