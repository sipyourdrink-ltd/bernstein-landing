'use client';

/**
 * RightRail - evidence column for the ask-first hero (right 40 %).
 *
 * Stacks four single-purpose surfaces:
 *   1. Install snippet (segmented tabset: pipx / brew / uv / docker), with
 *      a follow-up `bernstein init` row directly under it. Both setup
 *      steps are shown verbatim rather than collapsed into one line.
 *   2. GitHub star row - black row with the 7-day delta. Star count
 *      fetched via /api/stats (same source the Nav uses) so the number
 *      stays consistent across nav & rail.
 *   3. Mini-stats grid (2×2) - adapters / closed PRs / downloads-or-
 *      contributors / $0. The third slot prefers monthly PyPI downloads
 *      and degrades to contributor count when upstream is unavailable.
 *      Both values are server-fetched at the page level and threaded
 *      through as props so this component stays presentational.
 *   4. Fact list - verb→object table answering "what is bernstein".
 *
 * The column carries equal vertical weight to the ask box (its own bg +
 * border + 24 px padding) so it reads as a peer column, not a sidebar.
 * Below 1280 px css gives the ask box a bit more dominance; below 900 px
 * the column promotes above the ask block.
 *
 * Copy-on-click for both install rows logs `install-snippet-copy` to
 * Umami - the same event name the earlier hero used, so reports stay
 * continuous.
 */

import { useEffect, useState } from 'react';
import { trackOutbound } from '@/components/site/track-outbound';
import { UmamiEvent, emitFunnelStep, track } from '@/lib/analytics/events';
import { withUtm } from '@/lib/utm';
import { ReadTheCode } from './ReadTheCode';

/**
 * day-2-return + gh-star-confirmed detection.
 *
 * Inlined here rather than split into a module - it is used by this
 * component only. Both checks run exactly once per session via
 * sessionStorage gates so a re-render of RightRail can't double-count.
 *
 * day-2-return:
 *   localStorage["bernstein:first-seen"] = ms timestamp of first paint.
 *   On every mount, if the key exists AND is >=24h old AND the session
 *   gate hasn't fired yet, emit ``day-2-return`` with a coarse
 *   ``days_since`` bucket. New visitors set the key and skip the emit.
 *
 * gh-star-confirmed:
 *   ``trackOutbound`` (see components/site/track-outbound.ts) sets a
 *   2-minute cookie ``bernstein:gh-pending`` carrying the original
 *   ``source`` value when destination is github.com. On the next page
 *   load, if (a) the cookie is still fresh AND (b)
 *   ``document.referrer`` host is github.com, we treat the round-trip
 *   as a heuristic confirmation that the visitor reached the repo
 *   before coming back. Confirming an actual star needs a GitHub
 *   webhook, which this app does not have.
 */
const FIRST_SEEN_KEY = 'bernstein:first-seen';
const DAY2_SESSION_GATE = 'bernstein:day2-emitted';
const GH_RETURN_SESSION_GATE = 'bernstein:gh-return-emitted';
const GH_PENDING_COOKIE = 'bernstein:gh-pending';

function daysSinceBucket(daysSince: number): '1' | '2' | '3-7' | '7-30' | '30+' {
  if (daysSince < 2) return '1';
  if (daysSince < 3) return '2';
  if (daysSince < 7) return '3-7';
  if (daysSince < 30) return '7-30';
  return '30+';
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const raw of document.cookie.split(';')) {
    const c = raw.trim();
    if (c.startsWith(prefix)) return decodeURIComponent(c.slice(prefix.length));
  }
  return null;
}

function clearCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function maybeEmitCohortEvents(): void {
  if (typeof window === 'undefined') return;
  try {
    /* ---- day-2-return ---- */
    const ls = window.localStorage;
    const ss = window.sessionStorage;
    const now = Date.now();
    const firstSeenRaw = ls?.getItem(FIRST_SEEN_KEY);
    if (!firstSeenRaw) {
      ls?.setItem(FIRST_SEEN_KEY, String(now));
    } else {
      const firstSeenMs = Number(firstSeenRaw);
      if (Number.isFinite(firstSeenMs) && firstSeenMs > 0) {
        const ageMs = now - firstSeenMs;
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (ageMs >= oneDayMs && ss?.getItem(DAY2_SESSION_GATE) !== '1') {
          ss?.setItem(DAY2_SESSION_GATE, '1');
          const days = Math.floor(ageMs / oneDayMs);
          track(UmamiEvent.Day2Return, {
            source: 'right-rail-mount',
            days_since: daysSinceBucket(days),
          });
        }
      }
    }

    /* ---- gh-star-confirmed ---- */
    const pending = readCookie(GH_PENDING_COOKIE);
    if (pending && ss?.getItem(GH_RETURN_SESSION_GATE) !== '1') {
      const referrerHost = (() => {
        try {
          return document.referrer
            ? new URL(document.referrer).hostname.replace(/^www\./i, '').toLowerCase()
            : '';
        } catch {
          return '';
        }
      })();
      if (referrerHost === 'github.com') {
        ss?.setItem(GH_RETURN_SESSION_GATE, '1');
        track(UmamiEvent.GhStarConfirmed, { source: pending || 'unknown' });
        /* Clear the pending cookie so a later page load (e.g. an in-app
           nav back to /) doesn't double-emit. */
        clearCookie(GH_PENDING_COOKIE);
      }
    }
  } catch {
    /* localStorage / sessionStorage can throw in iframe-sandbox or
       private-mode contexts; the cohort events are best-effort by
       design - never let a tracker failure throw into the component. */
  }
}

interface RightRailProps {
  /**
   * Live adapter count, server-fetched from the bernstein registry.
   * Always present (the fetcher in `lib/adapter-count.ts` returns a
   * documented fallback rather than throwing or returning null).
   */
  adapterCount: number;
  /**
   * Total closed PRs (live from GitHub search API). null when the
   * search call failed - falls back to the hardcoded const below.
   * The previous `292 closed prs / mo` was a hardcoded placeholder
   * (it got pinned to the stars value by accident); this is the real
   * "closed PRs ever" total.
   */
  closedPrs: number | null;
  /**
   * Live contributor count from GitHub. null on outage; falls back to
   * the hardcoded const. Renders in the slot vacated by the downloads
   * tile (operator moved downloads to the hero eyebrow).
   */
  contributors: number | null;
}

/**
 * Hardcoded fallback for the contributor count if the GitHub API is
 * unreachable AND the ISR cache is cold. Update manually if the real
 * number drifts away from this for an extended outage.
 */
const CONTRIBUTORS_FALLBACK: number | null = null;
/**
 * Hardcoded fallback for the closed-PR total. Same outage-mode rule as
 * above. The ground-truth lives at
 * https://github.com/sipyourdrink-ltd/bernstein/pulls?q=is%3Apr+is%3Aclosed
 * and the live fetch in `lib/pkg-stats.ts::fetchPackageStats` reads the
 * same number via the search API.
 */
const CLOSED_PR_FALLBACK: number | null = null;

type Tab = { id: string; label: string; cmd: string };

const INSTALL_TABS: Tab[] = [
  { id: 'pipx', label: 'pipx', cmd: 'pipx install bernstein' },
  { id: 'brew', label: 'brew', cmd: 'brew tap chernistry/tap && brew install bernstein' },
  { id: 'uv', label: 'uv', cmd: 'uv tool install bernstein' },
  { id: 'docker', label: 'docker', cmd: 'docker run --rm ghcr.io/sipyourdrink-ltd/bernstein' },
];

/* The /api/stats endpoint already feeds the Nav - reuse it so the star
   count + (eventual) 7-day delta stay coherent across surfaces.

   STAR_FALLBACK: shown only if /api/stats is unreachable. Should be a
   real-ish recent value, NEVER a vibe number. Update when the live count
   moves materially away from this; the fallback is never visible to a
   live visitor with a working network.

   DELTA_FALLBACK: 0 on purpose. /api/stats does NOT yet return a real
   weekly delta - wiring that up is a separate ticket (snapshot stars
   to disk daily, expose `starsDelta7d`). Until then we render no delta
   chip rather than a hardcoded number that looks wrong against the
   live total (e.g. delta > total = absurd). When the API ships the
   field, the existing `delta > 0` guard below will start rendering it. */
const STAR_FALLBACK: number | null = null;
const DELTA_FALLBACK = 0;

function formatStars(stars: number | null): string {
  return stars === null ? '-' : stars.toLocaleString('en-US');
}

