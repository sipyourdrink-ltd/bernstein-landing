/**
 * /cli-quickstart - non-redirect tutorial page for the Bernstein CLI.
 *
 * Why a standalone page (when /docs/cli already exists):
 *   - /docs/cli is a server-side redirect to readthedocs (see
 *     app/docs/cli/page.tsx). Crawlers that follow the redirect land
 *     on a different host, so the TechArticle JSON-LD for the CLI
 *     walkthrough never gets attached to a page on bernstein.run.
 *   - AIO / SGE crawlers extract structured data plus the visible
 *     DOM from the same response. A non-redirect page solves that.
 *   - Verified commands only. Every numbered step in the body
 *     corresponds to a real `click.command` registered on the CLI
 *     group in bernstein.cli.main. No invented flags, no aspirational
 *     features. Source of truth: src/bernstein/cli/run_bootstrap.py
 *     (run + init) and src/bernstein/cli/main.py (add_command calls).
 *
 * Voice rules (operator-enforced):
 *   - sentence-case body copy, lowercase headings and page title
 *   - direct technical language
 *   - no marketing adjectives ("powerful", "revolutionary", etc.)
 *   - no em-dashes; use " - " or rewrite
 *   - no Claude attribution anywhere
 */

import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { BackToTop } from '@/components/landing/BackToTop';
import { SITE_URL, AUTHOR, SITE_NAME } from '@/lib/seo';

const PAGE_TITLE = 'cli quickstart';
const PAGE_DESC =
  'Five-minute walkthrough of the Bernstein CLI: install, init, configure agents in bernstein.yaml, run a goal, and inspect the run status.';
const PAGE_URL = `${SITE_URL}/cli-quickstart`;

/* The walkthrough is hand-written prose plus six numbered headings.
 * Nothing on the page depends on per-request data, so we bake one HTML
 * page at build time. */
export const dynamic = 'force-static';

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
    images: [
      { url: `/api/og?title=${encodeURIComponent(PAGE_TITLE)}`, width: 1200, height: 630 },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    images: [`/api/og?title=${encodeURIComponent(PAGE_TITLE)}`],
  },
};

/* TechArticle JSON-LD. Replaces the previous HowTo block; Google
 * removed HowTo rich results in Sep 2023, so the type is deprecated.
 * TechArticle is the supported schema for technical walkthroughs and
 * keeps the same semantic content. The numbered walkthrough body
 * remains visible in the DOM; AIO crawlers extract steps from the
 * structured headings and prose. */
