/**
 * Curation rules for the /cost model-price table.
 *
 * The upstream catalogue lists 400+ entries. The page needs a short
 * readable table, so this module reduces the catalogue to two rows per
 * brand: the current flagship and the current cheap tier. Everything
 * here is pure, so `scripts/fetch-model-prices.mjs` and the request-time
 * path in `./fetch.ts` produce identical rows from identical input.
 *
 * The rules are encoded, not a model allowlist. A hand-written list of
 * model ids is what this table used to be, and it went stale within one
 * release cycle. The point of the rules below is that they keep working
 * when a vendor ships the next generation.
 *
 * Exclusions, in order:
 *   1. Floating aliases (`~vendor/model-latest`). They resolve to a
 *      different model over time, so their price is not quotable.
 *   2. Variant-tagged ids (`model:batch`, `model:free`, `model:thinking`).
 *      These are alternate SKUs of a base model that is listed
 *      separately; the base id is the one the table should name.
 *   3. Anything that is not a text-in / text-out model. Image, audio and
 *      music endpoints are priced per token but are not routing targets
 *      for a coding agent.
 *   4. Entries with a zero or non-numeric price. Free-tier mirrors and
 *      unpriced previews are not comparable to a paid rate.
 *   5. Dated snapshot ids (`model-0813`, `model-2024-11-20`) when the
 *      undated id for the same model is also listed. If only the dated
 *      id exists, it is kept, because then it is the only way to name
 *      that model.
 *   6. `-preview` ids when the GA sibling is listed.
 *   7. Serving-mode suffixes (`-fast`, `-pro`, `-max`, `-high`,
 *      `-thinking`, `-chat`, `-customtools`) when the base id is listed.
 *      These describe how the same model is served, not a different
 *      model, and they distort a price comparison. Size suffixes
 *      (`-mini`, `-nano`, `-lite`) are deliberately NOT in this list:
 *      they are genuinely smaller and cheaper models and are usually
 *      the cheap-tier pick.
 *
 * Selection, per brand, from what survives:
 *   - flagship: the highest input price among models released within
 *     FLAGSHIP_WINDOW_DAYS of the brand's newest listing. The window is
 *     what makes this "current" rather than "most expensive ever": a
 *     vendor's previous generation stays listed for a long time at a
 *     higher price than its replacement.
 *   - cheap tier: the lowest input price within CHEAP_WINDOW_DAYS of the
 *     brand's newest listing. The wider window is deliberate. Cheap
 *     tiers are refreshed far less often than flagships, so a one-year
 *     horizon keeps a still-current small model in the table while still
 *     dropping models that have been superseded twice over.
 *
 * Ties break on newer first, then on id, so the output is stable across
 * runs for identical input.
 */

/** The shape this module needs from an upstream catalogue entry. */
export interface RawModel {
  id?: unknown;
  created?: unknown;
  architecture?: {
    input_modalities?: unknown;
    output_modalities?: unknown;
  } | null;
  pricing?: {
    prompt?: unknown;
    completion?: unknown;
    input_cache_read?: unknown;
  } | null;
}

/** One rendered line of the price table. Prices are USD per 1M tokens. */
export interface PriceRow {
  brand: string;
  id: string;
  displayName: string;
  inputPer1M: number;
  cachedInputPer1M: number | null;
  outputPer1M: number;
}

/** The table plus its provenance. */
export interface PriceTable {
  rows: PriceRow[];
  fetchedAt: string;
  source: 'live' | 'snapshot';
}

/**
 * Brands the table covers, keyed by the id prefix upstream uses. The
 * value is the label the page prints; `x-ai` renders as `xai` to match
 * the wording the rest of the page already uses.
 */
export const BRAND_LABELS: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  'x-ai': 'xai',
  deepseek: 'deepseek',
};

const DAY_SECONDS = 86_400;

