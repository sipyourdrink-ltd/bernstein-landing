/**
 * FaqV2 - 4 questions in a 2×2 grid.
 *
 * The four are the ones readers ask before installing or opening the
 * repo: is the scheduler an LLM, does it phone home, where does it run,
 * and how it relates to Claude Code.
 *
 * The id `faq` is preserved so /#faq deep-links from blog posts still
 * land here.
 *
 * Inview tracker: emits `faq-inview` on first scroll-into-view, which
 * distinguishes readers who reach the end of the page from those who
 * scroll straight past to the footer.
 */

import { InViewTracker } from '@/components/InViewTracker';
import { UmamiEvent } from '@/lib/analytics/events';

interface Qa {
  q: string;
  a: React.ReactNode;
}

const QAS: Qa[] = [
  {
    q: 'is the scheduler an llm?',
    a: (
      <>
        no. the useful half of the answer is where models do sit: model
        selection is llm-assisted (capability router + recommender), and
        best-of-n picks a winner via llm judge. both are opt-in and
        pluggable, so you can wire your own planner in through the
        routing layer. the one place a model never goes is the tick that
        decides who runs, who&apos;s blocked and what merges. put one
        there and the run stops replaying.
      </>
    ),
  },
  {
    q: 'does it phone home?',
    a: (
      <>
        nothing leaves your machine without your config. opt-in
        telemetry is full and audit-grade: hmac-chained
        run trail, per-task tool calls, model usage, token cost, latency
        percentiles. ship it to your own otel collector, datadog, splunk,
        s3 bucket. defaults to local-only because on-prem installs need
        that, but the enterprise hooks are there.
      </>
    ),
  },
  {
    q: 'where does it run?',
    a: (
      <>
        wherever you point it. your laptop, on-prem behind a firewall,
        cloudflare workers as the cloud runtime, kubernetes as a
        multi-node cluster, or a hybrid of those. sandbox-execution mode
        is supported (cloudflare sandbox, local docker). your repo is the
        input, your tests are the gate; bernstein adapts to the host.
        nothing forces a saas hop.
      </>
    ),
  },
  {
    q: 'how is this different from claude code?',
    a: (
      <>
        claude code can spawn sub-agents on its own; bernstein does the same
        thing across 40+ cli agents at once and verifies their
        output against your tests instead of trusting it. claude code is the
        most common primary backend inside bernstein - using one does not
        exclude the other.
      </>
    ),
  },
];

export function FaqV2() {
  return (
    <section
      className="v2-section v2-faq"
      id="faq"
      aria-labelledby="faq-heading"
    >
      <InViewTracker eventName={UmamiEvent.FaqInView} />
      <p className="v2-kicker">frequently asked</p>
      <h2 id="faq-heading">
        the four questions <em>that block install</em>.
      </h2>
      <div className="v2-grid">
        {QAS.map((qa) => (
          <div className="v2-qa" key={qa.q}>
            <h3 className="v2-q">{qa.q}</h3>
            <div className="v2-a">{qa.a}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
