/**
 * /spec/agent-failure-taxonomy/v0.1 - canonical spec page.
 *
 * The taxonomy was lifted from the open-source bernstein evaluation
 * harness (src/bernstein/eval/taxonomy.py) and rewritten as a public,
 * versioned specification with explicit NIST AI RMF and ISO/IEC 42001
 * cross-references so operators running compliance-sensitive workflows
 * can cite a stable URL.
 *
 * Why a hand-written page rather than MDX-from-content:
 *   - the spec text is canonical and must not silently change; keeping
 *     the prose in TSX means a deliberate code change is required to
 *     amend it.
 *   - the JSON schema sibling at /spec/agent-failure-taxonomy/v0.1.json
 *     is the authoritative machine-readable form; this page is the
 *     human-readable form. They version together.
 */
import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { BackToTop } from '@/components/landing/BackToTop';
import { SITE_URL, AUTHOR, SITE_NAME } from '@/lib/seo';

export const dynamic = 'force-static';

const SPEC_VERSION = '0.1.0';
const SPEC_DATE = '2026-05-19';
const PAGE_TITLE = 'CLI Coding Agent Failure Taxonomy v0.1';
const PAGE_DESC =
  'A closed-set vocabulary for classifying outcomes of CLI coding agent tasks. Eight categories, four severity tiers, NIST AI RMF and ISO/IEC 42001 cross-reference. Designed for evaluation harnesses, audit logs, and regression dashboards.';
const PAGE_URL = `${SITE_URL}/spec/agent-failure-taxonomy/v0.1`;
const SCHEMA_URL = `${SITE_URL}/spec/agent-failure-taxonomy/v0.1.json`;
const CHANGELOG_URL = `${SITE_URL}/spec/agent-failure-taxonomy/CHANGELOG.md`;

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

type Category = {
  id: string;
  name: string;
  summary: string;
  rmf: string[];
  iso42001: string;
  severity: string;
  signal: string;
};

const CATEGORIES: Category[] = [
  {
    id: 'orientation_miss',
    name: 'Orientation miss',
    summary:
      'The agent spent a disproportionate share of its turns on exploration (reading files, asking clarifying questions) without producing output.',
    rmf: ['validity'],
    iso42001: 'A.6.2.4 (performance evaluation of AI components)',
    severity: 'medium',
    signal: 'more than half of turns spent in exploration before any artefact is produced',
  },
  {
    id: 'scope_creep',
    name: 'Scope creep',
    summary:
      'The agent modified files outside the scope it was assigned. The change may be technically correct but violates the operating contract.',
    rmf: ['validity', 'security'],
    iso42001: 'A.7.2 (data and asset boundaries)',
    severity: 'high',
    signal: 'diff touches paths outside the declared owned_files set',
  },
  {
    id: 'test_regression',
    name: 'Test regression',
    summary:
      'The agent broke at least one existing test that was passing before its run. Highest-priority failure category and a hard gate for most deployments.',
    rmf: ['validity', 'robustness'],
    iso42001: 'A.6.2.5 (regression handling)',
    severity: 'critical',
    signal: 'previously-green tests fail after the agent run',
  },
  {
    id: 'incomplete',
    name: 'Incomplete',
    summary:
      'The agent stopped before fulfilling the completion signals declared in the task brief. Distinct from timeout: the agent terminated voluntarily.',
    rmf: ['validity'],
    iso42001: 'A.6.2.6 (output verification)',
    severity: 'medium',
    signal: 'one or more required completion signals are missing at run end',
  },
  {
    id: 'timeout',
    name: 'Timeout',
    summary:
      'The agent hit its wall-clock or max-turns budget. Distinct from incomplete: the agent might have finished given more budget.',
    rmf: ['validity', 'robustness'],
    iso42001: 'A.6.2.7 (resource budgeting)',
    severity: 'high',
    signal: 'wall-clock or turn-count limit reached before completion signals satisfied',
  },
  {
    id: 'conflict',
    name: 'Conflict',
    summary:
      'The agent’s changes collide with a concurrent agent’s changes in a way that requires reconciliation. Specific to multi-agent orchestration.',
    rmf: ['robustness'],
    iso42001: 'A.6.2.8 (concurrency control)',
    severity: 'high',
    signal: 'merge or apply step fails because of an overlapping edit by another agent',
  },
  {
    id: 'context_miss',
    name: 'Context miss',
    summary:
      'The agent had everything it needed to operate (budget, scope) but lacked the contextual knowledge to complete the task. Often signals a documentation gap rather than an agent defect.',
    rmf: ['validity'],
    iso42001: 'A.5.2 (training and contextual data adequacy)',
    severity: 'medium',
    signal: 'agent explicitly reports missing information; or output reflects a misread of the brief',
  },
  {
    id: 'hallucination',
    name: 'Hallucination',
    summary:
      'The agent produced output that references APIs, files, or facts that do not exist in the codebase or its dependencies. Includes uncompilable code and fabricated identifiers.',
    rmf: ['validity', 'security'],
    iso42001: 'A.6.2.9 (factuality and grounding)',
    severity: 'high',
    signal: 'code does not compile, or imports/calls reference non-existent symbols',
  },
];

