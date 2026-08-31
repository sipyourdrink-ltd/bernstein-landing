/**
 * Tests for `lib/model-prices/fetch.ts`.
 *
 * The contract this file exists to protect: the /cost price table never
 * throws into the render, and it never presents the committed snapshot
 * as if it were live. Every failure mode returns the snapshot tagged
 * `source: 'snapshot'`, and the page prints a different sentence for
 * that case.
 *
 * `globalThis.fetch` is replaced for each case; no real network call is
 * made here. The one real call in this change lives in
 * `scripts/fetch-model-prices.mjs`, which an operator runs by hand.
 *
 * Coverage:
 *   - happy path returns live rows and a fresh timestamp
 *   - fetch rejects (network down, DNS, abort) returns the snapshot
 *   - non-2xx returns the snapshot
 *   - malformed body (not JSON, no `data`, empty `data`) returns the snapshot
 *   - a payload whose prices fail the sanity band returns the snapshot
 *   - the committed snapshot itself is a usable table
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchModelPrices, snapshotTable } from '../lib/model-prices/fetch.ts';
import { isPlausibleTable, selectRows } from '../lib/model-prices/select.ts';
import fixture from './fixtures/openrouter-models.trimmed.json' with { type: 'json' };

type FetchFn = typeof globalThis.fetch;

async function withFetch<T>(fn: FetchFn, body: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try {
    return await body();
  } finally {
    globalThis.fetch = original;
  }
}

function jsonResponse(payload: unknown, status = 200): FetchFn {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as FetchFn;
}

/* A payload whose prices are a million times too large, which is what a
   switch to per-1M units upstream would look like to the parser. */
function badUnitsPayload() {
  return {
    data: fixture.data.map((m) => ({
      ...m,
      pricing: Object.fromEntries(
        Object.entries(m.pricing).map(([k, v]) => [k, String(Number(v) * 1e6)]),
      ),
    })),
  };
}

test('a good payload returns live rows and a fresh timestamp', async () => {
  const before = Date.now();
  const table = await withFetch(jsonResponse(fixture), fetchModelPrices);
  assert.equal(table.source, 'live');
  assert.deepEqual(table.rows, selectRows(fixture.data));
  assert.ok(table.rows.length > 0);
  assert.ok(
    new Date(table.fetchedAt).getTime() >= before,
    'fetchedAt should be stamped at read time, not carried from the snapshot',
  );
});

test('a rejected fetch returns the snapshot', async () => {
  const table = await withFetch(
    (async () => {
      throw new TypeError('fetch failed');
    }) as FetchFn,
    fetchModelPrices,
  );
  assert.equal(table.source, 'snapshot');
  assert.deepEqual(table.rows, snapshotTable().rows);
  assert.equal(table.fetchedAt, snapshotTable().fetchedAt);
});

test('an aborted fetch returns the snapshot', async () => {
  const table = await withFetch(
    (async () => {
      throw Object.assign(new Error('This operation was aborted'), {
        name: 'AbortError',
      });
    }) as FetchFn,
    fetchModelPrices,
  );
  assert.equal(table.source, 'snapshot');
});

test('a non-2xx response returns the snapshot', async () => {
  for (const status of [429, 500, 503]) {
    const table = await withFetch(jsonResponse(fixture, status), fetchModelPrices);
    assert.equal(table.source, 'snapshot', `status ${status}`);
  }
});

test('a body that is not JSON returns the snapshot', async () => {
  const table = await withFetch(
    (async () => new Response('<html>upstream error page</html>', { status: 200 })) as FetchFn,
    fetchModelPrices,
  );
  assert.equal(table.source, 'snapshot');
});

test('a payload with no usable data returns the snapshot', async () => {
  for (const payload of [{}, { data: null }, { data: [] }, { data: {} }, null]) {
    const table = await withFetch(jsonResponse(payload), fetchModelPrices);
    assert.equal(table.source, 'snapshot', JSON.stringify(payload));
  }
});

test('a payload that parses to no rows returns the snapshot', async () => {
  /* Well-formed entries, but every one of them is filtered out. If the
     rules ever start matching everything, the page must not publish an
     empty table. */
  const table = await withFetch(
    jsonResponse({ data: [{ id: 'mistralai/whatever', created: 1, pricing: {} }] }),
    fetchModelPrices,
  );
  assert.equal(table.source, 'snapshot');
});

test('prices outside the sanity band return the snapshot', async () => {
  const payload = badUnitsPayload();
  assert.equal(isPlausibleTable(selectRows(payload.data)), false, 'fixture guard');
  const table = await withFetch(jsonResponse(payload), fetchModelPrices);
  assert.equal(table.source, 'snapshot');
});

test('the committed snapshot is itself a usable table', async () => {
  const snap = snapshotTable();
  assert.equal(snap.source, 'snapshot');
  assert.ok(isPlausibleTable(snap.rows), 'snapshot rows must pass the sanity band');
  assert.ok(
    snap.rows.length >= 8 && snap.rows.length <= 14,
    `snapshot should hold 8-14 rows, has ${snap.rows.length}`,
  );
  assert.ok(
    !Number.isNaN(new Date(snap.fetchedAt).getTime()),
    'snapshot fetchedAt must parse as a date',
  );
  for (const row of snap.rows) {
    assert.equal(typeof row.brand, 'string');
    assert.ok(row.id.includes('/'), `${row.id} should keep its upstream id`);
    assert.ok(row.displayName.length > 0);
  }
});