/** Release window that counts as the brand's current generation. */
export const FLAGSHIP_WINDOW_DAYS = 180;

/** Release window a cheap tier may sit in before it counts as retired. */
export const CHEAP_WINDOW_DAYS = 365;

/**
 * Sanity band for a per-1M price, in USD. A row outside this band means
 * the upstream unit changed or the parse is wrong, not that a vendor is
 * giving tokens away or charging four figures for them.
 */
export const PRICE_SANITY_MIN = 0.0001;
export const PRICE_SANITY_MAX = 1000;

/** `-0813`, `-05-06`, `-2024-11-20`. */
const DATE_SUFFIX = /-(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{2}|\d{4})$/;

/** Suffixes that change how a model is served, not which model it is. */
const SERVING_MODE_SUFFIX = /-(?:fast|pro|max|high|thinking|chat|customtools)$/;

const PREVIEW_SUFFIX = '-preview';

/** Upstream prices are USD per single token, as decimal strings. */
const TOKENS_PER_UNIT = 1_000_000;

/**
 * Round to four significant digits. Upstream sends values such as
 * `0.00000009999999999999999`, which is 0.1 per 1M with float noise on
 * the end; printing that verbatim would put 17 digits in a table cell.
 */
function toSignificant(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  return Number(value.toPrecision(4));
}

/** Per-token decimal string to USD per 1M tokens, or null. */
export function toPer1M(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return toSignificant(n * TOKENS_PER_UNIT);
}

/**
 * Print a per-1M price the way the table reads best: no padding at or
 * above a dollar, two decimals minimum below it, and no trailing zeros
 * beyond that.
 */
