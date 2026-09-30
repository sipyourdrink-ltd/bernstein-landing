/**
 * Static `as featured in` data for the in-fold SocialProofStrip.
 *
 * Voice rule: ONLY operator-confirmed badges. Add new entries only
 * after the operator confirms the listing exists and the badge URL is
 * current.
 *
 * Each entry is rendered as a single link with lowercase copy in the
 * strip. The list is currently empty, so the block renders nothing.
 */

export interface SocialProofItem {
  /** Canonical id used by the umami event prop. */
  id: string;
  /** Display label in the strip. lowercase. */
  label: string;
  /** Outbound href. */
  href: string;
  /** Optional aria-label override; falls back to `featured in: ${label}`. */
  ariaLabel?: string;
}

// Self-submitted aggregator entries (CodeTrendy, SaaSHub) were removed
// in issue #35 - submission-driven listings carry low signal and
// rendered as "thirsty" to the engineer audience the strip targets.
// Add new entries only after the operator confirms an earned editorial
// pickup (Python Weekly, Future Digest, awesome-agentic-patterns, etc.).
// While the list is empty, the strip is guarded to render nothing.
export const SOCIAL_PROOF_ITEMS: readonly SocialProofItem[] = [];
