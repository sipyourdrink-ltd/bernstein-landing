/**
 * agent-md-bench rules - deterministic parser-quirk linter for AGENTS.md /
 * CLAUDE.md / .cursorrules content.
 *
 * Source-of-truth references (per ticket E1):
 *   - bernstein/src/bernstein/adapters/claude.py
 *   - bernstein/src/bernstein/adapters/cursor.py
 *   - bernstein/src/bernstein/adapters/codex.py
 *   - bernstein/src/bernstein/adapters/gemini.py
 *   - bernstein/src/bernstein/adapters/aider.py
 *   - bernstein/src/bernstein/adapters/opencode.py
 *   - bernstein/src/bernstein/core/knowledge/agents_md_bridge.py
 *   - https://agents.md/ (canonical site)
 *   - https://code.claude.com/docs/en/memory (CLAUDE.md soft cap)
 *   - https://cursor.com/docs/context/rules (Cursor rules format)
 *   - https://aider.chat/docs/usage/conventions.html (Aider conventions)
 *   - https://developers.openai.com/codex/guides/agents-md (Codex AGENTS.md)
 *
 * Each rule is a pure function from a parsed document to ``Finding[]``. We
 * keep rules tiny so they run client-side in <10ms even on a 100KB
 * AGENTS.md and remain auditable by anyone reading the source.
 *
 * The schema mirrors ``chernistry/agent-md-rules`` so an external repo can
 * one-day be the single source of truth and we re-import via a vendored
 * snapshot.
 */

export type Severity = 'error' | 'warn' | 'info';
export type AgentName =
  | 'claude-code'
  | 'cursor'
  | 'codex'
  | 'aider'
  | 'gemini'
  | 'opencode'
  | 'goose';

export interface Finding {
  /** Stable rule id, e.g. ``CLAUDE-01``. */
  id: string;
  /** Which agent's parser this rule covers. */
  agent: AgentName;
  /** One-line description of what triggered. */
  message: string;
  severity: Severity;
  /** 1-indexed line number in the input (best effort; 0 = whole-file). */
  line?: number;
  /** Optional doc link for the operator to verify. */
  docs?: string;
}

export interface Document {
  /** Filename hint as supplied by the user (e.g. ``CLAUDE.md``). */
  filename: string;
  /** Raw text content, exactly as pasted/dropped. */
  text: string;
}

