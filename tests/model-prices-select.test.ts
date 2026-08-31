/**
 * Tests for `lib/model-prices/select.ts`.
 *
 * The fixture is a trimmed copy of a real OpenRouter catalogue response:
 * the entries the rules pick, one witness for every exclusion rule, and
 * a few decoys that must lose. It is trimmed rather than invented so a
 * change to the upstream shape shows up here rather than on the page.
 *
 * The trimmed fixture selects the same ten rows as the full 413-model
 * payload it was cut from, which is what makes it a usable stand-in.
 *
 * Coverage:
 *   - per-1M conversion, against four hand-checked prices
 *   - every exclusion rule, each with its own witness
 *   - the dated-id rule keeping a dated id when it is the only one
 *   - brand grouping, ordering, and row count staying in range
 *   - the sanity band rejecting an impossible table
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type PriceRow,
  PRICE_SANITY_MAX,
  formatUsd,
  groupByBrand,
  isPlausibleTable,
  selectRows,
  toCandidates,
  toPer1M,
} from '../lib/model-prices/select.ts';
import fixture from './fixtures/openrouter-models.trimmed.json' with { type: 'json' };

const MODELS = fixture.data;

function candidateIds(): Set<string> {
  return new Set(toCandidates(MODELS).map((c) => c.id));
}

function rowById(rows: PriceRow[], id: string): PriceRow | undefined {
  return rows.find((r) => r.id === id);
}

/* --------------------------------------------------------------------
   per-1M conversion
   -------------------------------------------------------------------- */

test('per-token strings convert to per-1M dollars', () => {
  /* Upstream sends USD per single token as a decimal string. */
  assert.equal(toPer1M('0.000005'), 5);
  assert.equal(toPer1M('0.0000000001'), 0.0001);
  assert.equal(toPer1M(null), null);
  assert.equal(toPer1M(undefined), null);
  assert.equal(toPer1M('not a number'), null);
});

test('float noise in the upstream decimal is rounded off', () => {
  /* 0.09999999999999999 per 1M is 0.1; printing it verbatim would put
     17 digits in a table cell. */
  assert.equal(toPer1M('0.00000009999999999999999'), 0.1);
  assert.equal(toPer1M('0.00000016999999999999998'), 0.17);
});

test('hand-checked prices survive the conversion', () => {
  const byId = new Map(toCandidates(MODELS).map((c) => [c.id, c]));
  const expected: [string, number, number, number][] = [
    /* id, input/1M, output/1M, cached input/1M */
    ['anthropic/claude-opus-5', 5, 25, 0.5],
    ['anthropic/claude-sonnet-5', 2, 10, 0.2],
    ['anthropic/claude-haiku-4.5', 1, 5, 0.1],
    ['google/gemini-2.5-pro', 1.25, 10, 0.125],
  ];
  for (const [id, input, output, cached] of expected) {
    const row = byId.get(id);
    assert.ok(row, `${id} should survive the exclusion rules`);
    assert.equal(row.inputPer1M, input, `${id} input`);
    assert.equal(row.outputPer1M, output, `${id} output`);
    assert.equal(row.cachedInputPer1M, cached, `${id} cached input`);
  }
});

/* --------------------------------------------------------------------
   exclusion rules, one witness each
   -------------------------------------------------------------------- */

test('floating aliases are excluded', () => {
  const ids = candidateIds();
  const aliases = MODELS.filter((m) => m.id.startsWith('~'));
  assert.ok(aliases.length > 0, 'fixture should carry a floating alias');
  for (const alias of aliases) assert.ok(!ids.has(alias.id), alias.id);
});

test('variant-tagged ids are excluded in favour of the base id', () => {
  const ids = candidateIds();
  assert.ok(!ids.has('anthropic/claude-opus-5:batch'), 'batch SKU');
  assert.ok(!ids.has('openai/gpt-oss-20b:free'), 'free-tier mirror');
  assert.ok(ids.has('anthropic/claude-opus-5'), 'base id is kept');
});

