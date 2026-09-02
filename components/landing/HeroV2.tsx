/**
 * HeroV2 - variant-2 ask-first hero.
 *
 * Layout (desktop, 1.55fr / 1fr split):
 *   ┌──────────────────────────┐  ┌───────────────┐
 *   │ preamble · stamp · meta  │  │  install      │
 *   │ H1 (56 px serif italic)  │  │  bernstein init│
 *   │ sub                      │  │  github row   │
 *   │ kicker · ask anything.   │  │  mini-stats   │
 *   │ <DocsBot variant=hero/>  │  │  fact list    │
 *   └──────────────────────────┘  └───────────────┘
 *
 * Mobile: stacks. Right rail promotes ABOVE the bot block (typing on
 * phone is high-friction; mobile users want install first). See
 * variant-2 README §5.
 *
 * Above-fold conversion targets hit (4 of 5):
 *   #1 github star - right rail black row
 *   #2 install     - right rail snippet (copy-on-click)
 *   #3 ask the bot - left column DocsBot variant=hero
 *   #4 email cap   - below fold
 *   #5 read a blog - below fold (DocsBot citations link to posts)
 *
 * The DocsBot is mounted in a Suspense-boundary-safe wrapper at the page
 * level; HeroV2 renders the kicker and ask-h heading then leaves a
 * `<slot />`-shaped div for the page to drop the bot into. This keeps the
 * heading lockup as a server component (faster paint) and only pays for
 * the bot's client bundle below the heading.
 */

import { ReactNode } from 'react';
import { RightRail } from './RightRail';
import { InViewTracker } from '@/components/InViewTracker';
import { UmamiEvent } from '@/lib/analytics/events';
/* Both figures are baked at build time by the prebuild step - the
   adapter count from the bernstein registry, the version from the
   latest release tag. They are the fallbacks used when the
   request-time lookups below fail, and they exist because the literals
   that used to sit here went stale silently between releases. */
import adapterCountData from '@/data/adapter-count.json';
import versionData from '@/data/bernstein-version.json';

interface HeroV2Props {
  /**
   * The DocsBot panel - passed in from the page so the panel itself can
   * be a `dynamic()` import (ssr: false) and HeroV2 stays a server-rendered
   * component for the heading + lede.
   */
  docsBot: ReactNode;
  /**
   * Live count of CLI adapters Bernstein ships (server-fetched at the
   * page level so it's shared across the rail and the meta line). The
   * page is responsible for resolving this - HeroV2 just renders.
   * Optional with a hardcoded default (matches the historic copy)
   * until the page-level fetch lands. The default keeps existing
   * callers from breaking while the new wiring is staged.
   */
  adapterCount?: number;
  /** Total closed PRs (live from GitHub search API). null on outage. */
  closedPrs?: number | null;
  /** Live contributor count via GitHub API. null on outage. */
  contributors?: number | null;
  /**
   * Published post count, counted from `content/blog/` at build time by
   * the page. Rendered in the ask-the-docs kicker, which advertises what
   * the bot is grounded in. It was a hardcoded 14 while the directory
   * held nineteen posts, so the kicker undersold the corpus by a third.
   */
  postCount: number;
}

/**
 * Default adapter count when the page hasn't threaded a server-fetched
 * value through yet. Baked at build time from the bernstein registry, so
 * it tracks the same source the live fetch reads rather than needing a
 * manual bump on registry drift. The live fetch supersedes it on every
 * render that reaches upstream.
 */
const DEFAULT_ADAPTER_COUNT = adapterCountData.count;

/**
 * Fallback for the version pill. Used when GitHub is unreachable AND the
 * ISR cache is cold. Baked at build time from the latest release tag
 * (falling back to the offline floor in lib/version.ts), so the worst
 * case is the version that was current when the image was built rather
 * than whenever someone last remembered to edit this line.
 */
const VERSION_FALLBACK = `v${versionData.version}`;
/* Hard upstream timeout. Mirrors the per-request AbortController
   pattern from `app/api/stats/route.ts` (4320057): the homepage SSR
   awaits this on the render path, so a slow GitHub call must not pin
   the render handler open until the edge times out. 2s ceiling; on
   timeout we fall through to VERSION_FALLBACK like every other error
   path here. */
const VERSION_FETCH_TIMEOUT_MS = 2000;

/**
 * Latest release tag from the public bernstein repo.
 *
 * One-hour ISR cache via Next's `next: { revalidate: 3600 }`. Returns
 * the hardcoded fallback on any 4xx/5xx/timeout/network error. We
 * expose an OPTIONAL `GITHUB_TOKEN` so an operator who hits the
 * 60/hr unauthenticated rate limit can opt into the 5000/hr
 * authenticated tier without making the token a hard dependency.
 */
