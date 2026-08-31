/**
 * Tests for the IndexNow integration.
 *
 *   1. The static ownership-proof file `public/<key>.txt` exists, its
 *      name and body equal the configured key, and the key is a
 *      valid lowercase-hex IndexNow key. (The file is served statically
 *      by Next as text/plain by extension; the protocol contract is that
 *      its body is exactly the key.)
 *   2. `submitUrls` builds the canonical `{host,key,keyLocation,urlList}`
 *      payload, posts to every endpoint, and swallows non-200 and
 *      network errors without throwing.
 *   3. `extractSitemapLocs` pulls `<loc>` URLs from sitemap XML.
 *   4. The POST /api/indexnow route is bearer-gated, submits the
 *      sitemap URL set, and surfaces a sitemap-read failure as 502.
 *
 * Network is fully stubbed via `globalThis.fetch`; no real upstream call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  INDEXNOW_HOST,
  indexNowKey,
  indexNowKeyLocation,
  buildIndexNowPayload,
  extractSitemapLocs,
  submitUrls,
} from '../lib/seo/indexnow.ts';
import { POST as indexnowPost, GET as indexnowGet } from '../app/api/indexnow/route.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(
  responder: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): { restore: () => void; calls: FetchCall[] } {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, fetchInit?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init: fetchInit });
    return await responder(url, fetchInit);
  }) as typeof globalThis.fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
    calls,
  };
}

type EnvSnap = {
  INDEXNOW_TRIGGER_TOKEN?: string;
  BERNSTEIN_PUBLIC_ORIGIN?: string;
  NODE_ENV?: string;
};
function snap(): EnvSnap {
  return {
    INDEXNOW_TRIGGER_TOKEN: process.env.INDEXNOW_TRIGGER_TOKEN,
    BERNSTEIN_PUBLIC_ORIGIN: process.env.BERNSTEIN_PUBLIC_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
  };
}
/* Next's type augmentation marks several `process.env.*` keys (notably
   NODE_ENV) read-only. Tests need to flip them, so we write through a
   plain mutable-record view of the same object. */
const mutableEnv = process.env as unknown as Record<string, string | undefined>;

function restore(s: EnvSnap) {
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined) delete mutableEnv[k];
    else mutableEnv[k] = v;
  }
}

function setEnvVar(key: keyof EnvSnap, value: string): void {
  mutableEnv[key] = value;
}

function bearerRequest(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/indexnow', { method: 'POST', headers });
}

const SAMPLE_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://bernstein.run/</loc><lastmod>2026-05-22</lastmod></url>
  <url><loc>https://bernstein.run/blog/some-post</loc></url>
  <url><loc>https://bernstein.run/q/what-is-bernstein</loc></url>
</urlset>`;

// ---------------------------------------------------------------------------
// 1. Key file / ownership proof
// ---------------------------------------------------------------------------

/* The key and its ownership-proof file are supplied by whoever runs the
   host: whoever holds the key can submit URL-change notices for this
   domain, so neither is committed. With no key configured these assert
   the safe default; with one configured they assert the invariant that
   actually matters - the file the engine fetches has to be named for the
   key and contain it. */
const KEY_CONFIGURED = indexNowKey() !== '';

/* The wire-shape and transport tests below assert how a submission is
   built and sent, which is deployment-independent. They pass this key
   explicitly so they exercise the same path whether or not the checkout
   running them has one configured. */
const FIXTURE_KEY = 'ffffffffffffffffffffffffffffffff';
const FIXTURE_KEY_LOCATION = `https://${INDEXNOW_HOST}/${FIXTURE_KEY}.txt`;

test('with no key configured, nothing is submitted and nothing is claimed', () => {
  if (KEY_CONFIGURED) return;
  assert.equal(indexNowKey(), '');
  assert.equal(buildIndexNowPayload(['https://bernstein.run/']).key, '');
});

test('a configured INDEXNOW_KEY is lowercase hex within the spec range', () => {
  if (!KEY_CONFIGURED) return;
  assert.match(indexNowKey(), /^[a-f0-9]{8,128}$/);
});

test('a configured key has a matching ownership-proof file on this host', () => {
  if (!KEY_CONFIGURED) return;
  const keyFilePath = join(REPO_ROOT, 'public', `${indexNowKey()}.txt`);
  const body = readFileSync(keyFilePath, 'utf8').trim();
  /* The IndexNow spec requires https://<host>/<key>.txt to return the
     key as plain text; the engine compares the file body to the `key`
     field in the POST. Body must be exactly the key. */
  assert.equal(body, indexNowKey());
});

