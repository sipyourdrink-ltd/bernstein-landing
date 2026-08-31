/**
 * Typed accessor for the cli-agent-orchestrators benchmark suite.
 *
 * Source of truth: data/benchmarks/cli-agent-orchestrators-2026-05.json
 *
 * The data file is committed to the repo so a fresh checkout can render
 * the page without re-running the eval. Scores are operator-verified per
 * the methodology block (3 trials per task, median score, fixed model).
 * Refresh quarterly; the dated suite id keeps the URL stable while
 * historical runs stay under data/benchmarks/.
 *
 * Winrates and the honesty gate are computed at render time. No prose
 * fields are interpolated from an LLM.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export type BenchmarkTool = {
  id: string;
  displayName: string;
  version: string;
  repoUrl: string;
  category: string;
  shape: string;
};

export type BenchmarkTask = {
  id: string;
  title: string;
  category: string;
  acceptanceChecks: string[];
  /** Per-tool integer score 0 to 3 inclusive. Missing tool means not run. */
  scores: Record<string, number>;
  notes: string;
};

export type BenchmarkMethodology = {
  scoringRubric: string;
  tieRule: string;
  tasksCount: number;
  trialsPerTask: number;
  trialAggregation: string;
  seedPromptHash: string;
  modelsFixed: string;
  envHardware: string;
  reproScript: string;
};

export type BenchmarkSource = {
  tool: string;
  url: string;
  checkedOn: string;
};

export type BenchmarkSuite = {
  version: number;
  suiteId: string;
  datePublished: string;
  dateModified: string;
  methodology: BenchmarkMethodology;
  tools: BenchmarkTool[];
  tasks: BenchmarkTask[];
  winratesNote: string;
  sources: BenchmarkSource[];
};

const DATA_PATH = path.resolve(
  process.cwd(),
  'data',
  'benchmarks',
  'cli-agent-orchestrators-2026-05.json',
);

let _cache: BenchmarkSuite | null = null;

export async function getBenchmarkSuite(): Promise<BenchmarkSuite> {
  if (_cache) return _cache;
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  _cache = JSON.parse(raw) as BenchmarkSuite;
  return _cache;
}

/**
 * Tool winrate. A tool "wins" a task when its score is the maximum
 * across every tool that ran the task. Ties win. Returns a Record from
 * tool id to winrate in 0..1 inclusive.
 */
export function computeWinrates(suite: BenchmarkSuite): Record<string, number> {
  const wins: Record<string, number> = {};
  for (const tool of suite.tools) wins[tool.id] = 0;

  for (const task of suite.tasks) {
    let max = -1;
    for (const tool of suite.tools) {
      const s = task.scores[tool.id];
      if (s !== undefined && s > max) max = s;
    }
    if (max < 0) continue;
    for (const tool of suite.tools) {
      const s = task.scores[tool.id];
      if (s !== undefined && s === max) wins[tool.id] += 1;
    }
  }

  const total = suite.tasks.length;
  const out: Record<string, number> = {};
  for (const id of Object.keys(wins)) out[id] = total > 0 ? wins[id] / total : 0;
  return out;
}

/**
 * Count of tasks where the named tool's score is strictly less than the
 * best score on the task. Used by the honesty gate: a credible benchmark
 * must report >= 2 losses for the publishing project. The page builds
 * this into the rendered text, and the test in tests/benchmarks-honesty
 * fails CI if the count for bernstein drops below 2.
 */
export function countLosses(suite: BenchmarkSuite, toolId: string): number {
  let losses = 0;
  for (const task of suite.tasks) {
    let max = -1;
    for (const tool of suite.tools) {
      const s = task.scores[tool.id];
      if (s !== undefined && s > max) max = s;
    }
    const own = task.scores[toolId];
    if (own !== undefined && own < max) losses += 1;
  }
  return losses;
}

/** Convenience: the suite's date in ISO yyyy-mm-dd for sitemap lastmod. */
export function suiteLastmod(suite: BenchmarkSuite): string {
  return suite.dateModified;
}
