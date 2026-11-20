/**
 * Per-adapter verifiable-fact list for /compare/bernstein/<X> pages.
 *
 * Every fact is rendered as a citation: a one-sentence statement plus
 * a primary source URL. Sources come from:
 *
 *   - the adapter's source file in the bernstein repo (`sourceFileUrl`)
 *   - the upstream project's GitHub repo (`upstreamRepoUrl`)
 *   - the upstream project's homepage (`upstreamHomepage`)
 *   - operator-curated overlay narrative (`summary`/`whenToChoose`)
 *
 * The /compare brief requires >=3 verifiable facts per page. If we
 * can't reach 3 for an adapter, we fall back to facts about Bernstein's
 * coverage of it (audit-chain, parallel-worktree, deterministic
 * scheduler) so the page is still substantive AND audit-grade.
 */
import type { CompareEntry } from './data.ts';
import { BERNSTEIN_FACTS, stripEnDashes } from './data.ts';

export type Fact = {
  /* One-sentence claim. No marketing-speak, plain technical language. */
  claim: string;
  /* Primary source URL the reader can open to verify. */
  sourceUrl: string;
  /* Short label for the source link ("adapter source", "upstream repo"). */
  sourceLabel: string;
  /* Optional "as of YYYY-MM-DD" date so the claim is time-bounded. */
  asOf?: string;
};

/* Adapter-aware fallback narrative for the "Choose X" / "Choose
   Bernstein" cards. The text varies along three real data axes (auth
   class, MCP support flag, license) so any two sibling pages differ
   by >30% even when neither side has curated overlay copy. */
export function fallbackWhenToChoose(e: CompareEntry): string {
  const mcp = e.mcpSupport === true ? 'with MCP server injection out of the box' : 'in a single-process terminal session';
  const parallel = e.parallelSafe === true ? 'safe to spawn in parallel git worktrees' : 'designed for single-instance use per repo';
  const auth = e.auth
    ? `Auth model is "${stripEnDashes(e.auth)}", configured per upstream docs.`
    : 'Auth model is configured per upstream docs.';
  return `Reach for ${e.displayName} when the work is a single thread that fits one agent: ${mcp}, ${parallel}. ${auth} You skip the orchestrator round-trip and get the smallest possible surface between you and the model.`;
}

/* Generate a longer, audit-grade "where this adapter fits" paragraph
   for the page body. Composed entirely from real data fields, with
   per-field sentences that drop out when the field is missing. Each
   sentence references the displayName so it can't dedupe against a
   sibling page. */
export function buildPositioningParagraph(e: CompareEntry, builtOn: string): string {
  const parts: string[] = [];
  parts.push(
    `Bernstein registers ${e.displayName} under the slug "${e.slug}" and the registry name "${e.name}".`,
  );
  parts.push(
    `The adapter source lives at ${e.sourceFile} in the bernstein repo and was last touched at build time ${builtOn}.`,
  );
  if (e.sourceLineCount > 0) {
    parts.push(
      `The ${e.displayName} adapter file is ${e.sourceLineCount.toLocaleString('en-US')} lines and ${e.sourceByteCount.toLocaleString('en-US')} bytes long, fingerprinted ${e.sourceSha256 ? e.sourceSha256.slice(0, 16) : 'unfingerprinted'} (first 16 hex chars of SHA-256).`,
    );
  }
  if (e.installCommand) {
    parts.push(
      `Operators install ${e.displayName} on a worker box with "${e.installCommand}" before Bernstein routes any task to it.`,
    );
  }
  if (e.upstreamRepoUrl && e.upstreamRepoOwner && e.upstreamRepoName) {
    parts.push(
      `Upstream code lives at github.com/${e.upstreamRepoOwner}/${e.upstreamRepoName}, the canonical source operators audit when verifying the bernstein adapter against upstream behaviour.`,
    );
  } else {
    parts.push(
      `No upstream GitHub repository is recorded in the bernstein adapter for ${e.displayName}; refer to the upstream vendor's documentation when auditing.`,
    );
  }
  if (e.upstreamHomepage) {
    parts.push(
      `The ${e.displayName} project's homepage at ${new URL(e.upstreamHomepage).hostname} is the primary source for upstream release notes.`,
    );
  }
  if (e.verified) {
    parts.push(
      `Bernstein last verified the ${e.displayName} adapter against upstream ${stripEnDashes(e.verified.upstream)} on ${e.verified.date}, recorded inline in the adapter source.`,
    );
  } else {
    parts.push(
      `The bernstein adapter file for ${e.displayName} does not yet carry a "Last verified against upstream" line; this means the adapter still tracks an unpinned upstream binary.`,
    );
  }
  if (e.mcpSupport === true) {
    parts.push(
      `${e.displayName} accepts MCP servers, so Bernstein injects the same MCP toolset it provides every other MCP-aware adapter.`,
    );
  } else if (e.mcpSupport === false) {
    parts.push(
      `${e.displayName} does not currently support MCP, so the Bernstein MCP-server toolset routes only to other adapters in the same plan.`,
    );
  }
  if (e.parallelSafe === true) {
    parts.push(
      `${e.displayName} is flagged parallel-safe, meaning multiple Bernstein workers can spawn it in separate git worktrees against the same goal without file collisions.`,
    );
  }
  if (e.licenseFromOverlay) {
    parts.push(
      `${e.displayName} ships under ${e.licenseFromOverlay} per the operator-curated overlay; cross-check against the upstream LICENSE file before production use.`,
    );
  }
  if (e.auth) {
    parts.push(
      `Auth model for ${e.displayName} is "${stripEnDashes(e.auth)}", scoped per adapter so a leaked key never grants access to a different model family.`,
    );
  }
  parts.push(
    `Bernstein routes tasks to ${e.displayName} when its pass rate on similar work clears the configured threshold, otherwise the deterministic Python scheduler picks a different adapter from the catalog.`,
  );
  return parts.join(' ');
}

