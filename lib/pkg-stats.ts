const PYPI_URL = 'https://pypistats.org/api/packages/bernstein/recent';
const GITHUB_URL = 'https://api.github.com/repos/sipyourdrink-ltd/bernstein';
const GITHUB_PR_SEARCH =
  'https://api.github.com/search/issues?q=repo%3Asipyourdrink-ltd%2Fbernstein+is%3Apr+is%3Aclosed';
const GITHUB_CONTRIBUTORS =
  'https://api.github.com/repos/sipyourdrink-ltd/bernstein/contributors?per_page=1&anon=false';
const UA = 'bernstein-landing/1.0 (+https://bernstein.run)';
const REVALIDATE_SECONDS = 3600;
/* Hard upstream timeout per fetch. Mirrors the per-request
   AbortController pattern from `app/api/stats/route.ts` (4320057):
   a slow pypi/github call must not pin the home-page render handler
   open until the edge times out (504). One controller per fetch so an
   abort on one does not cancel the others. The four upstreams normally
   respond in <500ms; 2s is a tight ceiling that still lets the slowest
   transient (e.g. cold-cache pypi) succeed. On timeout each `out`
   field stays at its null sentinel and the page falls back to em-dash
   placeholders, same as any other failure path. */
const UPSTREAM_TIMEOUT_MS = 2000;

export interface PackageStats {
  monthly_downloads: number | null;
  stars: number | null;
  /* Total closed PRs (merged + closed-without-merge). The previous
     "closed PRs / mo" hardcoded number was a placeholder taken from
     stars by accident; this is the live total via the search API. */
  closed_prs: number | null;
  contributors: number | null;
}

// Server-side fetch with Next.js request-level dedupe: calling this from
// several components in the same render triggers a single upstream request
// per URL thanks to the shared { next: { revalidate } } cache key.
export async function fetchPackageStats(): Promise<PackageStats> {
  const out: PackageStats = {
    monthly_downloads: null,
    stars: null,
    closed_prs: null,
    contributors: null,
  };

  /* Authorise the three GitHub calls when GITHUB_TOKEN (or GH_TOKEN) is set.
     The 60/h-per-IP unauth ceiling is shared across the four fetches below
     plus /api/stats and the sponsors page - under any real load the SSR
     path is the first thing to start returning null and the homepage falls
     back to em-dash placeholders. A read-only PAT lifts the ceiling to
     5000/h and removes that failure mode. Mirrors app/api/stats/route.ts
     so an operator only needs to set one env var. */
  const ghToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const ghHeaders: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/vnd.github.v3+json',
  };
  if (ghToken) ghHeaders.Authorization = `Bearer ${ghToken}`;

  /* Per-request AbortController so a stuck upstream cannot pin the
     render handler open. One controller per fetch - sharing would
     cancel all four when any timer fires. Timer cleared in `finally`
     so a fast response does not leak a pending Timeout. */
  const fetchWithTimeout = async (url: string, init: RequestInit) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: ac.signal });
    } finally {
      clearTimeout(t);
    }
  };

  const [pypiRes, ghRes, prRes, contribRes] = await Promise.allSettled([
    fetchWithTimeout(PYPI_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    }),
    fetchWithTimeout(GITHUB_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: ghHeaders,
    }),
    fetchWithTimeout(GITHUB_PR_SEARCH, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: ghHeaders,
    }),
    fetchWithTimeout(GITHUB_CONTRIBUTORS, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: ghHeaders,
    }),
  ]);

  if (pypiRes.status === 'fulfilled' && pypiRes.value.ok) {
    try {
      const data = await pypiRes.value.json();
      if (typeof data?.data?.last_month === 'number' && data.data.last_month > 0) {
        out.monthly_downloads = data.data.last_month;
      }
    } catch {
      /* em-dash fallback */
    }
  }

  if (ghRes.status === 'fulfilled' && ghRes.value.ok) {
    try {
      const data = await ghRes.value.json();
      if (typeof data?.stargazers_count === 'number' && data.stargazers_count > 0) {
        out.stars = data.stargazers_count;
      }
    } catch {
      /* em-dash fallback */
    }
  }

  if (prRes.status === 'fulfilled' && prRes.value.ok) {
    try {
      const data = await prRes.value.json();
      if (typeof data?.total_count === 'number' && data.total_count > 0) {
        out.closed_prs = data.total_count;
      }
    } catch {
      /* swallow */
    }
  }

  /* Contributors: the per_page=1 trick uses the Link rel=last header to
     return total count without paging through everyone. Falls back to
     length of the returned array when Link is absent (small repos). */
  if (contribRes.status === 'fulfilled' && contribRes.value.ok) {
    try {
      const link = contribRes.value.headers.get('link');
      if (link) {
        const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
        if (m) {
          const n = Number.parseInt(m[1], 10);
          if (Number.isFinite(n) && n > 0) out.contributors = n;
        }
      }
      if (out.contributors === null) {
        const data = await contribRes.value.json();
        if (Array.isArray(data) && data.length > 0) out.contributors = data.length;
      }
    } catch {
      /* swallow */
    }
  }

  return out;
}
