'use client';

/**
 * CitationChip - inline `[n]` chip with hover/keyboard preview popover.
 *
 * Positioning model: a portal-rendered absolutely-positioned div.
 * We previously used the HTML `popover="manual"` API (paints in the
 * browser top layer), but without anchor positioning (still Chrome-only
 * and recently-added) the popover lands at viewport 0,0 - which is
 * what live operators saw on bernstein.run after the variant-2 deploy.
 * Using a portal + computed rect dodges:
 *   - parent overflow:hidden / transform clipping
 *   - z-index gymnastics with sticky headers
 *   - scroll-container ancestor relativity
 * The cost is one `getBoundingClientRect()` on open and a small
 * scroll/resize listener while open. No third-party positioner.
 *
 * Behavioural contract:
 *   - hover, focus, or keyboard activation opens the preview.
 *   - click on the chip navigates to the source URL with `#chunkId`
 *     when present.
 *   - title is ellipsised at 32 chars in the preview header; full
 *     title shows in the popover body.
 *   - missing citation (chip exists but `citations.get(n)` is null)
 *     renders a literal `[n]` so we never lose information.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Citation } from './types.ts';
import { chipHrefState } from './cite-helpers.ts';

interface CitationChipProps {
  n: number;
  citation: Citation | undefined;
}

const TITLE_CAP = 32;
/* Width matches the CSS .docs-bot-cite-popover { width: 320px }.
   Kept as a constant here so the clamp math doesn't have to read
   the popover element after first paint. */
const POPOVER_WIDTH = 320;
const VIEWPORT_MARGIN = 8;

/**
 * Strip the structural markdown that the gateway leaves in the 240-char
 * excerpt. The full answer renders rich markdown via AnswerMarkdown,
 * but a chip popover is a tiny preview - flat readable prose beats
 * literal `**` and triple-backtick fences in a 320×~140px card.
 *
 * Rules:
 *   - `**bold**` → bold (drop markers)
 *   - `*italic*` / `_italic_` → italic (drop markers)
 *   - `` `code` `` → code (drop markers)
 *   - fenced ``` blocks → keep contents, drop fences
 *   - leading `# ` headings → drop the marker
 *   - leading `- ` / `* ` / `1. ` list markers → drop
 *   - `> ` quote markers → drop
 *   - `[text](url)` → text only (the popover already has its own link)
 *   - collapse repeated whitespace + multi-newlines into single spaces
 *
 * 240 chars in, 240 chars (or fewer) out. Pure regex, no parser, no
 * dep - keeps the chip code in the docs-bot route's lean budget.
 */
