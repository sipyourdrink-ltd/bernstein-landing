/**
 * The analytics script's before-send hook.
 *
 * Stamped as an inline `<script>` in `app/layout.tsx` before the
 * analytics script tag. It defines `window[UMAMI_BEFORE_SEND]`, which
 * the tracker calls (via its `data-before-send` attribute) before every
 * request it would send. Returning null drops the request.
 *
 *   1. Privacy signals and opt-out. Drops every request when browser
 *      Global Privacy Control (`navigator.globalPrivacyControl === true`)
 *      or Do Not Track (`doNotTrack === "1"`) is active, or when either
 *      `localStorage["umami:disabled"]` or Umami's standard
 *      `localStorage["umami.disabled"]` is `"true"` or `"1"`. Read on
 *      every call so toggling takes effect without a reload.
 *   2. Strict UTM allowlist, fragment scrub, and referrer scheme guard.
 *      Removes `#` fragments and every query parameter except the five
 *      standard `utm_*` campaign keys from `url` and `referrer`, clears
 *      any `referrer` lacking a valid `http:`/`https:` scheme rather
 *      than resolving it relative to `bernstein.run`, and drops
 *      duplicate consecutive page views for the same cleaned address.
 *
 * Keep the string short and self-contained - no imports, no comments
 * inside it. Browser global and storage access are wrapped in try/catch
 * (private mode, sandboxed iframe).
 */

export const UMAMI_DISABLED_KEY = 'umami:disabled';

export const UMAMI_STANDARD_DISABLED_KEY = 'umami.disabled';

export const UMAMI_BEFORE_SEND = 'umamiBeforeSend';

/** Only standard UTM campaign parameters may remain on analytics URLs. */
export const ALLOWED_URL_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

function isOptOutValue(v: string | null | undefined): boolean {
  return v === 'true' || v === '1';
}

/**
 * Synchronous client-side opt-out guard called before any `window.umami?.track(...)`
 * invocation so GPC, DNT, and `localStorage` opt-out flags remain enforced even if
 * the external tracker script ignores `data-before-send`. Fails closed (`true`)
 * when browser globals or storage throw (e.g. sandboxed iframe).
 */
export function isAnalyticsOptedOut(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const nav = window.navigator as Navigator & { globalPrivacyControl?: boolean };
    const win = window as Window & { doNotTrack?: string };
    if (nav && (nav.globalPrivacyControl === true || nav.doNotTrack === '1')) {
      return true;
    }
    if (win.doNotTrack === '1') {
      return true;
    }
    if (
      window.localStorage &&
      (isOptOutValue(window.localStorage.getItem(UMAMI_DISABLED_KEY)) ||
        isOptOutValue(window.localStorage.getItem(UMAMI_STANDARD_DISABLED_KEY)))
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

export const OPERATOR_EXCLUDE_INLINE_SCRIPT = `(() => {
  var allow = ${JSON.stringify(ALLOWED_URL_PARAMS)};
  var lastView = null;
  function optedOut(v) {
    return v === 'true' || v === '1';
  }
  function clean(u) {
    try {
      var x = new URL(u, window.location.href);
      Array.from(x.searchParams.keys()).forEach(function (k) {
        if (allow.indexOf(k) === -1) x.searchParams.delete(k);
      });
      x.hash = '';
      return x.toString();
    } catch (_) { return ''; }
  }
  function cleanRef(r) {
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(r)) return '';
    try {
      var x = new URL(r);
      if (x.protocol !== 'https:' && x.protocol !== 'http:') return '';
      return clean(x.toString());
    } catch (_) { return ''; }
  }
  window.${UMAMI_BEFORE_SEND} = function (type, payload) {
    try {
      if (
        (window.navigator && (window.navigator.globalPrivacyControl === true || window.navigator.doNotTrack === '1')) ||
        window.doNotTrack === '1'
      ) {
        return null;
      }
      if (
        window.localStorage && (
          optedOut(window.localStorage.getItem('${UMAMI_DISABLED_KEY}')) ||
          optedOut(window.localStorage.getItem('${UMAMI_STANDARD_DISABLED_KEY}'))
        )
      ) {
        return null;
      }
    } catch (_) { return null; }
    if (!payload || typeof payload !== 'object') return payload;
    var out = Object.assign({}, payload);
    if (out.url) out.url = clean(out.url);
    if (out.referrer) out.referrer = cleanRef(out.referrer);
    if (type === 'event' && !out.name) {
      if (out.url === lastView) return null;
      lastView = out.url;
    }
    return out;
  };
})();`;
