<div align="center">

<img alt="" src="https://raw.githubusercontent.com/sipyourdrink-ltd/bernstein/main/docs/assets/logo-light.svg" width="300">

### the source of [bernstein.run](https://bernstein.run)

[![ci](https://github.com/sipyourdrink-ltd/bernstein-landing/actions/workflows/ci.yml/badge.svg)](https://github.com/sipyourdrink-ltd/bernstein-landing/actions/workflows/ci.yml)
[![codeql](https://github.com/sipyourdrink-ltd/bernstein-landing/actions/workflows/codeql.yml/badge.svg?branch=master)](https://github.com/sipyourdrink-ltd/bernstein-landing/actions/workflows/codeql.yml)
[![openssf scorecard](https://api.securityscorecards.dev/projects/github.com/sipyourdrink-ltd/bernstein-landing/badge)](https://scorecard.dev/viewer/?uri=github.com/sipyourdrink-ltd/bernstein-landing)
[![next.js](https://img.shields.io/badge/next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![licence](https://img.shields.io/github/license/sipyourdrink-ltd/bernstein-landing)](LICENSE)

[site](https://bernstein.run) &middot; [the orchestrator](https://github.com/sipyourdrink-ltd/bernstein) &middot; [docs](https://bernstein.readthedocs.io/) &middot; [contributing](CONTRIBUTING.md) &middot; [security](SECURITY.md)

</div>

---

This repository is the website, not the software it describes.

[Bernstein](https://github.com/sipyourdrink-ltd/bernstein) is the open-source
governance layer for AI agents: a deterministic scheduler with no model in the
coordination loop, running agents in parallel, gating what they produce, and
recording every step so a run can be verified afterwards, offline, from the
artifacts alone. CLI coding agents work out of the box — 48 adapters ship with
it — and the same layer governs any agent workload. Bugs and features in *that*
belong in
[its tracker](https://github.com/sipyourdrink-ltd/bernstein/issues).

What lives here is the Next.js app that documents it — pages, copy, structured
data, and the machine-readable surfaces (`/llms.txt`, `/agents.txt`,
`/.well-known/agent-card.json`) that let a crawler or an agent read the project
without scraping HTML.

## Why it is public

Two reasons, both practical.

A site that argues for auditability and cannot be audited is an odd thing. Every
number rendered here — the adapter count, the version, the benchmark scores —
comes from a checked-in data file with a generator next to it, and you can now
read both.

And corrections get cheaper. Claims about software go stale; opening a pull
request against the sentence is faster than describing it in an issue. The
[content correction](.github/ISSUE_TEMPLATE/content_correction.yml) template
exists for exactly that.

## What is not here

Some of what bernstein.run serves is supplied by the host and is deliberately
absent from this repository: the retrieval and summarisation service behind
`/ask`, the mailing-list plumbing, comparison datasets, and the deploy units.

This is not a stripped build. `npm run build` completes on a fresh clone and
prerenders the whole site; the routes that need a host service are the ones you
will not find, and `scripts/prebuild.mjs` prints each step it skips. Nothing
fails silently.

## Run it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. No credentials required — every integration
fails closed and hides its own entry point when unconfigured. `.env.example`
documents the seams if you want to wire your own.

```bash
npm run lint        # eslint
npx tsc --noEmit    # types
npm test            # node:test, no framework
npm run build       # prerenders ~100 routes; the real check
```

`npm run build` is the one that matters. Most of this site is static, so a page
that throws does it at build time and nowhere else.

## Layout

| Path | What it holds |
|---|---|
| `app/` | routes — pages, API handlers, and the machine-readable surfaces |
| `components/` | presentational components, grouped by the surface they serve |
| `content/` | blog posts and long-form copy as MDX |
| `lib/` | data access, SEO and structured-data builders, small utilities |
| `data/` | generated catalogues and counts, checked in so a build needs no network |
| `scripts/` | the generators that write `data/`, run by `prebuild` |
| `styles/` | design tokens and per-surface CSS |

## Voice

The copy has rules, and they are enforced by tests rather than by taste:
lowercase headings, concrete nouns, no superlatives, and no claim that cannot be
followed to a source. `__tests__/voice-banned-words.test.ts` fails on the words
this project does not use. If a change reads like an advert, that test is
usually already telling you so.

## Contributing

Corrections, accessibility fixes, broken links, and copy that has aged badly are
all welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Ideas about the
orchestrator itself go to
[its tracker](https://github.com/sipyourdrink-ltd/bernstein/issues) instead.

## Sponsor

If bernstein routed a model that saved you a bill, $25 covers a month of coffee.
[github.com/sponsors/chernistry →](https://github.com/sponsors/chernistry)

---

Brand assets belong to [Sip Your Drink Ltd](https://sipyourdrink.ltd); the brand
system itself lives in the
[orchestrator repository](https://github.com/sipyourdrink-ltd/bernstein).

© [Sip Your Drink Ltd](https://sipyourdrink.ltd) · [MIT](LICENSE)
