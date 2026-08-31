import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { StaticPageBreadcrumb } from '@/components/seo/BreadcrumbListJsonLd';

const SITE_URL = 'https://bernstein.run';
const LAST_UPDATED = '2026-05-08';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What bernstein.run collects, how long it is kept, and how to ask for deletion. Plain English. No third-party trackers.',
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="blog-post-layout">
        <article className="blog-post">
          <header className="blog-post-header">
            <h1>Privacy</h1>
            <p className="blog-post-meta">
              <time dateTime={LAST_UPDATED}>Last updated: {LAST_UPDATED}</time>
            </p>
          </header>

          <div className="prose">
            <h2>Who runs this site</h2>
            <p>
              bernstein.run is the project site for Bernstein, the
              open-source governance layer for AI agents. It is operated as a personal
              project by Alex Chernysh (Tel Aviv, Israel). Contact for any
              privacy matter:{' '}
              <a href="mailto:forte@bernstein.run">forte@bernstein.run</a>.
            </p>

            <h2>What we collect</h2>
            <ul>
              <li>
                <strong>Pageview events.</strong> We use a self-hosted Umami
                instance at{' '}
                <a href="https://analytics.bernstein.run" rel="noopener">
                  analytics.bernstein.run
                </a>{' '}
                to count page visits and outbound link clicks. Umami is
                cookieless and does not collect IP addresses, device
                fingerprints, or personal identifiers. Aggregated counts are
                kept for at most 24 months, then dropped.
              </li>
              <li>
                <strong>Email, if you opt in.</strong> If you submit your email
                to subscribe to updates, it is stored in Resend (our delivery
                provider) and used only to send the newsletter. You can
                unsubscribe from any email; that removes you from the list.
              </li>
              <li>
                <strong>Server logs.</strong> Our reverse proxy keeps short
                access logs (URL, status, response size, user agent) for at
                most 14 days, used to debug outages and abuse. We do not join
                these logs to any other identifier.
              </li>
            </ul>

            <h2>What we do not collect</h2>
            <p>
              No advertising trackers, no Google Analytics, no Facebook pixel,
              no session replay, no fingerprinting. Cookies are not used for
              tracking. The site sets one cookie only if you choose to dismiss
              the locale-hint banner; it stores a yes/no flag, no identifier.
            </p>

            <h2>Your rights</h2>
            <p>
              Under GDPR (Article 15-22) you can request access to, correction
              of, deletion of, or a copy of any data we hold on you. Email{' '}
              <a href="mailto:forte@bernstein.run">forte@bernstein.run</a> with
              the request and we will action it within 30 days. If we hold no
              data on you (the common case), we will tell you that.
            </p>

            <h2>Third parties</h2>
            <p>
              Three external services receive data when you use this site:
              GitHub (when you click GitHub links), Resend (when you subscribe
              to email), and the OVH/Hetzner data centre that hosts our
              servers. None of them get analytics events; only the request
              they directly need to serve.
            </p>

            <h2>Changes</h2>
            <p>
              If this policy changes, the &ldquo;Last updated&rdquo; date at
              the top will move and a note will be posted on the blog.
            </p>
          </div>
        </article>
      </main>
      <Footer />
      <StaticPageBreadcrumb name="Privacy" slug="/privacy" />
    </>
  );
}
