'use client';

import { useRef, useEffect, useState, type ReactNode } from 'react';
import { ScrollReveal } from '@/components/ScrollReveal';

type CellKind = 'yes' | 'no' | 'partial' | 'text';

interface Cell {
  kind: CellKind;
  text: string;
  aria?: string;
}

interface CompareRow {
  label: string;
  cells: Cell[];
  onlyBernstein?: boolean;
}

interface CompareTable {
  headers: string[];
  rows: CompareRow[];
}

const LAST_VERIFIED = 'verified 22 Apr 2026';

const frameworksTable: CompareTable = {
  headers: ['Bernstein', 'CrewAI', 'AutoGen', 'LangGraph'],
  rows: [
    {
      label: 'Orchestrator',
      cells: [
        { kind: 'text', text: 'Deterministic code' },
        { kind: 'partial', text: '~ LLM-driven', aria: 'Partial: LLM-driven plus code Flows' },
        { kind: 'partial', text: '~ LLM-driven', aria: 'Partial: LLM-driven' },
        { kind: 'partial', text: '~ Graph + LLM', aria: 'Partial: Graph + LLM' },
      ],
    },
    {
      label: 'CLI agent support',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: '18 adapters', aria: 'Yes: 18 adapters' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Git isolation',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'Worktree / sandbox', aria: 'Yes: Worktrees or cloud sandbox' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Quality gates',
      cells: [
        { kind: 'yes', text: 'Built-in', aria: 'Yes: Built-in janitor with concrete signals' },
        { kind: 'partial', text: '~ Guardrails', aria: 'Partial: guardrails plus Pydantic output' },
        { kind: 'partial', text: '~ Termination', aria: 'Partial: termination conditions' },
        { kind: 'partial', text: '~ Conditional edges', aria: 'Partial: conditional edges' },
      ],
    },
    {
      label: 'MCP server mode',
      cells: [
        { kind: 'yes', text: 'stdio + HTTP', aria: 'Yes: MCP server with stdio and HTTP' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'partial', text: '~ Tool mode', aria: 'Partial: MCP tool support only' },
        { kind: 'partial', text: '~ Tool mode', aria: 'Partial: MCP tool support only' },
      ],
    },
    {
      label: 'A2A support',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'Native', aria: 'Yes: Native A2A protocol support' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Cost-aware routing',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'Bandit', aria: 'Yes: Bandit-based cost-aware routing' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Cross-model verifier',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'Built-in', aria: 'Yes: Cross-model verifier' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Sandbox backends',
      cells: [
        { kind: 'yes', text: '9 backends', aria: 'Yes: 9 sandbox backends' },
        { kind: 'partial', text: '~ Docker', aria: 'Partial: Docker only' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'partial', text: '~ Docker', aria: 'Partial: Docker only' },
      ],
    },
    {
      label: 'Storage backends',
      cells: [
        { kind: 'yes', text: 'S3 / GCS / R2 / Blob', aria: 'Yes: S3, GCS, R2, Azure Blob' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'partial', text: '~ LangSmith', aria: 'Partial: via LangSmith' },
      ],
    },
    {
      label: 'Observability',
      cells: [
        { kind: 'yes', text: 'Prometheus + OTel', aria: 'Yes: Prometheus and OpenTelemetry' },
        { kind: 'partial', text: '~ usage_metrics', aria: 'Partial: usage_metrics attribute' },
        { kind: 'partial', text: '~ RequestUsage', aria: 'Partial: RequestUsage per message' },
        { kind: 'partial', text: '~ LangSmith', aria: 'Partial: via LangSmith tracer' },
      ],
    },
    {
      label: 'Retry + bandit',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'Built-in', aria: 'Yes: Retry and bandit built-in' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Worktree merge queue',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'Built-in', aria: 'Yes: Worktree merge queue' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'License',
      cells: [
        { kind: 'text', text: 'Apache-2.0' },
        { kind: 'text', text: 'MIT' },
        { kind: 'text', text: 'MIT / CC-BY-4.0' },
        { kind: 'text', text: 'MIT' },
      ],
    },
    {
      label: 'Primary lang',
      cells: [
        { kind: 'text', text: 'Python' },
        { kind: 'text', text: 'Python' },
        { kind: 'text', text: 'Python / .NET' },
        { kind: 'text', text: 'Python / JS' },
      ],
    },
    {
      label: 'Audience',
      cells: [
        { kind: 'text', text: 'Eng teams shipping code' },
        { kind: 'text', text: 'Workflow/RAG builders' },
        { kind: 'text', text: 'Researchers + devs' },
        { kind: 'text', text: 'Workflow graph builders' },
      ],
    },
  ],
};

