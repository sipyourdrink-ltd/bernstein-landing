'use client';

/**
 * ThinkingShimmer - placeholder shown while the bot is mid-stream and
 * no tokens have arrived yet.
 *
 * Two phases tied to elapsed time since `startedAt`:
 *
 *   0 - 2000 ms  →  bars phase
 *     three sliding bars (the legacy shimmer). Carries the eye for
 *     normal-latency queries (<2s); they never see the folder phase.
 *
 *   2000 ms+     →  folder phase
 *     1-bit Macintosh System-7 vibe: a folder opens, three papers slide
 *     out and shimmer in mid-air, then return. Below it, a single mono
 *     status line cycles through four stages mirroring the gateway
 *     pipeline (rewrite → retrieve → rerank → draft). The status line
 *     is deliberately specific ("scanning ~2,500 chunks") so the visitor
 *     reads it as honest progress, not a generic "thinking…".
 *
 * `prefers-reduced-motion`: motion is disabled in CSS; the status line
 * still cycles (text-only rotation respects the spec) so the visitor
 * still sees evidence of progress.
 */
import { useEffect, useState, type ReactElement } from 'react';

interface ThinkingShimmerProps {
  /** Wall-clock ms when the stream started - used to compute elapsed.
      null means "no stream in flight"; the component renders nothing. */
  startedAt: number | null;
}

/* Folder appears almost immediately. Operator's call: at the previous
   2000ms threshold, fast queries never showed it (visible for a few ms
   only, then tokens replaced it). Drop to 200ms - long enough that a
   sub-100ms cache hit doesn't flash the folder, short enough that
   anything else is visibly "the docs are being looked through". */
const FOLDER_PHASE_AFTER_MS = 200;
const STATUS_CYCLE_MS = 850;

const STATUS_LINES = [
  'scanning ~2,500 chunks across the docs…',
  'ranking the best matches…',
  'rereading the top passages…',
  'drafting an answer…',
];

export function ThinkingShimmer({ startedAt }: ThinkingShimmerProps): ReactElement | null {
  const [now, setNow] = useState<number>(() => Date.now());
  const [statusIndex, setStatusIndex] = useState<number>(0);

  /* Tick every ~250ms while we're showing - enough for the bars→folder
     hand-off to be perceived as snappy without burning the main thread. */
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  /* Status line cycle - independent of the phase tick so it stays
     readable. Last line ("drafting an answer…") sticks: once we reach
     it, we don't loop back to "scanning…" because that would make the
     visitor doubt progress. */
  useEffect(() => {
    if (startedAt === null) {
      setStatusIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setStatusIndex((cur) => (cur < STATUS_LINES.length - 1 ? cur + 1 : cur));
    }, STATUS_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (startedAt === null) return null;

  const elapsed = now - startedAt;
  const showFolder = elapsed >= FOLDER_PHASE_AFTER_MS;

  if (!showFolder) {
    return (
      <div className="docs-bot-shimmer" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    );
  }

  return (
    <div className="docs-bot-thinking" role="status" aria-live="polite">
      <FolderArt />
      <p className="docs-bot-thinking-status">{STATUS_LINES[statusIndex]}</p>
    </div>
  );
}

/**
 * 1-bit Macintosh System-7 folder. Lid lifts; three sheets slide out,
 * shimmer for a beat, slide back; lid closes. Pure SVG + class-based
 * CSS animation - no inline styles, so prefers-reduced-motion can
 * disable the transforms cleanly.
 *
 * The "stippled" greys are dotted patterns rather than fills so the
 * effect reads as classic Mac dithering (e.g. desktop pattern, drag
 * outline) rather than a modern flat grey.
 */
function FolderArt(): ReactElement {
  return (
    <svg
      className="docs-bot-folder"
      viewBox="0 0 160 110"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Classic 1-bit dither - sparse dots, like Mac's lightGray pattern */}
        <pattern
          id="docs-bot-stipple"
          x="0"
          y="0"
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <rect width="4" height="4" fill="var(--bg-paper, #f7f1e8)" />
          <circle cx="0.6" cy="0.6" r="0.6" fill="currentColor" />
          <circle cx="2.6" cy="2.6" r="0.6" fill="currentColor" />
        </pattern>
      </defs>

      {/* PAPERS - three sheets that slide out, shimmer, return.
          Drawn first so the folder front overlaps them on close. */}
      <g className="docs-bot-folder-papers">
        <rect className="docs-bot-folder-paper p1" x="42" y="48" width="34" height="44" rx="1" />
        <rect className="docs-bot-folder-paper p2" x="60" y="40" width="34" height="48" rx="1" />
        <rect className="docs-bot-folder-paper p3" x="80" y="46" width="34" height="46" rx="1" />
        {/* writing scribbles on the front-most sheet */}
        <line className="docs-bot-folder-scribble s1" x1="65" y1="50" x2="89" y2="50" />
        <line className="docs-bot-folder-scribble s2" x1="65" y1="56" x2="85" y2="56" />
        <line className="docs-bot-folder-scribble s3" x1="65" y1="62" x2="87" y2="62" />
        <line className="docs-bot-folder-scribble s4" x1="65" y1="68" x2="83" y2="68" />
      </g>

      {/* FOLDER BODY - back of the wallet, with a stippled fill to read
          as Mac System lightGray. */}
      <g className="docs-bot-folder-body">
        {/* Tab - sits at the top-left, classic Mac folder cue */}
        <path
          d="M 26 30 L 56 30 L 60 38 L 26 38 Z"
          className="docs-bot-folder-tab"
        />
        {/* Wallet body */}
        <rect
          x="20"
          y="36"
          width="120"
          height="58"
          rx="2"
          className="docs-bot-folder-wallet"
        />
        {/* Lid - pivots open from the rear-left edge */}
        <path
          className="docs-bot-folder-lid"
          d="M 20 38 L 140 38 L 140 60 L 20 60 Z"
        />
      </g>
    </svg>
  );
}