test('the key location points at the static proof file on this host', () => {
  assert.equal(indexNowKeyLocation(), `https://${INDEXNOW_HOST}/${indexNowKey()}.txt`);
});

// ---------------------------------------------------------------------------
// 2. submitUrls payload + failure handling
// ---------------------------------------------------------------------------

test('buildIndexNowPayload produces the canonical wire shape', () => {
  const payload = buildIndexNowPayload(['https://bernstein.run/a', 'https://bernstein.run/b'], FIXTURE_KEY);
  assert.deepEqual(payload, {
    host: INDEXNOW_HOST,
    key: FIXTURE_KEY,
    keyLocation: FIXTURE_KEY_LOCATION,
    urlList: ['https://bernstein.run/a', 'https://bernstein.run/b'],
  });
});

test('submitUrls POSTs the correct payload to a single endpoint', async () => {
  const f = stubFetch(() => new Response(null, { status: 200 }));
  try {
    const results = await submitUrls(['https://bernstein.run/blog/x'], { key: FIXTURE_KEY, endpoints: ['https://api.indexnow.org/indexnow'],
    });
    assert.equal(f.calls.length, 1);
    const call = f.calls[0];
    assert.equal(call.url, 'https://api.indexnow.org/indexnow');
    assert.equal(call.init?.method, 'POST');
    const headers = (call.init?.headers ?? {}) as Record<string, string>;
    assert.match(headers['Content-Type'], /application\/json/);
    const body = JSON.parse(call.init?.body as string);
    assert.equal(body.host, 'bernstein.run');
    assert.equal(body.key, FIXTURE_KEY);
    assert.equal(body.keyLocation, FIXTURE_KEY_LOCATION);
    assert.deepEqual(body.urlList, ['https://bernstein.run/blog/x']);
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, true);
    assert.equal(results[0].status, 200);
  } finally {
    f.restore();
  }
});

test('submitUrls treats 202 as accepted', async () => {
  const f = stubFetch(() => new Response(null, { status: 202 }));
  try {
    const results = await submitUrls(['https://bernstein.run/a'], { key: FIXTURE_KEY, endpoints: ['https://api.indexnow.org/indexnow'],
    });
    assert.equal(results[0].ok, true);
    assert.equal(results[0].status, 202);
  } finally {
    f.restore();
  }
});

test('submitUrls posts to every configured endpoint', async () => {
  const f = stubFetch(() => new Response(null, { status: 200 }));
  try {
    const results = await submitUrls(['https://bernstein.run/a'], { key: FIXTURE_KEY });
    /* Default endpoints: relay + Bing. */
    assert.equal(f.calls.length, 2);
    assert.equal(results.length, 2);
    assert.ok(f.calls.some((c) => c.url === 'https://api.indexnow.org/indexnow'));
    assert.ok(f.calls.some((c) => c.url === 'https://www.bing.com/indexnow'));
  } finally {
    f.restore();
  }
});