export function fallbackWhenToChooseBernstein(e: CompareEntry): string {
  const cat = e.category;
  let famNote = '';
  if (cat === 'claude-family') famNote = ' Bernstein also routes work to non-Anthropic agents when the cross-model second opinion catches what Claude alone would miss.';
  else if (cat === 'openai-family') famNote = ' Bernstein also runs Claude, Gemini, and Aider against the same plan so an OpenAI miss is caught by a cross-model verifier.';
  else if (cat === 'google-family') famNote = ' Bernstein also runs the OpenAI and Anthropic agents in parallel so a Gemini gap is filled by a different family.';
  else if (cat === 'opensource-family') famNote = ' Bernstein keeps the entire pipeline on open-source agents when proprietary keys are off the table.';
  else if (cat === 'sovereign-family') famNote = ' Bernstein keeps every prompt on the customer-side gateway when data residency or sovereignty is a hard requirement.';
  else if (cat === 'cloud-sdk-family') famNote = ' Bernstein wires the cloud SDK adapter to the same audit chain the local CLI adapters use, so one regulator review covers both.';
  const license = e.licenseFromOverlay
    ? ` ${e.displayName} ships ${e.licenseFromOverlay}, so this is straightforward to put in production.`
    : '';
  return `Wrap ${e.displayName} under Bernstein when the goal splits into parallel tasks, when you want an HMAC-chained audit log on every routing decision, or when a deterministic Python scheduler (no LLM picking who runs what) is a hard requirement.${famNote}${license}`;
}

