/**
 * Analytics opt-out.
 *
 * Stamped as an inline `<script>` in `app/layout.tsx` before the
 * analytics script tag. It defines `window[UMAMI_BEFORE_SEND]`, which
 * the tracker calls (via its `data-before-send` attribute) before every
 * request it would send - page views and events alike. When
 * `localStorage["umami:disabled"] === "true"` the hook returns null and
 * the tracker sends nothing. The flag is read on every call, so setting
 * or clearing it takes effect without a reload.
 *
 * Keep the string short and self-contained - no imports, no comments
 * inside it. `localStorage` access is wrapped in try/catch (private mode,
 * sandboxed iframe).
 */

export const UMAMI_DISABLED_KEY = 'umami:disabled';

export const UMAMI_BEFORE_SEND = 'umamiBeforeSend';

export const OPERATOR_EXCLUDE_INLINE_SCRIPT = `(() => {
  window.${UMAMI_BEFORE_SEND} = function (type, payload) {
    try {
      if (window.localStorage && window.localStorage.getItem('${UMAMI_DISABLED_KEY}') === 'true') {
        return null;
      }
    } catch (_) { /* private mode / sandboxed iframe */ }
    return payload;
  };
})();`;
