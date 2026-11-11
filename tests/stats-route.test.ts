import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Use the web Response implementation for NextResponse.json in route tests.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') {
      return {
        url: 'data:text/javascript,export const NextResponse = Response;',
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

let moduleId = 0;
async function freshRoute() {
  return import(`../app/api/stats/route.ts?test=${moduleId++}`) as Promise<{
    GET: (request: Request) => Promise<Response>;
  }>;
}

const request = (query = '') => new Request(`https://bernstein.run/api/stats${query}`);
const githubUrl = 'https://api.github.com/repos/sipyourdrink-ltd/bernstein';
const normalCache = 'public, s-maxage=1800, stale-while-revalidate=3600';
const fallbackCache = 'public, s-maxage=60, stale-while-revalidate=300';

test('fresh stars are cached until expiry and force bypasses both caches', async (t) => {
  let now = 1_000_000;
  let starCount = 42;
  t.mock.method(Date, 'now', () => now);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ stargazers_count: ++starCount }),
  );
  const { GET } = await freshRoute();
  const response = await GET(request());
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['fetched_at', 'stars']);
  assert.equal(body.stars, 43);
  assert.ok(Number.isFinite(Date.parse(body.fetched_at)));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), normalCache);
  const [url, init] = fetchMock.mock.calls[0].arguments as unknown as [string, RequestInit & { next: { revalidate: number } }];
  assert.equal(url, githubUrl);
  assert.equal(init.next.revalidate, 1800);
  assert.ok(init.signal instanceof AbortSignal);

  now += 1_799_000;
  const cached = await GET(request());
  assert.deepEqual(await cached.json(), body);
  assert.equal(cached.headers.get('cache-control'), normalCache);
  assert.equal(fetchMock.mock.callCount(), 1);

  now += 1000;
  assert.equal((await (await GET(request())).json()).stars, 44);
  assert.equal(fetchMock.mock.callCount(), 2);

  assert.equal((await (await GET(request('?force=1'))).json()).stars, 45);
  const forcedInit = fetchMock.mock.calls[2].arguments[1] as RequestInit;
  assert.equal(forcedInit.cache, 'no-store');
  assert.equal('next' in forcedInit, false);
});

test('an expired cache serves last-known-good stars on failure and then recovers', async (t) => {
  let now = 1_000_000;
  let failing = false;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () =>
    failing ? new Response(null, { status: 503 }) : Response.json({ stargazers_count: 82 }),
  );
  const { GET } = await freshRoute();
  const original = await (await GET(request())).json();
  now += 1_800_000;
  failing = true;
  const fallback = await GET(request());
  assert.deepEqual(await fallback.json(), original);
  assert.equal(fallback.status, 200);
  assert.equal(fallback.headers.get('cache-control'), fallbackCache);
  assert.equal(fallback.headers.get('x-cache-source'), 'stale-fallback');

  failing = false;
  const recovered = await GET(request('?force=1'));
  assert.equal((await recovered.json()).stars, 82);
  assert.equal(recovered.headers.get('cache-control'), normalCache);
  assert.equal(recovered.headers.get('x-cache-source'), null);
});

for (const failure of ['http', 'network', 'json', 'zero', 'negative', 'missing'] as const) {
  test(`cold-cache ${failure} failure returns the fallback sentinel`, async (t) => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'warn', () => {});
    t.mock.method(globalThis, 'fetch', async () => {
      if (failure === 'network') throw new Error('offline');
      if (failure === 'http') return new Response(null, { status: 429 });
      if (failure === 'json') return new Response('invalid JSON');
      return Response.json({ stargazers_count: failure === 'zero' ? 0 : failure === 'negative' ? -1 : undefined });
    });
    const { GET } = await freshRoute();
    const response = await GET(request());
    assert.deepEqual(await response.json(), {
      stars: 0,
      fetched_at: new Date(0).toISOString(),
      fallback: true,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), fallbackCache);
    assert.equal(response.headers.get('x-cache-source'), 'stale-fallback');
  });
}

test.after(() => hooks.deregister());
