'use client';

/**
 * DocsBot - main shell. Owns the input + dispatch and delegates the
 * answer body to AnswerStream / DeclineCard.
 *
 * Variants:
 *   - 'hero' : embedded in the homepage panel (replaces the legacy
 *              AskSummary slot). Compact layout, no heading.
 *   - 'page' : full-width on /ask, sits above the BM25 fallback list.
 *   - 'modal' : inside the SlashCommand dialog; same content tree
 *               but a cancel-on-ESC behaviour the dialog wraps.
 *
 * The shell wires:
 *   - useReducer( sse-reducer ) for state.
 *   - useSseStream() for the wire.
 *   - performance.mark for the latency timeline (devtools traces).
 *   - umami.track for click events.
 *
 * Vertical-space pre-allocation: the answer region has a `min-height`
 * so the layout doesn't shift when streaming begins. CLS spec calls
 * this out as the dominant cause of mid-stream jank.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Citation, Message, SseEvent } from './types.ts';
import { initialState, reducer } from './sse-reducer.ts';
import { useSseStream } from './useSseStream.ts';
import { CitationChip } from './CitationChip.tsx';
import { DeclineCard } from './DeclineCard.tsx';
import { FollowUps } from './FollowUps.tsx';
import { CopyAsMarkdown } from './CopyAsMarkdown.tsx';
import { SponsorNote, shouldShowSponsorNote } from './SponsorNote.tsx';
import { CtaStrip } from './CtaStrip.tsx';
import { ThinkingShimmer } from './ThinkingShimmer.tsx';
import { track, UmamiEvent } from '@/lib/analytics/events';

/* AnswerStream + AnswerMarkdown pull in react-markdown / remark-gfm /
   rehype-sanitize - ~150 kB minified, all of it dead weight before the
   user actually asks something. Defer the chunk until first stream so
   the initial bot mount stays at "input + button" size. The static
   imports above were the largest contributor to bootup-time on the
   homepage Lighthouse run (chunk 6700, ~80 % unused). */
const AnswerStream = lazy(() =>
  import('./AnswerStream.tsx').then((m) => ({ default: m.AnswerStream })),
);
const AnswerMarkdown = lazy(() =>
  import('./AnswerMarkdown.tsx').then((m) => ({ default: m.AnswerMarkdown })),
);

type Variant = 'hero' | 'page' | 'modal';

interface DocsBotProps {
  variant?: Variant;
  initialQuery?: string;
  /** Focus the input on mount. The modal sets this; hero/page don't. */
  autoFocus?: boolean;
}

/**
 * Format a retry-after window into compact human copy.
 *
 *   3   -> "3 seconds"
 *   59  -> "59 seconds"
 *   60  -> "1 minute"
 *   119 -> "1 minute"
 *   120 -> "2 minutes"
 *
 * We round DOWN for the >=60s case so the user is told the soonest
 * full-minute boundary they can retry; rounding up would advertise
 * a longer wait than the proxy actually enforces.
 */