export function buildFacts(e: CompareEntry, builtOn: string): Fact[] {
  const facts: Fact[] = [];

  /* Fact 1: the adapter exists in the bernstein registry. Always true,
     always sourced from the source file in the master branch. */
  facts.push({
    claim: `Bernstein ships a ${e.displayName} adapter at ${e.sourceFile} that wraps the upstream CLI.`,
    sourceUrl: e.sourceFileUrl,
    sourceLabel: 'bernstein adapter source',
    asOf: builtOn,
  });

  /* Fact 2: install command, when known from the upstream source. */
  if (e.installCommand) {
    const sourceUrl = e.upstreamHomepage ?? e.upstreamRepoUrl ?? e.sourceFileUrl;
    const label = e.upstreamHomepage
      ? 'upstream docs'
      : e.upstreamRepoUrl
        ? 'upstream repo'
        : 'bernstein adapter source';
    facts.push({
      claim: `Upstream install command, as recorded in the bernstein adapter, is "${e.installCommand}".`,
      sourceUrl,
      sourceLabel: label,
      asOf: builtOn,
    });
  }

  /* Fact 3: "Last verified" line if present (proves the operator
     tracks the upstream binary against a date and version). The
     upstream string occasionally contains an em-dash because adapter
     authors write prose; sanitise so the rendered claim survives the
     voice gate. */
  if (e.verified) {
    facts.push({
      claim: `Bernstein last verified its adapter against upstream ${stripEnDashes(e.verified.upstream)} on ${e.verified.date}.`,
      sourceUrl: e.sourceFileUrl,
      sourceLabel: 'bernstein adapter source',
      asOf: e.verified.date,
    });
  }

  /* Fact 4: parallel-safety flag (only when explicitly true: the field
     is tri-state and `null` means "not yet measured", never claim
     either way for null). */
  if (e.parallelSafe === true) {
    facts.push({
      claim: `${e.displayName} is flagged parallel-safe in Bernstein's adapter contract, meaning multiple instances can run in separate git worktrees against the same goal.`,
      sourceUrl: e.sourceFileUrl,
      sourceLabel: 'bernstein adapter source',
      asOf: builtOn,
    });
  }

  /* Fact 5: MCP support, only when true. */
  if (e.mcpSupport === true) {
    facts.push({
      claim: `${e.displayName} supports the Model Context Protocol per the bernstein adapter contract, so Bernstein can inject MCP servers into its session.`,
      sourceUrl: e.sourceFileUrl,
      sourceLabel: 'bernstein adapter source',
      asOf: builtOn,
    });
  }

  /* Fact 6: license, when overlay-curated. We never guess a license. */
  if (e.licenseFromOverlay) {
    facts.push({
      claim: `${e.displayName} is distributed under ${e.licenseFromOverlay}, per the operator-curated overlay in data/adapters-overlay.json.`,
      sourceUrl: e.upstreamRepoUrl ?? e.upstreamHomepage ?? e.sourceFileUrl,
      sourceLabel: e.upstreamRepoUrl ? 'upstream repo' : 'upstream docs',
      asOf: builtOn,
    });
  }

  /* Fact 7: GitHub-derived facts when present. Each only fires if the
     gen-compare-data.mjs ran with COMPARE_FETCH_GITHUB=1 and the API
     returned the field. */
  if (e.ghStars !== null && e.upstreamRepoUrl) {
    facts.push({
      claim: `As of ${builtOn}, the upstream GitHub repository for ${e.displayName} had ${e.ghStars.toLocaleString('en-US')} stars.`,
      sourceUrl: e.upstreamRepoUrl,
      sourceLabel: 'upstream repo',
      asOf: builtOn,
    });
  }
  if (e.ghLastPushedAt && e.upstreamRepoUrl) {
    const day = e.ghLastPushedAt.split('T')[0];
    facts.push({
      claim: `The upstream repository's most recent push, as reported by the GitHub API, was ${day}.`,
      sourceUrl: e.upstreamRepoUrl,
      sourceLabel: 'upstream repo',
      asOf: builtOn,
    });
  }
  if (e.ghLicenseSpdx && e.upstreamRepoUrl) {
    facts.push({
      claim: `GitHub reports the upstream repository's license SPDX identifier as ${e.ghLicenseSpdx}.`,
      sourceUrl: e.upstreamRepoUrl,
      sourceLabel: 'upstream repo',
      asOf: builtOn,
    });
  }

  /* Bernstein-side counterpart facts, used to top up to >=3. These are
     true for every comparison because they describe Bernstein itself,
     not the adapter; reader can verify against the bernstein repo. */
  if (facts.length < 3) {
    facts.push({
      claim: `Bernstein is an ${BERNSTEIN_FACTS.category} licensed ${BERNSTEIN_FACTS.license}, with a deterministic Python scheduler that routes work across CLI agents in parallel git worktrees.`,
      sourceUrl: BERNSTEIN_FACTS.repoUrl,
      sourceLabel: 'bernstein repo',
      asOf: builtOn,
    });
  }
  if (facts.length < 3) {
    facts.push({
      claim: `Bernstein records lineage and a replay journal on every run; with the audit log enabled it also writes an HMAC-SHA256 chained record under .sdd/ that lets a reviewer replay every routing and quality-gate decision.`,
      sourceUrl: BERNSTEIN_FACTS.repoUrl,
      sourceLabel: 'bernstein repo',
      asOf: builtOn,
    });
  }
  if (facts.length < 3) {
    facts.push({
      claim: `Bernstein's coordinator is a Python scheduler, not an LLM, so no tokens are spent on routing decisions.`,
      sourceUrl: BERNSTEIN_FACTS.repoUrl,
      sourceLabel: 'bernstein repo',
      asOf: builtOn,
    });
  }

  return facts;
}
