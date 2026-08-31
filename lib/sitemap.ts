/**
 * Pure helpers for `app/sitemap.xml/route.ts`.
 *
 * Deliberately free of React / `next-mdx-remote` imports so the unit
 * test can `import` it under `node --test --experimental-strip-types`
 * without pulling in JSX-bearing component modules.
 *
 * The route handler does the actual `getAllPosts()` / data-file calls
 * and feeds the results into `buildSitemapUrls()` here.
 *
 * Contract (audit 2026-05-21):
 *   - Every <url> ships a <lastmod> derived from a per-entry source:
 *     blog posts use frontmatter `dateModified` (fallback `date`);
 *     generated catalogue pages use the data file's git mtime; static pages use
 *     page.tsx mtime via the build-time manifest. The build-time
 *     `buildAt` is a last-resort fallback so we never return undefined.
 *   - URLs that serve `x-robots-tag: noindex` are NOT listed. AI
 *     crawlers reach `/llms.txt`, `/llms-full.txt`, `/ai.txt` via
 *     well-known path conventions, not the sitemap. Listing a
 *     noindex URL is a self-cancelling signal that Search Console
 *     logs as "Submitted URL marked noindex".
 */

export const SITEMAP_SITE_URL = 'https://bernstein.run';

export type SitemapPost = {
  slug: string;
  fm: {
    date: string;
    dateModified?: string;
  };
};

export type SitemapSeedItem = {
  slug: string;
};

export type SitemapAdapterRef = {
  slug: string;
  verified?: { date: string } | null;
};

export type SitemapCompareEntry = {
  slug: string;
  verified?: { date: string } | null;
};

export type SitemapBenchmarkSuite = {
  dateModified: string;
};

export type LastModResolver = (
  candidates: readonly string[],
) => Promise<string>;

export type SitemapUrl = {
  loc: string;
  /* Required. The pre-fix prod sitemap dropped lastmod on 35% of URLs;
     the type plus the resolver fallback chain guarantees every URL
     ships a date. */
  lastmod: string;
  changefreq?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never';
  priority?: number;
};

export type SitemapInputs = {
  posts: SitemapPost[];
  seedItems: SitemapSeedItem[];
  readyAdapters: SitemapAdapterRef[];
  compareEntries: SitemapCompareEntry[];
  benchmarkSuite: SitemapBenchmarkSuite | null;
  lastModFromSource: LastModResolver;
  /* Last-resort lastmod (typically the source-mtimes manifest's
     `builtAt`). Used when frontmatter is unparseable or a data file
     is missing. Never appears as the primary signal. */
  buildAt: string;
};

export function escapeXml(text: string): string {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function toW3CDate(date: string | Date): string {
  const d = date instanceof Date ? date : new Date(date);
  /* YYYY-MM-DD is the W3C-flavoured ISO 8601 date that Google Search
     Console accepts in <lastmod>; full timestamps work too, but
     day-precision avoids spurious "page changed" pings every build. */
  return d.toISOString().split('T')[0];
}

/**
 * Per-post lastmod. Frontmatter `dateModified` wins (operators bump it
 * when the post is meaningfully edited); otherwise frontmatter `date`
 * is the canonical publish date. If both are unparseable, fall back to
 * `buildAtFallback` rather than `new Date()` so the sitemap stays
 * deterministic across rebuilds.
 */
export async function postLastMod(
  post: SitemapPost,
  buildAtFallback: string,
): Promise<string> {
  const candidate = post.fm.dateModified ?? post.fm.date;
  const parsed = new Date(candidate);
  if (!Number.isNaN(parsed.getTime())) return toW3CDate(parsed);
  return buildAtFallback;
}

/**
 * lastmod for the /blog index. The newest post's lastmod is the most
 * faithful signal: the index re-renders whenever a new post lands.
 * Empty post set falls back to `buildAtFallback`.
 */
export async function blogIndexLastMod(
  posts: SitemapPost[],
  buildAtFallback: string,
): Promise<string> {
  let newest: Date | undefined;
  for (const p of posts) {
    const candidate = p.fm.dateModified ?? p.fm.date;
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) continue;
    if (newest === undefined || parsed.getTime() > newest.getTime()) {
      newest = parsed;
    }
  }
  if (newest) return toW3CDate(newest);
  return buildAtFallback;
}