const TECH_ARTICLE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  '@id': PAGE_URL,
  headline: 'Get started with the Bernstein CLI',
  description:
    'Install Bernstein, initialise a project, configure CLI coding agents, run your first goal, and inspect the run status from the terminal.',
  inLanguage: 'en',
  url: PAGE_URL,
  mainEntityOfPage: { '@type': 'WebPage', '@id': PAGE_URL },
  articleSection: 'Tutorial',
  proficiencyLevel: 'Beginner',
  dependencies:
    'Python 3.12+, a git repository, a terminal (bash / zsh / PowerShell), pipx or uv or pip, at least one CLI coding agent (claude, codex, gemini, etc.)',
  audience: {
    '@type': 'Audience',
    audienceType: 'Software developers integrating CLI coding agents',
  },
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.svg` },
  },
  author: {
    '@type': 'Person',
    name: AUTHOR,
    url: 'https://alexchernysh.com',
  },
};

/* FAQPage JSON-LD removed 2026-05-21. Google restricted FAQPage rich
 * results to government and healthcare authorities in Aug 2023, so the
 * markup was inert on a commercial walkthrough page. The visible FAQ
 * <details> section below still renders the operator-curated Q&A copy;
 * only the structured-data emission was dropped. If a future schema
 * type (Article with inline Question/Answer, or QAPage on a dedicated
 * route) becomes viable for this content, the previous builder is in
 * git history. */

/* Inline anchor heading helper. The DOM ids keep deep-link parity
 * with crawlers and the in-page TOC; before the TechArticle swap they
 * were also referenced from HowToStep.url fields. */
function StepHeading({ id, n, label }: { id: string; n: number; label: string }) {
  return (
    <h2 id={id} className="cliqs-step-heading">
      <span className="cliqs-step-num">{n}.</span> {label}
    </h2>
  );
}

export default function CliQuickstartPage() {
  return (
    <>
      <Nav />
      <main id="main" className="cost-page">
        <article className="cost-page-inner">
          <header className="cost-page-header">
            <p className="blog-back-link">
              <a href="/" className="blog-back">
                &larr; back home
              </a>
            </p>
            <h1>cli quickstart</h1>
            <p className="cost-page-lede">
              Five minutes from a clean checkout to a green run.
              Every command on this page maps to a real click subcommand
              registered in <code>bernstein.cli.main</code>. If a flag
              shows up here, it ships in the wheel on PyPI.
            </p>
          </header>

          <section className="cliqs-body">
            <StepHeading id="step-1-install" n={1} label="install Bernstein" />
            <p>
              The fastest install is <code>pipx</code>. It pins Bernstein in
              its own venv and exposes the <code>bernstein</code> and{' '}
              <code>bernstein-worker</code> entry points on{' '}
              <code>$PATH</code>. <code>uv tool install</code> and a plain{' '}
              <code>pip install</code> also work.
            </p>
            <pre className="cliqs-code">
              {/* DRIFT-SYNC:start key=cli-quickstart-install */}
              <code>{`pipx install bernstein
bernstein init
bernstein run -g "fix the failing test in tests/test_foo.py"`}</code>
{/* DRIFT-SYNC:end */}
            </pre>
            <p>
              Bernstein requires Python 3.12 or newer. The wheel is published
              to PyPI under <code>bernstein</code>, Apache 2.0. If you need an
              offline install, the air-gap wheelhouse path is documented in
              the canonical reference linked at the bottom of this page.
            </p>

            <StepHeading id="step-2-init" n={2} label="initialise the workspace" />
            <p>
              Change into the repository you want Bernstein to work on and
              run <code>bernstein init</code>. The command is idempotent and
              safe to run a second time:
            </p>
            <pre className="cliqs-code">
              <code>{`cd /path/to/your/project
bernstein init`}</code>
            </pre>
            <p>
              On a fresh checkout, <code>init</code> creates four things:
            </p>
            <ul className="cliqs-list">
              <li>
                <code>.sdd/</code>: runtime directory for state, backlog,
                metrics, traces. <code>.sdd/runtime/</code> is added to{' '}
                <code>.gitignore</code> automatically.
              </li>
              <li>
                <code>bernstein.yaml</code>: project config. The starter file
                ships with one agent and a placeholder goal.
              </li>
              <li>
                <code>templates/</code>: copied from the wheel. Contains the
                role prompts (manager, backend, qa, security, devops, and a
                dozen more). Edit them per project if you want a different
                voice.
              </li>
              <li>
                <code>.sdd/config.yaml</code>: server port, worker cap,
                default model, default effort.
              </li>
            </ul>

            <StepHeading id="step-3-configure" n={3} label="configure agents in bernstein.yaml" />
            <p>
              Open <code>bernstein.yaml</code> and edit the <code>agents</code>{' '}
              block. Each entry binds a <code>name</code> (free-form), an{' '}
              <code>adapter</code> (one of the 40+ CLI adapters listed in the
              project README), a <code>role</code>, and a <code>model</code>.
              A minimal three-agent config looks like this:
            </p>
            <pre className="cliqs-code">
              <code>{`# bernstein.yaml
goal: "Add JWT auth to the /login endpoint"

agents:
  - name: backend-claude
    adapter: claude
    role: backend
    model: sonnet
  - name: tests-codex
    adapter: codex
    role: qa
    model: gpt-5.4-mini
  - name: review-gemini
    adapter: gemini
    role: reviewer
    model: gemini-2.5-pro

