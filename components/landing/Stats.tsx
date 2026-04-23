import { StatsClient } from './StatsClient';

const PYPI_URL = 'https://pypistats.org/api/packages/bernstein/recent';
const GITHUB_URL = 'https://api.github.com/repos/chernistry/bernstein';
const UA = 'bernstein-landing/1.0 (+https://bernstein.run)';
const REVALIDATE_SECONDS = 3600;

interface InitialStats {
  monthly_downloads: number | null;
  stars: number | null;
}

async function fetchInitialStats(): Promise<InitialStats> {
  // Fetches PyPI + GitHub on the server at request time so the first paint
  // carries real values (or nulls when upstream is unavailable). Mirrors the
  // logic in app/api/stats/route.ts, but runs inline to avoid a client-side
  // race that would expose animated-from-zero numbers before hydration.
  const out: InitialStats = { monthly_downloads: null, stars: null };

  const [pypiRes, ghRes] = await Promise.allSettled([
    fetch(PYPI_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    }),
    fetch(GITHUB_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { 'User-Agent': UA, Accept: 'application/vnd.github.v3+json' },
    }),
  ]);

  if (pypiRes.status === 'fulfilled' && pypiRes.value.ok) {
    try {
      const data = await pypiRes.value.json();
      if (typeof data?.data?.last_month === 'number' && data.data.last_month > 0) {
        out.monthly_downloads = data.data.last_month;
      }
    } catch {
      /* ignore parse errors — render em-dash fallback */
    }
  }

  if (ghRes.status === 'fulfilled' && ghRes.value.ok) {
    try {
      const data = await ghRes.value.json();
      if (typeof data?.stargazers_count === 'number' && data.stargazers_count > 0) {
        out.stars = data.stargazers_count;
      }
    } catch {
      /* ignore parse errors — render em-dash fallback */
    }
  }

  return out;
}

export async function Stats() {
  let initial: InitialStats = { monthly_downloads: null, stars: null };
  try {
    initial = await fetchInitialStats();
  } catch {
    // Upstream entirely unreachable during SSR — fall through to client fetch.
  }

  return <StatsClient initialStars={initial.stars} initialDownloads={initial.monthly_downloads} />;
}
