'use client';

import { ScrollReveal } from '@/components/ScrollReveal';

interface Step {
  num: string;
  title: string;
  desc: string;
  chip?: string;
}

export function HowItWorks() {
  const steps: Step[] = [
    {
      num: '01',
      title: 'Set a goal',
      desc: 'Describe what you want built. Bernstein decomposes it into tasks with the right roles, models, and dependencies.',
    },
    {
      num: '02',
      title: 'Agents work in parallel',
      desc: 'Each agent gets its own git worktree. Opus for architecture, Sonnet for implementation, Haiku for tests. Automatically routed.',
    },
    {
      num: '03',
      title: 'Verified and merged',
      desc: 'Quality gates run lint, types, and tests on every result. Only verified work gets merged.',
      chip: '↻ Retry + escalate via bandit',
    },
  ];

  return (
    <section id="how" aria-labelledby="how-heading">
      <ScrollReveal>
        <div className="section-header">
          <h2 id="how-heading">How it works</h2>
          <p>Three steps. No babysitting.</p>
        </div>
      </ScrollReveal>
      <div className="steps steps-editorial">
        {steps.map((step, i) => (
          <ScrollReveal key={step.num} delay={200 + i * 100}>
            <div className="step">
              <div className="step-num step-num-editorial">{step.num}</div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
              {step.chip && <div className="step-chip">{step.chip}</div>}
            </div>
          </ScrollReveal>
        ))}
      </div>
      <ScrollReveal delay={600}>
        <pre className="how-diagram" aria-hidden="true">
{`goal `}<span className="d-mute">{`──┐`}</span>{`
       `}<span className="d-mute">{`├──▶  `}</span><span className="d-agent">agent-1 · sonnet</span>{`  `}<span className="d-mute">{`──▶  `}</span><span className="d-janitor">janitor</span>{` `}<span className="d-mute">{`──┐`}</span>{`
       `}<span className="d-mute">{`├──▶  `}</span><span className="d-agent">agent-2 · codex  </span>{`  `}<span className="d-mute">{`──▶  `}</span><span className="d-janitor">janitor</span>{` `}<span className="d-mute">{`──┤`}</span>{`  `}<span className="d-ok">merge</span>{`
       `}<span className="d-mute">{`├──▶  `}</span><span className="d-agent">agent-3 · haiku  </span>{`  `}<span className="d-mute">{`──▶  `}</span><span className="d-janitor">janitor</span>{` `}<span className="d-mute">{`──┤`}</span>{`  `}<span className="d-ok">main ✓</span>{`
       `}<span className="d-mute">{`└──▶  `}</span><span className="d-agent">agent-4 · gemini </span>{`  `}<span className="d-mute">{`──▶  `}</span><span className="d-bad">fail   </span>{`  `}<span className="d-mute">{`──┘`}</span>{`
                                     `}<span className="d-mute">│</span>{`
               `}<span className="d-janitor">↺ retry w/ escalated model</span>{` `}<span className="d-mute">←</span>{` `}<span className="d-agent">bandit</span>
        </pre>
      </ScrollReveal>
    </section>
  );
}