test('submitUrls swallows a non-200 response without throwing', async () => {
  const origWarn = console.warn;
  console.warn = () => {};
  const f = stubFetch(() => new Response('bad request', { status: 422 }));
  try {
    const results = await submitUrls(['https://bernstein.run/a'], { key: FIXTURE_KEY, endpoints: ['https://api.indexnow.org/indexnow'],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, false);
    assert.equal(results[0].status, 422);
  } finally {
    console.warn = origWarn;
    f.restore();
  }
});

test('submitUrls swallows a network error without throwing', async () => {
  const origWarn = console.warn;
  console.warn = () => {};
  const f = stubFetch(() => {
    throw new Error('connection refused');
  });
  try {
    const results = await submitUrls(['https://bernstein.run/a'], { key: FIXTURE_KEY, endpoints: ['https://api.indexnow.org/indexnow'],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, false);
    assert.equal(results[0].status, 0);
    assert.match(results[0].error ?? '', /connection refused/);
  } finally {
    console.warn = origWarn;
    f.restore();
  }
});

test('submitUrls drops off-host URLs (same-origin rule) and skips empty batches', async () => {
  const f = stubFetch(() => new Response(null, { status: 200 }));
  try {
    /* Only the bernstein.run URL survives the host filter. */
    const results = await submitUrls(
      ['https://evil.example.com/x', 'https://bernstein.run/keep', 'not-a-url'],
      { key: FIXTURE_KEY, endpoints: ['https://api.indexnow.org/indexnow'] },
    );
    const body = JSON.parse(f.calls[0].init?.body as string);
    assert.deepEqual(body.urlList, ['https://bernstein.run/keep']);
    assert.equal(results.length, 1);

    /* A batch with no on-host URLs is a no-op: no fetch, empty result. */
    f.calls.length = 0;
    const none = await submitUrls(['https://evil.example.com/x'], { key: FIXTURE_KEY, endpoints: ['https://api.indexnow.org/indexnow'],
    });
    assert.equal(f.calls.length, 0);
    assert.deepEqual(none, []);
  } finally {
    f.restore();
  }
});

// ---------------------------------------------------------------------------
// 3. extractSitemapLocs
// ---------------------------------------------------------------------------

test('extractSitemapLocs pulls every <loc> from sitemap XML', () => {
  const locs = extractSitemapLocs(SAMPLE_SITEMAP);
  assert.deepEqual(locs, [
    'https://bernstein.run/',
    'https://bernstein.run/blog/some-post',
    'https://bernstein.run/q/what-is-bernstein',
  ]);
});

// ---------------------------------------------------------------------------
// 4. POST /api/indexnow route
// ---------------------------------------------------------------------------

test('route GET returns 405 (POST-only)', async () => {
  const res = await indexnowGet();
  assert.equal(res.status, 405);
});

test('route rejects a missing bearer token with 401', async () => {
  const env = snap();
  process.env.INDEXNOW_TRIGGER_TOKEN = 'sekret-token';
  try {
    const res = await indexnowPost(bearerRequest());
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  } finally {
    restore(env);
  }
});

test('route rejects a wrong bearer token with 401', async () => {
  const env = snap();
  process.env.INDEXNOW_TRIGGER_TOKEN = 'sekret-token';
  try {
    const res = await indexnowPost(bearerRequest('wrong'));
    assert.equal(res.status, 401);
  } finally {
    restore(env);
  }
});

test('route returns 503 NOT_CONFIGURED in production when token unset', async () => {
  const env = snap();
  delete process.env.INDEXNOW_TRIGGER_TOKEN;
  setEnvVar('NODE_ENV', 'production');
  try {
    const res = await indexnowPost(bearerRequest());
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error.code, 'NOT_CONFIGURED');
  } finally {
    restore(env);
  }
});

test('route with a valid token submits the sitemap URL set', async () => {
  const env = snap();
  process.env.INDEXNOW_TRIGGER_TOKEN = 'sekret-token';
  process.env.INDEXNOW_KEY = FIXTURE_KEY;
  process.env.BERNSTEIN_PUBLIC_ORIGIN = 'https://bernstein.run';
  const f = stubFetch((url) => {
    if (url.endsWith('/sitemap.xml')) {
      return new Response(SAMPLE_SITEMAP, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    }
    /* IndexNow endpoints */
    return new Response(null, { status: 200 });
  });
  try {
    const res = await indexnowPost(bearerRequest('sekret-token'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.submitted, 3);

    /* The sitemap was fetched once, then the 3 URLs were POSTed to both
       default IndexNow endpoints. */
    const sitemapCalls = f.calls.filter((c) => c.url.endsWith('/sitemap.xml'));
    assert.equal(sitemapCalls.length, 1);
    const submitCalls = f.calls.filter((c) => c.url.includes('indexnow'));
    assert.equal(submitCalls.length, 2);
    const sent = JSON.parse(submitCalls[0].init?.body as string);
    assert.deepEqual(sent.urlList, [
      'https://bernstein.run/',
      'https://bernstein.run/blog/some-post',
      'https://bernstein.run/q/what-is-bernstein',
    ]);
    assert.equal(sent.key, FIXTURE_KEY);
  } finally {
    f.restore();
    restore(env);
  }
});

test('route surfaces a sitemap-read failure as 502', async () => {
  const env = snap();
  process.env.INDEXNOW_TRIGGER_TOKEN = 'sekret-token';
  const origErr = console.error;
  console.error = () => {};
  const f = stubFetch((url) => {
    if (url.endsWith('/sitemap.xml')) return new Response('boom', { status: 500 });
    return new Response(null, { status: 200 });
  });
  try {
    const res = await indexnowPost(bearerRequest('sekret-token'));
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error.code, 'UPSTREAM_FAILED');
    /* No IndexNow submission should have happened. */
    assert.equal(f.calls.filter((c) => c.url.includes('indexnow')).length, 0);
  } finally {
    console.error = origErr;
    f.restore();
    restore(env);
  }
});
