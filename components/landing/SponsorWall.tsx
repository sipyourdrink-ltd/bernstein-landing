/**
 * SponsorWall - sponsorkit-style avatar grid.
 *
 * Render contract:
 *   - 64px circular avatars (plain <img>; no avatar lib, no new deps).
 *   - rel="external noopener noreferrer" on every link out to GitHub.
 *   - Each slot has aria-label + alt text with the sponsor's GH login.
 *   - When the input array is empty we render a single placeholder card
 *     reading "first three sponsors get listed by name on the homepage."
 *   - When the input array is non-empty but below MIN_VISIBLE (=5), we
 *     render the real avatars and top up with neutral placeholder cards
 *     so the row doesn't look broken at low counts. Placeholders never
 *     assert they are sponsors.
 *
 * Reuse:
 *   The component is consumable from /sponsors today and from the
 *   homepage hero ONCE the sponsor count crosses 5. Per the research
 *   plan, the homepage mount is held until that threshold; nothing
 *   here forces it. The .tsx is import-only - no auto-mount.
 *
 * Test surface:
 *   The pure ordering + slot-build logic lives in
 *   `sponsor-wall-data.ts` so the test runner (`node --test
 *   --experimental-strip-types`) can import it without JSX. JSX is
 *   verified manually via `next build` and `next dev`; the component
 *   has no client-only behaviour.
 */
import {
  buildWallSlots,
  type Sponsor,
  type WallSlot,
} from './sponsor-wall-data';

interface SponsorWallProps {
  /** Server-fetched sponsors. Empty array is the legitimate "no
   *  sponsors yet" state - we render the placeholder copy, not a
   *  manufactured count. */
  sponsors: readonly Sponsor[];
  /** Optional heading rendered above the grid. The /sponsors page
   *  passes its own; the homepage (when later mounted) will pass
   *  `null` so the hero owns the heading hierarchy. */
  heading?: string | null;
}

const AVATAR_PX = 64;

function isSponsorSlot(slot: WallSlot): slot is Sponsor & { kind: 'sponsor' } {
  return slot.kind === 'sponsor';
}

export function SponsorWall({ sponsors, heading = 'who sponsors bernstein' }: SponsorWallProps) {
  const slots = buildWallSlots(sponsors);
  const realCount = sponsors.length;

  return (
    <section
      className="sponsor-wall"
      aria-label={heading ?? 'sponsors'}
      data-sponsor-count={realCount}
    >
      {heading ? <h2 className="sponsor-wall__heading">{heading}</h2> : null}
      <ul
        className={
          realCount === 0
            ? 'sponsor-wall__grid sponsor-wall__grid--empty'
            : 'sponsor-wall__grid'
        }
        role="list"
      >
        {slots.map((slot, i) => (
          <li
            key={isSponsorSlot(slot) ? `sponsor-${slot.login}` : `placeholder-${i}`}
            className={
              isSponsorSlot(slot)
                ? 'sponsor-wall__cell sponsor-wall__cell--real'
                : 'sponsor-wall__cell sponsor-wall__cell--placeholder'
            }
          >
            {isSponsorSlot(slot) ? (
              <a
                href={slot.profileUrl}
                rel="external noopener noreferrer"
                target="_blank"
                aria-label={`${slot.name} on github`}
                title={slot.name}
                data-umami-event="sponsor-avatar-click"
                data-umami-event-source="sponsor-wall"
                data-umami-event-login={slot.login}
              >
                {/* plain <img> on purpose: no next/image because the
                    avatar URLs are off-domain and we want server-only
                    fetch behaviour. width/height set in pixels for
                    layout-stable rendering on first paint. */}
                <img
                  src={slot.avatarUrl}
                  alt={`${slot.name} (@${slot.login})`}
                  width={AVATAR_PX}
                  height={AVATAR_PX}
                  loading="lazy"
                  decoding="async"
                  className="sponsor-wall__avatar"
                />
                <span className="sponsor-wall__login">@{slot.login}</span>
              </a>
            ) : (
              <div
                role="note"
                aria-label="open sponsor slot"
                className="sponsor-wall__placeholder"
              >
                <div className="sponsor-wall__placeholder-frame" aria-hidden="true">
                  <span aria-hidden="true">+</span>
                </div>
                <p className="sponsor-wall__placeholder-caption">{slot.caption}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
