/**
 * /spec-driven - walkthrough of the spec-driven planning loop.
 *
 * Closes a documentation gap: the runtime surface (goal in, verified PR
 * out) is described well on the home page's "how it works" section, but
 * the planning loop a human drives before any agent spawns - express
 * intent, review the decomposed plan, then execute - is only referenced
 * in passing. This page walks the five stages end to end.
 *
 * Every command on this page is a real entry point in the bernstein CLI
 * (verified against src/bernstein/cli/ at authoring time). No command is
 * invented for narrative convenience:
 *   - bernstein init                  -> creates the .sdd/ workspace
 *   - bernstein run -g "<goal>"       -> open-ended natural-language goal
 *   - bernstein run --plan-only       -> emit decomposed plan, no agents
 *   - bernstein run --dry-run         -> plan + scheduling + cost preview
 *   - bernstein run --from-plan plan.yaml -> execute a hand-written manifest
 *   - bernstein approve / reject      -> merge-gate decisions
 *   - bernstein wrap-up               -> session summary + lineage
 *
 * Why hand-written TSX rather than MDX-from-content: the command names
 * and flags are load-bearing - a silent content edit that drifts from
 * the CLI would mislead operators. Keeping the prose in TSX means a
 * deliberate code change (and a diff in review) is required to amend it.
 */
import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { BackToTop } from '@/components/landing/BackToTop';
import { SITE_URL, AUTHOR, SITE_NAME } from '@/lib/seo';

export const dynamic = 'force-static';

const PAGE_DATE = '2026-05-20';
const PAGE_TITLE = 'Spec-driven development with Bernstein: a walkthrough';
const PAGE_DESC =
  'How a goal becomes a verified pull request in Bernstein: express intent, review the decomposed task plan before any agent spawns, then execute under gates.';
const PAGE_URL = `${SITE_URL}/spec-driven`;
const REPO_URL = 'https://github.com/sipyourdrink-ltd/bernstein';
const DOCS_URL = 'https://bernstein.readthedocs.io/';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  authors: [{ name: AUTHOR }],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    url: PAGE_URL,
    authors: [AUTHOR],
    images: [{ url: `/api/og?title=${encodeURIComponent(PAGE_TITLE)}`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    images: [`/api/og?title=${encodeURIComponent(PAGE_TITLE)}`],
  },
};

type Stage = {
  num: number;
  id: string;
  title: string;
  command: string;
  what: string;
  detail: string;
};

const STAGES: Stage[] = [
  {
    num: 1,
    id: 'spec',
    title: 'Spec - state the intent',
    command: 'bernstein init && bernstein run -g "<goal>"',
    what:
      'bernstein init creates the .sdd/ workspace and a bernstein.yaml in the current directory. From there a spec is either a natural-language goal passed to run -g, or - when the goal is too coarse - a hand-written plan.yaml manifest that pins stages, roles, and models explicitly.',
    detail:
      'The spec is the only place a human writes prose. Everything downstream of the decomposed plan is derived deterministically, so the plan is also the artefact you version and review in a pull request before a single agent runs.',
  },
  {
    num: 2,
    id: 'checklist',
    title: 'Checklist - review the decomposed plan',
    command: 'bernstein run --plan-only   # or --dry-run for cost preview',
    what:
      'run --plan-only emits the decomposed task plan as Markdown and exits before any agent spawns. run --dry-run adds the scheduling order and an estimated cost band. This is the checkpoint where you read what the planner intends to do and stop it if the decomposition is wrong.',
    detail:
      'Decomposing a free-text goal is one LLM call, so two runs of the same goal can differ. Everything after it - scheduling, routing, gating - is plain Python, and a hand-written plan.yaml skips the LLM entirely and reproduces the same task graph every time. Either way a decomposition bug shows up here as a wrong checklist you can read, not as a bad chain-of-thought you have to infer after the fact.',
  },
  {
    num: 3,
    id: 'tasks',
    title: 'Tasks - the graph the scheduler builds',
    command: 'bernstein run --from-plan plan.yaml',
    what:
      'The planner emits a task graph: each task carries a role, a model, and its dependencies. Tasks with no unmet dependency are eligible to run; the rest wait. Each task gets its own git worktree, so concurrent agents never share a working tree.',
    detail:
      'State lives on disk under .sdd/runtime/ (the task backlog, per-agent tokens, the write-ahead log). External workers can claim eligible tasks from a shared same-host backlog with bernstein backlog claim --role <role>; the orchestrator and the worker pool read the same files.',
  },
  {
    num: 4,
    id: 'implement',
    title: 'Implement - one agent per worktree',
    command: '(agents run automatically as tasks become eligible)',
    what:
      'Each eligible task gets one agent in its worktree. Model selection follows the task role - a stronger model for architecture, a mid-tier model for ordinary implementation, a cheap model for tests and boilerplate. An epsilon-greedy bandit reroutes by observed pass rate per task type.',
    detail:
      'The agent itself is whichever CLI tool you already trust (Claude Code, Codex, and other adapters). Bernstein owns the scheduling, scoping, and audit; the adapter owns the edit. Every routing and gate decision is written to the HMAC-chained audit log under .sdd/audit/.',
  },
  {
    num: 5,
    id: 'review',
    title: 'Review - gates, then the merge decision',
    command: 'bernstein approve <task-id>   # or bernstein reject',
    what:
      'Lint, type-check, and tests run on every diff, plus an optional security scan and an optional cross-model review. A failed gate retries against a stronger model. Your branch only ever sees diffs that passed every gate. The final merge decision is an explicit bernstein approve / bernstein reject.',
    detail:
      'bernstein wrap-up closes the session with a summary, lineage, and cost report. Nothing about the run is implicit: the spec, the plan, every gate result, and the approve/reject decision are all recorded, so the path from intent to merged PR is auditable end to end.',
  },
];

