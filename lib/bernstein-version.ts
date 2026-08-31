/* Fetch the latest Bernstein release tag from GitHub Releases.
   Used by app/blog/page.tsx to replace the previously hardcoded
   "v1.9" version chip in the blog index eyebrow. Returns null on
   any fetch / parse / network error so callers can hide the chip
   instead of rendering a stale value. Mirrors the GH auth pattern
   from lib/pkg-stats.ts so an operator only needs GITHUB_TOKEN
   (or GH_TOKEN) set in one place. */

const RELEASES_URL =
  'https://api.github.com/repos/sipyourdrink-ltd/bernstein/releases/latest';
const UA = 'bernstein-landing/1.0 (+https://bernstein.run)';
const REVALIDATE_SECONDS = 3600;

interface GithubRelease {
  tag_name?: string;
  name?: string;
}

/* Returns the latest release tag (e.g. "v2.0.1") or null if the
   GitHub API call fails, is rate-limited, or returns malformed
   JSON. Cached at the Next.js fetch layer for one hour to keep
   us well under the 60/h-per-IP unauthenticated ceiling. */
export async function fetchLatestBernsteinVersion(): Promise<string | null> {
  const ghToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/vnd.github.v3+json',
  };
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;

  try {
    const res = await fetch(RELEASES_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GithubRelease;
    const tag = typeof data.tag_name === 'string' ? data.tag_name.trim() : '';
    if (!tag) return null;
    return tag;
  } catch {
    return null;
  }
}
