/**
 * Pure reducer for the docs-bot state machine.
 *
 * Why a pure reducer rather than `useState` collages:
 *   - The state graph (idle / streaming / done / declined / error) has
 *     enough edges that `useState` calls scattered around components
 *     become bug-prone. A reducer is one hop from a unit test.
 *   - Tests run in `node --test` against pure TS - no DOM needed. We
 *     get state-machine coverage without spinning a React renderer.
 *   - The reducer never mutates inputs; the citations Map is rebuilt
 *     on each `citation` event so React's structural-sharing checks
 *     keep working.
 *
 * Transition table (S = state.phase, E = event.type):
 *
 *   S=idle      E=meta       -> phase='streaming', responseId, model
 *   S=streaming E=token      -> append text
 *   S=streaming E=citation   -> upsert citations.get(n)
 *   S=streaming E=decline-replace     -> text REPLACED with decline copy,
 *                                        suggestions pinned for DeclineCard,
 *                                        later legacy decline tokens ignored
 *   S=streaming E=done.declined=true  -> phase='declined' (no transcript push)
 *   S=streaming E=done.declined=false -> phase='done', followUps,
 *                                        transcript += [user, assistant],
 *                                        text/citations cleared for next turn
 *   S=*         E=error      -> phase='error', error{code,message}
 *   ABORTED                  -> phase='error', code='ABORTED'
 *   ASK                      -> reset streaming fields, KEEP transcript,
 *                               record pendingQuery for later push
 *   RESET                    -> initial state (clears transcript too)
 *
 *   research-006 preview transitions:
 *
 *   S=idle     E=preview-token    -> phase='preview-streaming', append previewText
 *   S=preview-streaming E=preview-token    -> append previewText
 *   S=preview-streaming E=preview-citation -> upsert previewCitations
 *   S=preview-streaming E=preview-done.declined=true
 *                                  -> phase='preview-complete',
 *                                     previewDeclined=true,
 *                                     previewText cleared (frontend hides)
 *   S=preview-streaming E=preview-done.declined=false
 *                                  -> phase='preview-complete',
 *                                     previewDeclined=false (UI keeps text)
 *   S=preview-complete E=meta      -> phase='streaming', regular flow proceeds;
 *                                     previewText / previewCitations PRESERVED so
 *                                     the UI can keep rendering them collapsed
 *                                     until / unless the full answer arrives.
 *   S=preview-streaming E=meta     -> defensive: same as preview-complete→meta
 *                                     (a fast gateway might land `meta` before
 *                                     the preview-done frame). Move to
 *                                     `streaming`, keep partial preview.
 *
 * Note on `done` arriving without a prior `meta`: gateway always emits
 * `meta` first by contract. We still let `done` land defensively rather
 * than assert; a misbehaving gateway shouldn't lock the UI.
 */
import type { DocsBotAction, DocsBotState, Message, SseEvent } from './types.ts';

/**
 * Initial state. Every field is at its "no data yet" value. The
 * citations map is fresh on every reset so React sees a new reference.
 */
export const initialState: DocsBotState = {
  phase: 'idle',
  responseId: null,
  text: '',
  citations: new Map(),
  followUps: [],
  model: null,
  costUsd: null,
  elapsedMs: null,
  error: null,
  transcript: [],
  pendingQuery: null,
  declineSuggestions: [],
  declineReplaced: false,
  previewText: '',
  previewCitations: new Map(),
  previewDeclined: null,
};

/**
 * Apply a single SSE event to state. Extracted so the `EVENT` action
 * dispatch is one switch and tests can drive it with raw events
 * directly without faking the action wrapper.
 */