async function fetchLatestVersionTag(): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), VERSION_FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(
      'https://api.github.com/repos/sipyourdrink-ltd/bernstein/releases/latest',
      { headers, next: { revalidate: 3600 }, signal: ac.signal },
    );
    if (!res.ok) return VERSION_FALLBACK;
    const data = (await res.json()) as { tag_name?: unknown };
    if (typeof data.tag_name !== 'string' || !data.tag_name.trim()) {
      return VERSION_FALLBACK;
    }
    /* GitHub release tags conventionally start with "v"; lowercase
       to match the editorial voice ("v3.12.0 shipping"). */
    return data.tag_name.trim().toLowerCase();
  } catch {
    /* Network error / DNS / AbortController timeout - same fallback
       path as the non-200 branch. We never throw upward; the pill must
       always render. */
    return VERSION_FALLBACK;
  } finally {
    clearTimeout(timer);
  }
}

export async function HeroV2({
  docsBot,
  adapterCount,
  closedPrs = null,
  contributors = null,
  postCount,
}: HeroV2Props) {
  const versionTag = await fetchLatestVersionTag();
  const resolvedAdapterCount = adapterCount ?? DEFAULT_ADAPTER_COUNT;

  return (
    <section className="v2-hero" aria-labelledby="hero-heading">
      {/* Funnel step 1 - fires once per session when the hero CTA region
          first crosses the viewport. RightRail mount now fires
          ``cta-hero-mount`` (see action-002); this is the canonical
          "scrolled-to" denominator. */}
      <InViewTracker eventName={UmamiEvent.HeroCtaInView} ratio={0.2} />
      {/* LEFT COLUMN - preamble + H1 + sub + ask-first slot */}
      <div className="v2-hero-lede">
        <div className="v2-hero-pre" role="note" aria-label="release status">
          <span className="v2-stamp">
            <span className="pulse" aria-hidden="true" />
            {versionTag} shipping
          </span>
          {/* Deliberately "40+" rather than the live figure. Every other
              surface quotes the same floor, and an exact number rendered
              here drifted out of step with them the moment the registry
              changed. resolvedAdapterCount still backs the surfaces that
              genuinely want a live count. */}
          <span className="v2-meta">
            40+ cli adapters · apache 2.0 · on-prem
          </span>
        </div>

        {/* H1 lockup. Each visual line is its own <span className="v2-h1-line">
            so word boundaries survive naive tag-strip tokenizers (older
            crawlers, embedding pipelines, AI scrapers) that don't insert
            whitespace where a tag boundary sat. Italic accent words are
            wrapped as whole-word <em>...</em> with explicit surrounding
            whitespace inside the parent text node, never around fragments
            of a word. CSS turns each .v2-h1-line into a block to replace
            the old <br/>. The leading/trailing space between lines below
            keeps the rendered text node a tokenizer-safe single string. */}
        <h1 id="hero-heading">
          <span className="v2-h1-line">
            <em>several</em> ai agents.
          </span>
          {' '}
          <span className="v2-h1-line">
            one governance layer. <em>every run</em> provable.
          </span>
        </h1>

        <p className="v2-sub">
          bernstein is the open-source governance layer for ai agents:
          a deterministic python scheduler runs them in parallel, with
          no model in the coordination loop, so the same plan replays
          byte-identically. it runs on policy as code: you write the
          policy, bernstein enforces it, and produces the verifiable
          record.
        </p>

        <p className="v2-sub">
          ships adapters for claude code, codex, gemini cli, aider, and
          40+ more. each coding task runs in its own git worktree; lint,
          types, and tests gate every merge. non-code work closes on
          artifact contracts with signed lineage receipts: research,
          datasets, audit evidence packs. flip on the hmac audit log and
          someone who did not run it can check the record offline,
          without rerunning it.
        </p>

        <div className="v2-docs-kicker">
          <span>ask the docs</span>
          <span className="sep" aria-hidden="true">
            ·
          </span>
          <span>grounded in source + {postCount} posts</span>
          <span className="sep" aria-hidden="true">
            ·
          </span>
          <span>cited</span>
        </div>

        <h2 className="v2-ask-h">
          ask <em>anything</em>.
        </h2>

        {/* DocsBot mounts here. Pre-allocated min-height in the bot's own
            CSS keeps CLS at 0 during streaming. */}
        {docsBot}
      </div>

      {/* RIGHT COLUMN - evidence rail */}
      <RightRail
        adapterCount={resolvedAdapterCount}
        closedPrs={closedPrs}
        contributors={contributors}
      />
    </section>
  );
}
