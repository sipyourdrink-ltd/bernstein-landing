// Flow diagram for the "How it works" section. Inline SVG keeps pixel
// alignment (ASCII couldn't — JetBrains Mono rendered variably across
// browsers) without pulling in a flow-chart library. All colors resolve
// from CSS custom properties so dark-palette tokens flow through.

export function HowItWorksDiagram() {
  const rows = [
    { y: 44, label: '[agent-1] · sonnet', color: 'var(--agent-a1, oklch(0.78 0.1 260))', next: 'janitor', nextKind: 'ok' as const },
    { y: 80, label: '[agent-2] · codex ', color: 'var(--agent-a2, oklch(0.78 0.1 150))', next: 'janitor', nextKind: 'ok' as const },
    { y: 116, label: '[agent-3] · haiku ', color: 'var(--agent-a3, oklch(0.82 0.12 60))', next: 'janitor', nextKind: 'ok' as const },
    { y: 152, label: '[agent-4] · gemini', color: 'var(--agent-a4, oklch(0.78 0.1 0))', next: 'fail', nextKind: 'fail' as const },
  ];

  const SPINE_IN = 70;
  const AGENT_X = 112;
  const AGENT_ARROW_START = 276;
  const AGENT_ARROW_END = 320;
  const NEXT_X = 330;
  const NEXT_ARROW_START = 398;
  const NEXT_ARROW_END = 450;
  const SPINE_OUT = 464;
  const MERGE_ARROW_END = 528;
  const MERGE_LABEL_X = 536;

  return (
    <svg
      className="how-diagram"
      viewBox="0 0 720 220"
      role="img"
      aria-label="Goal fans out to four parallel agents. Three succeed through the janitor and merge to main. The fourth fails and retries via the bandit."
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker
          id="how-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted)" />
        </marker>
        <marker
          id="how-arrow-retry"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--accent-hover)" />
        </marker>
      </defs>

      {/* goal label + connector into the spine */}
      <text x="14" y="98" className="how-t how-t-muted">goal</text>
      <path d="M 50 98 L 70 98" className="how-edge" />

      {/* vertical fan-out spine */}
      <path d={`M ${SPINE_IN} ${rows[0].y} L ${SPINE_IN} ${rows[rows.length - 1].y}`} className="how-edge" />

      {rows.map((r) => (
        <g key={r.label}>
          {/* spine -> agent arrow */}
          <path
            d={`M ${SPINE_IN} ${r.y} L ${AGENT_ARROW_END - 6} ${r.y}`}
            className="how-edge"
            markerEnd="url(#how-arrow)"
          />
          {/* agent label */}
          <text x={AGENT_X} y={r.y + 4} className="how-t how-t-mono" fill={r.color}>
            {r.label}
          </text>
          {/* agent -> next arrow */}
          <path
            d={`M ${AGENT_ARROW_START} ${r.y} L ${NEXT_ARROW_END - 6} ${r.y}`}
            className="how-edge"
            markerEnd="url(#how-arrow)"
          />
          {/* next node label */}
          <text
            x={NEXT_X}
            y={r.y + 4}
            className={`how-t how-t-mono ${r.nextKind === 'fail' ? 'how-t-fail' : 'how-t-amber'}`}
          >
            {r.next}
          </text>
        </g>
      ))}

      {/* merge spine: connects the 3 successful janitors */}
      <path d={`M ${SPINE_OUT} ${rows[0].y} L ${SPINE_OUT} ${rows[2].y}`} className="how-edge" />
      {/* 3 arrows from janitor to spine */}
      {rows.slice(0, 3).map((r) => (
        <path
          key={`merge-${r.y}`}
          d={`M ${NEXT_ARROW_START} ${r.y} L ${SPINE_OUT} ${r.y}`}
          className="how-edge"
        />
      ))}
      {/* spine -> merge label arrow (from center of the three janitors) */}
      <path
        d={`M ${SPINE_OUT} ${rows[1].y} L ${MERGE_ARROW_END - 6} ${rows[1].y}`}
        className="how-edge"
        markerEnd="url(#how-arrow)"
      />
      <text x={MERGE_LABEL_X} y={rows[1].y + 4} className="how-t how-t-mono how-t-ok">
        merge → main ✓
      </text>

      {/* retry loop: fail -> bandit -> back to manager */}
      <path
        d={`M ${NEXT_X + 18} ${rows[3].y + 10} L ${NEXT_X + 18} 188`}
        className="how-edge-retry"
      />
      <text x={NEXT_X + 28} y="192" className="how-t how-t-mono how-t-accent">
        ↺ retry w/ escalated model
      </text>
      <path
        d={`M ${NEXT_X + 240} 188 L ${NEXT_X + 272} 188`}
        className="how-edge-retry"
        markerEnd="url(#how-arrow-retry)"
      />
      <text x={NEXT_X + 278} y="192" className="how-t how-t-mono how-t-accent">
        bandit
      </text>
    </svg>
  );
}
