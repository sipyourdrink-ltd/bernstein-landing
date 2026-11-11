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
  ClickPypiOut: 'click-pypi-out',
  SponsorNoteShown: 'sponsor-note-shown',
  SponsorTileClick: 'sponsor-tile-click',
  SponsorClick: 'sponsor-click',
  SponsorNoteDismiss: 'sponsor-note-dismiss',
  SponsorNoteClick: 'sponsor-note-click',
  CostTileClick: 'cost-tile-click',

  GhSponsorsClick: 'gh-sponsors-click',
  PypiInstallPipCopy: 'pypi-install-pip-copy',
  PypiInstallUvCopy: 'pypi-install-uv-copy',
  PypiInstallPipxCopy: 'pypi-install-pipx-copy',
  PypiInstallDockerCopy: 'pypi-install-docker-copy',
  SponsorsTierClick: 'sponsors-tier-click',
  SponsorsFaqExpand: 'sponsors-faq-expand',
  CostInputChange: 'cost-input-change',
  CostResultShown: 'cost-result-shown',
  OutboundGetbernstein: 'outbound-getbernstein',
  HeroCtaInView: 'hero-cta-inview',
  CompareSectionInView: 'compare-section-inview',
  ForwardDeployedInView: 'forward-deployed-inview',
  NewsletterView: 'newsletter-view',
  NewsletterSubmit: 'newsletter-submit',
  NewsletterSuccess: 'newsletter-success',
  NewsletterError: 'newsletter-error',
  NewsletterFocus: 'newsletter-focus',
  SponsorsFooterClick: 'sponsors-footer-click',
  ContactFormSubmit: 'contact-form-submit',
  PipelineRailInView: 'pipeline-rail-inview',
  AuditLogEvidenceInView: 'audit-log-evidence-inview',
  FaqInView: 'faq-inview',
  CtaHeroMount: 'cta-hero-mount',
  DocsBotScopeHintView: 'docs-bot-scope-hint-view',
  GhSkipToRepoClick: 'gh-skip-to-repo-click',
  InternalLinkClick: 'internal-link-click',
  SponsorStripImpression: 'sponsor-strip-impression',
  SponsorStripClick: 'sponsor-strip-click',
  SocialProofImpression: 'social-proof-impression',
  DigestSignupImpression: 'digest-signup-impression',
  WatchCtaImpression: 'watch-cta-impression',
  WatchCtaClick: 'watch-cta-click',
  RssSubscribeClick: 'rss-subscribe-click',
  Signup: 'signup',
  SponsorConversion: 'sponsor-conversion',
  BotFiltered: 'bot-filtered',
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
