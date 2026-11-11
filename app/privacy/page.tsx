import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { StaticPageBreadcrumb } from '@/components/seo/BreadcrumbListJsonLd';

const SITE_URL = 'https://bernstein.run';
const LAST_UPDATED = '2026-11-11';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What bernstein.run records, what it keeps in your browser, and how to turn analytics off. Plain English.',
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
              open-source governance layer for AI agents. It is run by Alex
              Chernysh, an individual, in Haifa, Israel. Sip Your Drink is the
              studio name of Alex Chernysh. It is not a registered company.
              Contact for any privacy matter:{' '}
              <a href="mailto:forte@bernstein.run">forte@bernstein.run</a>.
            </p>

            <h2>Cookies</h2>
            <p>
              The code of this site sets no cookies and reads none. The
              analytics script described below sets no cookies and sends its
              requests without cookies. Cloudflare, which serves the site, may
              set its own security cookie.
            </p>

            <h2>Storage in your browser</h2>
            <p>
              The site keeps these entries in your browser&rsquo;s local
              storage. They stay on your device; the site does not send them
              anywhere.
            </p>
            <ul>
              <li>
                <code>beta-notice:dismissed</code> is set to{' '}
                <code>1</code> when you close the beta notice on the home
                page, so the notice stays closed.
              </li>
              <li>
                <code>bernstein:sponsor-note-seen-v1</code> is set to{' '}
                <code>1</code> the first time the docs assistant shows its
                sponsor note under an answer, so the note is shown once.
              </li>
              <li>
                <code>umami:disabled</code> is only read by the site, never
                written. Set it yourself to turn analytics off, as described
                below.
              </li>
            </ul>
            <p>The site uses no session storage.</p>

            <h2>Analytics</h2>
            <p>
              The site uses Umami, an open-source analytics tool, on a
              self-hosted instance at{' '}
              <a href="https://analytics.bernstein.run" rel="noopener">
                analytics.bernstein.run
              </a>
              . It records two things:
            </p>
            <ul>
              <li>
                <strong>Page views.</strong> For each page you open, your
                browser sends the page address, the page title, the address
                of the page you came from, your screen size and your browser
                language. Text you type into the docs assistant is removed
                from these addresses before they are sent.
              </li>
              <li>
                <strong>Clicks on links to other sites.</strong> One event
                named <code>outbound-click</code>, with the host name of the
                site the link points to (for example <code>github.com</code>)
                and nothing else.
              </li>
            </ul>
            <p>
              Nothing else is recorded: no scrolling, no time on page, no
              clicks inside the site, no form contents. The script does not
              compute a device fingerprint. Like any web request, each request
              to the analytics server carries your IP address and your
              browser&rsquo;s user agent.
            </p>
            <p>
              Until 11 November 2026 the site also sent one event to the
              analytics server for each answer of the docs assistant: the
              model, timing, the lengths of the question and the answer, token
              counts, your locale, the position of the message in the
              conversation, and whether the answer came from a cache or was
              declined. Those events carry no question or answer text. They
              are kept and deleted like the other analytics records.
            </p>
            <p>
              The analytics server uses your IP address to look up your
              country, region and city and to compute a session hash. It
              stores the page views and clicks above together with that
              location and the session hash. Records older than 24 months are
              deleted every day.
            </p>

            <h2>Turning analytics off</h2>
            <p>
              Open your browser&rsquo;s developer console on this site and
              run{' '}
              <code>localStorage.setItem(&apos;umami:disabled&apos;, &apos;true&apos;)</code>
              . From then on the analytics script in that browser sends
              nothing, neither page views nor clicks. To turn it back on, run{' '}
              <code>localStorage.removeItem(&apos;umami:disabled&apos;)</code>.
              Blocking <code>analytics.bernstein.run</code> in your browser or
              network has the same effect.
            </p>

            <h2>The docs assistant</h2>
            <p>
              When you ask the docs assistant a question, your browser sends
              the question to <code>/api/ask</code> on this site, together
              with up to the last eight messages of the current conversation
              (your earlier questions and the answers). The service that
              answers is not part of this site&rsquo;s published source code.
            </p>
            <p>
              That service sends the text of your question to Jina AI, which
              computes embeddings used to find the matching documentation.
              The answer is generated by a language model reached through the
              site operator&rsquo;s own gateway. Until 6 November 2026 the
              answers were written by models of other providers, among them
              models reached through OpenRouter. Questions and answers are held
              in a cache for up to 24 hours.
            </p>
            <p>
              For each question the service stores the first 200 characters
              of the question, a hash of the question, a hash of your IP
              address made with a salt that changes daily, your locale, the
              model, timing, whether the question was declined, and the time.
              These records are deleted after 90 days. A separate integrity
              log keeps, for each answer, a hash of the question and of the
              session, the model, the cost, your locale, the documentation
              passages cited, timing, and whether the question was declined.
              It holds no question or answer text. No deletion
              period is set for this log yet.
            </p>
            <p>
              Until 19 September 2026 the assistant also wrote the full text
              of questions and answers to a log on the server, together with a
              session identifier, the country, a shortened browser name and a
              daily-salted hash of
              the IP address. That logging is switched off. The file from that
              period still exists. It is not read or used.
            </p>

            <h2>The e-mail form</h2>
            <p>
              The newsletter form sends the e-mail address you enter to{' '}
              <code>/api/notify</code> on this site, which adds it to the
              newsletter list. The address is stored with Resend, which also
              sends the confirmation e-mail and the newsletter. The address is
              used to send that newsletter.
              To be removed, use the unsubscribe link in any newsletter e-mail
              or write to{' '}
              <a href="mailto:forte@bernstein.run">forte@bernstein.run</a>.
            </p>

            <h2>Server logs</h2>
            <p>
              The web server keeps an access log of requests to bernstein.run.
              IP addresses in it are shortened to their network (the first 24
              bits of an IPv4 address, the first 48 bits of an IPv6 address)
              and the referring page is removed. Log files are kept for 14
              days.
            </p>
            <p>
              If your browser blocks something on this site under its content
              security policy, it may send a report to{' '}
              <code>/api/csp-report</code>. The site writes the policy
              directive, the blocked address, the page address, the source
              file and line, and a short code sample from that report to its
              server log. Your IP address is used in memory to limit how many
              reports are accepted and is not written to that log.
            </p>

            <h2>Third parties</h2>
            <ul>
              <li>
                <strong>Cloudflare</strong> serves the site; every request
                passes through it.
              </li>
              <li>
                <strong>Netcup</strong> hosts the server this site runs on.
              </li>
              <li>
                <strong>GitHub</strong>: when the site shows sponsor avatars,
                your browser loads those images from GitHub.
              </li>
              <li>
                <strong>Jina AI</strong> receives the text of questions asked
                in the docs assistant.
              </li>
              <li>
                <strong>Resend</strong> stores newsletter addresses and sends
                the newsletter.
              </li>
              <li>
                <strong>Groq</strong> runs the language model that writes the
                answers. It receives your question, the earlier messages sent
                with it and the documentation passages used for the answer.
              </li>
            </ul>

            <h2>Your rights</h2>
            <p>
              Under GDPR (Article 15-22) you can request access to, correction
              of, deletion of, or a copy of any data we hold on you. Email{' '}
              <a href="mailto:forte@bernstein.run">forte@bernstein.run</a> with
              the request and we will action it within 30 days. Most records
              described here carry no name or address. Tell us the date and
              what you asked or which page you opened, and we will look for
              them.
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