/**
 * Build the URL list for `/sitemap.xml`. Pure: every dynamic input is
 * passed in. The route handler does the IO (post fetch, data file
 * reads); this function decides what shape the sitemap takes.
 *
 * The route MUST NOT inline URLs that bypass this function - the test
 * suite asserts `/llms.txt`, `/llms-full.txt`, `/ai.txt` are absent at
 * both this layer and in the rendered XML.
 */
export async function buildSitemapUrls(
  inputs: SitemapInputs,
): Promise<SitemapUrl[]> {
  const {
    posts,
    seedItems,
    readyAdapters,
    compareEntries,
    benchmarkSuite,
    lastModFromSource,
    buildAt,
  } = inputs;

  /* Per-route source-of-truth files. Each entry is a list of project-
     relative candidate paths: the first existing file's mtime drives
     the route's <lastmod>. The trailing entry is a route-local fallback
     (typically page.tsx) so a missing data file degrades gracefully
     to the route source rather than breaking the whole sitemap or
     emitting a moving-target literal. Ordering matters: data files
     come before page.tsx because edits to data are the relevant
     content-mtime signal for crawler freshness. */
  const [
    homeLastMod,
    indexLastMod,
    cliQuickstartLastMod,
    whyBernsteinLastMod,
    costLastMod,
    sponsorsLastMod,
    askLastMod,
    toolsAgentMdBenchLastMod,
    toolsOrchestraLastMod,
    qLastMod,
    specDrivenLastMod,
  ] = await Promise.all([
    lastModFromSource(['app/page.tsx']),
    blogIndexLastMod(posts, buildAt),
    lastModFromSource(['app/cli-quickstart/page.tsx']),
    lastModFromSource(['app/why-bernstein/page.tsx']),
    lastModFromSource(['app/cost/page.tsx']),
    lastModFromSource(['app/sponsors/page.tsx']),
    lastModFromSource(['app/ask/page.tsx']),
    lastModFromSource(['app/tools/agent-md-bench/page.tsx']),
    lastModFromSource(['app/tools/orchestra/page.tsx']),
    /* /q index + /q/<slug> leaves share one mtime: the seed file is
       the canonical content surface; the index page is the route
       fallback. */
    lastModFromSource(['data/ask-seed.json', 'app/q/page.tsx']),
    lastModFromSource(['app/spec-driven/page.tsx']),
  ]);

  const urls: SitemapUrl[] = [
    {
      loc: SITEMAP_SITE_URL,
      lastmod: homeLastMod,
      changefreq: 'weekly',
      priority: 1.0,
    },
    {
      loc: `${SITEMAP_SITE_URL}/blog`,
      lastmod: indexLastMod,
      changefreq: 'daily',
      priority: 0.9,
    },
    /* /llms.txt, /llms-full.txt, /ai.txt deliberately omitted (audit
       2026-05-21, issue #42). Those routes serve `x-robots-tag:
       noindex` so listing them here is a self-cancelling signal that
       Search Console buckets as "Submitted URL marked noindex". AI
       crawlers reach them via well-known path conventions, not the
       sitemap. */
    {
      loc: `${SITEMAP_SITE_URL}/cli-quickstart`,
      lastmod: cliQuickstartLastMod,
      changefreq: 'monthly',
      priority: 0.7,
    },
    {
      loc: `${SITEMAP_SITE_URL}/spec-driven`,
      lastmod: specDrivenLastMod,
      changefreq: 'monthly',
      priority: 0.7,
    },
    {
      loc: `${SITEMAP_SITE_URL}/why-bernstein`,
      lastmod: whyBernsteinLastMod,
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      loc: `${SITEMAP_SITE_URL}/cost`,
      lastmod: costLastMod,
      changefreq: 'monthly',
      priority: 0.8,
    },
    {
      loc: `${SITEMAP_SITE_URL}/sponsors`,
      lastmod: sponsorsLastMod,
      changefreq: 'weekly',
      priority: 0.6,
    },
    {
      loc: `${SITEMAP_SITE_URL}/ask`,
      lastmod: askLastMod,
      changefreq: 'weekly',
      priority: 0.7,
    },
    {
      loc: `${SITEMAP_SITE_URL}/tools/agent-md-bench`,
      lastmod: toolsAgentMdBenchLastMod,
      changefreq: 'monthly',
      priority: 0.5,
    },
    {
      loc: `${SITEMAP_SITE_URL}/tools/orchestra`,
      lastmod: toolsOrchestraLastMod,
      changefreq: 'monthly',
      priority: 0.5,
    },
    {
      loc: `${SITEMAP_SITE_URL}/q`,
      lastmod: qLastMod,
      changefreq: 'weekly',
      priority: 0.6,
    },
  ];

  for (const item of seedItems) {
    urls.push({
      loc: `${SITEMAP_SITE_URL}/q/${item.slug}`,
      lastmod: qLastMod,
      changefreq: 'monthly',
      priority: 0.5,
    });
  }

  for (const post of posts) {
    urls.push({
      loc: `${SITEMAP_SITE_URL}/blog/${post.slug}`,
      lastmod: await postLastMod(post, buildAt),
      changefreq: 'monthly',
      priority: 0.7,
    });
  }

  if (readyAdapters.length > 0) {
    const vsLastMod = await lastModFromSource([
      'data/adapters.json',
      'app/vs/page.tsx',
    ]);
    urls.push({
      loc: `${SITEMAP_SITE_URL}/vs`,
      lastmod: vsLastMod,
      changefreq: 'weekly',
      priority: 0.6,
    });
    for (const a of readyAdapters) {
      urls.push({
        loc: `${SITEMAP_SITE_URL}/vs/${a.slug}`,
        lastmod: a.verified?.date ?? vsLastMod,
        changefreq: 'monthly',
        priority: 0.6,
      });
    }
  }

  if (compareEntries.length > 0) {
    const compareLastMod = await lastModFromSource([
      'lib/compare/data.ts',
      'app/compare/page.tsx',
    ]);
    urls.push({
      loc: `${SITEMAP_SITE_URL}/compare`,
      lastmod: compareLastMod,
      changefreq: 'weekly',
      priority: 0.6,
    });
    for (const e of compareEntries) {
      urls.push({
        loc: `${SITEMAP_SITE_URL}/compare/bernstein/${e.slug}`,
        lastmod: e.verified?.date ?? compareLastMod,
        changefreq: 'monthly',
        priority: 0.5,
      });
    }
  }

  if (benchmarkSuite) {
    const benchmarkLastmod = benchmarkSuite.dateModified;
    urls.push({
      loc: `${SITEMAP_SITE_URL}/benchmarks`,
      lastmod: benchmarkLastmod,
      changefreq: 'monthly',
      priority: 0.7,
    });
    urls.push({
      loc: `${SITEMAP_SITE_URL}/benchmarks/cli-agent-orchestrators`,
      lastmod: benchmarkLastmod,
      changefreq: 'monthly',
      priority: 0.7,
    });
    urls.push({
      loc: `${SITEMAP_SITE_URL}/benchmarks/cli-agent-orchestrators/methodology`,
      lastmod: benchmarkLastmod,
      changefreq: 'monthly',
      priority: 0.5,
    });
  }

  return urls;
}

export function buildSitemapXml(urls: SitemapUrl[]): string {
  const urlEntries = urls
    .map((u) => {
      const lines: string[] = [
        '  <url>',
        `    <loc>${escapeXml(u.loc)}</loc>`,
        `    <lastmod>${escapeXml(u.lastmod)}</lastmod>`,
      ];
      if (u.changefreq) lines.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (u.priority !== undefined) {
        lines.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
      }
      lines.push('  </url>');
      return lines.join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urlEntries,
    '</urlset>',
  ].join('\n');
}
