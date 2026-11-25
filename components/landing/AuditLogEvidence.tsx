/**
 * AuditLogEvidence - page centerpiece. Real artifact, not a screenshot.
 *
 * Both variants of the redesign pin the audit log because it is bernstein-
 * specific in a way no diagram can be - a hash chain printout cannot be
 * confused with another product. (See variant-2 README §6 + annotations
 * § "audit-log evidence block".)
 *
 * Layout: text left (kicker + h2 + lede + secondary lede), terminal right.
 * The terminal mock uses the v2-term colour palette which mirrors the
 * design source's mono colour cuts (ok / warn / bad / acc / mute / hash).
 *
 * No motion. Animating an audit log turns evidence into decoration;
 * the block stays a static artifact.
 *
 * The `id="audit"` is here so the Nav can scroll-spy this section, and so
 * docs-bot citations (which sometimes link to /#audit) land deep-anchor
 * correctly.
 *
 * Two separate guarantees live here, and both are gated - the copy says so
 * rather than implying either is automatic:
 *   1. the HMAC-chained audit log, written when the run enables audit;
 *   2. the Ed25519-signed run receipt, written only when a signing key is
 *      configured (documented no-op otherwise).
 * Sources: bernstein README § "prove a run" and
 * docs/operations/deterministic-replay.md § "signed run receipt". The
 * receipt's verify surface is `bernstein verify receipt <path>
 * [--public-key PEM]` (src/bernstein/cli/commands/verify_cmd.py).
 *
 * The terminal below is deliberately NOT extended with receipt output: its
 * chrome title and aria-label both name `bernstein audit verify`, and the
 * receipt verdict is emitted by a different command. Adding those lines
 * under this title would attribute output to a command that never prints it.
 */

const AUDIT_EVENTS = [
  {
    time: '17:42:01',
    event: 'manager.plan',
    statusClass: 'c-ok',
    hash: 'cb84a1…',
    detail: '13 tasks · est $4.20',
  },
  {
    time: '17:42:18',
    event: 'scheduler.spawn',
    statusClass: 'c-ok',
    hash: '3e09f7…',
    detail: 't-001 → backend (sonnet)',
  },
  {
    time: '17:42:18',
    event: 'scheduler.spawn',
    statusClass: 'c-ok',
    hash: '81c2dd…',
    detail: 't-002 → backend (sonnet)',
  },
  {
    time: '17:42:19',
    event: 'scheduler.spawn',
    statusClass: 'c-ok',
    hash: 'b50af8…',
    detail: 't-003 → qa      (opus)',
  },
  {
    time: '17:55:11',
    event: 'janitor.verify',
    statusClass: 'c-ok',
    hash: 'd014a3…',
    detail: 't-005 docs · pytest 84/84 · ruff 0',
  },
  {
    time: '17:55:14',
    event: 'manager.merge',
    statusClass: 'c-ok',
    hash: 'ee7c12…',
    detail: 't-005 → main · 4 files · clean',
  },
  {
    time: '18:02:14',
    event: 'janitor.fail',
    statusClass: 'c-bad',
    hash: '9aa10b…',
    detail: 't-003 qa · pytest collect err · 3/3 retries',
  },
  {
    time: '18:02:30',
    event: 'scheduler.route',
    statusClass: 'c-warn',
    hash: '71b4cc…',
    detail: 't-003 opus → sonnet · awaiting op',
  },
  {
    time: '18:09:14',
    event: 'scheduler.pause',
    statusClass: 'c-warn',
    hash: '4d2e09…',
    detail: 'conflict · t-001 ↔ t-007 · src/auth/refresh.py',
  },
] as const;

export function AuditLogEvidence() {
  return (
    <section
      className="v2-section v2-evidence"
      id="audit"
      aria-labelledby="audit-evidence-heading"
    >
      <div>
        <p className="v2-kicker">evidence, not vibes</p>
        <h2 id="audit-evidence-heading">
          every step <em>signed</em>, in order, on disk.
        </h2>
        <p>
          run <span className="v2-mono-inline">bernstein run --audit --goal &quot;your task&quot;</span> and
          bernstein writes an hmac-chained event log under{' '}
          <span className="v2-mono-inline">.sdd/audit/</span>, one jsonl
          file per utc day. each entry references the previous hash.
          tampering breaks verification. nothing leaves your machine.
        </p>
        <p>
          someone who did not run it can check it. signature and
          hash-chain checks read the files alone; the hmac leg needs the
          key the chain was written with, so hand a reviewer both and{' '}
          <span className="v2-mono-inline">bernstein audit verify</span>{' '}
          answers without rerunning anything. not a screenshot, not a
          SOC2 PDF - a hash chain that recomputes.
        </p>
        <p>
          configure a signing key and a run also writes an
          ed25519-signed receipt binding the journal and lineage
          heads.{' '}
          <span className="v2-mono-inline">bernstein verify receipt</span>{' '}
          reads that file alone - no hmac key, no{' '}
          <span className="v2-mono-inline">.sdd/</span>. pin the public
          key for provenance. no key, no receipt.
        </p>
      </div>
      <div className="v2-term" role="img" aria-label="bernstein audit verify terminal output">
        <div className="v2-term-chrome">
          <span className="v2-title">~/proj $ bernstein audit verify</span>
        </div>
        {/* The terminal block below is decorative content; it carries no
            semantic information that isn't already in the heading + lede.
            Sighted users see a real audit-log printout; screen readers
            get the role="img" + aria-label above. */}
        <div className="v2-term-body" aria-hidden="true">
          <div className="v2-term-comment c-mute">
            # reading .sdd/audit/2026-07-24.jsonl · 412 entries · 18m04s span
          </div>
          <div className="v2-term-rows">
            {AUDIT_EVENTS.map((row, idx) => (
              <div className="v2-term-row" key={`${row.time}-${row.hash}-${idx}`}>
                <span className="c-acc">{row.time}</span>
                <span className={row.statusClass}>{row.event}</span>
                <span className="c-hash">{row.hash}</span>
                <span className="v2-term-detail">{row.detail}</span>
              </div>
            ))}
          </div>
          <div className="v2-term-footer">
            <div className="v2-term-meta">
              <span className="c-mute">verify chain</span>
              <span className="v2-term-meta-val">
                <span className="c-ok">ok ✓</span>{'  '}
                <span className="c-mute">412/412 entries · last hash 4d2e09cb…</span>
              </span>
            </div>
            <div className="v2-term-meta">
              <span className="c-mute">hmac key</span>
              <span className="v2-term-meta-val c-acc">~/.local/state/bernstein/audit.key</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