function stripMarkdownForExcerpt(s: string): string {
  return s
    /* fenced code: keep inner, drop fences */
    .replace(/```[a-z]*\n?([\s\S]*?)```/gi, '$1')
    /* inline code */
    .replace(/`([^`]+)`/g, '$1')
    /* bold + italic (longest first) */
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
    /* links → keep label, drop href */
    .replace(/\[([^\]]+)\]\((?:https?:|mailto:|#)[^)]*\)/g, '$1')
    /* leading line markers - only at start of a line */
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    /* collapse whitespace */
    .replace(/\s+/g, ' ')
    .trim();
}

/* URL safety + linkability helpers live in `./cite-helpers.ts` so the
   `node --test --experimental-strip-types` runner can unit-test them
   without resolving react / react-dom. See that file for `safeHref`
   and `chipHrefState`. */

/* Telemetry helper. Keeps the component free of conditional imports
   and works in SSR by guarding `window`. */
function trackCiteClick(n: number, url: string): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { umami?: { track: (name: string, data?: Record<string, unknown>) => void } };
  w.umami?.track('docs-bot-cite-click', { n, url });
}

export function CitationChip({ n, citation }: CitationChipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  /* `mounted` defers portal render until after first client commit.
     SSR can't render into document.body, and on hydration we need a
     real DOM node before createPortal sees it. */
  const [mounted, setMounted] = useState(false);
  const chipRef = useRef<HTMLAnchorElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const popoverId = useId();

  /* If we don't have citation metadata yet (chip was emitted before
     the citation event), still render so the marker number is stable
     and the chip becomes interactive when the metadata lands. */
  const hasCitation = Boolean(citation);
  const { href, isLinkable } = chipHrefState(citation);

  useEffect(() => {
    setMounted(true);
  }, []);

  /**
   * Compute the popover's viewport-relative top/left from the chip's
   * bounding rect. Width is fixed at 320px in CSS; we shift left if
   * the chip sits near the right edge. The popover renders into
   * document.body so coordinates are page-absolute (rect + scroll).
   */
  const positionPopover = useCallback(() => {
    const chip = chipRef.current;
    if (!chip) return;
    const r = chip.getBoundingClientRect();
    let left = r.left;
    if (left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN);
    }
    setPos({
      top: r.bottom + 4 + window.scrollY,
      left: left + window.scrollX,
    });
  }, []);

  /* Re-read the rect synchronously when `open` flips on so the first
     paint already has the correct coordinates. useLayoutEffect runs
     before the browser commits, so the popover never appears at the
     stale (or null) position for a frame. */
  useLayoutEffect(() => {
    if (open) positionPopover();
  }, [open, positionPopover]);

  /* Open via hover / focus / keyboard. We don't toggle on hover-leave
     because a tiny gap between chip and popover would close it; we
     close on blur or when the pointer leaves both chip and popover. */
  const handleEnter = useCallback(() => {
    if (!hasCitation) return;
    setOpen(true);
  }, [hasCitation]);

  /* Hover-leave with a small grace period: if the pointer moves into
     the popover itself we keep it open. */
  const handleLeave = useCallback((e: React.PointerEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && popRef.current?.contains(related)) return;
    setOpen(false);
  }, []);

  /* Show on Enter/Space too. The chip is itself an anchor so Enter
     navigates by default - we let it; the modal cite preview is for
     hover/focus inspection, not the click target. */
  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      popRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    }
  }, [open]);

  /* Reposition on scroll/resize while open. Listeners attach only
     while the popover is open so idle pages don't run the handler. */
  useEffect(() => {
    if (!open) return;
    const onScroll = () => positionPopover();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, positionPopover]);

  const onClick = useCallback(() => {
    if (citation) trackCiteClick(n, citation.url);
  }, [citation, n]);

  const truncatedTitle = citation && citation.title.length > TITLE_CAP
    ? citation.title.slice(0, TITLE_CAP - 1) + '…'
    : citation?.title ?? '';

  const popoverNode = open && hasCitation && pos && mounted
    ? createPortal(
        <div
          ref={popRef}
          id={popoverId}
          role="dialog"
          aria-label={`citation ${n} preview`}
          className="docs-bot-cite-popover"
          style={{
            position: 'absolute',
            top: pos.top,
            left: pos.left,
            zIndex: 60,
          }}
          onPointerEnter={() => setOpen(true)}
          onPointerLeave={() => setOpen(false)}
        >
          <div className="docs-bot-cite-popover-header">
            <span className="docs-bot-cite-popover-num">[{n}]</span>
            <span className="docs-bot-cite-popover-title" title={citation!.title}>
              {truncatedTitle}
            </span>
            {typeof citation!.score === 'number' ? (
              /* Post-rerank relevance hint. Two decimals is enough
                 signal ("strong / weak match") without implying the
                 score is a calibrated probability. */
              <span className="docs-bot-cite-popover-score">
                match {citation!.score.toFixed(2)}
              </span>
            ) : null}
          </div>
          {citation!.section ? (
            <p className="docs-bot-cite-popover-section">{citation!.section}</p>
          ) : null}
          <p className="docs-bot-cite-popover-excerpt">
            {stripMarkdownForExcerpt(citation!.excerpt)}
          </p>
          {isLinkable ? (
            <a
              className="docs-bot-cite-popover-open"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClick}
            >
              open doc →
            </a>
          ) : (
            <span className="docs-bot-cite-popover-open docs-bot-cite-popover-open--unavailable">
              source link unavailable
            </span>
          )}
        </div>,
        document.body,
      )
    : null;

  /* Render as an anchor only when the citation has a usable URL.
     Otherwise the chip is a non-interactive marker - still visible
     for grounding context, but no longer a dead `<a href="#">` that
     navigates nowhere and leaves a stray `#` on the address bar. */
  const sharedProps = {
    ref: chipRef as React.Ref<HTMLAnchorElement>,
    className: 'docs-bot-cite-chip',
    'data-has-citation': hasCitation ? 'true' : 'false',
    'data-linkable': isLinkable ? 'true' : 'false',
    'aria-describedby': open ? popoverId : undefined,
    'aria-label': citation
      ? `citation ${n}: ${citation.title}`
      : `citation ${n}`,
    onPointerEnter: handleEnter,
    onPointerLeave: handleLeave,
    onFocus: handleEnter,
    onBlur: handleLeave as unknown as (e: React.FocusEvent) => void,
    onKeyDown: handleKey,
  };

  return (
    <>
      {isLinkable ? (
        <a
          {...sharedProps}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
        >
          [{n}]
        </a>
      ) : (
        <span
          {...(sharedProps as unknown as React.HTMLAttributes<HTMLSpanElement>)}
          role="note"
        >
          [{n}]
        </span>
      )}
      {popoverNode}
    </>
  );
}
