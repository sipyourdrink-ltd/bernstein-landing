/**
 * Every custom analytics event name the site emits, in one place.
 *
 * Names used to be written inline at each call site, which meant one
 * name could stand for several different clicks and a typo shipped
 * silently. Routing them through this module gives a typed enum, one
 * grep target, and a file a contributor can read to see what the site
 * records before going looking for the call sites.
 *
 * Self-exclusion: `track` short-circuits when
 * `localStorage["umami:disabled"] === "true"`, and installs a stub so
 * declarative `data-*` attributes bail out too. The load-time check
 * lives in `lib/analytics/disable.ts`.
 *
 * Automated clients: every `track` call consults `isLikelyBot()`.
 * `bot` emits `bot-filtered` in place of the original; `suspected`
 * emits both the original and a `bot-suspected` marker, so an ambiguous
 * visit is labelled rather than dropped; `human` passes through.
 * Declarative attribute clicks bypass JS and are unaffected, which is
 * why anchors prefer a programmatic `track()` call.
 *
 * PII rule: props are enums, booleans and numeric ranges only. No URLs,
 * no addresses, no free-form text.
 */

import { isLikelyBot } from './bot-filter';

/** Every custom event name in use. New events go here first, then at
 *  the call site. Names use kebab-case. */
export const UmamiEvent = {
  // --- existing events kept for backward compatibility ---
  // Renaming any of these orphans the history already recorded under
  // the old name, so the names stay put even where a better one exists.
  CtaHeroView: 'cta-hero-view',
  GithubClick: 'github-click',
  GithubStarClick: 'github-star-click',
  ReadTheDocsClick: 'read-the-docs-click',
  InstallSnippetCopy: 'install-snippet-copy',
  ClickInstallPs1: 'click-install-ps1',
  ClickLlms: 'click-llms',
  ClickLlmsFull: 'click-llms-full',
  ClickPypistatsOut: 'click-pypistats-out',
  ClickPypiOut: 'click-pypi-out',
  SponsorNoteShown: 'sponsor-note-shown',
  SponsorTileClick: 'sponsor-tile-click',
  SponsorClick: 'sponsor-click',
  SponsorNoteDismiss: 'sponsor-note-dismiss',
  SponsorNoteClick: 'sponsor-note-click',
  CostTileClick: 'cost-tile-click',

  // --- new events shipped 2026-05-08 ---
  /** Distinct event for clicks on github.com/sponsors/chernistry. The
   *  pre-existing ``github-click`` lumps repo, star and sponsor clicks
   *  together; ``gh-sponsors-click`` separates the actual conversion. */
  GhSponsorsClick: 'gh-sponsors-click',
  /** Per-installer split for the install snippet copy events. The
   *  audit traced funnel breakage to the inability to tell pip from uv
   *  from pipx from docker. ``install-snippet-copy`` is still emitted
   *  alongside (with ``variant`` prop) so historical reports keep
   *  working; these split events are what the new report queries. */
  PypiInstallPipCopy: 'pypi-install-pip-copy',
  PypiInstallUvCopy: 'pypi-install-uv-copy',
  PypiInstallPipxCopy: 'pypi-install-pipx-copy',
  PypiInstallDockerCopy: 'pypi-install-docker-copy',
  /** Tier card click on /sponsors. Prop: ``tier`` ∈ {'5mo','25mo',
   *  '100mo','500mo','25one'}. Distinct from ``sponsor-tile-click``
   *  (which is the rail tile, not a tier ladder row). */
  SponsorsTierClick: 'sponsors-tier-click',
  /** FAQ accordion expand on /sponsors (and the homepage FAQ - same
   *  event so the expand-rate report aggregates). Prop: ``question``
   *  is the first 40 chars (kebab-cased) of the question, never the
   *  full string. */
  SponsorsFaqExpand: 'sponsors-faq-expand',
  /** Cost calculator input change. Debounced 1s in the call site so
   *  one keystroke doesn't fire a hundred events. Prop: ``input`` ∈
   *  {'claude','codex','cursor'}. Magnitude is reported as a coarse
   *  bucket (none/low/mid/high) - never the literal dollar value. */
  CostInputChange: 'cost-input-change',
  /** Fired exactly once per page load when the calculator first
   *  renders a non-zero saving band. Prop: ``band`` is the magnitude
   *  bucket ('lt100' | '100-500' | '500-2k' | '2k-plus'). */
  CostResultShown: 'cost-result-shown',
  /** Outbound click to getbernstein.com (legacy 301 host). The audit
   *  noted zero captures from the redirect host - this fires when
   *  someone clicks an in-page anchor that targets it, so we at
   *  least see intent before the 301 strips referrer info. */
  OutboundGetbernstein: 'outbound-getbernstein',

  // --- scroll depth + form events ---
  /** Hero CTA region scrolled into view. Fires once per session (keyed
   *  in sessionStorage). The legacy ``cta-hero-view`` is fired on mount
   *  by RightRail; this distinct event measures *scrolled-to-view*
   *  rather than *rail-mounted*, which on tall mobile viewports is
   *  often the more accurate funnel-step-1. */
  HeroCtaInView: 'hero-cta-inview',
  /** Comparison section scrolled into view. Fires once per session.
   *  The audit noted comparison was a strong dwell signal and we had no
   *  way to measure "did they reach it" - only anchor-clicks landed via
   *  hash pageviews. */
  CompareSectionInView: 'compare-section-inview',
  /** Forward-deployed section scrolled into view. Reserved - currently
   *  not rendered on the live homepage (the section was collapsed in
   *  the v2 redesign). Kept here so any /why-bernstein or future page
   *  that re-introduces the section can wire useInViewOnce immediately. */
  ForwardDeployedInView: 'forward-deployed-inview',
  /** Newsletter form scrolled into view. Distinct from a submit; lets
   *  the funnel report split scroll-reach vs intent-to-fill vs success. */
  NewsletterView: 'newsletter-view',
  /** Newsletter form submission attempted. Fires on submit before we
   *  know the result, so the report can compute (success + error) /
   *  submit as the API health rate. The legacy ``email-capture-submit``
   *  ONLY fires on confirmed success - we keep that rule and add
   *  ``newsletter-submit`` as the broader attempt counter. */
  NewsletterSubmit: 'newsletter-submit',
  /** Newsletter form confirmed-subscribe (mirror of the legacy
   *  ``email-capture-submit`` semantic). Both events are emitted on
   *  success so historical reports keep working and the new report
   *  uses ``newsletter-success`` for the canonical funnel step. */
  NewsletterSuccess: 'newsletter-success',
  /** Newsletter form error (non-2xx, dev-noop, network). Mirrors
   *  legacy ``email-capture-error`` with a stable name aligned with
   *  the new submit/success pair. */
  NewsletterError: 'newsletter-error',
  /** Newsletter form input first-focus. Fires once per component
   *  mount (ref-flag gated) so a user tabbing in/out of the field
   *  doesn't inflate the count. The funnel report uses this to split
   *  ``view → focus → submit → success`` so we can tell "saw and
   *  ignored" (view but no focus) from "tried and bailed" (focus but
   *  no submit). Per research-004 brief 2026-05-09: this was the only
   *  instrumentation gap in the otherwise-complete newsletter funnel. */
  NewsletterFocus: 'newsletter-focus',
  /** Sponsor footer-link click. Distinct from ``gh-sponsors-click``
   *  (which fires from any sponsor anchor) so the /sponsors-funnel
   *  report can isolate footer-attributed sponsor traffic. The audit
   *  noted /sponsors got 1 organic landing in 3 days - the footer
   *  link is the cheapest discoverability lever. */
  SponsorsFooterClick: 'sponsors-footer-click',
  /** Contact-form submission (forte@bernstein.run mailto fallback,
   *  enterprise-form when shipped). Reserved name; no live form yet.
   *  Listed here so a future contact form wires to a typed event
   *  instead of inventing a new name in the call site. */
  ContactFormSubmit: 'contact-form-submit',

  // --- research-003 (audit 2026-05-09) - landing dark-zone inview events ---
  /** PipelineRailMini scrolled into view. The 4-stage band sits
   *  directly under the hero; before this event was added the entire
   *  section was a telemetry dark zone. Pairs with the landing
   *  scroll-50pct/scroll-90pct events introduced by mounting
   *  ReadingProgress on app/page.tsx. */
  PipelineRailInView: 'pipeline-rail-inview',
  /** AuditLogEvidence scrolled into view. The terminal-mock centerpiece
   *  is the page's strongest enterprise differentiator; without this
   *  event we had no signal that anyone reached it. Audit research-003
   *  classified this as the highest-value missing inview event. */
  AuditLogEvidenceInView: 'audit-log-evidence-inview',
  /** FaqV2 scrolled into view. Last objection-handling block before
   *  the email cap; reach % here informs whether FAQ content is being
   *  consumed or merely scrolled past on the way to the footer. */
  FaqInView: 'faq-inview',

  // --- 2026-05-10 - funnel denominator + scope/discoverability events ---
  /** Right-rail mounted in the DOM. Replaces the legacy
   *  ``cta-hero-view`` semantically: same hook point, new name. Lifetime
   *  ratio inview/mount = 58/214 = 27 %, so any funnel using
   *  ``cta-hero-view`` as denominator under-stated rates by ~73 %.
   *  Pair with ``HeroCtaInView`` to compute mount → scrolled-to-view.
   *  action-002 ticket (2026-05-10). */
  CtaHeroMount: 'cta-hero-mount',
  /** DocsBot scope-hint shown to the visitor. Fires once per session
   *  (sessionStorage flag) on input first-focus so the funnel can split
   *  "saw the scope hint" from "submitted blind". Mitigates the 254/176
   *  decline/submit ratio by signalling corpus boundaries before submit.
   *  action-001 ticket (2026-05-10). */
  DocsBotScopeHintView: 'docs-bot-scope-hint-view',
  /** Click on the nav "→ repo" pill that takes the visitor straight
   *  to github.com/sipyourdrink-ltd/bernstein. Distinct from
   *  ``GithubClick`` (any github anchor) and ``GithubStarClick``
   *  (the rail star CTA). Prop ``source`` ∈ {'nav'} for now.
   *  action-003 ticket (2026-05-10). */
  GhSkipToRepoClick: 'gh-skip-to-repo-click',

  // --- 2026-05-13 - blog cross-link instrumentation (action-004) ---
  /** Click on an in-app internal link surfaced by a curated link graph
   *  (today: the RelatedPosts strip below every /blog/<slug> body). Prop
   *  ``target_blog`` carries the destination slug; ``source`` names the
   *  surface that emitted the click ('related-posts' for the strip,
   *  reserved for future surfaces like in-prose SmartLinks). Distinct
   *  from outbound clicks (those live under ``trackOutbound``) and from
   *  the nav prev/next anchor (no event today; could be added later).
   *  Powers the blog → blog traversal report mentioned in the ticket. */
  InternalLinkClick: 'internal-link-click',

  // --- 2026-05-17 - conv-001 sticky pricing CTA + cost A/B ---
  /** Sticky `view pricing →` CTA mounted on `/`. Fires once per
   *  session when the component renders (after the dismiss-cookie
   *  check passes). Pairs with `pricing-peek-click` and
   *  `pricing-peek-dismiss` for the funnel report. */
  PricingPeekImpression: 'pricing-peek-impression',
  /** Visitor clicked the sticky `view pricing →` CTA on `/`. */
  PricingPeekClick: 'pricing-peek-click',
  /** Visitor closed the sticky CTA. Sets a 7-day cookie so the
   *  pointer stays dismissed for that visitor. */
  PricingPeekDismiss: 'pricing-peek-dismiss',
  /** Fires once per session on `/cost`, seeding the
   *  `pricing-variant=a|b` dimension into the events stream. The
   *  variant is picked from a 90-day cookie set on first visit. */
  CostVariantView: 'cost-variant-view',

  // --- 2026-05-17 - conv-002 sponsor strip + social proof ---
  /** SponsorStrip mounted into the fold below the hero. Fires once
   *  per session via IntersectionObserver so the report has a base
   *  for the `sponsor-strip-click / sponsor-strip-impression` ratio. */
  SponsorStripImpression: 'sponsor-strip-impression',
  /** Visitor clicked one of the sponsor logos in the fold strip.
   *  Prop: `sponsor` = canonical login of the clicked sponsor. */
  SponsorStripClick: 'sponsor-strip-click',
  /** SocialProofStrip mounted into the fold. Same IntersectionObserver
   *  contract as the sponsor strip; lets the operator see whether the
   *  badges row is actually being reached on mobile. */
  SocialProofImpression: 'social-proof-impression',

  // --- digest + watch + RSS ---
  /** Weekly-digest pointer scrolled into view. Distinct from
   *  `NewsletterView` (monthly post) so the two surfaces stay
   *  separable. Emitted by the blog-post footer link. */
  DigestSignupImpression: 'digest-signup-impression',
  /** GitHub watch CTA mounted into the hero region. */
  WatchCtaImpression: 'watch-cta-impression',
  /** Visitor clicked the GitHub watch CTA. The anchor href points
   *  to /watchers/new on the repo; the event fires before nav. */
  WatchCtaClick: 'watch-cta-click',
  /** Visitor clicked a visible RSS subscribe link (footer or /blog
   *  page). Distinct from the `<link rel="alternate">` auto-discover
   *  path which we can't instrument. Prop: `source` ∈ {footer,blog}. */
  RssSubscribeClick: 'rss-subscribe-click',

  // --- 2026-05-17 - conv-funnel canonical events (EVENT_TAXONOMY §4) ---
  // Parallel-emit alongside existing legacy events for a 30-day overlap
  // window so the operator's pre-cutover SQL keeps working while the
  // canonical funnel events accumulate baseline volume.
  //
  // Migration plan (per EVENT_TAXONOMY §6):
  //   T0    : ship new name alongside the old one. Both fire on every trigger.
  //   T+30d : switch dashboards & SQL to the new name only.
  //   T+60d : remove the old emitter.
  //
  // PII rule: every event below carries only enum / numeric props (source,
  // surface, latency_ms etc). No emails, no URLs, no free-form text.

  /** Form-submission landing → DB succeeded. Parallel-emit alongside
   *  ``newsletter-success`` + the legacy ``email-capture-submit`` goal.
   *  Becomes the canonical "captured a contact" event after the 30-day
   *  overlap. Prop: ``source`` = which form (``email-capture``, etc.). */
  Signup: 'signup',
  /** A click on a sponsor-conversion anchor confirmed by an outbound
   *  navigation. Parallel-emit alongside ``gh-sponsors-click`` /
   *  ``sponsor-tile-click``. The canonical "sponsor-intent confirmed"
   *  event. Prop: ``source`` = which surface (``hero-rail``,
   *  ``sponsors-page-cta``, ``sponsors-tier`` etc). */
  SponsorConversion: 'sponsor-conversion',
  /** Returning visitor first seen >24h ago. Emitted at most once per
   *  session on ``DOMContentLoaded`` from ``RightRail`` mount. Powered
   *  by a localStorage key ``bernstein:first-seen``. Prop: ``days_since``
   *  (coarse bucket: 1, 2, 3-7, 7-30, 30+) and a session-emit gate so
   *  re-renders inside the same tab don't double-count. */
  Day2Return: 'day-2-return',
  /** Post-click verification that a GitHub outbound clicker actually
   *  ended up returning from github.com (heuristic confirmation of a
   *  star). Cookie set in ``track-outbound.ts`` when destination is
   *  ``github.com``; the helper in ``RightRail`` mount checks
   *  ``document.referrer`` host + cookie freshness on next page load
   *  and emits this. Prop: ``source`` matches the original outbound
   *  surface so the report can attribute the confirmed star back to
   *  the originating CTA. */
  GhStarConfirmed: 'gh-star-confirmed',

  // --- 2026-05-12 - bot-filter segmentation (action-006) ---
  /** Fires INSTEAD OF the original event when the client-side bot
   *  filter classifies the visitor as a bot (webdriver flag, crawler
   *  UA token, or zero-input + empty UA). Lets the operator see the
   *  bot rate without polluting the headline metrics. The original
   *  event name is passed as the ``blocked`` prop so the report can
   *  segment by which funnel step was contaminated. */
  BotFiltered: 'bot-filtered',
  /** Fires ALONGSIDE the original event when the filter is uncertain
   *  (e.g. zero input observed but UA populated and webdriver flag
   *  not set). Operator subtracts this from the headline count to
   *  get a confidence-adjusted human cohort. Per ticket: bias toward
   *  over-counting humans - never silently drop an event. */
  BotSuspected: 'bot-suspected',
} as const;

