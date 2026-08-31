/**
 * Operator-traffic exclusion bootstrap.
 *
 * Loaded as an inline ``<script>`` in ``app/layout.tsx`` BEFORE the
 * Umami tracker so the kill-switch wins the race. When
 * ``localStorage["umami:disabled"] === "true"`` we install a no-op
 * ``window.umami`` stub. Both vectors get neutered:
 *   1. The ``data-umami-event`` auto-tracker calls ``window.umami.
 *      track`` after the script.js boots - it sees our stub and posts
 *      nothing.
 *   2. Programmatic ``track()`` from lib/analytics/events.ts re-checks
 *      localStorage on every call (so the operator can flip the flag
 *      mid-session via DevTools and watch live events stop).
 *
 * Why inline + not a module: this needs to execute synchronously before
 * the Umami script.js, which is loaded with ``defer`` from a CDN. A JS
 * module would race the defer load. Inline string ships the tiniest
 * possible amount of JS into the head.
 *
 * The literal string returned here is what gets stamped into the head
 * of every page. Keep it short and self-contained - no imports, no
 * comments inside the string (parsing surprises). Audit:
 *   - ``localStorage`` access wrapped in try/catch (private mode / iframe).
 *   - The stub ``track``/``identify`` accept any args and return void.
 *   - We DO NOT mutate ``window.umami`` if it is already set (defensive,
 *     because tracker might be inlined by some future build step).
 */

export const OPERATOR_EXCLUDE_INLINE_SCRIPT = `(() => {
  try {
    if (window.localStorage && window.localStorage.getItem('umami:disabled') === 'true') {
      if (!window.umami) {
        window.umami = {
          track: function () {},
          identify: function () {}
        };
      }
    }
  } catch (_) { /* private mode / sandboxed iframe - bail */ }
})();`;
