'use client';

/**
 * FollowUps - three suggested next questions, click runs a new query.
 *
 * The gateway emits these on the `done` event (when grounded). The UI
 * just renders three pill buttons; the actual question text is what
 * lands in the input on click. We dispatch a fresh `ASK` from the
 * parent rather than re-using a hash anchor - sharing follow-ups is
 * out of scope for v1 and the input box is the canonical surface.
 *
 * Empty `suggestions` → render nothing. The parent already gates this
 * on `phase === 'done'` but we re-check defensively.
 */
interface FollowUpsProps {
  suggestions: string[];
  onSelect: (question: string) => void;
}

function trackFollowUp(question: string): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { umami?: { track: (n: string, d?: Record<string, unknown>) => void } };
  /* Only the first 80 chars to keep umami payload small; the full
     question is in the URL/state anyway. */
  w.umami?.track('docs-bot-followup-click', { question: question.slice(0, 80) });
}

export function FollowUps({ suggestions, onSelect }: FollowUpsProps) {
  if (!suggestions.length) return null;
  /* Cap at three: matches gateway contract and gives a predictable
     visual rhythm. If the gateway ever sends four we still only show
     three. */
  const items = suggestions.slice(0, 3);
  return (
    <div className="docs-bot-followups" aria-label="follow-up suggestions">
      <p className="docs-bot-followups-label">try a follow-up</p>
      <ul className="docs-bot-followups-list">
        {items.map((q) => (
          <li key={q}>
            <button
              type="button"
              className="docs-bot-followup-pill"
              onClick={() => {
                trackFollowUp(q);
                onSelect(q);
              }}
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