export type UmamiEventName = (typeof UmamiEvent)[keyof typeof UmamiEvent];

/** Whitelisted prop value types - keep PII out of the wire by
 *  construction. Numbers carry no meaning beyond magnitude buckets. */
export type EventProps = Record<
  string,
  string | number | boolean | null | undefined
>;

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: EventProps) => void;
      identify?: (data?: EventProps) => void;
    };
  }
}

/** Coarse magnitude bucket for dollar amounts so we never wire literal
 *  spend numbers into Umami. Used by CostInputChange + CostResultShown.
 *  Buckets line up with the ``/cost`` calculator's plausible inputs. */
export function magnitudeBucket(usd: number): 'none' | 'low' | 'mid' | 'high' {
  if (!Number.isFinite(usd) || usd <= 0) return 'none';
  if (usd < 100) return 'low';
  if (usd < 500) return 'mid';
  return 'high';
}

/** Coarse band bucket for the calculator's saving band. */
export function savingBandBucket(
  savingHigh: number,
): 'zero' | 'lt100' | '100-500' | '500-2k' | '2k-plus' {
  if (!Number.isFinite(savingHigh) || savingHigh <= 0) return 'zero';
  if (savingHigh < 100) return 'lt100';
  if (savingHigh < 500) return '100-500';
  if (savingHigh < 2000) return '500-2k';
  return '2k-plus';
}