export interface Rule {
  id: string;
  agent: AgentName;
  description: string;
  severity: Severity;
  docs?: string;
  /** Pure check - returns zero or more findings. */
  check: (doc: Document) => Finding[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UTF-8 byte length, matching how parsers truncate by bytes (not chars). */
export function utf8Bytes(text: string): number {
  // Browser-safe: TextEncoder is in lib.dom.
  return new TextEncoder().encode(text).length;
}

/** Approximate token count via the GPT/Claude rule-of-thumb (~4 chars/token).
 *  Not a real BPE - accuracy ±20%. We disclose this in the UI. */
export function approxTokens(text: string): number {
  // Claude/GPT BPE on English averages ~3.6 chars/token; round to 4 for the
  // ROT and disclaim ±20% in the UI.
  return Math.ceil(text.length / 4);
}

/** Line-numbered iterator. */
function* eachLine(text: string): Generator<{ line: number; content: string }> {
  let line = 1;
  for (const content of text.split(/\r?\n/)) {
    yield { line, content };
    line += 1;
  }
}

/** Detect a YAML frontmatter block at the start of the document. */
function frontmatter(text: string): { start: number; end: number } | null {
  // Frontmatter must be the first thing in the file (allowing BOM).
  const trimmed = text.replace(/^﻿/, '');
  if (!trimmed.startsWith('---')) return null;
  // Find the closing fence on its own line.
  const closeMatch = trimmed.slice(3).match(/\n---\s*(\n|$)/);
  if (!closeMatch || closeMatch.index === undefined) return null;
  return { start: 0, end: 3 + closeMatch.index + closeMatch[0].length };
}

/** Detect any HTML <!-- ... --> comments. */
function hasHtmlComment(text: string): boolean {
  return /<!--[\s\S]*?-->/m.test(text);
}

// ---------------------------------------------------------------------------
// Rule catalog
// ---------------------------------------------------------------------------

export const RULES: Rule[] = [
  // ----- Claude Code ------------------------------------------------------
  {
    id: 'CLAUDE-01',
    agent: 'claude-code',
    severity: 'warn',
    description:
      'CLAUDE.md soft cap: Anthropic recommends ≤200 lines so the model has budget left for code context.',
    docs: 'https://code.claude.com/docs/en/memory',
    check: (doc) => {
      const lines = doc.text.split(/\r?\n/).length;
      if (lines <= 200) return [];
      return [
        {
          id: 'CLAUDE-01',
          agent: 'claude-code',
          severity: 'warn',
          message: `${lines} lines - Anthropic recommends ≤200 for CLAUDE.md (soft cap, no hard truncation).`,
        },
      ];
    },
  },
  {
    id: 'CLAUDE-02',
    agent: 'claude-code',
    severity: 'warn',
    description:
      "Claude Code does NOT parse YAML frontmatter - the block is pasted verbatim into the prompt.",
    docs: 'https://code.claude.com/docs/en/memory',
    check: (doc) => {
      const fm = frontmatter(doc.text);
      if (!fm) return [];
      return [
        {
          id: 'CLAUDE-02',
          agent: 'claude-code',
          severity: 'warn',
          line: 1,
          message:
            'YAML frontmatter detected. Claude Code does not parse it - the --- block ships as literal text in the prompt and burns tokens.',
        },
      ];
    },
  },
  {
    id: 'CLAUDE-03',
    agent: 'claude-code',
    severity: 'info',
    description:
      "Claude Code resolves CLAUDE.md from the worktree root via --add-dir; subdirectory CLAUDE.md files are NOT auto-loaded.",
    docs: 'https://code.claude.com/docs/en/memory',
    check: (doc) => {
      const ref = /\b(?:src|app|packages|services|backend|frontend)\/CLAUDE\.md\b/i;
      if (!ref.test(doc.text)) return [];
      return [
        {
          id: 'CLAUDE-03',
          agent: 'claude-code',
          severity: 'info',
          message:
            'References sub-directory CLAUDE.md files. Claude Code only auto-loads the root CLAUDE.md; nested files need an explicit @-mention or --add-dir.',
        },
      ];
    },
  },

  // ----- Cursor -----------------------------------------------------------
  {
    id: 'CURSOR-01',
    agent: 'cursor',
    severity: 'info',
    description:
      'Cursor 0.45+ prefers .cursor/rules/<key>.mdc over the legacy .cursorrules; the older file still works but is undocumented.',
    docs: 'https://cursor.com/docs/context/rules',
    check: (doc) => {
      const fname = doc.filename.toLowerCase();
      if (!fname.endsWith('.cursorrules')) return [];
      return [
        {
          id: 'CURSOR-01',
          agent: 'cursor',
          severity: 'info',
          message:
            "Filename '.cursorrules' is the legacy single-file format. Newer Cursor (≥ 0.45) reads .cursor/rules/<name>.mdc with YAML frontmatter.",
        },
      ];
    },
  },
  {
    id: 'CURSOR-02',
    agent: 'cursor',
    severity: 'warn',
    description:
      "Cursor's .mdc parser REQUIRES YAML frontmatter (description, globs, alwaysApply). Without it the rule is treated as agent-requested-only.",
    docs: 'https://cursor.com/docs/context/rules',
    check: (doc) => {
      const fname = doc.filename.toLowerCase();
      if (!fname.endsWith('.mdc')) return [];
      const fm = frontmatter(doc.text);
      if (fm) return [];
      return [
        {
          id: 'CURSOR-02',
          agent: 'cursor',
          severity: 'warn',
          line: 1,
          message:
            "Cursor .mdc file missing YAML frontmatter. Without 'description:' / 'globs:' / 'alwaysApply:' keys Cursor downgrades to manual-attach mode.",
        },
      ];
    },
  },
  {
    id: 'CURSOR-03',
    agent: 'cursor',
    severity: 'warn',
    description:
      'Cursor truncates very long rule files; ≤500 lines per file is the documented sweet spot.',
    docs: 'https://cursor.com/docs/context/rules',
    check: (doc) => {
      const lines = doc.text.split(/\r?\n/).length;
      if (lines <= 500) return [];
      return [
        {
          id: 'CURSOR-03',
          agent: 'cursor',
          severity: 'warn',
          message: `${lines} lines - Cursor docs recommend splitting rules >500 lines into multiple .mdc files (each rule auto-loaded by glob).`,
        },
      ];
    },
  },

  // ----- Codex (OpenAI) ---------------------------------------------------
  {
    id: 'CODEX-01',
    agent: 'codex',
    severity: 'info',
    description:
      'OpenAI Codex CLI reads AGENTS.md by default; CLAUDE.md / .cursorrules are NOT auto-loaded.',
    docs: 'https://developers.openai.com/codex/guides/agents-md',
    check: (doc) => {
      const fname = doc.filename.toLowerCase();
      if (fname === 'agents.md') return [];
      // Only flag when the doc clearly targets a single competitor.
      if (fname === 'claude.md' || fname === '.cursorrules' || fname.endsWith('.mdc')) {
        return [
          {
            id: 'CODEX-01',
            agent: 'codex',
            severity: 'info',
            message: `Codex CLI ignores '${doc.filename}'. Codex reads AGENTS.md only - duplicate or symlink the content if you want both engines to see it.`,
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'CODEX-02',
    agent: 'codex',
    severity: 'warn',
    description:
      'Codex AGENTS.md guidance: keep instructions in plain prose, not bulleted commands. Codex de-prioritises long bullet lists vs continuous prose blocks.',
    docs: 'https://developers.openai.com/codex/guides/agents-md',
    check: (doc) => {
      // Heuristic: ≥40% of non-empty lines are bullet items.
      let total = 0;
      let bullets = 0;
      for (const { content } of eachLine(doc.text)) {
        const trimmed = content.trim();
        if (!trimmed) continue;
        total += 1;
        if (/^[-*+] /.test(trimmed) || /^\d+\.\s/.test(trimmed)) bullets += 1;
      }
      if (total < 40) return [];
      const ratio = bullets / total;
      if (ratio < 0.4) return [];
      return [
        {
          id: 'CODEX-02',
          agent: 'codex',
          severity: 'warn',
          message: `${Math.round(ratio * 100)}% of non-empty lines are bullets. Codex weighs prose blocks higher than dense bullet lists; mix in 1-2-sentence paragraphs.`,
        },
      ];
    },
  },

  // ----- Aider ------------------------------------------------------------
  {
    id: 'AIDER-01',
    agent: 'aider',
    severity: 'info',
    description:
      "Aider does NOT auto-load AGENTS.md or CLAUDE.md. Conventions live in CONVENTIONS.md plus an .aider.conf.yml entry pointing at it.",
    docs: 'https://aider.chat/docs/usage/conventions.html',
    check: (doc) => {
      const fname = doc.filename.toLowerCase();
      if (fname === 'conventions.md') return [];
      if (
        fname === 'agents.md' ||
        fname === 'claude.md' ||
        fname === '.cursorrules' ||
        fname.endsWith('.mdc')
      ) {
        return [
          {
            id: 'AIDER-01',
            agent: 'aider',
            severity: 'info',
            message: `Aider does not auto-discover '${doc.filename}'. Either rename to CONVENTIONS.md or add 'read: ${doc.filename}' to .aider.conf.yml.`,
          },
        ];
      }
      return [];
    },
  },

  // ----- Gemini CLI -------------------------------------------------------
  {
    id: 'GEMINI-01',
    agent: 'gemini',
    severity: 'info',
    description:
      'Gemini CLI reads GEMINI.md (uppercase) at repo root; AGENTS.md / CLAUDE.md are NOT auto-loaded.',
    docs: 'https://ai.google.dev/gemini-api/docs/cli',
    check: (doc) => {
      const fname = doc.filename;
      if (fname === 'GEMINI.md') return [];
      // Only flag when the doc names a different engine's file directly.
      const lower = fname.toLowerCase();
      if (
        lower === 'agents.md' ||
        lower === 'claude.md' ||
        lower === '.cursorrules' ||
        lower.endsWith('.mdc')
      ) {
        return [
          {
            id: 'GEMINI-01',
            agent: 'gemini',
            severity: 'info',
            message: `Gemini CLI looks for GEMINI.md (case-sensitive on Linux). '${doc.filename}' will be ignored unless you symlink it.`,
          },
        ];
      }
      return [];
    },
  },

  // ----- OpenCode ---------------------------------------------------------
  {
    id: 'OPENCODE-01',
    agent: 'opencode',
    severity: 'info',
    description:
      'OpenCode reads AGENTS.md and supports the agents.md convention; subdirectory AGENTS.md files are loaded when you cd into them.',
    docs: 'https://github.com/opencode-ai/opencode',
    check: (doc) => {
      // Informational: only fires for clearly-other-engine files.
      const lower = doc.filename.toLowerCase();
      if (
        lower === '.cursorrules' ||
        lower.endsWith('.mdc') ||
        lower === 'gemini.md' ||
        lower === 'claude.md'
      ) {
        return [
          {
            id: 'OPENCODE-01',
            agent: 'opencode',
            severity: 'info',
            message: `OpenCode reads AGENTS.md by convention. '${doc.filename}' is not auto-loaded; rename or duplicate if you want OpenCode to see this.`,
          },
        ];
      }
      return [];
    },
  },

  // ----- Cross-cutting / non-standard directives --------------------------
  {
    id: 'X-01',
    agent: 'claude-code',
    severity: 'warn',
    description:
      "Non-standard 'max-tool-budget' / 'tool-budget' directive - no agent CLI parses this. If you mean per-task budget, use bernstein's --max-budget-usd.",
    check: (doc) => {
      const re = /\b(?:max[-_ ]tool[-_ ]budget|tool[-_ ]budget|max[-_ ]budget)\s*[:=]/i;
      const findings: Finding[] = [];
      let line = 0;
      for (const { content } of eachLine(doc.text)) {
        line += 1;
        if (re.test(content)) {
          findings.push({
            id: 'X-01',
            agent: 'claude-code',
            severity: 'warn',
            line,
            message:
              "'max-tool-budget' / 'tool-budget' is non-standard. No agent CLI consumes it. For bernstein per-task budgets use the CLI flag --max-budget-usd.",
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'X-02',
    agent: 'claude-code',
    severity: 'info',
    description:
      'HTML comments (<!-- ... -->) are kept verbatim in the prompt by every agent - they cost tokens without conveying anything to the model.',
    check: (doc) => {
      if (!hasHtmlComment(doc.text)) return [];
      return [
        {
          id: 'X-02',
          agent: 'claude-code',
          severity: 'info',
          message:
            'HTML comments present. Every agent ships them as literal text into the prompt - strip if they are author-only notes.',
        },
      ];
    },
  },
  {
    id: 'X-03',
    agent: 'claude-code',
    severity: 'warn',
    description:
      'Document is large enough that prompt-cache invalidation will hurt latency on every edit; consider splitting along the canonical AGENTS.md sections.',
    check: (doc) => {
      const bytes = utf8Bytes(doc.text);
      if (bytes <= 16 * 1024) return [];
      return [
        {
          id: 'X-03',
          agent: 'claude-code',
          severity: 'warn',
          message: `${(bytes / 1024).toFixed(1)} KB - prompt-cache invalidation kicks in on every byte change. Split into multiple AGENTS.md sections so edits to one section don't force a full re-cache.`,
        },
      ];
    },
  },
  {
    id: 'X-04',
    agent: 'claude-code',
    severity: 'info',
    description:
      'No "## Build & test" or "## Setup" section detected - the canonical agents.md/AGENTS.md guidance recommends both for any non-trivial repo.',
    docs: 'https://agents.md/',
    check: (doc) => {
      const hasBuild = /^##\s+(?:build\s*&\s*test|build\s+and\s+test|build|test|setup|installation)\b/im.test(
        doc.text,
      );
      if (hasBuild) return [];
      return [
        {
          id: 'X-04',
          agent: 'claude-code',
          severity: 'info',
          message:
            'No "## Build & test" or "## Setup" section. agents.md guidance: every repo should expose how to install and how to run tests so an agent does not invent its own commands.',
        },
      ];
    },
  },
];

// ---------------------------------------------------------------------------
// Top-level lint API
// ---------------------------------------------------------------------------

export interface LintResult {
  filename: string;
  charCount: number;
  byteCount: number;
  lineCount: number;
  approxTokens: number;
  findings: Finding[];
}

export function lint(doc: Document): LintResult {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    findings.push(...rule.check(doc));
  }
  // Stable sort: severity > agent > id
  const order: Severity[] = ['error', 'warn', 'info'];
  findings.sort((a, b) => {
    const sev = order.indexOf(a.severity) - order.indexOf(b.severity);
    if (sev !== 0) return sev;
    const ag = a.agent.localeCompare(b.agent);
    if (ag !== 0) return ag;
    return a.id.localeCompare(b.id);
  });
  return {
    filename: doc.filename,
    charCount: doc.text.length,
    byteCount: utf8Bytes(doc.text),
    lineCount: doc.text === '' ? 0 : doc.text.split(/\r?\n/).length,
    approxTokens: approxTokens(doc.text),
    findings,
  };
}

/** Per-agent size verdict for the summary table. */
export interface AgentBudget {
  agent: AgentName;
  /** Where the soft cap kicks in (in bytes). 0 = no documented cap. */
  softCapBytes: number;
  /** Best-effort label for the UI ("ok" / "warn" / "over"). */
  status: 'ok' | 'warn' | 'over';
  /** Soft truncation note shown beside the row. */
  note: string;
}

/** Agent size budgets (May 2026). The numbers are documented soft caps,
 *  not hard truncation - every modern CLI ships the whole file but warns
 *  when it costs prompt-cache headroom. */
const AGENT_BUDGETS: Record<AgentName, { soft: number; doc: string }> = {
  'claude-code': { soft: 200 * 80, doc: '~200 lines / ~16 KB' },
  cursor: { soft: 500 * 80, doc: '~500 lines per .mdc' },
  codex: { soft: 32 * 1024, doc: '~32 KB' },
  aider: { soft: 16 * 1024, doc: '~16 KB' },
  gemini: { soft: 32 * 1024, doc: '~32 KB' },
  opencode: { soft: 32 * 1024, doc: '~32 KB' },
  goose: { soft: 16 * 1024, doc: '~16 KB' },
};

export function budgets(doc: Document): AgentBudget[] {
  const bytes = utf8Bytes(doc.text);
  return (Object.keys(AGENT_BUDGETS) as AgentName[]).map((agent) => {
    const { soft, doc: note } = AGENT_BUDGETS[agent];
    let status: AgentBudget['status'] = 'ok';
    if (bytes >= soft * 1.5) status = 'over';
    else if (bytes >= soft) status = 'warn';
    return {
      agent,
      softCapBytes: soft,
      status,
      note,
    };
  });
}
