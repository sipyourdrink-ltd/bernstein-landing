'use client';

/**
 * SponsorStrip - compact in-fold sponsor row (conv-002).
 *
 * Mount contract:
 *   - Renders the top N (up to MAX_VISIBLE) sponsors as a single
 *     ≤80px row immediately under the hero. Monochrome by default,
 *     hover restores colour. Each cell links out to the sponsor's
 *     GitHub profile with `rel="sponsored noopener"`.
 *   - When the sponsor list is empty (no token configured, an
 *     empty list) the component renders nothing. The full
 *     `<SponsorWall/>` on /sponsors handles the empty state; the fold
 *     strip is an additive surface, not the canonical wall.
 *
 * Visibility budget:
 *   - 5 sponsors visible across desktop. Mobile wraps; we never
 *     hide rows.
 *   - Avatar is a 28px circle (compact density). The visible login
 *     name accompanies the avatar so the strip reads as people, not
 *     pure logos. Helps when avatars are letter-tiles.
 */

import {
  orderSponsors,
  type Sponsor,
} from './sponsor-wall-data';

interface SponsorStripProps {
  sponsors: readonly Sponsor[];
}

const MAX_VISIBLE = 5;
const AVATAR_PX = 28;

export function SponsorStrip({ sponsors }: SponsorStripProps) {
  if (sponsors.length === 0) return null;

  const visible = orderSponsors(sponsors).slice(0, MAX_VISIBLE);

  return (
    <section
      className="sponsor-strip-fold"
      aria-labelledby="sponsor-strip-fold-label"
    >
      <p id="sponsor-strip-fold-label" className="sponsor-strip-fold__label">
        sponsored by
      </p>
      <ul className="sponsor-strip-fold__row" role="list">
        {visible.map((s) => (
          <li key={s.login} className="sponsor-strip-fold__cell">
            <a
              href={s.profileUrl}
              rel="sponsored noopener noreferrer"
              target="_blank"
              aria-label={`Sponsor: ${s.name}`}
              className="sponsor-strip-fold__link"
            >
              <img
                src={s.avatarUrl}
                alt=""
                width={AVATAR_PX}
                height={AVATAR_PX}
                loading="lazy"
                decoding="async"
                className="sponsor-strip-fold__avatar"
              />
              <span className="sponsor-strip-fold__login">@{s.login}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