budget:
  max_cost_usd: 5.00`}</code>
            </pre>
            <p>
              Adapter names map one-to-one to files in{' '}
              <code>src/bernstein/adapters/</code>. If the CLI binary for an
              adapter is not installed on the host, the scheduler skips that
              agent and logs a warning. The <code>budget</code> block is
              optional but recommended on first run.
            </p>

            <StepHeading id="step-4-run" n={4} label="run a goal" />
            <p>
              With <code>bernstein.yaml</code> saved, kick the crew off:
            </p>
            <pre className="cliqs-code">
              <code>{`bernstein run -g "Add JWT auth to the /login endpoint"`}</code>
            </pre>
            <p>
              Useful flags on the <code>run</code> command:
            </p>
            <ul className="cliqs-list">
              <li>
                <code>--dry-run</code>: print the scheduling plan (which
                agent and model gets which task) without spawning anything.
                Zero token spend.
              </li>
              <li>
                <code>--plan-only</code>: emit the decomposed task plan as
                markdown and exit. Use this when you want a human review
                before any agent runs.
              </li>
              <li>
                <code>--auto-approve</code>: skip the interactive merge
                prompt at the end of the run. Pair with{' '}
                <code>--max-cost-usd</code> for unattended runs.
              </li>
              <li>
                <code>--profile airgap</code>: deny outbound network by
                default. Combine with <code>--allow-network</code> to
                allow-list specific hosts.
              </li>
              <li>
                <code>--audit</code>: enable the HMAC-chained audit log for
                every task lifecycle event, with a Merkle seal on shutdown.
              </li>
            </ul>
            <p>
              The orchestrator decomposes the goal into tasks, spawns one
              agent per task inside a fresh git worktree under{' '}
              <code>.sdd/worktrees/</code>, runs lint, types, tests, and the
              cross-model review gate against each branch, and merges only
              the work that passes every gate.
            </p>

            <StepHeading id="step-5-status" n={5} label="inspect status and results" />
            <p>
              While a run is in flight, open a second terminal and check
              progress:
            </p>
            <pre className="cliqs-code">
              <code>{`bernstein status        # one-shot text summary
