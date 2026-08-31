# Security policy

## Reporting

Report privately through
[GitHub Security Advisories](https://github.com/sipyourdrink-ltd/bernstein-landing/security/advisories/new).
Please do not open a public issue for anything exploitable.

Expect an acknowledgement within 72 hours and an assessment within seven days.
There is no bounty; there is credit in the advisory unless you would rather not
have it.

## Scope

This repository is a website. In scope:

- Cross-site scripting through rendered content — the MDX pipeline, the
  markdown renderer, and any structured data written into the page.
- Content Security Policy or security-header weaknesses configured in
  `next.config.mjs` or `middleware.ts`.
- Server-side request forgery or injection through the API routes under
  `app/api/`.
- A credential, token or private hostname committed to this repository.
- Dependency vulnerabilities that are actually reachable from shipped code.

Out of scope:

- Vulnerabilities in the orchestrator itself — report those to
  [sipyourdrink-ltd/bernstein](https://github.com/sipyourdrink-ltd/bernstein/security).
- Missing headers on third-party hosts the site merely links to.
- Automated scanner output with no demonstrated impact, volumetric testing, and
  social engineering.

## What runs here

Pull requests are scanned by CodeQL, trufflehog and the dependency-review
gate; the workflows themselves are analysed by zizmor. Every action is pinned to
a commit SHA. Findings land in the repository's Security tab.
