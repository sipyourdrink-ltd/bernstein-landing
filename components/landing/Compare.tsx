'use client';

import { useRef, useEffect, useState, type ReactNode } from 'react';
import { ScrollReveal } from '@/components/ScrollReveal';

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
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
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

export function Compare() {
  return (
    <section id="compare" aria-labelledby="compare-heading">
      <ScrollReveal>
        <div className="section-header">
          <h2 id="compare-heading">How it compares</h2>
          <p>Against the LLM-orchestration frameworks below. For the closer category — other CLI-coding-agent orchestrators like <a href="https://github.com/ComposioHQ/agent-orchestrator">ComposioHQ/agent-orchestrator</a> and <a href="https://github.com/generalaction/emdash">emdash</a> — see the CLI-orchestrator matrix in the <a href="https://github.com/chernistry/bernstein#how-it-compares">repo README</a>. Short version: Python-native, MCP-server-first, widest adapter coverage.</p>
        </div>
      </ScrollReveal>
      <ScrollReveal delay={200}>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Comparison table, scroll horizontally">
          <table className="compare-table" role="table" aria-label="Feature comparison between orchestration tools">
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">Bernstein</th>
                <th scope="col">CrewAI</th>
                <th scope="col">AutoGen</th>
                <th scope="col">LangGraph</th>
              </tr>
            </thead>
            <tbody>
              <TableRowReveal delay={0}>
                <td>Orchestrator</td>
                <td>Deterministic code</td>
                <td className="partial" aria-label="Partial: LLM-driven plus code Flows">~ LLM-driven</td>
                <td className="partial" aria-label="Partial: LLM-driven">~ LLM-driven</td>
                <td className="partial" aria-label="Partial: Graph + LLM">~ Graph + LLM</td>
              </TableRowReveal>
              <TableRowReveal delay={80}>
                <td>CLI agent support</td>
                <td aria-label="Yes: 18 adapters"><span className="check">&#10003; 18 adapters</span></td>
                <td aria-label="No"><span className="cross">&#10007; No</span></td>
                <td aria-label="No"><span className="cross">&#10007; No</span></td>
                <td aria-label="No"><span className="cross">&#10007; No</span></td>
              </TableRowReveal>
              <TableRowReveal delay={160}>
                <td>Agent isolation</td>
                <td aria-label="Yes: Worktrees or cloud sandbox"><span className="check">&#10003; Worktree / sandbox</span></td>
                <td aria-label="No"><span className="cross">&#10007; No</span></td>
                <td aria-label="No"><span className="cross">&#10007; No</span></td>
                <td aria-label="No"><span className="cross">&#10007; No</span></td>
              </TableRowReveal>
              <TableRowReveal delay={240}>
                <td>Quality gates</td>
                <td aria-label="Yes: Built-in janitor with concrete signals"><span className="check">&#10003; Built-in</span></td>
                <td className="partial" aria-label="Partial: guardrails plus Pydantic output">~ Guardrails</td>
                <td className="partial" aria-label="Partial: termination conditions">~ Termination</td>
                <td className="partial" aria-label="Partial: conditional edges">~ Conditional edges</td>
              </TableRowReveal>
              <TableRowReveal delay={320}>
                <td>Cost tracking</td>
                <td aria-label="Yes: Per-agent, built-in"><span className="check">&#10003; Per-agent</span></td>
                <td className="partial" aria-label="Partial: usage_metrics attribute">~ usage_metrics</td>
                <td className="partial" aria-label="Partial: RequestUsage per message">~ RequestUsage</td>
                <td className="partial" aria-label="Partial: via LangSmith tracer">~ Via LangSmith</td>
              </TableRowReveal>
              <TableRowReveal delay={400}>
                <td>Cloud execution</td>
                <td aria-label="Yes: Cloudflare Workers"><span className="check">&#10003; Cloudflare</span></td>
                <td className="partial" aria-label="Partial: CrewAI AMP">~ CrewAI AMP</td>
                <td aria-label="No"><span className="cross">&#10007; No</span></td>
                <td className="partial" aria-label="Partial: LangGraph Cloud">~ LangGraph Cloud</td>
              </TableRowReveal>
              <TableRowReveal delay={480}>
                <td>Self-evolution</td>
                <td aria-label="Yes: Built-in, experimental"><span className="check">&#10003; Built-in</span></td>
                <td aria-label="No"><span className="cross">&#10007; No</span></td>
                <td aria-label="No"><span className="cross">&#10007; No</span></td>
                <td aria-label="No"><span className="cross">&#10007; No</span></td>
              </TableRowReveal>
            </tbody>
          </table>
        </div>
      </ScrollReveal>
    </section>
  );
}