/** Operator-traffic kill-switch. Reads
 *  ``localStorage["umami:disabled"]``; when ``"true"`` we never call
 *  through to ``window.umami.track``. Safe under SSR. */
export function isUmamiDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem('umami:disabled') === 'true';
  } catch {
    /* localStorage can throw in private mode / iframe sandboxes - treat
       as not-disabled so production tracking still works. */
    return false;
  }
}

/** Programmatic event emit. Prefer ``data-umami-event`` on anchors so
 *  the auto-tracker fires before navigation; use ``track()`` from
 *  ``onClick`` / ``useEffect`` only when the markup-level attribute
 *  isn't enough (e.g. fire-once-per-page, debounced inputs).
 *
 *  Routing rules (post-action-006, 2026-05-12):
 *   - ``bot-filtered`` and ``bot-suspected`` events bypass the filter
 *     (they ARE the filter's output; recursing would loop forever and
 *     also defeat the segmentation report).
 *   - All other events consult ``isLikelyBot()``:
 *       - ``bot``      → emit ONLY ``bot-filtered`` with ``{ blocked: <name> }``
 *       - ``suspected``→ emit BOTH original AND ``bot-suspected``
 *       - ``human``    → emit original only (original behaviour). */
function emitRaw(event: string, props?: EventProps): void {
  try {
    window.umami?.track(event, props);
  } catch {
    /* tracker not loaded / blocked - never let a tracking failure
       throw into the user-facing component tree. */
  }
}

