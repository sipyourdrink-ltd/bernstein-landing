'use client';

/**
 * agent-md-bench - client-side linter UI.
 *
 * Pastes or drag-drops an AGENTS.md / CLAUDE.md / .cursorrules. Runs the
 * deterministic rules from ``lib/tools/agent-md-rules`` in-browser, no
 * backend, no analytics-that-break-ad-blockers. Every finding lists which
 * agent it covers and links to the upstream doc.
 *
 * Voice: lowercase, one-fact-per-line, no marketing copy.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  type AgentName,
  type AgentBudget,
  type Finding,
  type LintResult,
  budgets,
  lint,
} from '@/lib/tools/agent-md-rules';
import { withUtm } from '@/lib/utm';

const SAMPLE_INPUT = `# AGENTS.md

This repo runs Claude Code, Cursor, and Codex against the same Python
service. Every CLI must read the same context, so we keep it here.

## Setup

1. \`uv sync\`
2. \`uv run pytest\`
3. See ./scripts/dev.sh for the full loop.

## Build & test

\`\`\`
uv run pytest -x
uv run ruff check .
\`\`\`

## Conventions

- Every public function gets a docstring.
- Tests live in tests/unit/<module>.py.
- Never edit ./vendor/.

`;

const AGENT_LABEL: Record<AgentName, string> = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex CLI',
  aider: 'Aider',
  gemini: 'Gemini CLI',
  opencode: 'OpenCode',
  goose: 'Goose',
};

const SEVERITY_LABEL: Record<Finding['severity'], string> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
};

function StatusDot({ status }: { status: AgentBudget['status'] }) {
  const color =
    status === 'ok' ? '#3a7d3a' : status === 'warn' ? '#a36b00' : '#a3271a';
  return (
    <span
      aria-label={status}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
        background: color,
      }}
    />
  );
}

function detectFilename(name: string | null, body: string): string {
  if (name && name.length > 0) return name;
  // Heuristic: a leading YAML --- frontmatter usually means an .mdc file.
  if (/^---\s*\n[\s\S]*?\n---\s*\n/m.test(body)) return 'rules.mdc';
  return 'AGENTS.md';
}

export function AgentMdBench() {
  const [filename, setFilename] = useState<string>('AGENTS.md');
  const [text, setText] = useState<string>(SAMPLE_INPUT);
  const dropRef = useRef<HTMLDivElement | null>(null);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const body = await file.text();
    setText(body);
  }, []);

  const onPickFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFilename(file.name);
      const body = await file.text();
      setText(body);
    },
    [],
  );

  const result: LintResult = useMemo(
    () => lint({ filename: detectFilename(filename, text), text }),
    [filename, text],
  );
  const sizeRows: AgentBudget[] = useMemo(
    () => budgets({ filename: detectFilename(filename, text), text }),
    [filename, text],
  );

  const errorCount = result.findings.filter((f) => f.severity === 'error').length;
  const warnCount = result.findings.filter((f) => f.severity === 'warn').length;
  const infoCount = result.findings.filter((f) => f.severity === 'info').length;

  return (
    <div className="amd-root">
      <div className="amd-input-row">
        <label htmlFor="amd-filename" className="amd-label">
          filename
        </label>
        <input
          id="amd-filename"
          type="text"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          className="amd-filename"
          placeholder="AGENTS.md"
          aria-label="filename hint"
        />
        <input
          type="file"
          accept=".md,.mdc,.markdown,.txt,.cursorrules"
          onChange={onPickFile}
          className="amd-file"
          aria-label="upload agent context file"
        />
      </div>

      <div
        ref={dropRef}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="amd-drop"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          spellCheck={false}
          aria-label="agent context content"
          className="amd-textarea"
        />
        <p className="amd-hint">
          drag-and-drop a file here, or paste your AGENTS.md / CLAUDE.md / .cursorrules / .mdc content.
        </p>
      </div>

      <section className="amd-summary" aria-label="size summary">
        <h2>size</h2>
        <table className="amd-table">
          <thead>
            <tr>
              <th scope="col">metric</th>
              <th scope="col">value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>characters</td>
              <td>{result.charCount.toLocaleString()}</td>
            </tr>
            <tr>
              <td>bytes (utf-8)</td>
              <td>{result.byteCount.toLocaleString()}</td>
            </tr>
            <tr>
              <td>lines</td>
              <td>{result.lineCount.toLocaleString()}</td>
            </tr>
            <tr>
              <td>approx tokens (±20%)</td>
              <td>{result.approxTokens.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="amd-budgets" aria-label="per-agent size verdict">
        <h2>per-agent budget</h2>
        <p className="amd-hint">
          soft caps from each agent&rsquo;s docs (May 2026). no agent hard-truncates today; over-budget files cost prompt-cache headroom.
        </p>
        <table className="amd-table">
          <thead>
            <tr>
              <th scope="col">agent</th>
              <th scope="col">soft cap</th>
              <th scope="col">verdict</th>
            </tr>
          </thead>
          <tbody>
            {sizeRows.map((row) => (
              <tr key={row.agent}>
                <td>{AGENT_LABEL[row.agent]}</td>
                <td>{row.note}</td>
                <td>
                  <StatusDot status={row.status} />
                  {row.status === 'ok'
                    ? 'within budget'
                    : row.status === 'warn'
                      ? 'over soft cap'
                      : 'far over soft cap'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="amd-findings" aria-label="parser-quirk findings">
        <h2>
          findings <span className="amd-counts">({errorCount} error · {warnCount} warn · {infoCount} info)</span>
        </h2>
        {result.findings.length === 0 ? (
          <p className="amd-empty">no parser-quirk warnings. the file works for every agent we cover.</p>
        ) : (
          <ul className="amd-finding-list">
            {result.findings.map((f, idx) => (
              <li key={`${f.id}-${idx}`} className={`amd-finding amd-${f.severity}`}>
                <div className="amd-finding-head">
                  <span className="amd-rule-id">{f.id}</span>
                  <span className="amd-agent">{AGENT_LABEL[f.agent]}</span>
                  <span className="amd-sev">{SEVERITY_LABEL[f.severity]}</span>
                  {typeof f.line === 'number' && f.line > 0 && (
                    <span className="amd-line">line {f.line}</span>
                  )}
                </div>
                <p className="amd-finding-msg">{f.message}</p>
                {f.docs && (
                  <p className="amd-finding-docs">
                    docs:{' '}
                    <a href={f.docs} rel="noopener nofollow" target="_blank">
                      {f.docs.replace(/^https?:\/\//, '')}
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="amd-disclaimer">
        100% client-side. nothing leaves your browser.{' '}
        <a
          href={withUtm(
            'https://github.com/sipyourdrink-ltd/bernstein/blob/main/src/bernstein/adapters',
            {
              source: 'bernstein.run',
              medium: 'outbound-link',
              campaign: 'agent-md-bench-disclaimer',
            },
          )}
          rel="noopener"
          target="_blank"
          data-umami-event="outbound-github"
          data-umami-event-surface="agent-md-bench-disclaimer"
        >
          parser rules sourced from the bernstein adapters
        </a>
        .
      </p>
    </div>
  );
}
