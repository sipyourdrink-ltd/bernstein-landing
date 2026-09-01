/**
 * How this project describes itself, in one place.
 *
 * Why this module exists
 * ----------------------
 * The site describes the project on a lot of surfaces, and the
 * machine-readable ones are the surfaces nobody proofreads: a visitor
 * would notice two contradictory sentences on the homepage, but nobody
 * eyeballs `/agents.txt` next to the `WebSite` JSON-LD next to
 * `/llms-full.txt`. So when the project description changed, the human
 * copy was updated and six structured-data and plaintext surfaces were
 * not - two of them sitting in the same response body as an
 * already-corrected description, which meant the host was serving two
 * different descriptions of one project to the same crawler.
 *
 * Four hand-maintained copies of one sentence is the whole failure
 * mode. This module is the one copy; `tests/project-description.test.ts`
 * fails if a surface grows its own again, or if any of them reintroduce
 * the retired vocabulary.
 *
 * Deliberately dependency-free: `/agents.txt` and `/llms-full.txt` are
 * plaintext routes, and a leaf module with no imports can be pulled
 * into any of them without dragging MDX compilation or the post index
 * along behind it.
 *
 * Scope note: "governance layer" is the product description. The
 * scheduler is still an orchestrator, and pointers labelled "the
 * orchestrator" that resolve to the engine repository are correct as
 * they stand - this module does not govern those.
 */

/**
 * The load-bearing phrase, with no leading article so each surface can
 * supply its own. Every exported string below is built from it, which
 * is the point: the phrase is edited here once, or not at all.
 */
const LAYER = 'open-source governance layer for AI agents';

/** Sentence-initial and standalone use. */
export const PROJECT_TAGLINE = `The ${LAYER}`;

/** Mid-sentence use: "Bernstein is the open-source governance layer...". */
export const PROJECT_TAGLINE_MID = `the ${LAYER}`;

/** The lowercase-voice surfaces (/about) carry the same phrase, downcased. */
export const PROJECT_TAGLINE_LOWER = PROJECT_TAGLINE_MID.toLowerCase();

export const PROJECT_NAME = 'Bernstein';

/**
 * Schema.org `alternateName`. It disambiguates the site from the other
 * things called Bernstein, so it has to be a name rather than a
 * description - but it is still a claim about what this project is, and
 * it named the old scope until it was caught.
 */
export const PROJECT_ALTERNATE_NAME = `${PROJECT_NAME} Governance Layer`;

/**
 * The shortest canonical form: the `Description:` field of
 * `/agents.txt`. Every other description on the site is a longer or
 * shorter projection of this one.
 */
export const PROJECT_DESCRIPTION = `${PROJECT_TAGLINE} - no model in the coordination loop, so replaying a plan reproduces its task graph byte-identically; signed lineage and an opt-in HMAC audit chain, air-gap friendly`;

/**
 * Classification for `/agents.txt`. A directory that ingests this file
 * classifies the project from these two fields alone, so leaving the
 * governance and provenance terms out of them meant the descriptor said
 * one thing in prose and another in the fields a machine actually reads.
 */
export const PROJECT_CATEGORIES = [
  'DeveloperTool',
  'AIGovernance',
  'AgentOrchestration',
  'Provenance',
] as const;

export const PROJECT_TAGS = [
  'ai-governance',
  'agent-governance',
  'deterministic-scheduling',
  'offline-verification',
  'cli-agents',
  'multi-agent',
  'replay',
  'lineage',
  'provenance',
  'audit',
] as const;

/**
 * `WebSite` JSON-LD description.
 *
 * On the second clause: receipt bytes are identical across independent
 * builds of the SAME run. Two different runs produce different receipts,
 * as they must - each carries its own run id and heads. "byte-identical
 * run receipts" invited the reading that receipts are byte-identical in
 * general, which is not a property this project has or wants.
 * Offline verifiability is the property, and it is the phrasing the
 * paper uses.
 */
export const PROJECT_SITE_DESCRIPTION = `${PROJECT_TAGLINE}. Deterministic task graphs replay byte-identically; offline-verifiable run receipts let a reviewer check a run without rerunning it.`;

/** Closing line of the `/llms-full.txt` summary block. */
export const PROJECT_ONE_LINER = 'Govern any agent workload. Any model. One command.';

/**
 * The Overview paragraph of `/llms-full.txt` - the primary prose
 * description served to LLM crawlers, and the longest-lived copy of the
 * six that went stale.
 *
 * CLI coding agents stay named here on purpose. They are the
 * out-of-the-box path, and dropping them to make room for the broader
 * framing would trade one inaccuracy for another.
 */
export const PROJECT_OVERVIEW = `${PROJECT_NAME} is ${PROJECT_TAGLINE_MID}. CLI coding agents work out of the box (Claude Code, Codex, Gemini CLI, and 40+ more); the same layer governs any agent workload you point it at. It decomposes goals into tasks, assigns them to the most appropriate agents and models, isolates work in git worktrees, verifies results through quality gates, and merges verified output.`;

/** `Person` JSON-LD on /about. Lowercase to match that page's voice. */
export const PROJECT_MAINTAINER_DESCRIPTION = `solo maintainer of bernstein, ${PROJECT_TAGLINE_LOWER}. deterministic python scheduler, cli coding agents out of the box. apache 2.0, self-bootstrapped, no vc funding.`;
