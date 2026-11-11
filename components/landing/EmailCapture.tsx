'use client';

import { useState, type FormEvent } from 'react';
import { ScrollReveal } from '@/components/ScrollReveal';

export function EmailCapture() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = new FormData(form).get('email_address') as string;
    setStatus('submitting');
    try {
      const resp = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Parse body so we can distinguish real subscribe from dev-noop. The
      // route returns ok:false for dev-noop and 503 in prod when the
      // audience env var is unset.
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
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  return (
    <ScrollReveal>
      <div className={`email-section${status === 'success' ? ' success' : ''}`}>
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
              aria-invalid={status === 'error' ? true : undefined}
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
              ) : status === 'success' ? 'you\u2019re in' : 'Subscribe'}
            </button>
          </form>
          <p
            className={`email-note${
              status === 'success' ? ' email-note-success' : status === 'error' ? ' email-note-error' : ''
            }`}
          >
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