bernstein dashboard     # live TUI: agents, tasks, costs, traces
bernstein stop          # graceful shutdown of the running orchestra`}</code>
            </pre>
            <p>
              After the run, the artefacts live in three places. The
              HMAC-signed audit log is under{' '}
              <code>.sdd/audit/</code>, rotated daily - one JSONL file per
              UTC day; you can verify the chain with{' '}
              <code>bernstein lineage verify &lt;run_id&gt;</code>.
              Per-task traces (JSONL) are under <code>.sdd/traces/</code>.
              The merged code is in your working tree, ready for{' '}
              <code>git diff</code>.
            </p>
            <p>
              For the full reference, including every adapter, every
              quality gate, and the YAML workflow schema, see the{' '}
              <a href="/why-bernstein">why Bernstein</a> decision FAQ, the{' '}
              <a href="/cost">cost calculator</a>, and the{' '}
              <a href="/llms-full.txt">llms-full.txt</a> dump (consumed by
              other LLMs the same way as this page).
            </p>

            <h2 id="faq" className="cliqs-step-heading">faq</h2>
            <p>
              Five common operator questions about the install path,
              picked from real GitHub issues and discussion threads.
            </p>
            <details className="cliqs-faq">
              <summary>What does bernstein init create in 2026?</summary>
              <p>
                bernstein init creates four artefacts in the current
                directory. <code>.sdd/</code> is the runtime directory
                where backlog, traces, metrics, and audit logs live;{' '}
                <code>.sdd/runtime/</code> is auto-appended to{' '}
                <code>.gitignore</code> so process state never leaks
                into commits. <code>bernstein.yaml</code> is the project
                config; the starter file ships with one agent and a
                placeholder goal. <code>templates/</code> holds the role
                prompt overrides (manager, backend, qa, security,
                devops) copied from the wheel; edit them per project if
                you want a different voice. <code>.sdd/config.yaml</code>{' '}
                holds the server port, worker cap, default model, and
                default effort. The init command is idempotent: running
                it on an initialised project preserves existing files
                and refreshes only the templates.
              </p>
            </details>
            <details className="cliqs-faq">
              <summary>Which CLI agents are auto-discovered?</summary>
              <p>
                Bernstein discovers every CLI agent whose binary is on{' '}
                <code>$PATH</code> at run time. The current adapter set
                covers Claude Code, Codex, Gemini CLI, Aider, Cursor,
                Copilot, Goose, OpenHands, OpenCode, Plandex, Charm
                Crush, Continue, Cline, Kilo, Forge, Hermes, Junie,
                Letta Code, Pi, Q Developer, Qwen, Ralphex, Rovo,
                Mistral Vibe, Auggie, AIChat, Amp, Autohand, Codebuff,
                Cody, Composio Orchestrator, Devin Terminal, Droid,
                gptme, Kimi, Kiro, OpenAI Agents SDK, Ollama (any
                OpenAI-compatible local LLM), and a generic adapter for
                arbitrary CLI tools. If you list an adapter whose binary
                is missing, the scheduler skips that agent and logs a
                warning rather than failing the run.
              </p>
            </details>
            <details className="cliqs-faq">
              <summary>Can I do a dry-run before spending tokens?</summary>
              <p>
                Yes. <code>bernstein run --dry-run</code> prints the
                scheduling plan (which agent and which model would be
                assigned to which task) and exits with zero token spend.{' '}
                <code>bernstein run --plan-only</code> emits the
                decomposed task plan as markdown and exits before any
                agent spawns. Use either flag as the first pass when you
                are checking that the goal decomposition matches what
                you want. The dry-run flag also surfaces
                missing-binary warnings up-front so you find them before
                the first paid token leaves your terminal.
              </p>
            </details>
            <details className="cliqs-faq">
              <summary>How do I run an air-gapped install in 2026?</summary>
              <p>
                Pair <code>bernstein run --profile airgap</code> with
                the wheelhouse-bundle install path. The airgap profile
                denies outbound network by default; combine with{' '}
                <code>--allow-network &lt;host&gt;</code> to allow-list
                specific hosts (your local model server, for example).
                For the install side, bernstein ships a wheelhouse build
                helper that bundles every dependency as a verifiable
                archive so you can transport bernstein and its tree onto
                a disconnected machine. The runtime configuration lives
                in <code>.sdd/config.yaml</code> under the{' '}
                <code>offline.allow_hosts</code> field.
              </p>
            </details>
            <details className="cliqs-faq">
              <summary>Where does the audit log live and how do I verify it?</summary>
              <p>
                The HMAC-chained audit log lives under{' '}
                <code>.sdd/audit/</code>, rotated daily - one JSONL file
                per UTC day, for example{' '}
                <code>.sdd/audit/2026-05-07.jsonl</code>. Each line is one
                JSON record carrying the previous line&apos;s HMAC as a
                chain link, so modifying any earlier line breaks the
                chain at the next verification. Run{' '}
                <code>bernstein lineage verify &lt;run_id&gt;</code> to
                walk the chain end-to-end; the command exits zero on a
                clean chain and prints the first divergent line on
                tamper. Per-task transcripts under{' '}
                <code>.sdd/traces/</code> are referenced from the audit
                log by run_id so a reviewer can cross-check what a
                specific agent saw and produced against the chain entry
                that records the gate outcome.
              </p>
            </details>
          </section>
        </article>
      </main>
      <Footer />
      <BackToTop />
      <script
        id="techarticle-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(TECH_ARTICLE_JSON_LD) }}
      />
    </>
  );
}
