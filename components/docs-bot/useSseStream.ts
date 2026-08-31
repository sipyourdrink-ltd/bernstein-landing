'use client';

/**
 * Web Streams SSE consumer hook.
 *
 * Why no library:
 *   - The browser's `EventSource` is limited to GET; we need POST so
 *     the body carries the query rather than being URL-encoded into a
 *     query string the gateway then has to parse.
 *   - `fetch` + `ReadableStream.getReader()` is roughly fifteen lines
 *     of code to do the right thing. Pulling in `eventsource-parser`
 *     or similar would add ~3KB gzipped for one feature.
 *   - Bundle target for the docs-bot route is ≤30KB gzipped; a hand-
 *     rolled SSE parser is well inside the budget.
 *
 * Wall-clock guard: 30s per ticket spec. Per-ask AbortController so we
 * can also cancel mid-stream from a stop button. The hook tracks both
 * an internal abort (timeout) and an external one (caller-passed
 * signal) by chaining controllers.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AskRequest, Citation, SseEvent } from './types.ts';

const WALL_CLOCK_MS = 30_000;
const ENDPOINT = '/api/ask';

export type UseSseStreamApi = {
  /** Kick off a new stream. Cancels any in-flight one. */
  ask: (req: AskRequest) => void;
  /** Manual stop - used by the "stopped" retry button. */
  stop: () => void;
  /** Whether a stream is currently open. */
  isStreaming: boolean;
};

/**
 * @param onEvent - called once per parsed SSE event. The reducer
 *                  consumer wraps this in `dispatch({ kind: 'EVENT' })`.
 * @param onAborted - called when the wall-clock timer trips or the
 *                    caller invoked `stop()`.
 * @param onError - called when the connection itself fails (network
 *                  error, non-200 from the proxy, malformed body).
 *                  `retryAfterSec` is populated for 429 responses so
 *                  the UI can show a rate-limit countdown.
 */
export function useSseStream(
  onEvent: (event: SseEvent) => void,
  onAborted: () => void,
  onError: (code: string, message: string, retryAfterSec?: number) => void,
): UseSseStreamApi {
  const controllerRef = useRef<AbortController | null>(null);
  const wallClockRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isStreaming, setStreaming] = useState(false);

  /* Latest-handler refs so the `ask` closure doesn't recreate when
     consumers pass new (non-memoised) callbacks. The hook becomes a
     stable surface that React effects can depend on. */
  const onEventRef = useRef(onEvent);
  const onAbortedRef = useRef(onAborted);
  const onErrorRef = useRef(onError);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { onAbortedRef.current = onAborted; }, [onAborted]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  /**
   * Cancel whatever stream is in flight. Safe to call when nothing is
   * running. Also clears the wall-clock timer; `stop()` is the public
   * face of this and `ask` calls it before opening a new stream.
   */
  const cleanup = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    if (wallClockRef.current) {
      clearTimeout(wallClockRef.current);
      wallClockRef.current = null;
    }
    setStreaming(false);
  }, []);

  const stop = useCallback(() => {
    cleanup();
    onAbortedRef.current();
  }, [cleanup]);

  const ask = useCallback(
    (req: AskRequest) => {
      cleanup();
      const controller = new AbortController();
      controllerRef.current = controller;

      /* Wall-clock guard. If the gateway hangs or sentinel is slow we
         abort and let the UI show the "stopped - retry" affordance.
         30s matches the ticket's risk-mitigation budget. */
      wallClockRef.current = setTimeout(() => {
        controller.abort();
        onAbortedRef.current();
      }, WALL_CLOCK_MS);

      setStreaming(true);

      void runStream(req, controller.signal, onEventRef.current, onErrorRef.current)
        .finally(() => {
          if (wallClockRef.current) {
            clearTimeout(wallClockRef.current);
            wallClockRef.current = null;
          }
          /* Don't reset isStreaming if a newer ask has replaced this
             controller. Otherwise the spinner would briefly disappear
             between two back-to-back asks. */
          if (controllerRef.current === controller) {
            controllerRef.current = null;
            setStreaming(false);
          }
        });
    },
    [cleanup],
  );

  /* Tear down on unmount so a navigate-away doesn't leak a fetch. */
  useEffect(() => () => cleanup(), [cleanup]);

  return { ask, stop, isStreaming };
}

/**
 * Open a POST `/api/ask` and parse SSE frames out of the body. SSE
 * frames are blank-line-separated; each frame can have multiple
 * `data:` lines whose payloads concatenate. We expect each frame to
 * carry a single JSON event.
 *
 * The parser is intentionally tiny: it handles `data:`, ignores
 * comments (`:` line) and other field types (`event:`, `id:`, etc.)
 * because the gateway doesn't emit them.
 */
