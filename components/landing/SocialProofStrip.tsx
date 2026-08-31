'use client';

/**
 * SocialProofStrip - external listings row in the fold band.
 *
 * Renders inline under the SponsorStrip. Two independent blocks:
 *
 *   1. `as featured in` - operator-confirmed badge links, sourced from
 *      `./social-proof-data.ts`. Currently empty (issue #35), so the
 *      block is guarded and renders nothing.
 *   2. `mentioned in` - third-party listings that already appear in the
 *      product README's `mentioned in` section, mirrored here so the
 *      site does not lag the README. Entries below are copied from the
 *      README verbatim (names, issue numbers, links); the README is the
 *      source of truth. An entry with no README link renders as plain
 *      text - we never guess a URL.
 *
 * Both blocks render independently: an empty badge list does not
 * suppress the mentions line, and vice versa. Neither depends on the
 * `stars` prop, so a failed /api/stats fetch leaves this strip intact.
 *
 * Deliberately compact: label + a single row of inline text links. No
 * cards, no logos, no badges, no animation. The copy is a flat list of
 * where the project is listed - no claims are made about it.
 */

import { useEffect, useRef } from 'react';
import { track, UmamiEvent } from '@/lib/analytics/events';
import { SOCIAL_PROOF_ITEMS } from './social-proof-data';

interface SocialProofStripProps {
  /**
   * Live GitHub star count from /api/stats; null on outage.
   *
   * Retained in the props contract for backward compatibility with the
   * page-level call site (avoids a coordinated edit across components)
   * but no longer rendered here: per critique 2026-05-17 cut #2, the
   * star count already appears in the RightRail GH row and the
   * CompareStrip header, so a third print on the same scroll was an
   * applause-stack violation. Nothing in this component reads it.
   */
  stars?: number | null;
}

/**
 * A listing that names the project, mirrored from the README's
 * `mentioned in` section.
 */
interface PressMention {
  /** Stable react key. */
  id: string;
  /** Display label, lowercase, as named in the README. */
  label: string;
  /**
   * README link target. Omitted when the README entry carries no link -
   * the label then renders as plain text instead of a guessed URL.
   */
  href?: string;
}

/* Copied from bernstein/README.md, section `mentioned in`. Keep names,
   issue numbers and URLs byte-identical to the README; when the README
   section changes, this list is updated to match, not extended past
   it. */
const PRESS_MENTIONS: readonly PressMention[] = [
  {
    id: 'awesome-python',
    label: 'vinta/awesome-python',
    href: 'https://github.com/vinta/awesome-python',
  },
  {
    id: 'agent-orchestrators',
    label: 'open-source agent orchestrators',
    href: 'https://www.augmentcode.com/tools/open-source-agent-orchestrators',
  },
  {
    id: 'python-weekly-742',
    label: 'python weekly #742',
    href: 'https://www.pythonweekly.com/p/python-weekly-issue-742-april-23-2026',
  },
  {
    id: 'awesome-agentic-patterns',
    label: 'awesome-agentic-patterns',
    href: 'https://github.com/nibzard/awesome-agentic-patterns/blob/main/patterns/deterministic-zero-llm-orchestration.md',
  },
];

export function SocialProofStrip(_props: SocialProofStripProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const key = 'umami:social-proof:imp';
    try {
      if (window.sessionStorage?.getItem(key) === '1') return;
    } catch {
      /* fall through */
    }
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
            try {
              window.sessionStorage?.setItem(key, '1');
            } catch {
              /* fall through */
            }
            track(UmamiEvent.SocialProofImpression);
            io.disconnect();
            return;
          }
        }
      },
      { threshold: [0.4] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hasBadges = SOCIAL_PROOF_ITEMS.length > 0;
  const hasMentions = PRESS_MENTIONS.length > 0;

  // Nothing to show at all - render no section rather than a bare label.
  if (!hasBadges && !hasMentions) {
    return null;
  }

  return (
    <section ref={ref} className="social-proof-strip" aria-label="External listings">
      {hasBadges && (
        <>
          <p id="social-proof-label" className="social-proof-strip__label">
            as featured in
          </p>
          <ul
            className="social-proof-strip__row"
            role="list"
            aria-labelledby="social-proof-label"
          >
            {SOCIAL_PROOF_ITEMS.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-proof-strip__item"
                  aria-label={item.ariaLabel ?? `Featured in: ${item.label}`}
                >
                  <span>{item.label.toLowerCase()}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {hasMentions && (
        <>
          <p id="social-proof-mentions-label" className="social-proof-strip__label">
            mentioned in
          </p>
          <ul
            className="social-proof-strip__row"
            role="list"
            aria-labelledby="social-proof-mentions-label"
          >
            {PRESS_MENTIONS.map((m) => (
              <li key={m.id}>
                {m.href ? (
                  <a
                    href={m.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-proof-strip__item"
                    aria-label={`Mentioned in: ${m.label}`}
                  >
                    <span>{m.label}</span>
                  </a>
                ) : (
                  /* README entry with no link - plain text, no guessed URL. */
                  <span className="social-proof-strip__item">{m.label}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
