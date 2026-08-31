'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ScrollReveal } from '@/components/ScrollReveal';
import { track, UmamiEvent } from '@/lib/analytics/events';
import { useInViewOnce } from '@/lib/analytics/useInView';

export function EmailCapture() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const sectionRef = useInViewOnce<HTMLDivElement>(UmamiEvent.NewsletterView, 0.4);
  /* First-focus flag: gates ``newsletter-focus`` so the event fires
     exactly once per mount even if the user tabs in and out. Ref (not
     state) so we don't trigger a re-render on flip. */
  const focusFiredRef = useRef(false);

  const onFirstFocus = () => {
    if (focusFiredRef.current) return;
    focusFiredRef.current = true;
    track(UmamiEvent.NewsletterFocus, { source: 'email-capture' });
  };

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = new FormData(form).get('email_address') as string;
    setStatus('submitting');
    /* newsletter-submit fires on EVERY attempt - the legacy
       email-capture-submit (success-only goal) is preserved below. */
    track(UmamiEvent.NewsletterSubmit, { source: 'email-capture' });
    try {
      const resp = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Parse body so we can distinguish real subscribe from dev-noop. The
      // route now returns ok:false for dev-noop and 503 in prod when the
      // audience env var is unset, but we double-check status here so any
      // future fallback can't quietly count as a conversion.
      let body: { ok?: unknown; status?: unknown } = {};
      try {
        body = (await resp.json()) as typeof body;
      } catch {
        // Fall through with empty body; response.ok still gates UI below.
      }
      const confirmed =
        resp.ok &&
        body.ok === true &&
        (body.status === 'subscribed' || body.status === 'already_subscribed');
      if (confirmed) {
        setStatus('success');
        // Umami goal fires ONLY on confirmed Resend subscription. Dev-noop
        // and 503 audience-not-configured never increment the goal.
        if (typeof window !== 'undefined' && (window as unknown as { umami?: { track: (n: string) => void } }).umami) {
          (window as unknown as { umami: { track: (n: string) => void } }).umami.track('email-capture-submit');
        }
        track(UmamiEvent.NewsletterSuccess, { source: 'email-capture' });
        /* Also emit the shared ``signup`` event alongside the
           form-specific one. The ``source`` prop names the form that
           produced it; today the monthly newsletter is the only one. */
        track(UmamiEvent.Signup, { source: 'email-capture', surface: 'newsletter' });
      } else {
        setStatus('error');
        track(UmamiEvent.NewsletterError, {
          source: 'email-capture',
          code: resp.status,
        });
      }
    } catch {
      setStatus('error');
      track(UmamiEvent.NewsletterError, {
        source: 'email-capture',
        code: 'network',
      });
    }
  }

  return (
    <ScrollReveal>
      <div ref={sectionRef} className={`email-section${status === 'success' ? ' success' : ''}`}>
        <div className="email-inner">
          <p className="email-kicker">Monthly newsletter</p>
          <h2>
            One engineering <em className="italic-accent">post a month</em>.
          </h2>
          <p>Deep dives on what broke this month. No product announcements, no roundups, no calls to action. Unsubscribe link on every email.</p>
          <form className="email-form" onSubmit={handleSubmit}>
            <input
              type="email"
              name="email_address"
              placeholder="you@company.com"
              required
              aria-label="Email address"
              onFocus={onFirstFocus}
            />
            <button
              type="submit"
              disabled={status === 'submitting' || status === 'success'}
              className={status === 'success' ? 'email-btn-success' : undefined}
            >
              {status === 'submitting' ? (
                <span className="email-spinner" aria-label="Submitting">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="spin">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3"/>
                    <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </span>
              ) : status === 'success' ? 'You\u2019re in \u2713' : 'Subscribe'}
            </button>
          </form>
          <p className={`email-note${status === 'success' ? ' email-note-success' : ''}`}>
            {status === 'success'
              ? 'Check your inbox to confirm.'
              : status === 'error'
                ? 'Something went wrong. Try again.'
                : 'No spam. Unsubscribe anytime.'}
          </p>
        </div>
      </div>
    </ScrollReveal>
  );
}
