/**
 * StaffDivider - five-line musical staff hairline used between every
 * major section. Reads as "musical staff" up close and "subtle separator"
 * from far away. Pure SVG, no animation, no labels.
 *
 * The five lines are spaced 2px apart to evoke a treble-clef staff
 * without becoming an obvious motif. Hidden from assistive tech.
 */
export function StaffDivider() {
  return (
    <div className="staff-divider" aria-hidden="true" role="presentation">
      <svg
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1="0" y1="1" x2="100" y2="1" />
        <line x1="0" y1="3.5" x2="100" y2="3.5" />
        <line x1="0" y1="6" x2="100" y2="6" />
        <line x1="0" y1="8.5" x2="100" y2="8.5" />
        <line x1="0" y1="11" x2="100" y2="11" />
      </svg>
    </div>
  );
}
