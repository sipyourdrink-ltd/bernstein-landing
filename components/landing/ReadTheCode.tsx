/**
 * ReadTheCode — quiet "read the code:" strip of links to the browsable
 * views of the source.
 *
 * One mount point today — `footer`, in the footer's Resources group.
 * A `hero` variant used to sit directly under the RightRail CTA cluster
 * too; it was dropped 2026-09-18 so the hero column carries one Docs
 * mention (via Nav) instead of stacking a second one right under it. The
 * `surface` prop and its CSS modifier stay in case a non-footer mount
 * point is needed again - see read-the-code-data.ts for what still
 * renders.
 *
 * Deliberately NOT a badge. Service badges are GitHub-README vernacular
 * and read as foreign on an editorial page; this renders in the site's
 * own mono voice with the same tokens the BetaNotice strip uses
 * (--ink-soft label, --ink link, --rule-strong underline, --accent on
 * hover). It introduces no colours of its own and stays subordinate to
 * the install / GitHub CTAs above it.
 *
 * The links come from READ_THE_CODE_ENTRIES; adding a surface is a
 * one-line data change, not new JSX.
 *
 * Server component — no state, no effects. Umami tracks clicks through
 * `data-umami-event` attributes, which the auto-tracker reads without
 * a client bundle.
 */

import {
  READ_THE_CODE_ENTRIES,
  READ_THE_CODE_LABEL,
  isExternalEntry,
} from './read-the-code-data';

export function ReadTheCode({ surface }: { surface: 'hero' | 'footer' }) {
  return (
    <p className={`read-the-code read-the-code--${surface}`}>
      <span className="read-the-code__label">{READ_THE_CODE_LABEL}:</span>
      {READ_THE_CODE_ENTRIES.map((entry, i) => (
        <span className="read-the-code__item" key={entry.href}>
          {i > 0 && (
            <span className="read-the-code__sep" aria-hidden="true">
              ·
            </span>
          )}
          <a
            className="read-the-code__link"
            href={entry.href}
            /* Same treatment the other external links on this page use
               (see BetaNotice / RightRail): new tab, noopener noreferrer.
               Internal paths get neither. */
            {...(isExternalEntry(entry)
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {})}
            data-umami-event={entry.event}
            data-umami-event-source={surface}
          >
            {entry.label}
          </a>
        </span>
      ))}
    </p>
  );
}
