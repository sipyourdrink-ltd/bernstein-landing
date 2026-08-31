/**
 * Wire and state types for the docs RAG bot.
 *
 * Every type lives here so the reducer, the SSE hook, and the React
 * components all share one definition of "what an event looks like".
 * The wire shape (`SseEvent`) mirrors the gateway's contract; if the
 * gateway evolves, this file is the single point of churn.
 */

/* ---- conversation messages (multi-turn) -------------------------------- */

/**
 * A single conversation turn carried in the transcript. The `content`
 * field is the user's question or the model's full answer (no SSE
 * framing). `citations` is attached to assistant turns only and is
 * rendered as cite chips next to the recap; the gateway never sees
 * citations on its way back into prompt context - only `role` and
 * `content` cross the wire as `history`.
 */
export type Message = {
  role: 'user' | 'assistant';
  content: string;
  /** Set on assistant messages so prior cite chips re-render in recap. */
  citations?: Citation[];
  /** Pinned for telemetry / "open last response" affordances. */
  responseId?: string;
};

/* ---- citation source row, as the gateway emits it ---------------------- */

/**
 * One citation as it arrives from the gateway. `n` is the inline marker
 * number (1-based, matches `[n]` in the streamed text). `chunkId` is
 * optional and lets the chip click navigate to a deep anchor on the
 * source page.
 */
export type Citation = {
  n: number;
  title: string;
  url: string;
  excerpt: string;
  /** Post-rerank relevance score (0..1); shown as a subtle hint in the popover. */
  score?: number;
  chunkId?: string;
  /** Optional breadcrumb section path, used in the hover preview. */
  section?: string;
};

/* ---- SSE wire events ----------------------------------------------------- */

/**
 * Event union the gateway streams as `data:` lines (one JSON object per
 * line; the SSE framing is what the proxy handles). The reducer is a
 * pure function over this union and never sees raw bytes.
 */
export type SseEvent =
  | { type: 'meta'; responseId: string; model: string }
  | { type: 'token'; delta: string }
  | { type: 'citation'; n: number; title: string; url: string; excerpt: string; score?: number; chunkId?: string; section?: string }
  | {
      type: 'done';
      costUsd: number;
      elapsedMs: number;
      declined: boolean;
      /** Three follow-up suggestions, populated server-side; empty on decline. */
      followUps?: string[];
    }
  /* Structured decline. Sent when the gateway's output sentinel
     soft-declines after tokens already streamed: `text` is the full
     decline copy and REPLACES the streamed body (rendering both reads
     as a self-contradicting paragraph); `suggestions` are the
     retriever's top picks (URL-deduped, max 3) rendered as fallback
     links in DeclineCard. The gateway still streams the legacy decline
     copy as `token` deltas afterwards for older clients - the reducer
     ignores those once this event has landed. */
  | { type: 'decline-replace'; text: string; suggestions: Citation[] }
  /* research-006 - progressive TTFT preview events. Same wire shape as
     their non-preview siblings; the `type` discriminator is what the
     reducer keys on. A preview-unaware client (older bundle, third
     party) ignores these because the SSE event name is unknown. */
  | { type: 'preview-token'; delta: string }
  | {
      type: 'preview-citation';
      n: number;
      title: string;
      url: string;
      excerpt: string;
      chunkId?: string;
      section?: string;
    }
  | {
      type: 'preview-done';
      declined: boolean;
      costUsd: number;
      elapsedMs: number;
    }
  | {
      type: 'error';
      code: string;
      message: string;
      /**
       * Seconds the caller should wait before retrying. Populated when
       * the proxy returns 429 with a `Retry-After` header (RATE_LIMITED).
       * Optional - most error codes don't carry it.
       */
      retryAfterSec?: number;
    };

/* ---- client-side state machine ------------------------------------------- */

/**
 * Lifecycle phases. A query lives in exactly one of these at a time.
 * The transitions are enforced by the reducer; UI components read
 * `phase` and switch the rendered subtree accordingly.
 */
