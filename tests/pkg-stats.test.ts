import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchPackageStats } from '../lib/pkg-stats.ts';

test('package stats fetches the three GitHub sources and returns their counts', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/search/issues')) return Response.json({ total_count: 120 });
    if (url.includes('/contributors')) {
      return Response.json([{ login: 'contributor' }], {
        headers: { link: '<https://api.github.com/repos/sipyourdrink-ltd/bernstein/contributors?per_page=1&page=9>; rel="last"' },
      });
    }
    return Response.json({ stargazers_count: 42 });
  });
  assert.deepEqual(await fetchPackageStats(), { stars: 42, closed_prs: 120, contributors: 9 });
  assert.equal(fetchMock.mock.callCount(), 3);
  for (const { arguments: args } of fetchMock.mock.calls) {
    assert.equal(new URL(String(args[0])).hostname, 'api.github.com');
    const init = args[1] as RequestInit & { next: { revalidate: number } };
    assert.equal(init.next.revalidate, 3600);
    assert.ok(init.signal instanceof AbortSignal);
  }
});

test('a failed star request preserves independent PR and contributor results', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/search/issues')) return Response.json({ total_count: 120 });
    if (url.includes('/contributors')) return Response.json([{ login: 'one' }, { login: 'two' }]);
    throw new Error('offline');
  });
  assert.deepEqual(await fetchPackageStats(), { stars: null, closed_prs: 120, contributors: 2 });
});

test('non-positive stars and failed other sources return null sentinels', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input).endsWith('/bernstein')) return Response.json({ stargazers_count: 0 });
    return new Response(null, { status: 503 });
  });
  assert.deepEqual(await fetchPackageStats(), { stars: null, closed_prs: null, contributors: null });
});
