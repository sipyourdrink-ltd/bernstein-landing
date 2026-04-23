'use client';

import { useMemo, useState } from 'react';
import { ScrollReveal } from '@/components/ScrollReveal';

interface Agent {
  name: string;
  models: string;
  category: 'CLI' | 'SDK' | 'Editor' | 'Cloud' | 'Local' | 'Infra' | 'Adapter';
  monogram: string;
  hue: number | null; // null = muted, no hue
}

const agents: Agent[] = [
  { name: 'Claude Code', models: 'Anthropic · Opus 4, Sonnet 4.6, Haiku 4.5', category: 'CLI', monogram: 'CC', hue: 30 },
  { name: 'Codex CLI', models: 'OpenAI · GPT-5, GPT-5 mini', category: 'CLI', monogram: 'CX', hue: 155 },
  { name: 'Gemini CLI', models: 'Google · Gemini 2.5 Pro, Flash', category: 'CLI', monogram: 'GM', hue: 270 },
  { name: 'OpenAI Agents SDK', models: 'OpenAI · GPT-5, GPT-4.1 (Responses API)', category: 'SDK', monogram: 'OA', hue: 155 },
  { name: 'Cursor', models: 'Cursor · Sonnet 4.6, Opus 4, GPT-5', category: 'Editor', monogram: 'Cu', hue: 80 },
  { name: 'Aider', models: 'Anthropic / OpenAI · any chat model', category: 'CLI', monogram: 'Ai', hue: 200 },
  { name: 'Ollama', models: 'Local · offline, any model', category: 'Local', monogram: 'Ol', hue: 260 },
  { name: 'Amp', models: 'Sourcegraph · Sonnet, GPT-5', category: 'CLI', monogram: 'Am', hue: 200 },
  { name: 'Goose', models: 'Block · Sonnet, GPT-5, local', category: 'CLI', monogram: 'Go', hue: 30 },
  { name: 'Kiro', models: 'AWS · Bedrock, Sonnet, Haiku', category: 'Editor', monogram: 'Ki', hue: 60 },
  { name: 'Qwen', models: 'Alibaba · Qwen3 Coder, Max', category: 'CLI', monogram: 'Qw', hue: 0 },
  { name: 'Cloudflare Agents', models: 'Cloudflare · Workers AI, DO, R2', category: 'Cloud', monogram: 'Cf', hue: 30 },
  { name: 'Cody', models: 'Sourcegraph · Sonnet, GPT-5', category: 'Editor', monogram: 'Cd', hue: 220 },
  { name: 'Continue', models: 'VS Code · any OpenAI-compatible', category: 'Editor', monogram: 'Co', hue: 180 },
  { name: 'OpenCode', models: 'OSS · any OpenAI-compatible', category: 'CLI', monogram: 'Oc', hue: 140 },
  { name: 'Kilo', models: 'OSS · any OpenAI-compatible', category: 'CLI', monogram: 'Kl', hue: 20 },
  { name: 'IaC', models: 'Platform · Terraform, Pulumi', category: 'Infra', monogram: 'IaC', hue: 200 },
  { name: 'Generic', models: 'Any OpenAI-compatible', category: 'Adapter', monogram: '·', hue: null },
];

const CATEGORY_ORDER: Agent['category'][] = [
  'CLI',
  'SDK',
  'Editor',
  'Cloud',
  'Local',
  'Infra',
  'Adapter',
];

function monogramStyle(hue: number | null): React.CSSProperties {
  if (hue === null) {
    return {
      background: 'color-mix(in oklch, var(--text-muted) 20%, var(--surface))',
      color: 'var(--text-muted)',
    };
  }
  return {
    background: `color-mix(in oklch, oklch(0.7 0.12 ${hue}) 30%, var(--surface))`,
    color: `oklch(0.82 0.14 ${hue})`,
  };
}

export function AgentsGrid() {
  const [filter, setFilter] = useState<string>('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: agents.length };
    for (const cat of CATEGORY_ORDER) c[cat.toLowerCase()] = 0;
    for (const a of agents) c[a.category.toLowerCase()] += 1;
    return c;
  }, []);

  const visibleAgents = useMemo(
    () => (filter === 'all' ? agents : agents.filter((a) => a.category.toLowerCase() === filter)),
    [filter],
  );

  const chips: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    ...CATEGORY_ORDER.filter((c) => counts[c.toLowerCase()] > 0).map((c) => ({
      key: c.toLowerCase(),
      label: c,
    })),
  ];

  return (
    <section id="agents" aria-labelledby="agents-heading">
      <ScrollReveal>
        <div className="section-header">
          <h2 id="agents-heading">
            Works with every major coding agent <span className="agent-count">18</span>
          </h2>
          <p>Mix local models for boilerplate with cloud models for architecture. In the same run.</p>
        </div>
      </ScrollReveal>
      <ScrollReveal delay={100}>
        <div className="agent-filters" role="group" aria-label="Filter agents by category">
          {chips.map((chip) => {
            const active = filter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                className={`agent-chip${active ? ' agent-chip-active' : ''}`}
                aria-pressed={active}
                onClick={() => setFilter(chip.key)}
              >
                {chip.label} <span className="agent-chip-count">&middot; {counts[chip.key] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </ScrollReveal>
      <ScrollReveal delay={180}>
        <div className="agents-grid">
          {visibleAgents.map((agent, i) => (
            <div
              key={agent.name}
              className="agent-card agent-card-staggered"
              style={{ animationDelay: `${Math.min(i * 18, 300)}ms` }}
            >
              <span className="agent-monogram" style={monogramStyle(agent.hue)} aria-hidden="true">
                {agent.monogram}
              </span>
              <div>
                <div className="agent-name">
                  {agent.name}
                  {agent.category && <span className="agent-badge">{agent.category}</span>}
                </div>
                <div className="agent-models">{agent.models}</div>
              </div>
            </div>
          ))}
        </div>
      </ScrollReveal>
      <ScrollReveal delay={260}>
        <div className="agents-more-wrap">
          <a href="https://bernstein.readthedocs.io/" className="agents-more">
            View all 18 adapters and configuration &rarr;
          </a>
        </div>
      </ScrollReveal>
    </section>
  );
}