export type DocsBotPhase =
  | 'idle'
  /* research-006 - preview lifecycle. Both phases are pre-`streaming`:
     `preview-streaming` is "preview tokens are arriving on the wire,
     full answer hasn't started yet"; `preview-complete` is "preview
     finished, full answer hasn't started yet". As soon as the regular
     `meta` frame lands, the reducer moves to `streaming` and the UI
     softly collapses the preview block. */
  | 'preview-streaming'
  | 'preview-complete'
  | 'streaming'
  | 'done'
  | 'declined'
  | 'error';

/**
 * Full reducer state. `text` is the running concatenation of token
 * deltas. `citations` is keyed by `n` so render can do `O(1)` lookups
 * inside the answer-stream walker.
 */
export type DocsBotState = {
  phase: DocsBotPhase;
  responseId: string | null;
  /** Concatenated token deltas - what AnswerStream renders. */
  text: string;
  /** Map<n, Citation> - citations keyed by their inline marker number. */
  citations: Map<number, Citation>;
  /** Three follow-ups; populated only when the gateway grounds an answer. */
  followUps: string[];
  model: string | null;
  costUsd: number | null;
  elapsedMs: number | null;
  /** Last error; cleared on next ASK action. */
  error: { code: string; message: string; retryAfterSec?: number } | null;
  /**
   * Prior turns in the same conversation, oldest first. On `done` we
   * push the just-completed user→assistant pair into this array and
   * clear `text` / `citations` so the next ask starts on a fresh
   * canvas while the recap renders above the input.
   */
  transcript: Message[];
  /**
   * The query the user typed for the in-flight stream. We keep it
   * separately because `text` is the assistant's running answer and
   * we need to retain the user's message until `done` fires so we
   * can write the pair into `transcript` together.
   */
  pendingQuery: string | null;
  /**
   * Suggestions carried by a `decline-replace` frame - the retriever's
   * top picks, rendered as fallback links in DeclineCard. Empty when
   * no structured decline has landed this turn.
   */
  declineSuggestions: Citation[];
  /**
   * True once a `decline-replace` frame replaced `text` this turn.
   * Gates the legacy decline tokens the gateway keeps streaming for
   * older clients so they don't append onto the replaced copy.
   */
  declineReplaced: boolean;
  /**
   * research-006 - running concatenation of preview-token deltas.
   * Cleared whenever a fresh ASK lands. Stays populated even after the
   * full answer arrives so the UI can keep rendering it (collapsed) as
   * a "fast preview · superseded" pill or a soft fade-out per the
   * brief's UX target.
   */
  previewText: string;
  /** research-006 - Map<n, Citation> from preview-citation frames. */
  previewCitations: Map<number, Citation>;
  /**
   * research-006 - preview lifecycle outcome. ``null`` while no preview
   * has run; ``true`` when ``preview-done.declined === true`` (UI hides
   * the preview block entirely); ``false`` when the preview grounded
   * cleanly (UI keeps it visible / collapses softly when full lands).
   */
  previewDeclined: boolean | null;
};

/* ---- reducer action shape ----------------------------------------------- */

/**
 * Reducer actions. The SSE-derived ones map 1:1 onto wire events; the
 * UI-driven ones (`ASK`, `RESET`) live alongside so a single dispatch
 * channel covers both lifecycles.
 */
export type DocsBotAction =
  | { kind: 'ASK'; query: string }
  | { kind: 'EVENT'; event: SseEvent }
  | { kind: 'ABORTED' }
  | { kind: 'RESET' };

/* ---- public API surface for the gateway --------------------------------- */

/**
 * Body the Next.js `/api/ask` proxy forwards to the FastAPI gateway.
 * Tenant is fixed (`bernstein-docs`) at the proxy boundary, so the
 * client only sends the query and an optional response anchor.
 */
export type AskRequest = {
  query: string;
  /** When set, the gateway can rehydrate the same conversation context. */
  responseId?: string;
  /**
   * Prior turns to include as generation-side context. The gateway
   * caps this server-side (see ai_gateway.schemas.AskRequest). We cap
   * at the last 8 turns client-side too so the wire stays compact;
   * citations are stripped - only role + content cross the wire.
   */
  history?: { role: 'user' | 'assistant'; content: string }[];
};