const orchestratorsTable: CompareTable = {
  headers: ['Bernstein', 'Composio', 'emdash'],
  rows: [
    {
      label: 'Target user',
      cells: [
        { kind: 'text', text: 'Eng teams + solo devs' },
        { kind: 'text', text: 'Solo devs' },
        { kind: 'text', text: 'Solo devs' },
      ],
    },
    {
      label: 'Agents supported',
      cells: [
        { kind: 'yes', text: '18 adapters', aria: 'Yes: 18 adapters' },
        { kind: 'partial', text: '~ 4-5', aria: 'Partial: 4 to 5 agents' },
        { kind: 'partial', text: '~ 3-4', aria: 'Partial: 3 to 4 agents' },
      ],
    },
    {
      label: 'Git isolation',
      cells: [
        { kind: 'yes', text: 'Worktree / sandbox', aria: 'Yes: Worktrees or sandbox' },
        { kind: 'partial', text: '~ Worktree', aria: 'Partial: Worktrees only' },
        { kind: 'partial', text: '~ Worktree', aria: 'Partial: Worktrees only' },
      ],
    },
    {
      label: 'Quality gates',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'Built-in', aria: 'Yes: Built-in gates' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Cost routing',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'Bandit', aria: 'Yes: Bandit cost routing' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Bandit-based retry',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'Built-in', aria: 'Yes: Bandit-based retry' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'MCP server',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'stdio + HTTP', aria: 'Yes: MCP server stdio and HTTP' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Deterministic scheduler',
      cells: [
        { kind: 'yes', text: 'Yes', aria: 'Yes: deterministic scheduler' },
        { kind: 'partial', text: '~ Manual', aria: 'Partial: manual scheduling' },
        { kind: 'partial', text: '~ Manual', aria: 'Partial: manual scheduling' },
      ],
    },
    {
      label: 'Sandbox abstraction',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: '9 backends', aria: 'Yes: 9 backends' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Storage abstraction',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'S3 / GCS / R2', aria: 'Yes: multi-cloud storage' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Cloud sinks',
      onlyBernstein: true,
      cells: [
        { kind: 'yes', text: 'Built-in', aria: 'Yes: Cloud sinks' },
        { kind: 'no', text: 'No', aria: 'No' },
        { kind: 'no', text: 'No', aria: 'No' },
      ],
    },
    {
      label: 'Language',
      cells: [
        { kind: 'text', text: 'Python' },
        { kind: 'text', text: 'TypeScript' },
        { kind: 'text', text: 'TypeScript' },
      ],
    },
  ],
};

function Chip({ kind, text }: { kind: CellKind; text: string }) {
  if (kind === 'yes') return <span className="check">&#10003; {text}</span>;
  if (kind === 'no') return <span className="cross">&#10007; {text}</span>;
  if (kind === 'partial') return <span>{text}</span>;
  return <span>{text}</span>;
}

function TableRowReveal({ children, delay }: { children: ReactNode; delay: number }) {
  const ref = useRef<HTMLTableRowElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <tr
      ref={ref}
      className={`table-row-reveal ${visible ? 'revealed' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </tr>
  );
}

function CompareTableView({ table }: { table: CompareTable }) {
  return (
    <div className="table-wrap compare-scroll" tabIndex={0} role="region" aria-label="Comparison table, scroll horizontally">
      <table className="compare-table" role="table" aria-label="Feature comparison">
        <thead>
          <tr>
            <th scope="col"></th>
            {table.headers.map((h) => (
              <th key={h} scope="col">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => {
            const partialClass = (kind: CellKind) => (kind === 'partial' ? 'partial' : '');
            return (
              <TableRowReveal key={row.label} delay={Math.min(i * 40, 300)}>
                <td>
                  <span className="compare-row-label">{row.label}</span>
                  {row.onlyBernstein && (
                    <span className="compare-only" aria-label="Only Bernstein supports this">
                      &#9670; only Bernstein
                    </span>
                  )}
                </td>
                {row.cells.map((cell, j) => (
                  <td
                    key={j}
                    className={partialClass(cell.kind)}
                    aria-label={cell.aria ?? cell.text}
                  >
                    <Chip kind={cell.kind} text={cell.text} />
                  </td>
                ))}
              </TableRowReveal>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Compare() {
  const [tab, setTab] = useState<'frameworks' | 'orchestrators'>('frameworks');

  return (
    <section id="compare" aria-labelledby="compare-heading">
      <ScrollReveal>
        <div className="section-header compare-header">
          <div className="compare-header-top">
            <h2 id="compare-heading">How it compares</h2>
            <span className="compare-verified" aria-label={`Last ${LAST_VERIFIED}`}>{LAST_VERIFIED}</span>
          </div>
          <p>
            Python-native, MCP-server-first, widest adapter coverage. Toggle between LLM-orchestration frameworks and CLI-agent orchestrators below.
          </p>
        </div>
      </ScrollReveal>
      <ScrollReveal delay={160}>
        <div className="compare-tabs" role="tablist" aria-label="Comparison category">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'frameworks'}
            aria-controls="compare-panel-frameworks"
            id="compare-tab-frameworks"
            className={`compare-tab${tab === 'frameworks' ? ' compare-tab-active' : ''}`}
            onClick={() => setTab('frameworks')}
          >
            vs. LLM frameworks
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'orchestrators'}
            aria-controls="compare-panel-orchestrators"
            id="compare-tab-orchestrators"
            className={`compare-tab${tab === 'orchestrators' ? ' compare-tab-active' : ''}`}
            onClick={() => setTab('orchestrators')}
          >
            vs. CLI orchestrators
          </button>
        </div>
      </ScrollReveal>
      <ScrollReveal delay={220}>
        {tab === 'frameworks' ? (
          <div
            role="tabpanel"
            id="compare-panel-frameworks"
            aria-labelledby="compare-tab-frameworks"
          >
            <CompareTableView table={frameworksTable} />
          </div>
        ) : (
          <div
            role="tabpanel"
            id="compare-panel-orchestrators"
            aria-labelledby="compare-tab-orchestrators"
          >
            <CompareTableView table={orchestratorsTable} />
          </div>
        )}
      </ScrollReveal>
    </section>
  );
}
