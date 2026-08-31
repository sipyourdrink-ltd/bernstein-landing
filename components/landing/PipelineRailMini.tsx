/**
 * PipelineRailMini - compressed 4-stage band below the hero.
 *
 * Sits in the cream-2 surface (band) so it reads as a continuation of the
 * hero rather than a new section start. Variant-2 design § "BAND BELOW
 * HERO" calls this out as a tighter rail than v1 (which gives each stage
 * its own card row) - here all four stages share a single horizontal band
 * with dashed dividers, anchored on the left by the section title.
 *
 * The id `how` is preserved so the existing Nav scroll-spy keeps lighting
 * up "how it works" as the visitor scrolls past this band.
 *
 * Inview tracker: emits `pipeline-rail-inview` on first scroll-into-view.
 * Added per research-003 (audit 2026-05-09) - this section was a dark
 * zone with zero telemetry despite being the second slot on the page.
 *
 * This band is the page's only presentation of the four stages. A prose
 * explainer used to restate the same decompose/spawn/verify/merge
 * sequence in the slot directly above it; the one fact it carried that
 * this rail did not - the optional cross-model review in the verify
 * gate - is folded into stage 03 below. The long-form answer still
 * ships to extraction surfaces via /llms-full.txt and the /ask corpus.
 */

import { InViewTracker } from '@/components/InViewTracker';
import { UmamiEvent } from '@/lib/analytics/events';

interface Stage {
  n: string;
  label: string;
  detail: string;
}

const STAGES: Stage[] = [
  { n: '01', label: 'decompose', detail: 'manager → tasks · roles · signals' },
  { n: '02', label: 'spawn', detail: 'agents → isolated worktrees' },
  {
    n: '03',
    label: 'verify',
    detail: 'janitor → tests · types · lint · optional cross-model review',
  },
  { n: '04', label: 'merge', detail: 'only verified diffs land' },
];

export function PipelineRailMini() {
  return (
    <section
      className="v2-rail"
      id="how"
      aria-labelledby="pipeline-rail-mini-heading"
    >
      <InViewTracker eventName={UmamiEvent.PipelineRailInView} />
      <div className="v2-rail-inner">
        <h3 id="pipeline-rail-mini-heading">
          one run, <em>four stages</em>.
        </h3>
        <div className="v2-rail-pipe" role="list">
          {STAGES.map((s) => (
            <div className="v2-rail-ph" role="listitem" key={s.n}>
              <div className="v2-n">{s.n}</div>
              <div className="v2-label">
                <em>{s.label}</em>
              </div>
              <div className="v2-det">{s.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
