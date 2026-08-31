/**
 * /cost - token-bill calculator.
 *
 * Surfaces the loss-frame copy for visitors who already pay claude /
 * codex / cursor monthly: "your last bill was $X. sponsoring at $25/mo
 * is Y% of $X." The widget shows the math step by step and the dated
 * model-prices source table so an engineer can audit the inputs.
 *
 * Voice rules:
 *   - lowercase casual copy, real numbers, no buzzwords
 *   - the saving figure is a band, not a single promised number
 *   - the word "suggests" and the word "heuristic" are mandatory
 *
 * Discoverability:
 *   - canonical url is bernstein.run/cost
 *   - inline FAQPage JSON-LD answering "how much does bernstein save".
 *     The block is read as plain text by whatever ingests it, so the
 *     answer copy has to hold up on its own.
 */

import type { Metadata } from 'next';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { BackToTop } from '@/components/landing/BackToTop';
import { CostCalc } from '@/components/cost/CostCalc';
import { CostHeadlineAb } from '@/components/cost/CostHeadlineAb';
import { SITE_URL, AUTHOR } from '@/lib/seo';
import { fetchModelPrices } from '@/lib/model-prices/fetch';
import { formatUsd, groupByBrand } from '@/lib/model-prices/select';

const PAGE_TITLE = 'cost';
const PAGE_DESC =
  'token-bill calculator: enter your last month claude / codex / cursor spend and see what cheapest-passing-test routing would shift. heuristic, not a promise.';
const PAGE_URL = `${SITE_URL}/cost`;

/* The page stays prerendered. The calculator is a client component and
 * the surrounding chrome is fixed; the only moving part is the price
 * table, which is read from the upstream catalogue on a 6-hour ISR
 * cycle. Deliberately not per-request: one render every six hours keeps
 * the page CDN-cacheable and keeps the upstream call count flat
 * regardless of traffic. */
export const revalidate = 21600;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  authors: [{ name: AUTHOR }],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    url: PAGE_URL,
    images: [
      { url: `/api/og?title=${encodeURIComponent(PAGE_TITLE)}`, width: 1200, height: 630 },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESC,
    images: [`/api/og?title=${encodeURIComponent(PAGE_TITLE)}`],
  },
};

/* Render the fetch timestamp as a plain date. The table is refreshed on
 * a 6-hour cycle, so the time of day is noise. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an unknown date';
  return d.toISOString().slice(0, 10);
}

/* FAQPage JSON-LD removed 2026-05-21. Google restricted FAQPage rich
 * results to government and healthcare authorities in Aug 2023, so the
 * markup was inert on a commercial cost-calculator page. The visible
 * Q&A copy still renders below; only the structured-data emission was
 * dropped. The previous COST_FAQ_JSON_LD literal is in git history if
 * a future schema type (Article with inline Question/Answer, or a
 * dedicated QAPage route) becomes viable for this content. */