export function track(event: UmamiEventName, props?: EventProps): void {
  if (typeof window === 'undefined') return;
  if (isUmamiDisabled()) return;

  /* Filter output events bypass the filter - they describe the filter's
     own decisions and recursing through it makes no sense. */
  if (event === UmamiEvent.BotFiltered || event === UmamiEvent.BotSuspected) {
    emitRaw(event, props);
    return;
  }

  const verdict = isLikelyBot();
  if (verdict === 'bot') {
    /* Replace the original event with a single ``bot-filtered`` marker
       carrying the blocked event name as a prop. The report can group
       by ``blocked`` to see which funnel steps were most contaminated
       (typically ``hero-cta-inview``). */
    emitRaw(UmamiEvent.BotFiltered, { blocked: event });
    return;
  }
  if (verdict === 'suspected') {
    /* Bias toward over-counting humans: emit the original AND a
       ``bot-suspected`` shadow event with the original name as a
       prop. Operator subtracts the shadow from the headline to get
       a confidence-adjusted count without losing the original
       signal. */
    emitRaw(event, props);
    emitRaw(UmamiEvent.BotSuspected, { shadow: event });
    return;
  }

  emitRaw(event, props);
}

/**
 * Ordered step names for the one sequence this site reports on. They
 * are joined per session inside a 60-minute window, so every step has
 * to fire from the live page, in order, or the sequence reads as
 * abandoned at the first one that did not.
 *
 * History: the v2 redesign (HeroV2 / RightRail, 2026-05-09) renamed
 * step-1 to `hero-cta-inview` + `cta-hero-mount` and step-3 to
 * `outbound-github` for cross-property attribution. Step-1 and step-3
 * stopped firing under the canonical names entirely on the live home,
 * which dropped the funnel pass-rate to 0% across 21 hero pageviews in
 * the trailing 7d window (operator screenshot, 2026-05-14).
 *
 * The fix wires the canonical names back as a SHADOW emit alongside
 * the new semantic ones. We do not rename the new events (the
 * cross-property attribution and bot-filter cohorts depend on
 * `outbound-github` / `hero-cta-inview`). We just put the funnel
 * step name back in flight.
 *
 * Helper rules:
 *   - One canonical step per call (no fan-out).
 *   - Respects the bot filter via `track()` (no direct emitRaw bypass).
 *   - Session-storage gate keyed per `step` so a re-render does not
 *     double-count. The dashboard joins on session, so a duplicate
 *     fire inside the same session wouldn't move the visitor count
 *     anyway - the gate just keeps the per-event raw count honest.
 */