function applyEvent(state: DocsBotState, event: SseEvent): DocsBotState {
  switch (event.type) {
    case 'meta':
      /* meta is the start-of-response signal. We move into 'streaming'
         and stamp the responseId / model so the UI can pin them in
         attribution chips even before the first token lands.

         research-006: when a preview is in flight (or has already
         completed), `meta` flips us into `streaming` but PRESERVES the
         preview state - the UI uses `previewText` + `previewDeclined`
         to render the soft-collapsed preview block above the active
         stream until the full answer body kicks in. */
      return {
        ...state,
        phase: 'streaming',
        responseId: event.responseId,
        model: event.model,
        error: null,
      };

    case 'preview-token':
      /* research-006 - append to previewText, transition into the
         preview-streaming phase if we're still idle. We don't clobber
         `phase` if we're already past it (defensive: a stale frame
         shouldn't reverse the state machine). */
      return {
        ...state,
        phase:
          state.phase === 'idle' || state.phase === 'preview-streaming'
            ? 'preview-streaming'
            : state.phase,
        previewText: state.previewText + event.delta,
      };

    case 'preview-citation': {
      /* Upsert into previewCitations - same shape as the regular
         citation upsert. New Map ref so React diff sees the change. */
      const next = new Map(state.previewCitations);
      next.set(event.n, {
        n: event.n,
        title: event.title,
        url: event.url,
        excerpt: event.excerpt,
        chunkId: event.chunkId,
        section: event.section,
      });
      return { ...state, previewCitations: next };
    }

    case 'preview-done': {
      /* Brief failure-mode rules:
           - preview ok  -> previewDeclined=false; previewText kept so
             the UI can render the preview block (it stays visible
             until / unless the full answer arrives, then collapses).
           - preview decline -> previewDeclined=true; clear previewText
             so the UI hides the preview block entirely.
         Phase moves to `preview-complete` either way; the next `meta`
         frame transitions us to `streaming`. */
      if (event.declined) {
        return {
          ...state,
          phase:
            state.phase === 'streaming' ||
            state.phase === 'done' ||
            state.phase === 'declined'
              ? state.phase
              : 'preview-complete',
          previewDeclined: true,
          previewText: '',
          previewCitations: new Map(),
        };
      }
      return {
        ...state,
        phase:
          state.phase === 'streaming' ||
          state.phase === 'done' ||
          state.phase === 'declined'
            ? state.phase
            : 'preview-complete',
        previewDeclined: false,
      };
    }

    case 'token':
      /* After a decline-replace the gateway still streams the legacy
         decline copy as token deltas (back-compat for older clients);
         drop them so the replaced text stays canonical. */
      if (state.declineReplaced) return state;
      /* Append. Don't try to parse `[n]` markers here - that's the
         AnswerStream's responsibility and we want this reducer to stay
         protocol-agnostic. Token concat is associative; out-of-order
         tokens would break ordering, but the gateway emits in-order
         over a single connection, so we trust the framing. */
      return { ...state, text: state.text + event.delta };

    case 'citation': {
      /* Upsert: clone the map so React diff sees a new reference. The
         spread cost is O(citations) which stays tiny - three to five
         per answer. */
      const next = new Map(state.citations);
      next.set(event.n, {
        n: event.n,
        title: event.title,
        url: event.url,
        excerpt: event.excerpt,
        score: event.score,
        chunkId: event.chunkId,
        section: event.section,
      });
      return { ...state, citations: next };
    }

    case 'decline-replace':
      /* Structured decline: REPLACE the partial (ungrounded) streamed
         body with the operator-configured decline copy and pin the
         retriever's suggestions for DeclineCard. `declineReplaced`
         gates the legacy token fallback the gateway keeps emitting;
         the `done.declined=true` frame that follows moves the phase. */
      return {
        ...state,
        text: event.text,
        declineSuggestions: event.suggestions,
        declineReplaced: true,
      };

    case 'done': {
      /* Gateway tells us 'declined: true' for ungrounded queries. The
         UI swaps to DeclineCard and we keep `text` so a debugger can
         see whatever partial decline message the gateway streamed.
         Declines are NOT pushed into the transcript - a follow-up
         doesn't depend on a refusal, and stacking declines as
         "context" would just confuse the next generation. */
      if (event.declined) {
        return {
          ...state,
          phase: 'declined',
          costUsd: event.costUsd,
          elapsedMs: event.elapsedMs,
          followUps: [],
        };
      }
      /* Push the user→assistant pair into transcript and clear text /
         citations so the next ASK lands on a fresh canvas. The recap
         in the UI reads from `transcript`; the active answer reads
         from `text`.

         We only roll into the transcript when `pendingQuery` is set
         (i.e. the stream came from an actual ASK action). Tests that
         drive the reducer directly from initialState (without ASK)
         should still see the legacy "active answer stays in `text`"
         behaviour - the transcript is a UX layer on top of the same
         lifecycle, not a replacement for it. */
      if (!state.pendingQuery) {
        return {
          ...state,
          phase: 'done',
          costUsd: event.costUsd,
          elapsedMs: event.elapsedMs,
          followUps: event.followUps ?? [],
        };
      }
      const citationsList = Array.from(state.citations.values()).sort(
        (a, b) => a.n - b.n,
      );
      const turns: Message[] = [
        ...state.transcript,
        { role: 'user', content: state.pendingQuery },
        {
          role: 'assistant',
          content: state.text,
          citations: citationsList,
          responseId: state.responseId ?? undefined,
        },
      ];
      return {
        ...state,
        phase: 'done',
        costUsd: event.costUsd,
        elapsedMs: event.elapsedMs,
        followUps: event.followUps ?? [],
        transcript: turns,
        text: '',
        citations: new Map(),
        pendingQuery: null,
      };
    }

    case 'error':
      return {
        ...state,
        phase: 'error',
        error: {
          code: event.code,
          message: event.message,
          /* Forward retry-after when present (RATE_LIMITED). Omit
             entirely otherwise so consumers can use `?? null` checks. */
          ...(event.retryAfterSec !== undefined
            ? { retryAfterSec: event.retryAfterSec }
            : {}),
        },
      };
  }
}

/**
 * Reducer entry point. Switches on action kind and either resets,
 * dispatches the SSE event, or marks the stream aborted.
 */
export function reducer(state: DocsBotState, action: DocsBotAction): DocsBotState {
  switch (action.kind) {
    case 'ASK':
      /* New query: clear streaming state, but PRESERVE `transcript`
         so the recap stays visible as the user stacks follow-ups.
         `pendingQuery` records the user's text so the `done` handler
         can stitch it into the transcript pair. The `...initialState`
         spread also resets the research-006 preview fields so a fresh
         ask starts on a clean preview canvas. */
      return {
        ...initialState,
        phase: 'idle',
        transcript: state.transcript,
        pendingQuery: action.query,
      };

    case 'EVENT':
      return applyEvent(state, action.event);

    case 'ABORTED':
      /* Wall-clock timeout or user cancellation. We reuse the error
         phase so the same retry UI surfaces; the code distinguishes
         between "service unavailable" and "we gave up waiting". */
      return {
        ...state,
        phase: 'error',
        error: {
          code: 'ABORTED',
          message: 'stream stopped - retry to continue.',
        },
      };

    case 'RESET':
      return initialState;
  }
}
