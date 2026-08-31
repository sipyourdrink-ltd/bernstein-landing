/**
 * Tests for the IndexNow integration.
 *
 *   1. The static ownership-proof file `public/<key>.txt` exists, its
 *      name and body equal the `INDEXNOW_KEY` constant, and the key is a
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
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
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

test('INDEXNOW_KEY is a valid lowercase-hex IndexNow key (8-128 hex chars)', () => {
  assert.match(INDEXNOW_KEY, /^[a-f0-9]{8,128}$/);
  /* The brief asks for a 32-char key; assert that explicitly too. */
  assert.equal(INDEXNOW_KEY.length, 32);
});

test('public/<key>.txt exists and its body equals INDEXNOW_KEY exactly', () => {
  const keyFilePath = join(REPO_ROOT, 'public', `${INDEXNOW_KEY}.txt`);
  const body = readFileSync(keyFilePath, 'utf8').trim();
  /* The IndexNow spec requires https://<host>/<key>.txt to return the
     key as plain text; the engine compares the file body to the `key`
     field in the POST. Body must be exactly the key. */
  assert.equal(body, INDEXNOW_KEY);
});

test('INDEXNOW_KEY_LOCATION points at the static key file on the host', () => {
  assert.equal(INDEXNOW_KEY_LOCATION, `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`);
});

// ---------------------------------------------------------------------------
// 2. submitUrls payload + failure handling
// ---------------------------------------------------------------------------

test('buildIndexNowPayload produces the canonical wire shape', () => {
  const payload = buildIndexNowPayload(['https://bernstein.run/a', 'https://bernstein.run/b']);
  assert.deepEqual(payload, {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList: ['https://bernstein.run/a', 'https://bernstein.run/b'],
  });
});

test('submitUrls POSTs the correct payload to a single endpoint', async () => {
  const f = stubFetch(() => new Response(null, { status: 200 }));
  try {
    const results = await submitUrls(['https://bernstein.run/blog/x'], {
      endpoints: ['https://api.indexnow.org/indexnow'],
    });
    assert.equal(f.calls.length, 1);
    const call = f.calls[0];
    assert.equal(call.url, 'https://api.indexnow.org/indexnow');
    assert.equal(call.init?.method, 'POST');
    const headers = (call.init?.headers ?? {}) as Record<string, string>;
    assert.match(headers['Content-Type'], /application\/json/);
    const body = JSON.parse(call.init?.body as string);
    assert.equal(body.host, 'bernstein.run');
    assert.equal(body.key, INDEXNOW_KEY);
    assert.equal(body.keyLocation, INDEXNOW_KEY_LOCATION);
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
    const results = await submitUrls(['https://bernstein.run/a'], {
      endpoints: ['https://api.indexnow.org/indexnow'],
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
    const results = await submitUrls(['https://bernstein.run/a']);
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
    const results = await submitUrls(['https://bernstein.run/a'], {
      endpoints: ['https://api.indexnow.org/indexnow'],
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
    const results = await submitUrls(['https://bernstein.run/a'], {
      endpoints: ['https://api.indexnow.org/indexnow'],
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
      { endpoints: ['https://api.indexnow.org/indexnow'] },
    );
    const body = JSON.parse(f.calls[0].init?.body as string);
    assert.deepEqual(body.urlList, ['https://bernstein.run/keep']);
    assert.equal(results.length, 1);

    /* A batch with no on-host URLs is a no-op: no fetch, empty result. */
    f.calls.length = 0;
    const none = await submitUrls(['https://evil.example.com/x'], {
      endpoints: ['https://api.indexnow.org/indexnow'],
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
    assert.equal(sent.key, INDEXNOW_KEY);
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
