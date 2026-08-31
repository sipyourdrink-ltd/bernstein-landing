/**
 * Live model prices for /cost.
 *
 * Reads the public OpenRouter model catalogue, applies the curation
 * rules in `./select.ts`, and hands the page a table plus the timestamp
 * it was read at. The endpoint needs no credentials, so nothing here
 * reads an API key and nothing needs to be added to the environment.
 *
 * Every failure path returns the committed snapshot in
 * `data/model-prices.json` with `source: 'snapshot'`. Network error,
 * timeout, non-2xx, malformed JSON, a payload that survives parsing but
 * fails the sanity band: all of them land on the snapshot, and none of
 * them throw into the render. The page reads `source` and says which
 * one it is showing, so a stale table is never presented as fresh.
 *
 * The snapshot is refreshed by `scripts/fetch-model-prices.mjs`, which
 * runs the same `select.ts` rules against the same endpoint. It is a
 * standalone npm script rather than a build step: the build image runs
 * node 20, which cannot load the TypeScript rules directly, and a
 * committed snapshot only needs refreshing when the page is stale
 * enough to matter.
 */

import {
  type PriceRow,
  type PriceTable,
  isPlausibleTable,
  selectRows,
} from './select.ts';
import snapshotData from '../../data/model-prices.json' with { type: 'json' };

export const MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** Matches the page's `revalidate`, so the data cache and the rendered
 *  page expire together instead of drifting half a cycle apart. */
export const REVALIDATE_SECONDS = 21_600;

/**
 * Upstream ceiling. The catalogue is ~700KB, so this is wider than the
 * 2s used for the small raw.githubusercontent reads elsewhere, but it
 * still has to be bounded: an ISR regeneration that hangs holds a render
 * slot open until the platform kills it.
 */
const UPSTREAM_TIMEOUT_MS = 8000;

const UA = 'bernstein-landing/1.0 (+https://bernstein.run)';

interface SnapshotFile {
  fetchedAt: string;
  rows: PriceRow[];
}

const snapshot = snapshotData as SnapshotFile;

/** The committed table, tagged as such. */
export function snapshotTable(): PriceTable {
  return {
    rows: snapshot.rows,
    fetchedAt: snapshot.fetchedAt,
    source: 'snapshot',
  };
}

/**
 * Fetch and curate the live price table, or fall back to the snapshot.
 * Never throws.
 */
export async function fetchModelPrices(): Promise<PriceTable> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(MODELS_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return snapshotTable();

    const payload: unknown = await res.json();
    const data =
      payload !== null && typeof payload === 'object' && 'data' in payload
        ? (payload as { data: unknown }).data
        : null;
    if (!Array.isArray(data) || data.length === 0) return snapshotTable();

    const rows = selectRows(data);
    if (!isPlausibleTable(rows)) return snapshotTable();

    return { rows, fetchedAt: new Date().toISOString(), source: 'live' };
  } catch {
    /* Abort, DNS, TLS, connection reset, malformed JSON body. */
    return snapshotTable();
  } finally {
    clearTimeout(timer);
  }
}