function formatRetryAfter(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return 'a moment';
  if (sec < 60) return `${sec} second${sec === 1 ? '' : 's'}`;
  const minutes = Math.floor(sec / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/* Shimmer placeholder hold: minimum 120ms so a fast first-token
   doesn't flash a half-frame loader. */
const SHIMMER_MIN_MS = 120;

/* In-corpus example questions surfaced as both placeholder seed and
   clickable chips above the input. Research-005 finding: the original
   single placeholder ("how do i configure a plan file?") undersold the
   bot's scope, contributing to off-topic queries that returned
   ungrounded refusals. These three are deliberately concrete and
   cover the indexed corpus (worktrees, claude-code wiring, merge
   gates) so a reader can tell the bot is bounded to bernstein docs,
   not a general AI. */
const EXAMPLE_QUESTIONS: readonly string[] = [
  "what's a worktree slot?",
  'how do i wire claude code?',
  'what triggers a merge gate?',
] as const;

/* Stable per-build placeholder rotation. No client-side cycling: a
   moving placeholder is unreadable, so it must be deterministic
   for the whole session so a returning visitor sees the same prompt
   they remember. The build-id hash picks a pair from EXAMPLE_QUESTIONS;
   if NEXT_PUBLIC_BUILD_ID is unset (local dev), fall back to today's
   date string so the choice still rotates between deploys. */
const BUILD_HASH: string = process.env.NEXT_PUBLIC_BUILD_ID ?? '2026-05-10';
const PLACEHOLDER: string =
  EXAMPLE_QUESTIONS[
    Array.from(BUILD_HASH).reduce((acc, ch) => acc + ch.charCodeAt(0), 0) %
      EXAMPLE_QUESTIONS.length
  ];

/* Scope hint copy. ≤90 chars per ticket; this is 69. Signals corpus
   bounds before a visitor types so off-topic queries (which return
   ungrounded refusals) drop. Mitigates the 254/176 decline/submit
   ratio observed lifetime.

   No post count here on purpose: this is a client component, so it
   cannot read content/blog at render time, and the hardcoded figure
   drifted to a third of the real number while the hero kicker beside
   it rendered the live count from getPostCount(). Naming the corpus
   without counting it keeps the two from contradicting each other. */
const SCOPE_HINT =
  'answers limited to: bernstein source, blog posts, install + cli docs.';
const SCOPE_HINT_SESSION_KEY = 'docs-bot-scope-hint-view-fired';

/* Fire the scope-hint-view event exactly once per session. Gated by
   sessionStorage so tab-in/tab-out of the input doesn't inflate the
   count. Wrapped in try/catch because sessionStorage throws in private
   mode / iframe sandboxes. */
function fireScopeHintViewOnce(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.sessionStorage.getItem(SCOPE_HINT_SESSION_KEY)) return;
    window.sessionStorage.setItem(SCOPE_HINT_SESSION_KEY, '1');
  } catch {
    /* sessionStorage unavailable - fire anyway; the worst case is
       multiple events from the same session, which the report can
       de-duplicate by visitor-id. */
  }
  track(UmamiEvent.DocsBotScopeHintView);
}

/* TTFT pre-warm. Fires once per page session on the first signal of
   intent (chip hover/focus or input focus). Sends a tiny `OPTIONS` to
   `/api/ask`; the route 405s, but the request primes any cold proxy
   sockets and gives the Next.js worker a head-start.
   Honest caveats: this is mostly cosmetic in the current architecture
   - the bot's API is same-origin POST so the browser→Next socket is
   already alive after page load, and the Next→FastAPI gateway socket
   on 127.0.0.1 is process-resident. The real TTFT win lives in a
   backend two-tier (cheap-model preview → full RAG swap); see
   `.sdd/backlog/open/2026-05-09-research-006-progressive-ttft-two-tier.md`.
   The pre-warm here is cheap, idempotent, and doesn't dirty Umami -
   keep it as a no-cost belt-and-suspenders. */
let prewarmFired = false;
function prewarmAsk(): void {
  if (typeof window === 'undefined' || prewarmFired) return;
  prewarmFired = true;
  /* `keepalive: true` lets the request survive a quick navigation; the
     1.5s timeout caps how long we hold the socket if the route is
     unresponsive (we never read the body). Errors are swallowed -
     pre-warm must not surface anything to the user. */
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    void fetch('/api/ask', {
      method: 'OPTIONS',
      signal: ctrl.signal,
      keepalive: true,
    })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
  } catch {
    /* `fetch` itself can throw synchronously in older browsers when
       the URL is malformed; same-origin static path makes that
       impossible here, but we guard anyway. */
  }
}

function trackAsk(query: string): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { umami?: { track: (n: string, d?: Record<string, unknown>) => void } };
  w.umami?.track('docs-bot-ask', { length: query.length });
}

function trackError(code: string): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { umami?: { track: (n: string, d?: Record<string, unknown>) => void } };
  w.umami?.track('docs-bot-error', { code });
}