function trackUmami(name: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    umami?: { track: (n: string, d?: Record<string, unknown>) => void };
  };
  w.umami?.track(name, data);
}

export function RightRail({ adapterCount, closedPrs, contributors }: RightRailProps) {
  const resolvedClosedPrs: number | null = closedPrs ?? CLOSED_PR_FALLBACK;
  const resolvedContributors: number | null = contributors ?? CONTRIBUTORS_FALLBACK;
  const [activeTab, setActiveTab] = useState<string>('pipx');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [stars, setStars] = useState<number | null>(STAR_FALLBACK);
  const [delta, setDelta] = useState<number>(DELTA_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.stars === 'number' && data.stars > 0) {
          setStars(data.stars);
        }
        if (typeof data.starsDelta7d === 'number') {
          setDelta(data.starsDelta7d);
        }
      })
      .catch(() => {
        /* silent - fallback values stand */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Emits cta-hero-mount, plus cta-hero-view via emitFunnelStep. Both
  // are needed: cta-hero-mount counts every mount, cta-hero-view is the
  // name reports have always read. A rename dropped cta-hero-view for a
  // week; re-emitting it here keeps both series populated.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as {
      umami?: { track: (n: string, d?: Record<string, unknown>) => void };
    };
    w.umami?.track(UmamiEvent.CtaHeroMount, {
      viewport_width: window.innerWidth,
    });
    emitFunnelStep('cta', { source: 'hero-rail-mount' });
    /* day-2-return + gh-star-confirmed checks. Fire once per session
       via sessionStorage gates inside the helper so a re-mount can't
       double-count. See the helper docstring above for the full
       contract. */
    maybeEmitCohortEvents();
  }, []);

  const tab = INSTALL_TABS.find((t) => t.id === activeTab) ?? INSTALL_TABS[0];

  /** Per-installer event name. Maps the install-snippet variant to the
   *  ``pypi-install-{installer}-copy`` event (lib/analytics/events.ts →
   *  UmamiEvent). ``install-snippet-copy`` is fired alongside it so
   *  older reports keep working. */
  const installEventName: Record<string, string> = {
    pip: 'pypi-install-pip-copy',
    pipx: 'pypi-install-pipx-copy',
    uv: 'pypi-install-uv-copy',
    docker: 'pypi-install-docker-copy',
    brew: 'pypi-install-brew-copy',
  };

  const onCopy = (id: string, cmd: string, eventName: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(cmd).then(() => {
      setCopiedId(id);
      trackUmami(eventName, { variant: id });
      // Fire the canonical per-installer event for the install-snippet
      // family. The init-row keeps using ``install-init-copy`` only
      // because there's no installer there.
      if (eventName === 'install-snippet-copy') {
        const perInstaller = installEventName[id];
        if (perInstaller) trackUmami(perInstaller, { source: 'hero-rail' });
        /* Re-emit through emitFunnelStep, which applies the bot
           filter. The trackUmami call above bypasses that filter, so
           its series includes bot traffic; the raw emit stays only so
           older reports keep working. */
        emitFunnelStep('install', { source: 'hero-rail', variant: id, repeatable: true });
      }
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
      }, 1400);
    });
  };

  /* The sparkline was removed: its 12-bucket ascending shape was
     hand-tuned for visual rhythm rather than derived from real weekly
     data, and the page does not ship invented numbers. The row now
     renders the raw star count plus the delta chip when /api/stats
     supplies a real `starsDelta7d`. When the API grows a weekly bucket
     array, the sparkline can return backed by real numbers. */

  return (
    <aside className="v2-right-col" aria-label="install · github · evidence">
      {/* INSTALL - the primary action in this column. The sibling tiles
          (github row, mini-stats, fact list) are visually quieter via
          Tailwind utility classes layered on top of the existing v2-*
          CSS, so dropping the className additions reverts the emphasis. */}
      <div className="ring-2 ring-[color:var(--accent)]/70 ring-offset-2 ring-offset-[color:var(--bg-paper-2)] rounded-[var(--radius-lg)] p-1 shadow-[0_10px_30px_-12px_oklch(20%_0.005_60/0.35)]">
        {/* No time estimate here: the previous "· 5 min" chip was a
            hand-typed figure with nothing behind it, and install time is
            dominated by the visitor's Python setup, not by us. */}
        <p className="v2-rc-label !text-[color:var(--accent)] !mb-2">
          Copy &amp; install
        </p>
        <div className="v2-install" role="group" aria-label="install command">
          <div className="v2-install-tabs" role="tablist">
            {INSTALL_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={t.id === activeTab}
                aria-controls={`install-body-${t.id}`}
                className={`v2-install-tab ${t.id === activeTab ? 'is-on' : ''}`.trim()}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="v2-install-body !py-4" id={`install-body-${tab.id}`}>
            <span className="v2-install-cmd !text-[15px]">
              <span className="v2-prompt">$</span>
              {tab.cmd}
            </span>
            <button
              type="button"
              className={`v2-install-copy ${copiedId === tab.id ? 'is-copied' : ''} !text-[12px] !py-2 !px-3 !font-semibold !bg-[color:var(--accent)] !text-[color:var(--bg-paper)] !border-[color:var(--accent)] hover:!bg-[color:var(--ink)] hover:!border-[color:var(--ink)]`.trim()}
              onClick={() => onCopy(tab.id, tab.cmd, 'install-snippet-copy')}
              aria-label={`copy ${tab.label} install command`}
            >
              {copiedId === tab.id ? 'copied' : 'Copy command'}
            </button>
          </div>
        </div>
        {/* `bernstein init` - demoted to a follow-up; smaller + muted so
            the primary install block above reads as the single CTA. */}
        <div
          className="v2-install opacity-60 !mt-2 hover:opacity-90 transition-opacity"
          role="group"
          aria-label="post-install init command"
        >
          <div className="v2-install-body !py-2">
            <span className="v2-install-cmd !text-[12px]">
              <span className="v2-prompt">$</span>bernstein init
            </span>
            <button
              type="button"
              className={`v2-install-copy ${copiedId === 'init' ? 'is-copied' : ''}`.trim()}
              onClick={() => onCopy('init', 'bernstein init', 'install-init-copy')}
              aria-label="copy bernstein init command"
            >
              {copiedId === 'init' ? 'copied' : 'copy'}
            </button>
          </div>
        </div>
      </div>

      {/* GITHUB ROW + featured-in popover.
          The wrapper exists purely to host the hover/focus tooltip below
          the star CTA. The CTA itself stays a single anchor so screen
          readers / keyboard users still hit it as one tab stop; the
          tooltip is an additional anchor that becomes reachable via the
          wrapper's :focus-within state.
          opacity-80 + reduced shadow so this row no longer out-shouts
          the install block above. Hover restores full contrast so the
          row stays clearly clickable. */}
      <div className="v2-gh-wrap opacity-80 hover:opacity-100 transition-opacity [&_.v2-gh-row]:!shadow-none">
        <a
          href={withUtm('https://github.com/sipyourdrink-ltd/bernstein', {
            source: 'bernstein.run',
            medium: 'outbound-link',
            campaign: 'hero-rail-star',
          })}
          className="v2-gh-row"
          target="_blank"
          rel="noopener noreferrer"
          /* Two event names on one anchor: `github-click` is the older
             one, kept so existing reports keep working; `outbound-github`
             is the name shared across properties. The click handler also
             fires `github-star-click` for the star-specific series. */
          data-umami-event="outbound-github"
          data-umami-event-surface="hero-rail-star"
          data-umami-event-source="hero-rail"
          onClick={() => {
            /* Three event names on a single anchor:
               - ``outbound-github`` (auto-tracker via data-umami-event) -
                 the name shared across properties.
               - ``github-star-click`` - specific to this row.
               - ``github-click`` (via emitFunnelStep) - the generic
                 GitHub-click name. Without it that series reads zero,
                 because the auto-tracker only emits the first name. */
            trackUmami('github-star-click', { source: 'hero-rail' });
            emitFunnelStep('ghClick', { source: 'hero-rail-star', repeatable: true });
            emitFunnelStep('ghStar', { source: 'hero-rail', repeatable: true });
            trackOutbound('github.com', 'hero', 'star');
          }}
          aria-label={
            stars === null
              ? 'star bernstein on github'
              : `star bernstein on github · ${formatStars(stars)} stars`
          }
        >
          <div className="v2-gh-left">
            <span className="v2-gh-star" aria-hidden="true">
              ★
            </span>
            <span>star on github</span>
          </div>
          <div className="v2-gh-right">
            <span className="v2-gh-count">
              {formatStars(stars)}
              {/* Only render the chip when the delta is plausibly real:
                  positive AND less than the current total (delta >= total
                  would mean the project had ≤0 stars 7 days ago - absurd
                  for an established repo). It is the only weekly number
                  in this row now that the sparkline is gone. */}
              {stars !== null && delta > 0 && delta < stars && (
                <span className="v2-gh-delta">+{delta} / 7d</span>
              )}
            </span>
          </div>
        </a>
        <a
          /* Anchors the README's `### mentioned in` section. The umami
             event name stays `featured-in-click` so the series is
             continuous across the README heading rename. */
          href={withUtm('https://github.com/sipyourdrink-ltd/bernstein#mentioned-in', {
            source: 'bernstein.run',
            medium: 'outbound-link',
            campaign: 'hero-rail-featured',
          })}
          className="v2-gh-tooltip"
          target="_blank"
          rel="noopener noreferrer"
          data-umami-event="outbound-github"
          data-umami-event-surface="hero-rail-featured"
          data-umami-event-source="hero-rail"
          onClick={() => trackUmami('featured-in-click', { source: 'hero-rail' })}
        >
          <span className="v2-gh-tooltip-body">
            also picked up by awesome lists, newsletters &amp; peer projects
          </span>
          <span className="v2-gh-tooltip-cta">see mentioned in →</span>
        </a>
      </div>

      {/* DOCS LINK - secondary to the GitHub row. Added because the home
          page otherwise rendered no link to the docs at all.

          Points straight at readthedocs, matching the Nav callsite
          (same href, same target/rel). It used to point at the internal
          /docs/cli, which is a server-side redirect to exactly this URL
          - so every click paid a redirect hop, and the same intent had
          two different behaviours on one page (Nav opened a new tab,
          this row replaced the landing). Reuses the existing
          `read-the-docs-click` Umami event; the `hero-rail` source
          discriminator is what separates this row from Nav in reports.
          Styled quieter than the GitHub black row. */}
      <a
        href="https://bernstein.readthedocs.io/"
        target="_blank"
        rel="noopener noreferrer"
        className="v2-gh-row !bg-transparent !text-[color:var(--ink)] !shadow-none border border-[color:var(--rule)] hover:!bg-[color:var(--bg-paper-2)]"
        data-umami-event="read-the-docs-click"
        data-umami-event-source="hero-rail"
        onClick={() => trackUmami('read-the-docs-click', { source: 'hero-rail' })}
      >
        <div className="v2-gh-left">
          <span className="v2-gh-star !text-[color:var(--ink-soft)]" aria-hidden="true">
            §
          </span>
          <span>read the docs</span>
        </div>
        <div className="v2-gh-right">
          <span className="v2-gh-count !text-[color:var(--ink-soft)]">
            readthedocs.io →
          </span>
        </div>
      </a>

      {/* "read the code" - the browsable views of the source, directly
          under the CTA cluster because this is where a visitor decides
          how to look deeper. Driven by an array in
          read-the-code-data.ts; adding a surface is a one-line change. */}
      <ReadTheCode surface="hero" />

      {/* MINI STATS - opacity dampens the 4-tile grid + sponsor + /cost
          row so they read as supporting evidence rather than competing
          for the same attention as the install block. Hover restores
          full contrast on interactive tiles. */}
      <div className="opacity-70 hover:opacity-100 transition-opacity">
        <p className="v2-rc-label">today</p>
        <div className="v2-mini-stats" role="list">
          <div className="v2-ms" role="listitem">
            <div className="v2-ms-n">{adapterCount}</div>
            <div className="v2-ms-l">cli adapters</div>
          </div>
          <a
            className="v2-ms v2-ms-link"
            role="listitem"
            href={withUtm(
              'https://github.com/sipyourdrink-ltd/bernstein/pulls?q=is%3Apr+is%3Aclosed',
              {
                source: 'bernstein.run',
                medium: 'outbound-link',
                campaign: 'hero-rail-prs',
              },
            )}
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="outbound-github"
            data-umami-event-surface="hero-rail-prs"
            aria-label={
              resolvedClosedPrs === null
                ? 'closed pull requests on github'
                : `${resolvedClosedPrs} closed pull requests on github`
            }
          >
            <div className="v2-ms-n">
              {resolvedClosedPrs === null
                ? '-'
                : resolvedClosedPrs.toLocaleString('en-US')}
            </div>
            <div className="v2-ms-l">closed prs</div>
          </a>
          <a
            className="v2-ms v2-ms-link"
            role="listitem"
            href={withUtm(
              'https://github.com/sipyourdrink-ltd/bernstein/graphs/contributors',
              {
                source: 'bernstein.run',
                medium: 'outbound-link',
                campaign: 'hero-rail-contributors',
              },
            )}
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="outbound-github"
            data-umami-event-surface="hero-rail-contributors"
            aria-label={
              resolvedContributors === null
                ? 'contributors on github'
                : `${resolvedContributors} contributors on github`
            }
          >
            <div className="v2-ms-n">{resolvedContributors ?? '-'}</div>
            <div className="v2-ms-l">contributors</div>
          </a>
          {/* Sponsor tile (replaces the older "$0 to install").
              Quiet invitation, not a price tag. The headline reflects the
              real out-of-pocket development+host cost; the label invites
              without demanding. Whole tile is the link target.
              Two event names: ``sponsor-tile-click`` keeps older
              reports working; ``gh-sponsors-click`` (lib/analytics/
              events.ts) is the shared name for every GitHub-sponsors
              anchor, readable independently of where the click
              originated. */}
          <a
            href="https://github.com/sponsors/chernistry"
            target="_blank"
            rel="noopener noreferrer"
            className="v2-ms v2-ms-link"
            role="listitem"
            data-umami-event="sponsor-tile-click"
            data-umami-event-source="hero-rail"
            data-umami-event-surface="hero-rail-sponsor-tile"
            onClick={() => {
              trackUmami('gh-sponsors-click', { source: 'hero-rail' });
              /* Also emit ``sponsor-conversion``. Distinct from
                 ``sponsor-tile-click`` (the click on this tile) and
                 ``gh-sponsors-click`` (any sponsors anchor): this one
                 records that the visitor left for GitHub Sponsors. A
                 GitHub webhook would report the actual outcome; this
                 app has no such webhook. The other two keep firing. */
              track(UmamiEvent.SponsorConversion, {
                source: 'hero-rail',
                surface: 'sponsor-tile',
              });
              trackOutbound('github.com', 'hero', 'sponsor');
            }}
            aria-label="sponsor on github · helps if it helped you"
          >
            <div className="v2-ms-n">~$0</div>
            <div className="v2-ms-l">to install · sponsor →</div>
          </a>
          {/* Cost-calculator companion tile. Sits as a full-width row under
              the 2×2 grid (gridColumn: 1 / -1) so it visually pairs with the
              sponsor tile above without reshuffling the grid rhythm.
              /cost was previously three internal hops from the front
              page, which is why it is surfaced here. */}
          <a
            href="/cost"
            className="v2-ms v2-ms-link"
            role="listitem"
            style={{ gridColumn: '1 / -1' }}
            data-umami-event="cost-tile-click"
            data-umami-event-source="hero-rail"
            aria-label="/cost · what does it cost to run?"
          >
            <div className="v2-ms-n">/cost</div>
            <div className="v2-ms-l">what does it cost to run? →</div>
          </a>
        </div>
      </div>

      {/* FACT LIST - verb → object. Opacity dampens the list so the
          install block above stays the primary action in the column. */}
      <div className="opacity-70">
        <p className="v2-rc-label">what bernstein is</p>
        <dl className="v2-fact">
          <div className="v2-row">
            <dt className="v2-k">runs</dt>
            <dd className="v2-v">
              cli coding agents <em>in parallel</em>
            </dd>
          </div>
          <div className="v2-row">
            <dt className="v2-k">isolates</dt>
            <dd className="v2-v">each in its own git worktree</dd>
          </div>
          <div className="v2-row">
            <dt className="v2-k">verifies</dt>
            <dd className="v2-v">
              lint · types · tests <em>per diff</em>
            </dd>
          </div>
          <div className="v2-row">
            <dt className="v2-k">merges</dt>
            <dd className="v2-v">only what passes</dd>
          </div>
          <div className="v2-row">
            <dt className="v2-k">runs on</dt>
            <dd className="v2-v">your laptop, on-prem, air-gapped</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
