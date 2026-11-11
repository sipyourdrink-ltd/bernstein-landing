'use client';

/**
 * CtaStrip - one-line three-slot conversion strip rendered below
 * every NON-DECLINED answer card.
 *
 * Differs from <SponsorNote> on two axes:
 *   - SponsorNote is one-time-per-browser, deeper, vulnerable-tone
 *   - CtaStrip is every-answer, shallow, action-tone
 * They render together on the FIRST done; on subsequent dones only
 * the strip shows.
 *
 * Visual: monospace small font, three slots separated by middle-dot
 * glyphs. The install slot copies the command to the clipboard
 * (existing CopyButton pattern); the github + sponsor slots are
 * external links opening in a new tab.
 */
import { useCallback, useState, type ReactElement } from 'react';

import { withUtm } from '@/lib/utm';

const INSTALL_CMD = 'pipx install bernstein';
const GITHUB_URL = withUtm('https://github.com/sipyourdrink-ltd/bernstein', {
  source: 'bernstein.run',
  medium: 'outbound-link',
  campaign: 'docs-bot-cta-strip',
});
const SPONSOR_URL = 'https://github.com/sponsors/chernistry';

export function CtaStrip(): ReactElement {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      /* No clipboard API - let the user select the visible text
         manually. */
      return;
    }
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard write can fail on insecure-context tabs; degrade
         silently - the user can still select + copy manually. */
    }
  }, []);

  return (
    <nav
      className="docs-bot-cta-strip"
      aria-label="next steps"
      role="navigation"
    >
      <button
        type="button"
        className="docs-bot-cta-strip-item docs-bot-cta-strip-install"
        onClick={onCopy}
        aria-label={
          copied
            ? `copied: ${INSTALL_CMD}`
            : `copy install command: ${INSTALL_CMD}`
        }
      >
        <span aria-hidden="true">&rarr;&nbsp;</span>
        <code>{copied ? 'copied' : INSTALL_CMD}</code>
      </button>
      <span className="docs-bot-cta-strip-sep" aria-hidden="true">
        ·
      </span>
      <a
        className="docs-bot-cta-strip-item"
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        star on github
      </a>
      <span className="docs-bot-cta-strip-sep" aria-hidden="true">
        ·
      </span>
      <a
        className="docs-bot-cta-strip-item"
        href={SPONSOR_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        sponsor (alex)
      </a>
    </nav>
  );
}