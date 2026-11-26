import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { StaticPageBreadcrumb } from '@/components/seo/BreadcrumbListJsonLd';

const SITE_URL = 'https://bernstein.run';
const LAST_UPDATED = '2026-11-26';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What bernstein.run records, what it keeps in your browser, and how to turn browser analytics off. Plain English.',
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
              bernstein.run is the project site for Bernstein, an
              open-source governance layer for AI agents. It is run by Alex
              Chernysh, an individual, in Haifa, Israel. Sip Your Drink is the
              studio name of Alex Chernysh. It is not a registered company.
              Contact for any privacy matter:{' '}
              <a href="mailto:forte@bernstein.run">forte@bernstein.run</a>.
            </p>

            <h2>Cookies and fonts</h2>
            <p>
              The code of this site sets no cookies and reads none. The
              analytics script is loaded from a separate service; this
              statement covers the site&rsquo;s own code, not cookies that
              external services may set. Page fonts are self-hosted on this
              domain, so loading a page makes no font requests to external
              font services.
            </p>

            <h2>Storage in your browser</h2>
            <p>
              The site&rsquo;s own code keeps these entries in your
              browser&rsquo;s local storage. They stay on your device; the site
              does not send them anywhere.
            </p>
            <ul>
              <li>
                <code data-storage-key>beta-notice:dismissed</code> is set to{' '}
                <code>1</code> when you close the beta notice on the home
                page, so the notice stays closed.
              </li>
              <li>
                <code data-storage-key>umami:disabled</code> and{' '}
                <code data-storage-key>umami.disabled</code> are only read by
                the site, never written. Set either entry to <code>true</code>{' '}
                or <code>1</code> yourself to turn browser analytics off, as
                described below.
              </li>
            </ul>
            <p>The site&rsquo;s own code uses no session storage.</p>

            <h2>Analytics</h2>
            <p>
              The site is configured to load Umami, an open-source analytics
              tool, from{' '}
              <a href="https://analytics.bernstein.run" rel="noopener">
                analytics.bernstein.run
              </a>
              {' '}when an analytics website ID is configured. Its script tag
              restricts browser collection to{' '}
              <code data-tracker-domain>bernstein.run</code>, enables{' '}
              <code data-tracker-setting>data-do-not-track</code>, and excludes
              URL fragments via{' '}
              <code data-tracker-setting>data-exclude-hash</code>. It is set up
              for page views and two custom browser events:
            </p>
            <ul>
              <li data-browser-event>
                <code>outbound-click</code>, for clicks on links to other
                sites. The event&rsquo;s only custom property is{' '}
                <code>destination</code>, the bare host name of the site the
                link points to (for example <code>github.com</code>), without
                the link&rsquo;s path, query or fragment.
              </li>
              <li data-browser-event>
                <code>install-snippet-copy</code>, when you press an install
                command copy button on the site. The event&rsquo;s only custom
                property is <code>method</code>, naming which command slot was
                copied (<code>pipx</code>, <code>brew</code>, <code>uv</code>,{' '}
                <code>docker</code> or <code>init</code>), never clipboard text.
              </li>
            </ul>
            <p>
              Before the browser tracker sends a request, the site&rsquo;s hook
              strips any URL fragment and keeps only the{' '}
              <code>utm_source</code>, <code>utm_medium</code>,{' '}
              <code>utm_campaign</code>, <code>utm_content</code> and{' '}
              <code>utm_term</code> query parameters on the page and referrer
              addresses. Every other query parameter (including assistant
              questions, tokens and ad-click identifiers) is removed before
              sending, and the hook drops a page view when its cleaned address
              matches the previous one. Some outbound project links append
              static UTM parameters naming the page section on bernstein.run,
              with no visitor identifier.
            </p>
            <p>
              Like any web request, a browser request to the analytics server
              exposes your IP address and browser&rsquo;s user agent to that
              server. Its storage, location lookup, session identification
              and deletion schedule are not defined by this site&rsquo;s
              published code; no retention period is confirmed here.
            </p>
            <p>
              The docs assistant&rsquo;s server proxy also has a separate
              analytics path, enabled when an analytics website ID is
              configured. After a completed answer it sends a{' '}
              <code>chat.message</code> event with the model, timing, question
              and answer lengths, token counts, language, message position,
              cache status, similarity score and whether the answer was
              declined. It forwards the IP address, user agent and browser
              language with that event, but no question or answer text.
              The browser opt-out below does not control this server request.
            </p>

            <h2>Turning analytics off</h2>
            <p>
              The site&rsquo;s browser hook automatically drops every browser
              analytics request when your browser sends Global Privacy Control
              or Do Not Track. You can also open your browser&rsquo;s developer
              console on this site and run{' '}
              <code>localStorage.setItem(&apos;umami:disabled&apos;, &apos;true&apos;)</code>
              {' '}or{' '}
              <code>localStorage.setItem(&apos;umami.disabled&apos;, &apos;1&apos;)</code>
              . The site&rsquo;s browser hook then drops tracker requests,
              including page views, outbound clicks and install-copy events.
              This does not stop the docs assistant&rsquo;s server analytics.
              To turn browser analytics back on, run{' '}
              <code>localStorage.removeItem(&apos;umami:disabled&apos;)</code>
              {' '}and{' '}
              <code>localStorage.removeItem(&apos;umami.disabled&apos;)</code>.
              Blocking <code>analytics.bernstein.run</code> in your browser
              blocks browser requests to that host; it does not block
              requests made by the site&rsquo;s server.
            </p>

            <h2>The docs assistant and client-side tools</h2>
            <p>
              When you ask the docs assistant a question, your browser sends
              the question to <code>/api/ask</code> on this site, together
              with up to the last eight messages of the current conversation
              (your earlier questions and the answers). The service that
              answers is not part of this site&rsquo;s published source code.
            </p>
            <p>
              The site&rsquo;s proxy forwards the question (trimmed to 500
              characters), up to eight earlier messages (each capped at 2,000
              characters), and the locale <code>en</code> to the answering
              service. When completion logging is configured, it also sends
              the question, response identifier, model, timing, locale and
              whether the answer was declined to that service in a completion
              record. The proxy&rsquo;s separate full-text conversation log
              writer is disabled. The downstream model and embedding
              providers, cache duration and record deletion periods are not
              established by this proxy code.
            </p>
            <p>
              Outside the dialog, a submitted question is written into the
              page address as <code>?q=</code>; text still being typed is not.
              Opening or reloading a link with that parameter automatically
              sends its question to the assistant. The dialog can put its
              initial question in <code>?ask=</code>. Those addresses can be
              shared or sent to the site when loaded, even though the browser
              analytics hook removes those parameters from its own requests.
            </p>
            <p>
              The blog&rsquo;s summary buttons send the article slug and
              summary mode to <code>/api/blog/summary</code>. They do not send
              a free-text question.
            </p>
            <p>
              The interactive calculators and linters on <code>/cost</code> and{' '}
              <code>/tools/agent-md-bench</code> run inside your browser; the
              spend figures you enter and the context files you paste or drop
              there are not sent to this site&rsquo;s server or to analytics.
            </p>

            <h2>The e-mail form</h2>
            <p>
              The newsletter form sends the e-mail address you enter to{' '}
              <code>/api/notify</code> on this site. When configured, that
              service adds the address to the newsletter list stored with
              Resend and sends a confirmation e-mail through Resend. The
              address is collected for the newsletter.
              The unsubscribe link marks your contact as unsubscribed; it
              does not delete the stored address. To request deletion, write
              to{' '}
              <a href="mailto:forte@bernstein.run">forte@bernstein.run</a>.
            </p>

            <h2>Server logs</h2>
            <p>
              A question included in a page address can reach servers when
              that address is requested. The web server&rsquo;s access-log
              fields and retention period are not specified by the site code.
            </p>
            <p>
              If your browser blocks something on this site under its content
              security policy, it may send a report to{' '}
              <code>/api/csp-report</code>. The site writes the policy
              directive, the blocked address, the page address, the policy
              disposition, the source file and line, and a code sample from
              accepted reports to its server log, limiting each field to
              300 characters. Your IP address is used in memory to limit how
              many reports are accepted; the handler does not add it as a
              separate log field.
            </p>

            <h2>Third parties</h2>
            <ul>
              <li>
                <strong>Cloudflare</strong> and <strong>Netcup</strong> are
                named in the site&rsquo;s service information as its CDN and
                hosting providers. Cloudflare sits in front of every public
                request and may attach edge headers such as Network Error
                Logging; this repository&rsquo;s code does not load Cloudflare
                browser analytics or challenge widgets, and does not establish
                provider request logging or cookie behaviour.
              </li>
              <li>
                <strong>GitHub</strong>: when the site shows sponsor avatars,
                your browser loads those images from GitHub. Server-side
                star, release and contributor counts are fetched and cached by
                the server without forwarding visitor IP addresses.
              </li>
              <li>
                <strong>Resend</strong> stores newsletter addresses and sends
                the confirmation e-mail. The newsletter uses that list.
              </li>
              <li>
                The docs assistant sends questions and conversation history
                to its answering service as described above. This page does
                not name downstream providers whose current configuration
                cannot be verified from the site code.
              </li>
            </ul>

            <h2>Your rights</h2>
            <p>
              To request access to, correction of, deletion of, or a copy of
              data held about you, email{' '}
              <a href="mailto:forte@bernstein.run">forte@bernstein.run</a> with
              the request. Tell us the date and what you asked or which page
              you opened, so we can look for the relevant records.
            </p>

            <h2>Changes</h2>
            <p>
              If this policy changes, the &ldquo;Last updated&rdquo; date at
              the top will move.
            </p>
          </div>
        </article>
      </main>
      <Footer />
      <StaticPageBreadcrumb name="Privacy" slug="/privacy" />
    </>
  );
}
