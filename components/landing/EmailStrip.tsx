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
 *
 * Umami events emitted:
 *   - newsletter-view       (form scrolled into view, once per session)
 *   - newsletter-focus      (input first-focus, once per mount)
 *   - email-capture-submit  (older name - fires only on confirmed sub)
 *   - newsletter-submit     (attempt counter - every submit)
 *   - newsletter-success    (success - confirmed sub)
 *   - email-capture-error   (older error name)
 *   - newsletter-error      (error counter)
 *
 * The ``newsletter-*`` trio exists so attempts and results are counted
 * separately; before it, only confirmed successes were recorded.
 * ``newsletter-focus`` separates "saw and ignored" from "tried and
 * bailed"; a ref-flag gates it to first-focus per mount so tab-in and
 * tab-out cannot inflate it.
 */

import { useRef, useState } from 'react';
import { track as trackEvent, UmamiEvent } from '@/lib/analytics/events';
import { useInViewOnce } from '@/lib/analytics/useInView';

type Status = 'idle' | 'submitting' | 'ok' | 'error';

function track(name: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    umami?: { track: (n: string, d?: Record<string, unknown>) => void };
  };
  w.umami?.track(name, data);
}

export function EmailStrip() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const sectionRef = useInViewOnce<HTMLElement>(UmamiEvent.NewsletterView, 0.4);
  /* First-focus flag: gates ``newsletter-focus`` so the event fires
     exactly once per mount even if the user tabs in and out. Ref (not
     state) so we don't trigger a re-render on flip. */
  const focusFiredRef = useRef(false);

  const onFirstFocus = () => {
    if (focusFiredRef.current) return;
    focusFiredRef.current = true;
    trackEvent(UmamiEvent.NewsletterFocus, { source: 'email-strip' });
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setErrMsg(null);
    /* newsletter-submit fires on EVERY attempt so (success + error) /
       submit reads as the API health rate. email-capture-submit keeps
       its older success-only semantic so past reports stay comparable. */
    trackEvent(UmamiEvent.NewsletterSubmit, { source: 'email-strip' });

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
        /* Mirror EmailCapture: fire ONLY on confirmed subscription. */
        track('email-capture-submit', { source: 'email-strip' });
        trackEvent(UmamiEvent.NewsletterSuccess, { source: 'email-strip' });
      } else {
        setErrMsg(typeof body.error === 'string' ? body.error : 'subscribe failed. try again.');
        setStatus('error');
        track('email-capture-error', { code: res.status });
        trackEvent(UmamiEvent.NewsletterError, {
          source: 'email-strip',
          code: res.status,
        });
      }
    } catch {
      setErrMsg('network error. try again.');
      setStatus('error');
      track('email-capture-error', { code: 'network' });
      trackEvent(UmamiEvent.NewsletterError, {
        source: 'email-strip',
        code: 'network',
      });
    }
  };

  return (
    <section
      ref={sectionRef}
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
            onFocus={onFirstFocus}
            aria-label="email address"
            disabled={status === 'submitting' || status === 'ok'}
          />
          <button type="submit" disabled={status === 'submitting' || status === 'ok'}>
            {status === 'submitting' ? '…' : status === 'ok' ? 'thanks ✓' : 'subscribe'}
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
            fontSize: '13px',
            color: 'oklch(50% 0.12 25)',
          }}
        >
          {errMsg}
        </p>
      )}
    </section>
  );
}
