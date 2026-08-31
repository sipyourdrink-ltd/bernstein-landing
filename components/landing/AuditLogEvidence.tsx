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
 *
 * Inview tracker: emits `audit-log-evidence-inview` on first scroll-into-
 * view. Added per research-003 (audit 2026-05-09) - the centerpiece
 * artifact had no telemetry. Highest-priority dark-zone fix per the
 * audit's "buried gold" classification.
 */

import { InViewTracker } from '@/components/InViewTracker';
import { UmamiEvent } from '@/lib/analytics/events';

export function AuditLogEvidence() {
  return (
    <section
      className="v2-section v2-evidence"
      id="audit"
      aria-labelledby="audit-evidence-heading"
    >
      <InViewTracker eventName={UmamiEvent.AuditLogEvidenceInView} />
      <div>
        <p className="v2-kicker">evidence, not vibes</p>
        <h2 id="audit-evidence-heading">
          every step <em>signed</em>, in order, on disk.
        </h2>
        <p>
          run with <span className="v2-mono-inline">--audit</span> and
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
          <div className="v2-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <span className="v2-title">~/proj $ bernstein audit verify</span>
        </div>
        {/* The terminal block below is decorative content; it carries no
            semantic information that isn't already in the heading + lede.
            Sighted users see a real audit-log printout; screen readers
            get the role="img" + aria-label above. */}
        <pre aria-hidden="true">
          <span className="c-mute"># reading .sdd/audit/2026-07-24.jsonl · 412 entries · 18m04s span</span>
          {'\n\n'}
          <span className="c-acc">17:42:01</span>{'  '}<span className="c-ok">manager.plan</span>     <span className="c-hash">cb84a1…</span>  13 tasks · est $4.20{'\n'}
          <span className="c-acc">17:42:18</span>{'  '}<span className="c-ok">scheduler.spawn</span>  <span className="c-hash">3e09f7…</span>  t-001 → backend (sonnet){'\n'}
          <span className="c-acc">17:42:18</span>{'  '}<span className="c-ok">scheduler.spawn</span>  <span className="c-hash">81c2dd…</span>  t-002 → backend (sonnet){'\n'}
          <span className="c-acc">17:42:19</span>{'  '}<span className="c-ok">scheduler.spawn</span>  <span className="c-hash">b50af8…</span>  t-003 → qa      (opus){'\n'}
          <span className="c-acc">17:55:11</span>{'  '}<span className="c-ok">janitor.verify</span>   <span className="c-hash">d014a3…</span>  t-005 docs · pytest 84/84 · ruff 0{'\n'}
          <span className="c-acc">17:55:14</span>{'  '}<span className="c-ok">manager.merge</span>    <span className="c-hash">ee7c12…</span>  t-005 → main · 4 files · clean{'\n'}
          <span className="c-acc">18:02:14</span>{'  '}<span className="c-bad">janitor.fail</span>     <span className="c-hash">9aa10b…</span>  t-003 qa · pytest collect err · 3/3 retries{'\n'}
          <span className="c-acc">18:02:30</span>{'  '}<span className="c-warn">scheduler.route</span>  <span className="c-hash">71b4cc…</span>  t-003 opus → sonnet · awaiting op{'\n'}
          <span className="c-acc">18:09:14</span>{'  '}<span className="c-warn">scheduler.pause</span>  <span className="c-hash">4d2e09…</span>  conflict · t-001 ↔ t-007 · src/auth/refresh.py{'\n\n'}
          <span className="c-mute">verify chain      </span><span className="c-ok">ok ✓</span>  <span className="c-mute">412/412 entries · last hash 4d2e09cb…</span>{'\n'}
          <span className="c-mute">hmac key          </span><span className="c-acc">~/.local/state/bernstein/audit.key</span>
        </pre>
      </div>
    </section>
  );
}