export function DocsBot({ variant = 'page', initialQuery = '', autoFocus = false }: DocsBotProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /* Sponsor note: render once per browser, on the first non-declined
     `done` event. We latch the decision so it doesn't flicker if the
     reducer's phase oscillates during the same render pass. */
  const [showSponsor, setShowSponsor] = useState(false);
  /* `done` may arrive multiple times across multi-turn conversations.
     Only the FIRST (per browser) opens the note; the localStorage
     check inside SponsorNote handles cross-session memory. */
  const sponsorChecked = useRef(false);
  /* Tracks whether `meta` arrived this stream so we know when to mark
     `first-token`. We mark on the *first token*, not meta - TTFT is
     about visible content. */
  const firstTokenMarkedRef = useRef(false);
  const [shimmerHeld, setShimmerHeld] = useState(false);
  /* Wall-clock when the current stream started. Drives the
     ThinkingShimmer's two-phase animation: bars (0-2s) → folder (2s+).
     Reset to null whenever no stream is active. */
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (state.phase === 'streaming' && state.text === '') {
      /* Latch on entry - don't reset on every re-render while still
         in this state, otherwise the elapsed counter never grows. */
      setStreamStartedAt((cur) => cur ?? Date.now());
    } else {
      setStreamStartedAt(null);
    }
  }, [state.phase, state.text]);

  /* Bridge SSE events into reducer + side effects. */
  const onEvent = useCallback((event: SseEvent) => {
    if (event.type === 'token' && !firstTokenMarkedRef.current) {
      try {
        performance.mark('docs-bot:first-token');
      } catch {
        /* missing performance API - never on real browsers, but tests
           can run in node without it. */
      }
      firstTokenMarkedRef.current = true;
    }
    dispatch({ kind: 'EVENT', event });
    if (event.type === 'done') {
      /* On the first non-declined done of this session, mount the
         SponsorNote if the visitor hasn't seen it yet (localStorage). */
      if (!event.declined && !sponsorChecked.current) {
        sponsorChecked.current = true;
        if (shouldShowSponsorNote()) setShowSponsor(true);
      }
    }
    if (event.type === 'error') {
      trackError(event.code);
    }
  }, []);

  const onAborted = useCallback(() => {
    dispatch({ kind: 'ABORTED' });
    trackError('ABORTED');
  }, []);

  const onError = useCallback((code: string, message: string, retryAfterSec?: number) => {
    /* Wrap as an SSE error event so the reducer takes a single path.
       `retryAfterSec` is only set for 429 (RATE_LIMITED) so the UI can
       show "try again in N min" instead of the generic fallback. */
    dispatch({
      kind: 'EVENT',
      event: { type: 'error', code, message, retryAfterSec },
    });
    trackError(code);
  }, []);

  const { ask, stop, isStreaming } = useSseStream(onEvent, onAborted, onError);

  /* Sync query → URL (?q=) so a refresh keeps the conversation handle.
     Out of scope: full snapshot rehydration; only the last typed query
     persists. */
  useEffect(() => {
    if (variant === 'modal') return; /* modal uses ?ask= instead */
    if (typeof window === 'undefined') return;
    if (!query) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('q', query);
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      /* swallow */
    }
  }, [query, variant]);

  /* Auto-focus the input when variant requests it. */
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  /* Build the wire-format history from the in-memory transcript.
     Strip citations - only role + content cross the wire (the gateway
     never re-renders cite chips for prior turns). The cap is also
     applied in useSseStream and on the gateway; we do it here too so
     the JSON payload itself stays small. */
  const wireHistory = useMemo<{ role: 'user' | 'assistant'; content: string }[]>(
    () =>
      state.transcript
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content })),
    [state.transcript],
  );

  /* Last completed assistant turn. `done` rolls the finished answer
     into `transcript` and clears `text`, so the post-answer meta
     footer (model / elapsed / copy-as-markdown) reads from here
     rather than the now-empty active canvas. */
  const lastAssistant = useMemo<Message | null>(() => {
    for (let i = state.transcript.length - 1; i >= 0; i--) {
      if (state.transcript[i].role === 'assistant') return state.transcript[i];
    }
    return null;
  }, [state.transcript]);
  const lastAssistantCitations = useMemo<Map<number, Citation>>(() => {
    const map = new Map<number, Citation>();
    for (const c of lastAssistant?.citations ?? []) map.set(c.n, c);
    return map;
  }, [lastAssistant]);

  /* Single dispatch helper so the three call sites (onSubmit,
     onFollowUp, onRetry) share the same shape. */
  const fireAsk = useCallback(
    (q: string) => {
      firstTokenMarkedRef.current = false;
      try {
        performance.mark('docs-bot:click');
      } catch {
        /* swallow */
      }
      trackAsk(q);
      dispatch({ kind: 'ASK', query: q });
      setShimmerHeld(true);
      setTimeout(() => setShimmerHeld(false), SHIMMER_MIN_MS);
      ask({ query: q, history: wireHistory });
    },
    [ask, wireHistory],
  );

  /* Submit handler. */
  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;
      fireAsk(trimmed);
    },
    [fireAsk, query],
  );

  /* Followup handler - pre-fills + auto-submits the query. */
  const onFollowUp = useCallback(
    (q: string) => {
      setQuery(q);
      fireAsk(q);
    },
    [fireAsk],
  );

  /* Retry on error. Reuses the last query. */
  const onRetry = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    fireAsk(trimmed);
  }, [fireAsk, query]);

  /* Example-chip click - auto-submit on a single tap. The chip *is*
     the ask: prefill + fire so the user gets one fewer step before
     the first token streams. Per-IP rate limiting (30/hr) absorbs
     accidental misclicks without backend cost; the perceived TTFT
     win from skipping the second click outweighs that risk. */
  const onExampleClick = useCallback((q: string) => {
    setQuery(q);
    fireAsk(q);
  }, [fireAsk]);

  /* Body switch. The shell stays the same; only the answer region
     changes shape per phase. research-006: hide the shimmer while the
     preview is showing - the preview block IS the loading affordance. */
  const previewVisible =
    state.previewText.length > 0 &&
    state.previewDeclined !== true &&
    (state.phase === 'preview-streaming' ||
      state.phase === 'preview-complete' ||
      state.phase === 'streaming' ||
      state.phase === 'done');
  const showShimmer =
    !previewVisible && ((isStreaming && state.text.length === 0) || shimmerHeld);

  return (
    <section
      className={`docs-bot docs-bot--${variant}`}
      aria-labelledby="docs-bot-heading"
    >
      {variant === 'page' ? (
        <header className="docs-bot-header">
          <p className="docs-bot-eyebrow">ask the docs · grounded · cited</p>
          <h2 id="docs-bot-heading" className="docs-bot-title">
            ask <em>anything</em>.
          </h2>
        </header>
      ) : (
        /* Hero and modal variants both suppress the visual header.
           Hero: HeroV2 owns the kicker + headline above the bot.
           Modal: the slash-command dialog has its own framing.
           Both still expose an a11y heading so screen-reader landmarks
           and the aria-labelledby on <section> resolve. */
        <h2 id="docs-bot-heading" className="sr-only">docs bot</h2>
      )}

      {state.transcript.length > 0 ? (
        <TranscriptRecap transcript={state.transcript} />
      ) : null}

      {/* Cold-state example chips: render only when the user hasn't
          typed anything and no prior turn exists. Clicking a chip
          auto-submits the question (one tap, not two) - see
          onExampleClick for the rate-limit trade-off. The chip row
          scopes the bot's surface to in-corpus questions, which the
          research-005 brief identified as the cheapest decline-rate
          reduction. */}
      {state.transcript.length === 0 && query.length === 0 && !isStreaming ? (
        <div
          className="docs-bot-examples"
          aria-label="example questions"
        >
          <span className="docs-bot-examples-label">try:</span>
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              className="docs-bot-example"
              onClick={() => onExampleClick(q)}
              onPointerEnter={prewarmAsk}
              onFocus={prewarmAsk}
              data-umami-event="docs-bot-example-click"
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}

      <form className="docs-bot-form" onSubmit={onSubmit} role="search">
        <label htmlFor="docs-bot-input" className="sr-only">
          your question
        </label>
        <input
          ref={inputRef}
          id="docs-bot-input"
          type="search"
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            prewarmAsk();
            fireScopeHintViewOnce();
          }}
          placeholder={PLACEHOLDER}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          inputMode="search"
          maxLength={500}
          className="docs-bot-input"
          aria-describedby="docs-bot-hint"
          disabled={isStreaming}
        />
        <button
          type="submit"
          className="docs-bot-submit"
          disabled={isStreaming || query.trim().length === 0}
          data-umami-event="docs-bot-submit"
        >
          {isStreaming ? '…' : 'ask'}
        </button>
        {isStreaming ? (
          <button
            type="button"
            className="docs-bot-stop"
            onClick={() => stop()}
            aria-label="stop streaming"
          >
            stop
          </button>
        ) : null}
      </form>
      <p id="docs-bot-hint" className="docs-bot-hint">
        plain text. one question per try. answers cite the source.
      </p>
      <p className="docs-bot-hint">{SCOPE_HINT}</p>

      <div
        className="docs-bot-body"
        /* Only reserve vertical space when there's something to show.
           Idle state stays compact - the section sits right under Hero
           and an empty 6.5rem block reads as "nothing happened, did
           it break". research-006: preview-streaming /
           preview-complete also need the body slot reserved. */
        style={{
          minHeight:
            state.phase === 'streaming' || state.phase === 'done' || state.phase === 'declined' || state.phase === 'error' || state.phase === 'preview-streaming' || state.phase === 'preview-complete' || showShimmer
              ? '4rem'
              : '0',
          marginTop:
            state.phase === 'streaming' || state.phase === 'done' || state.phase === 'declined' || state.phase === 'error' || state.phase === 'preview-streaming' || state.phase === 'preview-complete' || showShimmer
              ? 'var(--space-4)'
              : '0',
        }}
      >
        {showShimmer ? (
          /* Two-phase shimmer. <2s = sliding bars; ≥2s = the macintosh
             folder + status line. ThinkingShimmer owns the timing; we
             just hand it the wall-clock when this stream began. */
          <ThinkingShimmer startedAt={streamStartedAt} />
        ) : null}

        {/* research-006 - preview block. Renders above the main answer
            during `preview-streaming` (typing in) and `preview-complete`
            (settled, full hasn't arrived). Once the full answer starts
            streaming, the block stays visible but softly collapsed via
            the `--collapsed` modifier; the operator's brief calls for
            the preview to remain readable as a "fast preview ·
            superseded" pill rather than disappearing entirely. Hidden
            entirely when the gateway told us the preview declined
            (previewDeclined=true). */}
        {previewVisible ? (
          <aside
            className={`docs-bot-preview${
              state.phase === 'streaming' || state.phase === 'done'
                ? ' docs-bot-preview--collapsed'
                : ''
            }`}
            aria-label="fast preview answer"
          >
            <p className="docs-bot-preview-eyebrow">
              fast preview
              {state.phase === 'streaming' || state.phase === 'done'
                ? ' · superseded'
                : ''}
            </p>
            <Suspense fallback={<div className="docs-bot-preview-body" />}>
              <AnswerStream
                text={state.previewText}
                citations={state.previewCitations}
                streaming={state.phase === 'preview-streaming'}
              />
            </Suspense>
          </aside>
        ) : null}

        {state.phase === 'declined' ? (
          <DeclineCard
            reason={state.text || null}
            suggestions={state.declineSuggestions}
          />
        ) : null}

        {(state.phase === 'streaming' || state.phase === 'done') && state.text.length > 0 ? (
          <article className="docs-bot-answer-card">
            <Suspense fallback={<div className="docs-bot-answer" aria-live="polite" />}>
              <AnswerStream
                text={state.text}
                citations={state.citations}
                streaming={state.phase === 'streaming'}
              />
            </Suspense>
            {state.phase === 'done' ? (
              <footer className="docs-bot-answer-meta">
                {state.model ? <code className="docs-bot-model">{state.model}</code> : null}
                {state.elapsedMs !== null ? (
                  <span className="docs-bot-elapsed">{state.elapsedMs}ms</span>
                ) : null}
                <CopyAsMarkdown text={state.text} citations={state.citations} />
              </footer>
            ) : null}
          </article>
        ) : null}

        {/* Post-answer meta for the multi-turn path. `done` clears
            `text` and rolls the turn into `transcript`, so the
            in-article footer above only covers the legacy no-ASK
            lifecycle; this one reads the last transcript assistant
            entry so model / elapsed / copy-as-markdown stay reachable
            for the answer the user just received. `state.model` and
            `state.elapsedMs` survive `done` and describe that same
            turn. */}
        {state.phase === 'done' && state.text.length === 0 && lastAssistant ? (
          <footer className="docs-bot-answer-meta">
            {state.model ? <code className="docs-bot-model">{state.model}</code> : null}
            {state.elapsedMs !== null ? (
              <span className="docs-bot-elapsed">{state.elapsedMs}ms</span>
            ) : null}
            <CopyAsMarkdown
              text={lastAssistant.content}
              citations={lastAssistantCitations}
            />
          </footer>
        ) : null}

        {/* Per-answer conversion strip - shows below every settled,
            non-declined answer. Distinct from SponsorNote (one-time-
            per-browser, deeper, vulnerable-tone). Hidden during
            streaming so it doesn't shift layout while tokens arrive.
            Hidden on the declined phase so the bot's "i don't have
            docs" line doesn't get followed by a "buy our thing" pitch
            - the decline-path install nudge is emitted by the gateway
            in the answer text itself. */}
        {state.phase === 'done' ? <CtaStrip /> : null}

        {/* One-time sponsor note. Mounts only on the FIRST non-declined
            done of this browser (latched in onEvent). SponsorNote owns
            the localStorage flag so a second mount no-ops. */}
        {showSponsor ? <SponsorNote /> : null}

        {state.phase === 'done' && state.followUps.length > 0 ? (
          <FollowUps suggestions={state.followUps} onSelect={onFollowUp} />
        ) : null}

        {state.phase === 'error' ? (
          <div className="docs-bot-error" role="alert">
            <p className="docs-bot-error-message">
              {state.error?.code === 'ABORTED'
                ? 'stream stopped.'
                : state.error?.code === 'RATE_LIMITED'
                  ? `you've hit the per-IP rate limit. try again in ${formatRetryAfter(state.error.retryAfterSec ?? 60)}.`
                  : state.error?.code === 'SERVICE_UNAVAILABLE'
                    ? 'service unavailable. try again in a moment.'
                    : state.error?.code === 'OUTPUT_VIOLATION'
                      ? "i don't have docs that answer this. try rephrasing, or open an issue at github.com/sipyourdrink-ltd/bernstein/issues/new."
                      : 'something went wrong.'}
            </p>
            <button
              type="button"
              className="docs-bot-retry"
              onClick={onRetry}
              /* Block the retry button while rate-limited - clicking
                 again just earns another 429 and erodes trust. The
                 user can still re-submit the form when ready; this
                 button only stops being the primary affordance. */
              disabled={state.error?.code === 'RATE_LIMITED'}
              data-umami-event="docs-bot-retry"
            >
              retry
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * TranscriptRecap - prior conversation turns rendered above the input.
 *
 * Visual model: each turn is a small card with the user question on
 * one line and the assistant's answer below it, cite chips inline at
 * the end. The whole block is dimmed slightly so the active stream
 * (if any) reads as the foreground.
 *
 * We render the assistant's answer as plain text + a flat chip row
 * rather than re-running the AnswerStream tokeniser. Recaps don't
 * stream - they're settled - so the chip-inline rendering doesn't buy
 * us anything; a chip row is simpler and avoids re-mounting popovers
 * for past turns.
 */
function TranscriptRecap({ transcript }: { transcript: Message[] }) {
  /* Group user→assistant pairs. The reducer always pushes them in
     pairs, but if we ever change that contract this still renders
     gracefully - orphan turns just appear by themselves. */
  const turns: { user: Message | null; assistant: Message | null }[] = [];
  for (const m of transcript) {
    if (m.role === 'user') {
      turns.push({ user: m, assistant: null });
    } else {
      const last = turns[turns.length - 1];
      if (last && last.assistant === null) {
        last.assistant = m;
      } else {
        turns.push({ user: null, assistant: m });
      }
    }
  }
  return (
    <ol className="docs-bot-transcript" aria-label="prior turns">
      {turns.map((t, idx) => (
        <li key={idx} className="docs-bot-transcript-turn">
          {t.user ? (
            <p className="docs-bot-transcript-q">{t.user.content}</p>
          ) : null}
          {t.assistant ? (
            <TranscriptAssistantBody message={t.assistant} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * Recap body for an assistant turn - same markdown pipeline as the
 * live AnswerStream so prior turns get bold/italic/list/link/code
 * rendering, with `[n]` chips inline. Citations that exist on the
 * message but don't appear in the body (e.g. the gateway emitted
 * citation metadata for a marker that didn't survive into the model's
 * text) are appended as a chip row so we never lose source links.
 */
function TranscriptAssistantBody({ message }: { message: Message }) {
  const citations = useMemo(() => {
    const map = new Map<number, Citation>();
    for (const c of message.citations ?? []) map.set(c.n, c);
    return map;
  }, [message.citations]);

  /* Chips that already render inline through the markdown pipeline. */
  const inlineNs = useMemo(() => {
    const found = new Set<number>();
    const re = /\[(\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(message.content)) !== null) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isInteger(n)) found.add(n);
    }
    return found;
  }, [message.content]);

  const orphanCitations = (message.citations ?? []).filter((c) => !inlineNs.has(c.n));

  return (
    <div className="docs-bot-transcript-a">
      <Suspense fallback={<div className="docs-bot-answer" />}>
        <AnswerMarkdown text={message.content} citations={citations} />
      </Suspense>
      {orphanCitations.length > 0 ? (
        <span className="docs-bot-transcript-cites">
          {orphanCitations.map((c) => (
            <CitationChip key={c.n} n={c.n} citation={c} />
          ))}
        </span>
      ) : null}
    </div>
  );
}