export default async function CostPage() {
  const prices = await fetchModelPrices();
  const brandGroups = groupByBrand(prices.rows);
  const pricesDate = formatDate(prices.fetchedAt);

  return (
    <>
      <Nav />
      <main id="main" className="cost-page">
        <article className="cost-page-inner">
          <header className="cost-page-header">
            <p className="blog-back-link">
              <a href="/" className="blog-back">
                &larr; back home
              </a>
            </p>
            {/* conv-001 A/B headline (2026-05-17). The H1 swap is the
                only difference between variants; lede, calc, prices,
                methodology are identical. Cookie-pinned 50/50 split. */}
            <CostHeadlineAb />
            <p className="cost-page-lede">
              the bernstein router picks the cheapest model that still
              passes your tests on each task. this page lets you put your
              own bills in and see what the math suggests for your
              situation. heuristic, not a promise.
            </p>
          </header>

          <CostCalc />

          {/* Model-prices source table, read from the live catalogue on
              the page's ISR cycle. Auditable. */}
          <section
            id="model-prices"
            className="cost-prices"
            aria-labelledby="model-prices-heading"
          >
            <h2 id="model-prices-heading">model prices</h2>
            <p className="cost-prices-meta">
              {prices.source === 'live' ? (
                <>
                  read from the openrouter catalogue on {pricesDate} and
                  refreshed automatically every six hours.
                </>
              ) : (
                <>
                  the live catalogue did not answer on this render, so
                  this is the committed fallback copy from {pricesDate}.
                  it may be stale.
                </>
              )}{' '}
              current flagship and cheap tier per provider, cheapest
              first. prices are usd per 1m tokens.
            </p>
            <div className="cost-prices-table-wrap">
              <table className="cost-prices-table">
                <thead>
                  <tr>
                    <th scope="col">model</th>
                    <th scope="col">input / 1m</th>
                    <th scope="col">cached input / 1m</th>
                    <th scope="col">output / 1m</th>
                  </tr>
                </thead>
                {brandGroups.map((group) => (
                  <tbody key={group.brand}>
                    <tr className="cost-prices-brand-row">
                      <th scope="colgroup" colSpan={4}>
                        {group.brand}
                      </th>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <code>{row.displayName}</code>
                        </td>
                        <td>{formatUsd(row.inputPer1M)}</td>
                        <td>{formatUsd(row.cachedInputPer1M)}</td>
                        <td>{formatUsd(row.outputPer1M)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            <p className="cost-prices-sources">
              sources:{' '}
              <a
                href="https://claude.com/pricing"
                rel="noopener nofollow"
              >
                claude.com/pricing
              </a>
              ,{' '}
              <a
                href="https://platform.openai.com/docs/pricing"
                rel="noopener nofollow"
              >
                platform.openai.com/docs/pricing
              </a>
              ,{' '}
              <a
                href="https://ai.google.dev/gemini-api/docs/pricing"
                rel="noopener nofollow"
              >
                ai.google.dev/gemini-api/docs/pricing
              </a>
              ,{' '}
              <a
                href="https://openrouter.ai/models"
                rel="noopener nofollow"
              >
                openrouter.ai/models
              </a>
              .
            </p>
            <p className="cost-prices-footnote">
              the table is generated, not typed: the catalogue is filtered
              down to the current flagship and the current cheap tier per
              provider, so a new release replaces the row it supersedes on
              the next refresh. cached input is the provider&apos;s own
              cache-read rate where one is published, and n/a where it is
              not. absolute numbers can shift by 20-40% between revisions
              even when relative ordering survives, and the catalogue rate
              is what this listing charges rather than what you would pay
              on a direct contract, so check the source links before
              quoting these in a procurement conversation.
            </p>
          </section>

          {/* Methodology block - exactly the text the calculator's
              footnote alludes to, rendered in full for crawlers. */}
          <section className="cost-method" aria-labelledby="method-heading">
            <h2 id="method-heading">how the band is computed</h2>
            <p>
              the calculator multiplies your total monthly llm spend by
              the fraction of tasks bernstein could route to a cheaper
              model (40-80%, a heuristic) and by the cost gap between the
              premium and cheap models (about 75% saving on the routable
              tasks). the spread is visible in the table above: the
              flagship rows and the cheap-tier rows are typically one to
              two orders of magnitude apart on input, so swapping one for
              the other on a routable task saves nearly all of the input
              cost; the 75% blended figure is the band-weighted average
              across mixed task types. the result
              is a band, not a point. the math is shown step by step in
              the calculator block so you can substitute your own
              assumptions if the heuristic does not fit your repo.
            </p>
            <p>
              the routable fraction is the load-bearing assumption. on a
              codebase with flaky tests it skews toward zero - the
              cheaper models do not pass, the bandit falls back to the
              premium model, and the saving collapses. on a codebase
              with tight tests and a lot of mechanical work (typed
              refactors, test scaffolding, lint fixes) it skews higher
              than the upper bound. neither extreme is a promise.
            </p>
            <p>
              if you want to verify any of this on your own repo before
              you sponsor, install bernstein with{' '}
              <code>pipx install bernstein</code> and check the cost
              column in the run report after one parallel run. the
              numbers there are real, not heuristic.
            </p>
          </section>

          {/* AIO-2026-05-17 - visible FAQ mirror of the JSON-LD block above.
              ChatGPT and Bing AIO surfaces extract from the visible DOM
              first, then from the JSON-LD. Mirroring the same Q&A pairs as
              real h2 / h3 headings + paragraphs makes both extraction
              paths land on identical copy, keeping citations consistent. */}
          <section
            className="cost-faq"
            aria-labelledby="cost-faq-heading"
            id="faq"
          >
            <h2 id="cost-faq-heading">frequently asked</h2>
            <div className="cost-faq-list">
              <div className="cost-faq-item">
                <h3>How much does Bernstein save on LLM bills?</h3>
                <p>
                  It depends on how much of your work is routable to a
                  cheaper model that still passes your tests. The
                  calculator on this page uses a heuristic: 40-80% of
                  tasks are routable, and the cheapest passing model costs
                  about a quarter of the premium model. On a $600/month
                  combined Claude + Codex + Cursor bill, that suggests a
                  band of roughly $180-360/month shifted. Real saving
                  will be lower if your tests are flaky and higher if you
                  have a lot of mechanical work in the repo.
                </p>
              </div>
              <div className="cost-faq-item">
                <h3>How does Bernstein decide which model to route a task to?</h3>
                <p>
                  Bernstein runs an epsilon-greedy contextual bandit over
                  a per-task pass-rate history. Each task type (lint fix,
                  test generation, refactor, architecture,
                  tests-and-boilerplate) has its own arm. The bandit
                  prefers the cheapest model whose recent pass rate on
                  that task type is above a configurable threshold, and
                  explores a more expensive model with probability epsilon.
                </p>
              </div>
              <div className="cost-faq-item">
                <h3>Why is the calculator output a band and not a single number?</h3>
                <p>
                  A single number would be marketing, not honest. The
                  actual saving depends on how many tasks route to a
                  cheaper model (varies with task mix), how often the
                  cheaper model passes your tests (varies with test
                  quality), and how aggressively you tune the bandit
                  explore rate. The band is the lower and upper bounds of
                  a heuristic that assumes routing kicks in 40-80% of the
                  time.
                </p>
              </div>
              <div className="cost-faq-item">
                <h3>Does sponsoring Bernstein affect what it routes to?</h3>
                <p>
                  No. Bernstein is on-prem only. It runs on your machine,
                  calls the model APIs you configure with your own keys,
                  and writes state to disk you own. Sponsorship funds the
                  operator, not the routing logic. Routing decisions are
                  deterministic Python in{' '}
                  <code>src/bernstein/core/routing/bandit_router.py</code>, scheduled
                  from <code>src/bernstein/core/orchestration/</code>{' '}
                  - what model wins is a function of the bandit history,
                  the cost table, and your test results.
                </p>
              </div>
            </div>
          </section>
        </article>
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