const PRIORITY_ORDER = [
  'test_regression',
  'timeout',
  'scope_creep',
  'conflict',
  'hallucination',
  'orientation_miss',
  'incomplete',
  'context_miss',
];

export default function SpecPage() {
  const sectionStyle: React.CSSProperties = {
    marginTop: 'var(--space-6, 32px)',
    marginBottom: 'var(--space-6, 32px)',
  };
  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.95rem',
  };
  const cellStyle: React.CSSProperties = {
    border: '1px solid var(--border, #2a2a2a)',
    padding: '0.6rem 0.8rem',
    verticalAlign: 'top',
    textAlign: 'left',
  };
  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    background: 'var(--surface-2, #161616)',
    fontWeight: 600,
  };
  const codeStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: '0.85rem',
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
                <span>Version {SPEC_VERSION}</span>
                <span aria-hidden="true">&middot;</span>
                <span>Published {SPEC_DATE}</span>
                <span aria-hidden="true">&middot;</span>
                <span>Maintainer: {AUTHOR}</span>
              </p>
              <p className="blog-post-meta">
                <a href={SCHEMA_URL}>JSON Schema</a>
                <span aria-hidden="true">&middot;</span>
                <a href={CHANGELOG_URL}>Changelog</a>
                <span aria-hidden="true">&middot;</span>
                <a href="https://github.com/sipyourdrink-ltd/bernstein/blob/main/src/bernstein/eval/taxonomy.py">
                  Reference implementation
                </a>
              </p>
            </header>

            <div className="prose">
              <section style={sectionStyle}>
                <h2>Summary</h2>
                <p>
                  This document defines a closed-set vocabulary for classifying outcomes
                  of CLI coding agent tasks. It is designed for three audiences:
                  evaluation harnesses that need a stable failure schema across runs,
                  operations teams that need an audit log readable by humans and
                  machines, and procurement teams that need a vocabulary they can map
                  to their existing governance framework.
                </p>
                <p>
                  The taxonomy was extracted from a working implementation in the
                  open-source orchestrator <code style={codeStyle}>bernstein</code>{' '}
                  (
                  <a href="https://github.com/sipyourdrink-ltd/bernstein/blob/main/src/bernstein/eval/taxonomy.py">
                    eval/taxonomy.py
                  </a>
                  ) and rewritten as a versioned specification with explicit
                  cross-reference to NIST AI Risk Management Framework (AI RMF 1.0)
                  trust characteristics and ISO/IEC 42001 governance controls.
                </p>
                <p>
                  The spec is intentionally short. The closed set has eight
                  categories. Adding more categories has been considered and
                  rejected because larger sets degrade classifier agreement and
                  produce noisy histograms. If your domain needs finer granularity,
                  the recommendation is to layer a second classifier under one
                  top-level category rather than expanding the top level.
                </p>
              </section>

              <section style={sectionStyle}>
                <h2>Scope and non-goals</h2>
                <h3>In scope</h3>
                <ul>
                  <li>
                    Classifying the outcome of a single agent task whose deliverable
                    is a code change, a patch series, or a structured artefact in a
                    version-controlled repository.
                  </li>
                  <li>
                    Producing a record that aggregates across runs and agents so
                    drift can be detected.
                  </li>
                  <li>
                    Cross-referencing the record against NIST AI RMF trust
                    characteristics and ISO/IEC 42001 control areas.
                  </li>
                </ul>
                <h3>Out of scope</h3>
                <ul>
                  <li>
                    Classifying successful task outcomes. This spec is about
                    failures and degraded outcomes only. A task that succeeded does
                    not produce a record under this schema.
                  </li>
                  <li>
                    Classifying outputs from non-coding agents (research agents,
                    customer-facing assistants). The categories were chosen for the
                    coding-agent setting and would not generalise cleanly.
                  </li>
                  <li>
                    Risk scoring, prioritisation policy, or escalation rules. The
                    spec produces records; what to do with them is a deployment
                    decision.
                  </li>
                </ul>
              </section>

              <section style={sectionStyle}>
                <h2>Categories</h2>
                <p>
                  Each category has: a definition, the NIST AI RMF trust
                  characteristic it maps to, the ISO/IEC 42001 control area it
                  relates to, a default severity tier, and a one-line operational
                  signal a classifier can key on.
                </p>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={headerCellStyle}>ID</th>
                      <th style={headerCellStyle}>Definition</th>
                      <th style={headerCellStyle}>NIST AI RMF</th>
                      <th style={headerCellStyle}>ISO/IEC 42001</th>
                      <th style={headerCellStyle}>Severity</th>
                      <th style={headerCellStyle}>Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATEGORIES.map((c) => (
                      <tr key={c.id}>
                        <td style={cellStyle}>
                          <strong>{c.name}</strong>
                          <br />
                          <code style={codeStyle}>{c.id}</code>
                        </td>
                        <td style={cellStyle}>{c.summary}</td>
                        <td style={cellStyle}>{c.rmf.join(', ')}</td>
                        <td style={cellStyle}>{c.iso42001}</td>
                        <td style={cellStyle}>{c.severity}</td>
                        <td style={cellStyle}>{c.signal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section style={sectionStyle}>
                <h2>Severity tiers</h2>
                <p>
                  Severity is informational. It does not change whether a task is
                  counted as failed. It exists so reviewers triaging a batch of
                  records can route them efficiently.
                </p>
                <ul>
                  <li>
                    <strong>low</strong>: degraded but acceptable. Record for trend
                    analysis; no immediate action expected.
                  </li>
                  <li>
                    <strong>medium</strong>: review during the next batch sweep.
                    Often indicates a documentation or prompt gap.
                  </li>
                  <li>
                    <strong>high</strong>: review the same day. Indicates the agent
                    operated outside its contract or produced an artefact that
                    cannot be merged.
                  </li>
                  <li>
                    <strong>critical</strong>: review immediately. Test regressions
                    and any record that suggests an undisclosed safety implication.
                  </li>
                </ul>
              </section>

              <section style={sectionStyle}>
                <h2>Priority order</h2>
                <p>
                  When more than one category applies to the same task, the
                  classifier assigns the one nearest the top of this list. The
                  ordering reflects gating severity, not statistical frequency.
                </p>
                <ol>
                  {PRIORITY_ORDER.map((id) => (
                    <li key={id}>
                      <code style={codeStyle}>{id}</code>
                    </li>
                  ))}
                </ol>
                <p>
                  Example: an agent that broke a test and also exceeded its scope
                  is recorded as <code style={codeStyle}>test_regression</code>,
                  not <code style={codeStyle}>scope_creep</code>. The scope
                  violation is captured in the <code style={codeStyle}>details</code>{' '}
                  field of the same record.
                </p>
              </section>

              <section style={sectionStyle}>
                <h2>Cross-reference to NIST AI RMF</h2>
                <p>
                  The NIST AI Risk Management Framework defines seven
                  characteristics of trustworthy AI: valid and reliable, safe,
                  secure and resilient, accountable and transparent, explainable
                  and interpretable, privacy-enhanced, and fair with harmful bias
                  managed. This spec maps each category to the subset of those
                  characteristics it most directly affects.
                </p>
                <p>
                  Most categories map to <em>validity</em> because the spec
                  is about whether an agent fulfilled the contract it was given.{' '}
                  <em>Robustness</em> appears for failure modes that are about
                  budget exhaustion or concurrent edits.{' '}
                  <em>Security</em> appears where the agent operated outside its
                  scope or produced content that references non-existent
                  surfaces.
                </p>
                <p>
                  The spec does not currently assign categories to{' '}
                  <em>fairness</em> or <em>privacy</em>. Those characteristics
                  are best handled by separate review processes whose outputs do
                  not aggregate cleanly with operational failure records.
                </p>
              </section>

              <section style={sectionStyle}>
                <h2>Cross-reference to ISO/IEC 42001</h2>
                <p>
                  ISO/IEC 42001 specifies an AI management system. The table in
                  the Categories section names a control area for each category;
                  the names are short paraphrases, not verbatim clause titles,
                  because the underlying standard is not freely redistributable.
                  Operators implementing ISO/IEC 42001 should use this taxonomy
                  as input to controls in clauses 6.2 (operational planning),
                  7.2 (asset management), and 9.1 (performance evaluation).
                </p>
              </section>

              <section style={sectionStyle}>
                <h2>JSON Schema</h2>
                <p>
                  The machine-readable form is at{' '}
                  <a href={SCHEMA_URL}>
                    <code style={codeStyle}>{SCHEMA_URL}</code>
                  </a>
                  . It validates a single failure record with the eight
                  categories as the <code style={codeStyle}>category</code> enum
                  and the four severity tiers as the{' '}
                  <code style={codeStyle}>severity</code> enum. Three worked
                  examples are embedded.
                </p>
                <p>
                  Required fields:{' '}
                  <code style={codeStyle}>task_id</code>,{' '}
                  <code style={codeStyle}>category</code>,{' '}
                  <code style={codeStyle}>severity</code>. Recommended but
                  optional: <code style={codeStyle}>details</code>,{' '}
                  <code style={codeStyle}>files_involved</code>,{' '}
                  <code style={codeStyle}>agent</code>,{' '}
                  <code style={codeStyle}>model</code>,{' '}
                  <code style={codeStyle}>trace_url</code>,{' '}
                  <code style={codeStyle}>timestamp</code>.
                </p>
              </section>

              <section style={sectionStyle}>
                <h2>Versioning and stability</h2>
                <ul>
                  <li>
                    Adding, removing, or renaming a category is a major version
                    bump.
                  </li>
                  <li>
                    Changing severity tiers or priority ordering is a minor
                    version bump.
                  </li>
                  <li>
                    Editing definitions or examples without changing
                    classification behaviour is a patch.
                  </li>
                  <li>
                    Every published version remains reachable at its original
                    URL. There is no breaking change to a URL that has been
                    cited.
                  </li>
                </ul>
                <p>
                  See <a href={CHANGELOG_URL}>CHANGELOG.md</a> for the full
                  history.
                </p>
              </section>

              <section style={sectionStyle}>
                <h2>How to adopt</h2>
                <p>
                  If you run an evaluation harness or agent CI pipeline:
                </p>
                <ol>
                  <li>
                    Wire your classifier output to the schema. The reference
                    implementation in{' '}
                    <code style={codeStyle}>bernstein</code>{' '}
                    accepts the same field set; you do not have to use that
                    code.
                  </li>
                  <li>
                    Emit one record per failed task. Successful tasks do not
                    produce records.
                  </li>
                  <li>
                    Store the records in a way that lets you aggregate by{' '}
                    <code style={codeStyle}>category</code>,{' '}
                    <code style={codeStyle}>agent</code>, and{' '}
                    <code style={codeStyle}>model</code>. Even a flat JSONL
                    file works.
                  </li>
                  <li>
                    Compare distributions across runs. A category that grows
                    over time is a regression signal.
                  </li>
                </ol>
                <p>
                  If you are an auditor or procurement reviewer: cite this URL
                  as the failure taxonomy the operator is using. The URL is
                  stable. The JSON schema is the authoritative form. Any
                  operator using a different taxonomy can be asked to map their
                  categories to this one.
                </p>
              </section>

              <section style={sectionStyle}>
                <h2>License</h2>
                <p>
                  This specification is released under{' '}
                  <a href="https://creativecommons.org/licenses/by/4.0/">
                    CC BY 4.0
                  </a>
                  . You may redistribute, adapt, and build on it for any
                  purpose, including commercial, as long as you attribute the
                  source and indicate changes.
                </p>
              </section>

              <section style={sectionStyle}>
                <h2>Feedback</h2>
                <p>
                  Open an issue on the{' '}
                  <a href="https://github.com/sipyourdrink-ltd/bernstein/issues">
                    bernstein repository
                  </a>{' '}
                  with the prefix <code style={codeStyle}>[spec]</code>. Operator
                  responds within five working days for substantive feedback;
                  smaller wording fixes are merged opportunistically.
                </p>
              </section>
            </div>
          </article>
          <div className="blog-post-chrome blog-post-chrome--bottom" data-nosnippet>
            <p className="blog-post-meta" style={{ marginTop: 'var(--space-4)' }}>
              spec version {SPEC_VERSION}, last updated {SPEC_DATE}.
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
            headline: PAGE_TITLE,
            description: PAGE_DESC,
            datePublished: SPEC_DATE,
            dateModified: SPEC_DATE,
            url: PAGE_URL,
            inLanguage: 'en',
            author: {
              '@type': 'Person',
              name: AUTHOR,
              url: 'https://alexchernysh.com',
              sameAs: [
                'https://alexchernysh.com',
                'https://github.com/chernistry',
              ],
            },
            publisher: {
              '@type': 'Organization',
              name: SITE_NAME,
              url: SITE_URL,
              logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.svg` },
            },
            mainEntityOfPage: { '@type': 'WebPage', '@id': PAGE_URL },
            license: 'https://creativecommons.org/licenses/by/4.0/',
            isPartOf: { '@type': 'CreativeWork', name: 'Bernstein Specifications' },
            version: SPEC_VERSION,
          }),
        }}
      />
    </>
  );
}
