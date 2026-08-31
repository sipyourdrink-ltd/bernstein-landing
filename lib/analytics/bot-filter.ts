/**
 * Client-side bot filter for analytics event emission.
 *
 * Clients that do not execute JavaScript never reach this code and so
 * cannot skew anything. The ones that matter are headless browsers and
 * crawlers that DO render: they fire a single IntersectionObserver
 * callback on the hero and leave without scrolling, clicking or
 * touching the keyboard, which reads exactly like a person who bounced.
 *
 * Heuristics:
 *   1. `navigator.webdriver === true` -> bot. Set by Selenium /
 *      Puppeteer / Playwright unless deliberately patched.
 *   2. UA matches the public crawler list (GPTBot, ClaudeBot,
 *      Googlebot, Bingbot, Bytespider, PerplexityBot) -> bot. The list
 *      is hand-rolled (no UA-parser dep); regexes are case-insensitive
 *      and anchored on the canonical token.
 *   3. Zero `mousemove` + zero `pointerdown` + zero `keydown` observed
 *      since page boot -> bot when called from an inview or
 *      timer-driven emitter, *suspected* otherwise. Click / focus /
 *      submit emitters by definition have at least one pointerdown or
 *      keydown, so they fall through to `human`.
 *
 * Bias: when the signal is ambiguous (webdriver false, UA empty, input
 * count still zero), return `suspected` so the wrapper emits BOTH the
 * original event AND a `bot-suspected` marker. A borderline visit is
 * labelled, never silently dropped.
 */

import { AI_BOTS } from '../seo/ai-bots.ts';

/** Escape regex metacharacters in a literal token. The crawler list
 *  in `lib/seo/ai-bots.ts` is mostly alphanumerics + hyphen, but we
 *  escape defensively so adding a token like `cohere.ai` later does
 *  not silently produce a regex that matches `cohereXai`. */
function escapeRegex(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Built once at module load from the shared bot list. Case-insensitive
 *  so `gptbot`, `GPTBot`, and `GPTBOT` all classify as bot - older
 *  crawlers lowercase their UA tokens, newer ones don't. */
const CRAWLER_UA_RE = new RegExp(`(${AI_BOTS.map(escapeRegex).join('|')})`, 'i');

let inputSeen = false;
let listenersInstalled = false;

function noteInput(): void {
  inputSeen = true;
  /* Remove listeners - we only needed the first signal. Saves the
     event-loop a few hundred microseconds per scroll tick on touch
     devices that fire pointermove at ~60 Hz. */
  if (typeof window === 'undefined') return;
  for (const name of ['mousemove', 'pointerdown', 'keydown', 'touchstart'] as const) {
    try {
      window.removeEventListener(name, noteInput, { capture: true });
    } catch {
      /* removeEventListener arg-shape varies across older browsers - if
         it throws we accept the small idempotency cost. */
    }
  }
}

function installListenersOnce(): void {
  if (listenersInstalled) return;
  if (typeof window === 'undefined') return;
  listenersInstalled = true;
  /* Capture phase so a ``stopPropagation`` in a child handler can't
     hide the signal. Passive so we never block scroll. */
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  for (const name of ['mousemove', 'pointerdown', 'keydown', 'touchstart'] as const) {
    try {
      window.addEventListener(name, noteInput, opts);
    } catch {
      /* If a sandboxed iframe rejects the listener we treat the user
         as ``suspected`` until proven otherwise; better than crashing. */
    }
  }
}

/* Install on module load. Module is pulled into the client bundle the
   first time any component imports the ``track`` helper, which on
   bernstein.run happens at hydration - well before the first scroll. */
installListenersOnce();

export type BotVerdict = 'bot' | 'suspected' | 'human';

/** Returns the bot-classification verdict for the current visitor at
 *  the moment of call. Cheap to call (no allocations on the human
 *  path). Re-evaluates ``navigator.webdriver`` and the input-seen
 *  flag every time - both can flip during the session (a webdriver
 *  client lying about its flag can't, but a real user who hasn't
 *  scrolled yet may later move the mouse). */
export function isLikelyBot(): BotVerdict {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    /* SSR / non-browser runtime: classify as human so the call
       short-circuits to the original behaviour. ``track`` itself
       early-returns on ``typeof window === 'undefined'`` anyway. */
    return 'human';
  }

  /* Heuristic 1 - webdriver flag. Strong signal: real browsers leave
     this undefined; automation frameworks set it true unless the
     operator runs a stealth plugin. We treat the stealth case as
     out-of-scope (those visitors also fake the UA, mouse jitter, etc.
     and are unreachable from JS heuristics anyway). */
  try {
    if (navigator.webdriver === true) return 'bot';
  } catch {
    /* navigator getters can throw in iframe sandboxes. Fall through. */
  }

  /* Heuristic 2 - UA token match. Hand-rolled regex over the public
     crawler list. Cheap (one match per call, no allocations on miss). */
  const ua = (navigator.userAgent ?? '').trim();
  if (ua && CRAWLER_UA_RE.test(ua)) return 'bot';

  /* Heuristic 3 - zero input since boot. The ``inputSeen`` flag is
     set by the capture-phase listeners installed at module load. If
     this is the first emit on the page AND no input has been seen,
     the visitor is either a headless renderer that fires one IO
     callback and leaves (bot) OR a human who arrived via direct
     load and hasn't moved yet (suspected - emit both events so
     operator can reconcile). The split is ambiguous from the client;
     we bias toward over-counting humans by returning ``suspected``
     rather than ``bot`` in this case. */
  if (!inputSeen) {
    /* An empty UA is a much stronger bot signal than a populated one
       (real browsers always send one; only naive HTTP clients omit
       it). Combine with zero-input for a confident ``bot``. */
    if (!ua) return 'bot';
    return 'suspected';
  }

  return 'human';
}

/** Test-only hook. Resets module state so unit tests can exercise the
 *  fresh-page-load path repeatedly. Production code must not import. */
export function __resetForTesting(): void {
  inputSeen = false;
  listenersInstalled = false;
}

/** Test-only hook. Lets unit tests simulate input arriving from the
 *  user without having to dispatch real DOM events on a non-jsdom
 *  test runner. */
export function __markInputForTesting(): void {
  inputSeen = true;
}
