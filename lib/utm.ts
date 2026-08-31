/**
 * UTM-tagging helper for outbound links from bernstein.run.
 *
 * Contract:
 *
 *   ``withUtm(url, { source, medium, campaign, content?, term? })``
 *     - ``utm_source`` - origin property (e.g. ``bernstein.run``)
 *     - ``utm_medium`` - channel (e.g. ``outbound-link``)
 *     - ``utm_campaign`` - surface slug (e.g. ``hero-cta``,
 *       ``footer-product``, ``docs-cross-link``)
 *     - ``utm_content`` - optional finer-grain breakdown
 *     - ``utm_term`` - optional keyword bucket
 *
 * Behaviour:
 *
 *   - **Idempotent**. Calling ``withUtm`` on a URL that already carries
 *     all five UTM params returns the input unchanged. Calling it on a
 *     partially-tagged URL fills in missing params; existing values for
 *     the same key win (operator's manually-set tag is sacred).
 *   - **URL-encoded**. Param values pass through ``URLSearchParams`` so
 *     spaces, commas, ``&``, ``#``, etc. are encoded correctly.
 *   - **Hash-preserving**. ``#mentioned-in`` and friends round-trip
 *     intact - the helper appends params to the search string, never to
 *     the fragment.
 *   - **Failure-soft**. A malformed input URL is returned verbatim.
 *     Outbound anchors must keep working even if the helper can't parse
 *     the href (``mailto:``, ``javascript:``, broken templates).
 *
 * Why a local copy:
 *   bernstein-landing is the first property to ship the helper. The
 *   homepage + alexchernysh.com properties will adopt structurally
 *   identical copies; the cross-property design plans a shared package
 *   later. Until then, **every property keeps the same shape and the
 *   same defaults** so downstream attribution joins on a single
 *   contract.
 */

export interface WithUtmOpts {
  /** ``utm_source`` - origin property, e.g. ``bernstein.run``. */
  source: string;
  /** ``utm_medium`` - channel class, e.g. ``outbound-link``. */
  medium: string;
  /** ``utm_campaign`` - surface slug, e.g. ``hero-cta``, ``footer``. */
  campaign: string;
  /** ``utm_content`` - optional finer breakdown. */
  content?: string;
  /** ``utm_term`` - optional keyword bucket. */
  term?: string;
}

/**
 * Append UTM params to ``url`` per ``opts``. Idempotent: existing
 * values win. Returns the input unchanged if it can't be parsed.
 */
export function withUtm(url: string, opts: WithUtmOpts): string {
  if (!url) return url;
  /* mailto:, tel:, javascript:, and other non-http schemes get no UTM
     - passing them through ``URL`` works, but appending search params
     is meaningless for those targets. Detect and short-circuit. */
  const lower = url.toLowerCase();
  if (
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('#')
  ) {
    return url;
  }

  let parsed: URL;
  try {
    /* The base argument lets relative hrefs parse without throwing.
       Relative hrefs (``/blog``, ``#anchor``) shouldn't ever be passed
       to ``withUtm`` - they're internal - but the failure-soft contract
       says the helper still must not throw. */
    parsed = new URL(url, 'https://bernstein.run');
  } catch {
    return url;
  }

  const desired: Array<[string, string | undefined]> = [
    ['utm_source', opts.source],
    ['utm_medium', opts.medium],
    ['utm_campaign', opts.campaign],
    ['utm_content', opts.content],
    ['utm_term', opts.term],
  ];

  for (const [key, val] of desired) {
    if (!val) continue;
    /* Idempotency rule: only set the param if it isn't already present.
       This protects operator-tagged URLs (e.g. SaaSHub's
       ``utm_source=badge``) from being overwritten by a wrapping
       ``withUtm`` call further up the render tree. */
    if (!parsed.searchParams.has(key)) {
      parsed.searchParams.set(key, val);
    }
  }

  /* If the original input was a relative path, ``parsed.toString()``
     would inject ``https://bernstein.run`` as the origin and break the
     contract that internal relative hrefs round-trip unchanged. The
     short-circuit at the top of the function should already cover most
     relative inputs, but defend against the edge case explicitly. */
  if (
    !lower.startsWith('http://') &&
    !lower.startsWith('https://') &&
    !lower.startsWith('//')
  ) {
    /* Re-stringify search + hash from the parsed URL but keep the
       original path. ``parsed.pathname`` already has the leading ``/``
       prepended by ``URL``; if the input didn't start with ``/``, this
       changes the path and we'd corrupt the link. Bail in that case. */
    if (!url.startsWith('/')) return url;
    const search = parsed.search;
    const hash = parsed.hash;
    return `${parsed.pathname}${search}${hash}`;
  }

  return parsed.toString();
}
