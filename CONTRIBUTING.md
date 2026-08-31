# Contributing

This repository is the website at [bernstein.run](https://bernstein.run). The
orchestrator it documents lives in
[sipyourdrink-ltd/bernstein](https://github.com/sipyourdrink-ltd/bernstein);
anything about the software itself belongs in that tracker.

## The most useful contribution

A correction. The site states facts about software that keeps moving, and some
of those facts are already wrong. Quoting the sentence and naming a primary
source — a repository, a release note, a doc page — is worth more than an
argument about it, and takes less of your evening.

Also welcome: broken links, accessibility problems, layout breakage on a
browser or width that was never checked, and copy that has aged into nonsense.

## Before you open a pull request

```bash
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run build
```

`npm run build` is not optional. Most of this site prerenders, so a page that
throws fails there and passes everything else.

Some parts of the site are supplied by the host and are absent from this
repository — the retrieval service behind `/ask`, the mailing-list routes,
comparison datasets. `scripts/prebuild.mjs` prints each step it skips. A skipped
step is expected; a failing one is not.

## Voice

The copy is deliberately plain: lowercase headings, concrete nouns, no
superlatives, no claim without a source. `__tests__/voice-banned-words.test.ts`
enforces the list of words the project does not use, so if a change reads like
an advert the suite usually says so before a reviewer does.

Numbers are never typed by hand. The adapter count, the version string and the
benchmark figures are read from files under `data/` that generators in
`scripts/` write. If a number is wrong, fix the generator or its input.

## Commits

One logical change per commit, present tense, and a subject that says what
changed rather than which files moved. No attribution trailers.

## Scope

Two things get declined, without prejudice:

- Redesigns that arrive as a finished pull request. Open an issue first — the
  visual system is shared with the orchestrator's brand and changes to it are
  not a site-local decision.
- Marketing copy. Superlatives, urgency and comparison framing are out of scope
  by policy, not by taste.

## Licence

By contributing you agree your work ships under the [MIT licence](LICENSE) that
covers this repository.
