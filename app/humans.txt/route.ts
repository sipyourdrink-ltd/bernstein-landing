import fs from 'node:fs';
import path from 'node:path';

/**
 * Both derived lines in this file used to be guesses.
 *
 * `Framework:` was a literal that fossilised at 14 while the tree moved
 * on (issue #91), and `Last updated:` was `new Date()` evaluated per
 * request, so no two responses from the same build matched byte for
 * byte (issue #112). Neither is hand-maintainable: a discovery file
 * that states a version has to read it from the thing that defines it.
 *
 * Sources, both read once at module load:
 *
 *   - `package.json` -> `dependencies.next`. Next.js copies the
 *     project's package.json into the standalone bundle, so the read
 *     resolves in production as well as in dev.
 *   - `data/source-mtimes.json` -> the prebuild manifest that
 *     `app/sitemap.xml/route.ts` already reads for `<lastmod>`. It is
 *     committed and traced into standalone.
 *
 * Both reads are soft. A missing or malformed file drops the affected
 * line instead of substituting a wall-clock guess: a discovery file one
 * line shorter is honest, one carrying today's date stamped at request
 * time is not.
 */

function readJsonFile(relPath: string): unknown {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
    return JSON.parse(raw) as unknown;
  } catch {
    /* Not present in this environment; the caller drops its line. */
    return null;
  }
}

/**
 * `major.minor` of the pinned Next.js release. The leading range
 * character of a spec like `^15.5.22` is skipped by matching the first
 * two numeric segments, so the line stays correct if the pin is ever
 * loosened.
 */
function resolveNextVersion(): string | null {
  const pkg = readJsonFile('package.json') as {
    dependencies?: Record<string, string>;
  } | null;
  const spec = pkg?.dependencies?.next;
  const match = spec ? /(\d+)\.(\d+)/.exec(spec) : null;
  return match ? `${match[1]}.${match[2]}` : null;
}

/**
 * Day-precision build stamp, `YYYY-MM-DD`.
 *
 * The manifest's `mtimes` values come from `git log -1 --format=%cI`,
 * so they are a property of the commit and two builds of the same tree
 * resolve the same date. `builtAt` is the prebuild wall clock and would
 * move between those two builds, so it is only the fallback. ISO
 * day-precision strings sort chronologically, so the newest tracked
 * source date is the last one after a plain sort.
 */
function resolveBuildStamp(): string | null {
  const manifest = readJsonFile('data/source-mtimes.json') as {
    builtAt?: string;
    mtimes?: Record<string, string | null>;
  } | null;
  if (!manifest) return null;
  const tracked = Object.values(manifest.mtimes ?? {}).filter(
    (value): value is string => typeof value === 'string' && value !== '',
  );
  return tracked.sort().at(-1) ?? manifest.builtAt ?? null;
}

const NEXT_VERSION = resolveNextVersion();
const LAST_UPDATED = resolveBuildStamp();

export function GET() {
  const content = [
    '/* TEAM */',
    'Creator: Alex Chernysh',
    'Contact: forte@bernstein.run',
    'Site: https://alexchernysh.com',
    'GitHub: https://github.com/chernistry',
    'X: https://x.com/alex_chernysh',
    'Location: Europe',
    '',
    '/* THANKS */',
    'Bernstein orchestrates: Claude Code, Codex CLI, Gemini CLI, and 40+ more agents',
    '',
    '/* SITE */',
    'Standards: HTML5, CSS3, TypeScript',
    NEXT_VERSION ? `Framework: Next.js ${NEXT_VERSION} (App Router)` : null,
    'Language: TypeScript, Python',
    'Hosting: OVH VPS, Caddy, Docker',
    'CDN: Cloudflare',
    'Email: Kit (ConvertKit)',
    'Design: OKLCH color space, Inter + JetBrains Mono',
    'Build: Node.js 20, standalone Docker output',
    LAST_UPDATED ? `Last updated: ${LAST_UPDATED}` : null,
    '',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