test('serving-mode suffixes are excluded when the base id is listed', () => {
  const ids = candidateIds();
  assert.ok(!ids.has('anthropic/claude-opus-5-fast'), '-fast');
  assert.ok(!ids.has('openai/gpt-5.6-sol-pro'), '-pro');
  assert.ok(!ids.has('google/gemini-3.1-pro-preview-customtools'), '-customtools');
  assert.ok(ids.has('openai/gpt-5.6-sol'), 'base id is kept');
  assert.ok(ids.has('google/gemini-3.1-pro-preview'), 'base id is kept');
});

test('a size suffix is not treated as a serving mode', () => {
  /* `-mini` / `-nano` / `-lite` denote genuinely smaller and cheaper
     models, and are usually the cheap-tier pick. If they ever start
     being dropped alongside `-fast` and `-pro`, this fails. */
  const ids = toCandidates([
    { id: 'openai/gpt-9', created: 1, ...textModel('0.000002', '0.000008') },
    { id: 'openai/gpt-9-mini', created: 1, ...textModel('0.0000002', '0.0000008') },
    { id: 'openai/gpt-9-pro', created: 1, ...textModel('0.00002', '0.00008') },
  ]).map((c) => c.id);
  assert.deepEqual(ids.sort(), ['openai/gpt-9', 'openai/gpt-9-mini']);
});

test('dated snapshot ids are excluded when the undated id exists', () => {
  const ids = candidateIds();
  assert.ok(!ids.has('deepseek/deepseek-v4-pro-0813'), 'MMDD form');
  assert.ok(!ids.has('openai/gpt-4o-2024-11-20'), 'YYYY-MM-DD form');
  assert.ok(ids.has('deepseek/deepseek-v4-pro'), 'undated id is kept');
  assert.ok(ids.has('openai/gpt-4o'), 'undated id is kept');
});

test('a dated id is kept when it is the only id for that model', () => {
  const ids = candidateIds();
  /* No `deepseek/deepseek-chat-v3` is listed, so the dated id is the
     model's only name and dropping it would lose the model. */
  assert.ok(!MODELS.some((m) => m.id === 'deepseek/deepseek-chat-v3'));
  assert.ok(ids.has('deepseek/deepseek-chat-v3-0324'));
});

test('-preview is excluded when a GA sibling exists, kept when not', () => {
  const ids = candidateIds();
  assert.ok(!ids.has('google/gemini-2.5-pro-preview'), 'GA sibling exists');
  assert.ok(ids.has('google/gemini-2.5-pro'), 'GA sibling');
  assert.ok(ids.has('google/gemini-3.1-pro-preview'), 'no GA sibling, so kept');
});

test('non-text models are excluded', () => {
  const ids = candidateIds();
  assert.ok(!ids.has('google/lyria-3-pro-preview'), 'audio output');
  assert.ok(!ids.has('openai/gpt-5-image'), 'image output');
});

test('brands outside the table are excluded', () => {
  const ids = candidateIds();
  assert.ok(!ids.has('mistralai/mistral-small-3.2-24b-instruct'));
});

/* --------------------------------------------------------------------
   selection, grouping, ordering
   -------------------------------------------------------------------- */

test('the table stays short and covers every brand present', () => {
  const rows = selectRows(MODELS);
  assert.ok(
    rows.length >= 8 && rows.length <= 14,
    `expected 8-14 rows, got ${rows.length}`,
  );
  const brands = new Set(rows.map((r) => r.brand));
  assert.deepEqual(
    [...brands].sort(),
    ['anthropic', 'deepseek', 'google', 'openai', 'xai'],
  );
});

test('x-ai is labelled xai to match the page copy', () => {
  const rows = selectRows(MODELS);
  assert.ok(rows.some((r) => r.brand === 'xai'));
  assert.ok(!rows.some((r) => r.brand === 'x-ai'));
  assert.ok(rowById(rows, 'x-ai/grok-4.6'), 'the id keeps its upstream form');
});

test('rows are contiguous per brand and cheapest first within a brand', () => {
  const rows = selectRows(MODELS);
  const groups = groupByBrand(rows);
  /* Contiguous: chunking never produces the same brand twice. */
  const seen = groups.map((g) => g.brand);
  assert.equal(new Set(seen).size, seen.length, 'each brand appears once');
  for (const g of groups) {
    const prices = g.rows.map((r) => r.inputPer1M);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b), g.brand);
  }
});

