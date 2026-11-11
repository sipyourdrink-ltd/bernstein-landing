'use client';

/**
 * EmailStrip - bottom-of-page signup. "one engineering post a month."
 *
 * Posts to /api/notify, the same endpoint EmailCapture uses. The form is
 * a small, focused surface: inline label + input + button + a one-line
 * meta below. Voice rules apply - lowercase, concrete, no marketing.
 *
 * Single-purpose strip, not a popup. Both successes and errors render
 * inline (no toast, no overlay) so the visitor never loses scroll
 * position.
 */

import { useState } from 'react';

type Status = 'idle' | 'submitting' | 'ok' | 'error';

export function EmailStrip() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setErrMsg(null);
    try {
      /* /api/notify is the live capture endpoint - the same one
         EmailCapture uses. Body shape: { email }. The route returns
         { ok: true, status: 'subscribed' | 'already_subscribed' } on real
         success and { ok: false } on dev-noop / 503 audience-unset, so
         we mirror EmailCapture's strict success check and never count a
         dev-noop as a completed signup. */
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      let body: { ok?: unknown; status?: unknown; error?: string } = {};
      try {
        body = (await res.json()) as typeof body;
      } catch {
        /* fall through; status code still gates UI */
      }
      const confirmed =
        res.ok &&
        body.ok === true &&
        (body.status === 'subscribed' || body.status === 'already_subscribed');
      if (confirmed) {
        setStatus('ok');
        setEmail('');
      } else {
        setErrMsg(typeof body.error === 'string' ? body.error : 'subscribe failed. try again.');
        setStatus('error');
      }
    } catch {
      setErrMsg('network error. try again.');
      setStatus('error');
    }
  };

  return (
    <section
      id="subscribe"
      className="v2-email"
      aria-labelledby="email-strip-heading"
    >
      <div className="v2-email-inner">
        <div>
          <h3 id="email-strip-heading">
            one engineering post <em>a month</em>.
          </h3>
          <p>
            what we shipped, what broke, what we learned. one click
            to unsubscribe.
          </p>
        </div>
        <form
          className="v2-email-form"
          onSubmit={onSubmit}
          aria-describedby={status === 'error' ? 'email-strip-error' : undefined}
        >
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="email address"
            aria-invalid={status === 'error' ? true : undefined}
            disabled={status === 'submitting' || status === 'ok'}
          />
          <button
            type="submit"
            disabled={status === 'submitting' || status === 'ok'}
            className={status === 'ok' ? 'v2-btn-success' : undefined}
          >
            {status === 'submitting' ? '…' : status === 'ok' ? 'thanks' : 'subscribe'}
          </button>
        </form>
      </div>
      {status === 'error' && errMsg && (
        <p
          id="email-strip-error"
          role="alert"
          style={{
            maxWidth: '1100px',
            margin: '12px auto 0',
            padding: '0 64px',
            fontSize: 'var(--text-sm)',
            color: 'var(--warn)',
          }}
        >
          {errMsg}
        </p>
      )}
    </section>
  );
}