export default function SpecDrivenPage() {
  const sectionStyle: React.CSSProperties = {
    marginTop: 'var(--space-6, 32px)',
    marginBottom: 'var(--space-6, 32px)',
  };
  const codeStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: '0.85rem',
  };
  const cmdBlockStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: '0.85rem',
    background: 'var(--bg-paper-2, #efe6d2)',
    border: '1px solid var(--rule, rgba(0, 0, 0, 0.12))',
    borderRadius: '8px',
    padding: '0.7rem 0.9rem',
    margin: 'var(--space-3, 12px) 0',
    overflowX: 'auto',
    whiteSpace: 'pre',
  };
  const stageNumStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    fontSize: '0.8rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--ink-soft, #707078)',
  };

  return (
    <>
      <Nav />
      <div className="blog-post-layout">
        <div>
          <div className="blog-post-chrome blog-post-chrome--top" data-nosnippet>
            <a href="/" className="blog-back">
              &larr; Back home
            </a>
          </div>
          <article className="blog-post">
            <header className="blog-post-header">
              <h1>{PAGE_TITLE}</h1>
              <p className="blog-post-meta">
                <span>Published {PAGE_DATE}</span>
                <span aria-hidden="true">&middot;</span>
                <span>Maintainer: {AUTHOR}</span>
              </p>
              <p className="blog-post-meta">
                <a href="/cli-quickstart">CLI quickstart</a>
                <span aria-hidden="true">&middot;</span>
                <a href={DOCS_URL}>Full docs</a>
                <span aria-hidden="true">&middot;</span>
                <a href="/#how">How it works</a>
              </p>
            </header>

            <div className="prose">
              <section style={sectionStyle}>
                <h2>Why this page exists</h2>
                <p>
                  The runtime surface - goal in, verified pull request out - is
                  covered on the{' '}
                  <a href="/#how">home page</a>. What that summary skips is the
                  loop a human actually drives <em>before</em> any agent spawns:
                  you state intent, you read the decomposed plan, and only then
                  do you let the scheduler execute it. This page walks those five
                  stages, with the real command at each step.
                </p>
                <p>
                  Bernstein keeps all of its state in a per-project{' '}
                  <code style={codeStyle}>.sdd/</code> directory (spec-driven
                  development). That directory is the spine of everything below:
                  the spec, the task backlog, the worktrees, the audit chain, and
                  the cost ledger all live under it.
                </p>
              </section>

              <section style={sectionStyle}>
                <h2>The loop at a glance</h2>
                <p>
                  <code style={codeStyle}>
                    spec &rarr; checklist &rarr; tasks &rarr; implement &rarr; review
                  </code>
                </p>
                <p>
                  The first arrow is one LLM call: decomposing a free-text spec
                  into a task graph. Every arrow after it is deterministic
                  Python, not a prompt. Start from a hand-written plan.yaml
                  instead and the whole chain is reproducible. The two human
                  decision points are the start (writing the spec) and the end
                  (approving the merge).
                </p>
              </section>

              {STAGES.map((stage) => (
                <section style={sectionStyle} key={stage.id} id={stage.id}>
                  <p style={stageNumStyle}>Stage {stage.num}</p>
                  <h2>{stage.title}</h2>
                  <code style={cmdBlockStyle}>{stage.command}</code>
                  <p>{stage.what}</p>
                  <p>{stage.detail}</p>
                </section>
              ))}

              <section style={sectionStyle}>
                <h2>Where the state lives</h2>
                <p>
                  Everything the loop produces is on disk under{' '}
                  <code style={codeStyle}>.sdd/</code>, so a run is inspectable
                  without a database:
                </p>
                <ul>
                  <li>
                    <code style={codeStyle}>.sdd/runtime/</code> - the live task
                    backlog, per-agent tokens, and the write-ahead log.
                  </li>
                  <li>
                    <code style={codeStyle}>.sdd/audit/</code> - an HMAC-chained
                    audit log; every routing and gate decision is appended.
                  </li>
                  <li>
                    <code style={codeStyle}>.sdd/metrics/</code> - the per-model
                    cost ledger surfaced by <code style={codeStyle}>bernstein cost</code>.
                  </li>
                </ul>
                <p>
                  Because the scheduler is code and the state is files, the
                  same <code style={codeStyle}>plan.yaml</code> reproduces the
                  same task graph. A free-text goal does not: decomposing it
                  is the one LLM call in the loop (stage 2), so two runs of
                  the same goal can differ before the deterministic part
                  starts. Pin the plan if you need the whole chain
                  reproducible.
                </p>
              </section>

              <section style={sectionStyle}>
                <h2>Next steps</h2>
                <ul>
                  <li>
                    <a href="/cli-quickstart">CLI quickstart</a> - install and the
                    first commands, step by step.
                  </li>
                  <li>
                    <a href={DOCS_URL}>Full documentation</a> - every command,
                    flag, and configuration surface.
                  </li>
                  <li>
                    <a href={REPO_URL}>Source on GitHub</a> - the deterministic
                    planner and the gate pipeline are open.
                  </li>
                </ul>
              </section>
            </div>
          </article>
          <div className="blog-post-chrome blog-post-chrome--bottom" data-nosnippet>
            <p className="blog-post-meta" style={{ marginTop: 'var(--space-4)' }}>
              Last updated {PAGE_DATE}. Commands verified against the bernstein CLI.
            </p>
          </div>
        </div>
      </div>
      <Footer />
      <BackToTop />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'TechArticle',
            '@id': PAGE_URL,
            headline: PAGE_TITLE,
            description: PAGE_DESC,
            datePublished: PAGE_DATE,
            dateModified: PAGE_DATE,
            inLanguage: 'en',
            url: PAGE_URL,
            articleSection: 'Tutorial',
            proficiencyLevel: 'Intermediate',
            dependencies:
              'Bernstein CLI installed (pipx install bernstein), a git repository, and at least one configured CLI coding agent.',
            audience: {
              '@type': 'Audience',
              audienceType:
                'Engineers running planned multi-agent runs (spec, checklist, tasks, implement, review).',
            },
            author: {
              '@type': 'Person',
              name: AUTHOR,
              url: 'https://alexchernysh.com',
              sameAs: ['https://alexchernysh.com', 'https://github.com/chernistry'],
            },
            publisher: {
              '@type': 'Organization',
              name: SITE_NAME,
              url: SITE_URL,
              logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.svg` },
            },
            mainEntityOfPage: { '@type': 'WebPage', '@id': PAGE_URL },
          }),
        }}
      />
    </>
  );
}