async function runStream(
  req: AskRequest,
  signal: AbortSignal,
  onEvent: (event: SseEvent) => void,
  onError: (code: string, message: string, retryAfterSec?: number) => void,
): Promise<void> {
  let response: Response;
  /* Wire-shape: forward query, optional responseId, and (capped)
     history. The cap below is the client-side belt; the gateway also
     caps server-side as a safety net so a custom client can't paste
     a 1000-turn buffer at us. */
  const HISTORY_CAP = 8;
  const wireBody: AskRequest = {
    query: req.query,
    responseId: req.responseId,
    history: req.history?.slice(-HISTORY_CAP),
  };
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(wireBody),
      signal,
    });
  } catch (err) {
    if (signal.aborted) return; /* user/timer cancelled */
    onError('NETWORK', (err as Error).message ?? 'network error');
    return;
  }

  if (!response.ok || !response.body) {
    let code = 'UPSTREAM';
    let message = `HTTP ${response.status}`;
    let retryAfterSec: number | undefined;
    /* Read body first - for the proxy's fail-closed paths the body is
       a single SSE-encoded `error` frame whose JSON payload carries
       `code` + `message`. We try to parse that out so the UI sees the
       proxy's own taxonomy (e.g. RATE_LIMITED, INVALID_PARAMS) rather
       than collapsing every non-2xx into 'UPSTREAM'. */
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch {
      /* keep default */
    }
    const parsed = parseProxyErrorFrame(bodyText);
    if (parsed) {
      code = parsed.code;
      message = parsed.message || message;
    } else if (bodyText) {
      message = bodyText.slice(0, 200);
    }
    /* Status-code overrides for the canonical buckets. The proxy
       always tags 429 as RATE_LIMITED in the body too, but we belt-
       and-brace in case a future intermediary (CF, Caddy) returns
       its own 429 page without an SSE frame. */
    if (response.status === 503) code = 'SERVICE_UNAVAILABLE';
    if (response.status === 429) {
      code = 'RATE_LIMITED';
      const headerValue = response.headers.get('Retry-After');
      const headerSec = parseRetryAfterHeader(headerValue);
      if (headerSec !== null) retryAfterSec = headerSec;
    }
    onError(code, message, retryAfterSec);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    /* eslint-disable-next-line no-constant-condition */
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = drainFrames(buffer, onEvent);
    }
    /* Flush whatever's left after the stream closes. The gateway
       always finishes with a blank line, but a flaky upstream might
       drop the trailer. We try to parse the tail just in case. */
    if (buffer.trim().length > 0) {
      drainFrames(buffer + '\n\n', onEvent);
    }
  } catch (err) {
    if (!signal.aborted) {
      onError('STREAM', (err as Error).message ?? 'stream error');
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* lock may already be released if the reader cancelled */
    }
  }
}

/**
 * Pull complete SSE frames out of a buffer. Returns the unparsed
 * remainder so the caller can prepend the next chunk to it. Frames
 * are separated by `\n\n`; each `data:` line within a frame is a
 * payload fragment that we concatenate before JSON-parsing.
 */
function drainFrames(buffer: string, onEvent: (event: SseEvent) => void): string {
  let rest = buffer;
  while (true) {
    const idx = rest.indexOf('\n\n');
    if (idx < 0) return rest;
    const frame = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    const parsed = parseFrame(frame);
    if (parsed === null) continue;
    try {
      const data = JSON.parse(parsed.payload) as Record<string, unknown>;
      const event = normalizeEvent(parsed.eventName, data);
      if (event) onEvent(event);
    } catch {
      /* Drop unparseable frame - the gateway is well-formed; if we
         see garbage it's almost certainly a partial flush we'll
         glue back together on the next read. */
    }
  }
}

/**
 * Pull `event:` and `data:` fields out of an SSE frame.
 *
 * SSE-spec compliant: an event has a NAME on its own `event:` line and
 * a PAYLOAD on one or more `data:` lines (joined by newlines). The
 * gateway emits this shape; our reducer wants `{type, …}` so the
 * normalisation step below stitches the two together.
 */
function parseFrame(frame: string): { eventName: string | null; payload: string } | null {
  const lines = frame.split('\n');
  const datas: string[] = [];
  let eventName: string | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith(':')) continue; /* comment */
    if (line.startsWith('event:')) {
      let value = line.slice(6);
      if (value.startsWith(' ')) value = value.slice(1);
      eventName = value;
      continue;
    }
    if (!line.startsWith('data:')) continue;
    let value = line.slice(5);
    if (value.startsWith(' ')) value = value.slice(1);
    datas.push(value);
  }
  if (datas.length === 0) return null;
  return { eventName, payload: datas.join('\n') };
}

/**
 * Translate a gateway SSE frame ({event-name} + {snake_case payload})
 * into the camelCase tagged-union shape the reducer expects.
 *
 * The gateway is the source of truth for what arrives on the wire; the
 * reducer is the source of truth for what the React tree consumes.
 * This function is the only place where the two vocabularies meet.
 */
