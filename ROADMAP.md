# Maintenance roadmap

DanmuX is an early reference implementation. These are proposed priorities with
acceptance criteria, not claims of completed integration or a promised schedule.
Work is intended to remain public and MIT-licensed.

| Priority | Work | Evidence needed to call it complete |
| --- | --- | --- |
| 1 | Downstream integration | A reviewed integration PR, a reproducible consumer example and a documented compatibility matrix; distinguish source compatibility from deployment |
| 2 | Conformance fixtures | Authorized, anonymized fixtures with provenance; positive and negative cases covering adapters, effect isolation and both wire profiles |
| 3 | Semantic/property tests | Deterministic generated cases for idempotence, identity collisions, native effect precedence and malformed input isolation |
| 4 | Resource safety | DNS-to-connection pinning or a documented controlled-egress integration; bounded cache behavior and full image decoder validation |
| 5 | Release reproducibility | Passing runtime/platform matrix, consumer package checks and changelog-linked immutable version tags |

## Planned Codex-assisted maintenance

Codex can help turn minimized bug reports into regression tests, compare adapters
against fixtures, review changes to fallback behavior and prepare release notes.
Any future API workflow should run on relevant changes, have an explicit usage cap,
exclude credentials and private payloads, and keep merge/release authority with the
maintainer. No API-powered automation is currently installed by this roadmap.

Progress should be measured by merged fixes with reproductions, compatibility
cases, verified integration links and time spent reviewing changes. Usage and
download figures should only be reported from an identified source; no adoption
numbers are assumed.
