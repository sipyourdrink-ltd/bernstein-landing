/**
 * Refresh `data/model-prices.json`, the committed snapshot behind the
 * /cost price table.
 *
 * The page normally renders live data: `lib/model-prices/fetch.ts` reads
 * the same endpoint on an ISR cycle. The snapshot is what the page falls
 * back to when that read fails, and what a build with no network
 * produces. Re-running this script is how the fallback stops being
 * older than the thing it is standing in for.
 *
 * Both paths import `lib/model-prices/select.ts`, so the snapshot and a
 * live read pick the same rows from the same catalogue.
 *
 * Not wired into `prebuild`. The build image is node 20, which will not
 * load the TypeScript rules this imports, and a snapshot that is only a
 * fallback does not need to be regenerated on every deploy. Run it by
 * hand, or via `npm run build:prices`, when the committed date is old:
 *
 *     npm run build:prices
 *
 * Exits non-zero and leaves the existing file untouched if the endpoint
 * is unreachable or returns something the rules reject, so a bad run can
 * never replace a good snapshot with an empty one.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectRows, isPlausibleTable } from '../lib/model-prices/select.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_FILE = path.join(repoRoot, 'data', 'model-prices.json');

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const TIMEOUT_MS = 20_000;
const UA = 'bernstein-landing/1.0 (+https://bernstein.run)';

function fail(message) {
  process.stderr.write(`fetch-model-prices: ${message}\n`);
  process.exit(1);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

let payload;
try {
  const res = await fetch(MODELS_URL, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: controller.signal,
  });
  if (!res.ok) fail(`upstream returned ${res.status}`);
  payload = await res.json();
} catch (err) {
  fail(`upstream unreachable: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  clearTimeout(timer);
}

if (!payload || !Array.isArray(payload.data) || payload.data.length === 0) {
  fail('payload has no `data` array');
}

const rows = selectRows(payload.data);
if (!isPlausibleTable(rows)) {
  fail(`rules produced ${rows.length} row(s) or a price outside the sanity band`);
}

const out = { fetchedAt: new Date().toISOString(), rows };
await writeFile(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

process.stdout.write(
  `fetch-model-prices: wrote ${rows.length} rows from ${payload.data.length} models\n`,
);
for (const row of rows) {
  process.stdout.write(
    `  ${row.brand.padEnd(10)} ${row.displayName.padEnd(26)} `
      + `in=${row.inputPer1M} cached=${row.cachedInputPer1M ?? 'n/a'} out=${row.outputPer1M}\n`,
  );
}