function normalizeEvent(eventName: string | null, data: Record<string, unknown>): SseEvent | null {
  switch (eventName) {
    case 'meta':
      return {
        type: 'meta',
        responseId: String(data.response_id ?? data.responseId ?? ''),
        model: String(data.model ?? ''),
      };
    case 'token':
      return { type: 'token', delta: String(data.delta ?? '') };
    case 'citation': {
      /* Gateway wraps the Citation under `data.citation` per
         schemas.py::StreamCitation. Older shape (flat) supported
         as fallback so a legacy gateway response still renders. */
      const inner =
        (data.citation as Record<string, unknown> | undefined) ?? data;
      return {
        type: 'citation',
        n: Number(inner.n ?? 0),
        title: String(inner.title ?? ''),
        url: String(inner.url ?? ''),
        excerpt: String(inner.excerpt ?? ''),
        /* Post-rerank relevance (0..1). Optional on the wire so an
           older gateway build without it degrades to "no hint". */
        ...(typeof inner.score === 'number' && Number.isFinite(inner.score)
          ? { score: inner.score }
          : {}),
      };
    }
    case 'decline-replace': {
      /* Structured decline (schemas.py::StreamDeclineReplace). `text`
         REPLACES the streamed body; `suggestions` are flat Citation
         objects, already URL-deduped and capped at 3 server-side. We
         still filter/coerce defensively so one malformed suggestion
         degrades to "fewer links" rather than a dropped frame. */
      const rawSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      const suggestions: Citation[] = [];
      for (const raw of rawSuggestions) {
        if (raw === null || typeof raw !== 'object') continue;
        const s = raw as Record<string, unknown>;
        suggestions.push({
          n: Number(s.n ?? 0),
          title: String(s.title ?? ''),
          url: String(s.url ?? ''),
          excerpt: String(s.excerpt ?? ''),
          ...(typeof s.score === 'number' && Number.isFinite(s.score)
            ? { score: s.score }
            : {}),
        });
      }
      return {
        type: 'decline-replace',
        text: String(data.text ?? ''),
        suggestions,
      };
    }
    case 'done':
      return {
        type: 'done',
        costUsd: Number(data.cost_usd ?? data.costUsd ?? 0),
        elapsedMs: Number(data.elapsed_ms ?? data.elapsedMs ?? 0),
        declined: Boolean(data.declined),
      };
    /* research-006 - progressive TTFT preview frames. Same payload
       shape as their non-preview siblings; we keep the parsing tight
       so a malformed gateway frame degrades to "no preview" rather
       than leaking into the regular event channel. */
    case 'preview-token':
      return { type: 'preview-token', delta: String(data.delta ?? '') };
    case 'preview-citation': {
      const inner =
        (data.citation as Record<string, unknown> | undefined) ?? data;
      return {
        type: 'preview-citation',
        n: Number(inner.n ?? 0),
        title: String(inner.title ?? ''),
        url: String(inner.url ?? ''),
        excerpt: String(inner.excerpt ?? ''),
      };
    }
    case 'preview-done':
      return {
        type: 'preview-done',
        declined: Boolean(data.declined),
        costUsd: Number(data.cost_usd ?? data.costUsd ?? 0),
        elapsedMs: Number(data.elapsed_ms ?? data.elapsedMs ?? 0),
      };
    case 'error':
      return {
        type: 'error',
        code: String(data.code ?? 'UNKNOWN'),
        message: String(data.message ?? ''),
      };
    default:
      return null;
  }
}

/**
 * Pull `{code,message}` from the SSE-encoded error body the proxy
 * synthesises on its fail-closed paths (`errorStream` in
 * `app/api/ask/route.ts`). The body shape is exactly
 * `event: error\ndata: {"type":"error","code":"...","message":"..."}\n\n`
 * - a single frame. We don't run the full SSE parser here; a targeted
 * `data:` extraction (the `event:` line is skipped) keeps the not-ok
 * branch minimal.
 *
 * Returns null when the body isn't a recognisable error frame so the
 * caller can fall back to the raw text excerpt.
 */
function parseProxyErrorFrame(
  body: string,
): { code: string; message: string } | null {
  if (!body) return null;
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.startsWith('data:')) continue;
    let value = line.slice(5);
    if (value.startsWith(' ')) value = value.slice(1);
    try {
      const obj = JSON.parse(value) as { type?: unknown; code?: unknown; message?: unknown };
      if (obj.type !== 'error') return null;
      return {
        code: typeof obj.code === 'string' ? obj.code : 'UNKNOWN',
        message: typeof obj.message === 'string' ? obj.message : '',
      };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Parse a `Retry-After` HTTP header value into seconds. The header is
 * either a delta-seconds integer (the proxy always emits this shape)
 * or an HTTP-date (RFC 7231 §7.1.3). We support both because a future
 * intermediary may rewrite the header.
 *
 * Returns null on unparseable / empty input so the caller can decide
 * a sensible fallback. Negative or zero values are clamped out - they
 * almost certainly indicate a clock skew between proxy and client.
 */
function parseRetryAfterHeader(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  /* Pure integer → delta seconds. */
  if (/^\d+$/.test(trimmed)) {
    const sec = Number.parseInt(trimmed, 10);
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  }
  /* HTTP-date → diff from now in seconds. */
  const ts = Date.parse(trimmed);
  if (!Number.isFinite(ts)) return null;
  const sec = Math.round((ts - Date.now()) / 1000);
  return sec > 0 ? sec : null;
}