export function formatUsd(value: number | null): string {
  if (value === null) return 'n/a';
  if (value >= 1) return `$${String(value)}`;
  const plain = String(value);
  const decimals = plain.includes('.') ? plain.split('.')[1].length : 0;
  return `$${value.toFixed(Math.max(2, decimals))}`;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Text in, text only out. Image / audio / music endpoints drop here. */
function isTextOnlyModel(model: RawModel): boolean {
  const inputs = asStringArray(model.architecture?.input_modalities);
  const outputs = asStringArray(model.architecture?.output_modalities);
  return inputs.includes('text') && outputs.length === 1 && outputs[0] === 'text';
}

/**
 * True when `id` is a qualified form of some other listed id, e.g.
 * `claude-opus-5-fast` next to `claude-opus-5`. The base has to be
 * present in `listed` for the qualified id to be redundant; when only
 * the qualified id exists it is the model's only name and is kept.
 */
function isSupersededVariant(id: string, listed: ReadonlySet<string>): boolean {
  if (DATE_SUFFIX.test(id) && listed.has(id.replace(DATE_SUFFIX, ''))) return true;
  if (id.endsWith(PREVIEW_SUFFIX) && listed.has(id.slice(0, -PREVIEW_SUFFIX.length))) return true;
  if (SERVING_MODE_SUFFIX.test(id) && listed.has(id.replace(SERVING_MODE_SUFFIX, ''))) return true;
  return false;
}

interface Candidate extends PriceRow {
  created: number;
}

/**
 * Apply every exclusion rule and convert what survives into rows.
 * Exported for tests; production code goes through `selectRows`.
 */
export function toCandidates(models: RawModel[]): Candidate[] {
  const listed = new Set<string>(
    models.map((m) => m.id).filter((id): id is string => typeof id === 'string'),
  );

  const out: Candidate[] = [];
  for (const model of models) {
    const id = model.id;
    if (typeof id !== 'string' || id.length === 0) continue;
    if (id.startsWith('~')) continue;
    if (id.includes(':')) continue;

    const slash = id.indexOf('/');
    if (slash < 0) continue;
    const prefix = id.slice(0, slash);
    const brand = BRAND_LABELS[prefix];
    if (brand === undefined) continue;

    if (!isTextOnlyModel(model)) continue;
    if (isSupersededVariant(id, listed)) continue;

    const inputPer1M = toPer1M(model.pricing?.prompt);
    const outputPer1M = toPer1M(model.pricing?.completion);
    if (inputPer1M === null || inputPer1M <= 0) continue;
    if (outputPer1M === null || outputPer1M <= 0) continue;

    const cachedRaw = model.pricing?.input_cache_read;
    const cachedPer1M =
      cachedRaw === undefined || cachedRaw === null ? null : toPer1M(cachedRaw);

    const created = typeof model.created === 'number' && Number.isFinite(model.created)
      ? model.created
      : 0;

    out.push({
      brand,
      id,
      displayName: id.slice(slash + 1),
      inputPer1M,
      cachedInputPer1M: cachedPer1M !== null && cachedPer1M > 0 ? cachedPer1M : null,
      outputPer1M,
      created,
    });
  }
  return out;
}

function stripCreated(candidate: Candidate): PriceRow {
  const { created: _created, ...row } = candidate;
  return row;
}

/**
 * Reduce a raw catalogue to the table the page renders.
 *
 * Rows come back grouped: brands ordered by their cheapest row (so the
 * table still reads cheapest-first top to bottom), and within a brand
 * cheapest first. `groupByBrand` chunks the result without re-sorting.
 */
export function selectRows(models: RawModel[]): PriceRow[] {
  const candidates = toCandidates(models);

  const groups: { brand: string; rows: Candidate[] }[] = [];
  for (const brand of Object.values(BRAND_LABELS)) {
    const pool = candidates.filter((c) => c.brand === brand);
    if (pool.length === 0) continue;

    const newest = Math.max(...pool.map((c) => c.created));
    const flagshipPool = pool.filter(
      (c) => c.created >= newest - FLAGSHIP_WINDOW_DAYS * DAY_SECONDS,
    );
    const cheapPool = pool.filter(
      (c) => c.created >= newest - CHEAP_WINDOW_DAYS * DAY_SECONDS,
    );

    const flagship = [...flagshipPool].sort(
      (a, b) => b.inputPer1M - a.inputPer1M || b.created - a.created || a.id.localeCompare(b.id),
    )[0];
    const cheap = [...cheapPool].sort(
      (a, b) => a.inputPer1M - b.inputPer1M || b.created - a.created || a.id.localeCompare(b.id),
    )[0];

    /* A brand with one surviving model, or one whose cheapest and
       priciest current model are the same, contributes a single row. */
    const rows = flagship.id === cheap.id ? [cheap] : [cheap, flagship];
    groups.push({ brand, rows });
  }

  groups.sort(
    (a, b) => a.rows[0].inputPer1M - b.rows[0].inputPer1M || a.brand.localeCompare(b.brand),
  );

  return groups.flatMap((g) => g.rows.map(stripCreated));
}

/** Chunk pre-ordered rows into contiguous per-brand groups. */
export function groupByBrand(rows: PriceRow[]): { brand: string; rows: PriceRow[] }[] {
  const groups: { brand: string; rows: PriceRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.brand === row.brand) last.rows.push(row);
    else groups.push({ brand: row.brand, rows: [row] });
  }
  return groups;
}

/**
 * Reject a table that cannot be true. An empty result means every rule
 * matched everything, and a price outside the sanity band means the
 * upstream unit changed under us. Both are parse failures, and both
 * should send the caller to the committed snapshot rather than publish
 * a wrong number.
 */
export function isPlausibleTable(rows: PriceRow[]): boolean {
  if (rows.length === 0) return false;
  return rows.every((row) => {
    const values = [row.inputPer1M, row.outputPer1M];
    if (row.cachedInputPer1M !== null) values.push(row.cachedInputPer1M);
    return values.every(
      (v) => Number.isFinite(v) && v >= PRICE_SANITY_MIN && v <= PRICE_SANITY_MAX,
    );
  });
}