const FUNNEL_STEPS = {
  cta: UmamiEvent.CtaHeroView,
  install: UmamiEvent.InstallSnippetCopy,
  ghClick: UmamiEvent.GithubClick,
  ghStar: UmamiEvent.GithubStarClick,
} as const;

export type FunnelStep = keyof typeof FUNNEL_STEPS;

export function emitFunnelStep(step: FunnelStep, props?: EventProps): void {
  if (typeof window === 'undefined') return;
  if (isUmamiDisabled()) return;
  const eventName = FUNNEL_STEPS[step];
  const key = `umami:funnel:${eventName}`;
  try {
    if (window.sessionStorage?.getItem(key) === '1') {
      /* For repeating events (install copies, sequential github clicks)
         we still want every press to count, so click-fired steps pass
         `props.repeatable = true` to bypass the gate. Inview / mount
         events are one-shot by their nature so they keep the gate. */
      if (!props || props.repeatable !== true) return;
    }
    window.sessionStorage?.setItem(key, '1');
  } catch {
    /* sessionStorage can throw in iframe sandboxes / private mode -
       fall through and emit; duplicate-fire beats missed-fire. */
  }
  /* Strip the routing flag before sending to Umami so the event prop
     list stays the enum-and-bucket-only shape the PII rule guarantees. */
  const wireProps =
    props && 'repeatable' in props
      ? Object.fromEntries(
          Object.entries(props).filter(([k]) => k !== 'repeatable'),
        )
      : props;
  track(eventName, wireProps);
}