test('brands are ordered by their cheapest row', () => {
  const groups = groupByBrand(selectRows(MODELS));
  const heads = groups.map((g) => g.rows[0].inputPer1M);
  assert.deepEqual(heads, [...heads].sort((a, b) => a - b));
});

test('each brand contributes a cheap tier and a flagship', () => {
  const groups = groupByBrand(selectRows(MODELS));
  for (const g of groups) {
    assert.ok(g.rows.length <= 2, `${g.brand} should contribute at most 2 rows`);
    if (g.rows.length === 2) {
      assert.ok(
        g.rows[1].inputPer1M > g.rows[0].inputPer1M,
        `${g.brand} flagship should cost more than its cheap tier`,
      );
    }
  }
});

test('a superseded model does not beat the current generation', () => {
  const rows = selectRows(MODELS);
  /* claude-opus-4.1 is pricier than anything current but a year old,
     and claude-3-haiku is cheaper than any current tier and older
     still. The recency windows are what keep both out. */
  assert.ok(!rowById(rows, 'anthropic/claude-opus-4.1'), 'stale flagship');
  assert.ok(!rowById(rows, 'anthropic/claude-3-haiku'), 'stale cheap tier');
  assert.ok(!rowById(rows, 'openai/o1-pro'), 'stale flagship');
});

test('selection is deterministic for identical input', () => {
  const a = selectRows(MODELS);
  const b = selectRows([...MODELS].reverse());
  assert.deepEqual(a, b, 'input order must not change the result');
});

test('an absent cache-read rate becomes null, not zero', () => {
  const [row] = toCandidates([
    { id: 'x-ai/grok-test', created: 1, ...textModel('0.000001', '0.000002') },
  ]);
  assert.equal(row.cachedInputPer1M, null);
  assert.equal(formatUsd(row.cachedInputPer1M), 'n/a');
});

/* --------------------------------------------------------------------
   formatting
   -------------------------------------------------------------------- */

test('prices print with at least two decimals below a dollar', () => {
  assert.equal(formatUsd(5), '$5');
  assert.equal(formatUsd(1.168), '$1.168');
  assert.equal(formatUsd(0.1), '$0.10');
  assert.equal(formatUsd(0.03), '$0.03');
  assert.equal(formatUsd(0.06146), '$0.06146');
  assert.equal(formatUsd(null), 'n/a');
});

/* --------------------------------------------------------------------
   sanity band
   -------------------------------------------------------------------- */

function row(overrides: Partial<PriceRow> = {}): PriceRow {
  return {
    brand: 'anthropic',
    id: 'anthropic/claude-test',
    displayName: 'claude-test',
    inputPer1M: 5,
    cachedInputPer1M: 0.5,
    outputPer1M: 25,
    ...overrides,
  };
}

test('a real table passes the sanity band', () => {
  assert.equal(isPlausibleTable(selectRows(MODELS)), true);
});

test('an empty table is rejected', () => {
  assert.equal(isPlausibleTable([]), false);
  assert.equal(isPlausibleTable(selectRows([])), false);
});

test('a price outside the sanity band is rejected', () => {
  /* Upstream switching to per-1M units would multiply every price by a
     million. That is a parse bug, not a price change. */
  assert.equal(isPlausibleTable([row({ inputPer1M: PRICE_SANITY_MAX + 1 })]), false);
  assert.equal(isPlausibleTable([row({ outputPer1M: 5_000_000 })]), false);
  assert.equal(isPlausibleTable([row({ inputPer1M: 0 })]), false);
  assert.equal(isPlausibleTable([row({ cachedInputPer1M: 0 })]), false);
  assert.equal(isPlausibleTable([row({ inputPer1M: Number.NaN })]), false);
  /* A missing cache-read rate is normal and must not be rejected. */
  assert.equal(isPlausibleTable([row({ cachedInputPer1M: null })]), true);
});

/* A minimal text-in / text-out entry, for the synthetic cases above. */
function textModel(prompt: string, completion: string) {
  return {
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    pricing: { prompt, completion },
  };
}
