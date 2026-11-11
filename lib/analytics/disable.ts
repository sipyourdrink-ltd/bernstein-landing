/**
 * The analytics script's before-send hook.
 *
 * Stamped as an inline `<script>` in `app/layout.tsx` before the
 * analytics script tag. It defines `window[UMAMI_BEFORE_SEND]`, which
 * the tracker calls (via its `data-before-send` attribute) before every
 * request it would send. Returning null drops the request.
 *
 *   1. Opt-out. When `localStorage["umami:disabled"] === "true"` every
 *      request is dropped. The flag is read on every call, so setting
 *      or clearing it takes effect without a reload.
 *   2. Typed text stays out of page addresses. The docs assistant
 *      mirrors the question being typed into the address bar (`?q=`,
 *      and `?ask=` for the dialog); the tracker reports every address
 *      change as a page view. The hook removes those two parameters
 *      from the page and referrer addresses, and drops a page view
 *      whose cleaned address equals the previous one.
 *
 * Keep the string short and self-contained - no imports, no comments
 * inside it. `localStorage` access is wrapped in try/catch (private mode,
 * sandboxed iframe).
 */

export const UMAMI_DISABLED_KEY = 'umami:disabled';

export const UMAMI_BEFORE_SEND = 'umamiBeforeSend';

/** Query parameters that carry text typed into the docs assistant. */
export const STRIPPED_URL_PARAMS = ['q', 'ask'] as const;

export const OPERATOR_EXCLUDE_INLINE_SCRIPT = `(() => {
  var strip = ${JSON.stringify(STRIPPED_URL_PARAMS)};
  var lastView = null;
  function clean(u) {
    try {
      var x = new URL(u, window.location.href);
      strip.forEach(function (k) { x.searchParams.delete(k); });
      return x.toString();
    } catch (_) { return u; }
  }
  window.${UMAMI_BEFORE_SEND} = function (type, payload) {
    try {
      if (window.localStorage && window.localStorage.getItem('${UMAMI_DISABLED_KEY}') === 'true') {
        return null;
      }
    } catch (_) { /* private mode / sandboxed iframe */ }
    if (!payload || typeof payload !== 'object') return payload;
    var out = Object.assign({}, payload);
    if (out.url) out.url = clean(out.url);
    if (out.referrer) out.referrer = clean(out.referrer);
    if (type === 'event' && !out.name) {
      if (out.url === lastView) return null;
      lastView = out.url;
    }
    return out;
  };
})();`;
