# Changelog: CLI Coding Agent Failure Taxonomy

All notable changes to this spec are listed below. The spec follows semantic versioning at the document level.

Each version page documents its own canonical URL; previous versions remain reachable at their original URL forever.

## v0.1.0 - 2026-05-19

Initial public release.

- Eight failure categories defined: `orientation_miss`, `scope_creep`, `test_regression`, `incomplete`, `timeout`, `conflict`, `context_miss`, `hallucination`.
- Severity tiers defined: `low`, `medium`, `high`, `critical`.
- Priority ordering for classifiers that need to pick one category when multiple apply.
- NIST AI RMF cross-reference for each category (validity, robustness, privacy, fairness, security trust characteristics).
- ISO/IEC 42001 governance alignment notes.
- JSON Schema (`v0.1.json`) for machine-readable adoption.
- Three worked examples covering test regression, scope creep, and hallucination.

## Versioning policy

- A change to the set of categories (add, remove, rename) is a major version (e.g. v1.0).
- A change to severity tiers or priority ordering is a minor version (e.g. v0.2).
- A change to definitions, examples, or RMF/42001 cross-references that does not alter classification behaviour is a patch version (e.g. v0.1.1).
- The current and all previous versions remain reachable at their original URL. The latest version is v0.1 at `bernstein.run/spec/agent-failure-taxonomy/v0.1`.
