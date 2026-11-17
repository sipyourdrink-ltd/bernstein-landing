import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BERNSTEIN_FACTS, getCompareEntries } from '../lib/compare/data.ts';
import { buildFacts } from '../lib/compare/facts.ts';

test('Bernstein fallback facts use the complete category once and retain orchestration', async () => {
  const [recorded] = await getCompareEntries();
  const sparse = {
    ...recorded,
    installCommand: null,
    verified: null,
    parallelSafe: null,
    mcpSupport: null,
    licenseFromOverlay: null,
    ghStars: null,
    ghLastPushedAt: null,
    ghLicenseSpdx: null,
  };
  const facts = buildFacts(sparse, '2026-11-17');
  const category = facts.find((fact) => fact.claim.startsWith('Bernstein is '));
  assert.ok(category, 'sparse upstream records must include the Bernstein fallback');
  assert.equal(BERNSTEIN_FACTS.category, 'open-source governance layer for AI agents');
  assert.equal(category.claim, 'Bernstein is an open-source governance layer for AI agents licensed Apache-2.0, with a deterministic Python scheduler that routes work across CLI agents in parallel git worktrees.');
  assert.equal(BERNSTEIN_FACTS.multiAgent, true);
});
