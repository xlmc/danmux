# Changelog

Package versions are separate from the DanmuX schema and extension versions.

## 0.3.1 — 2026-09-16

- Harden asset address checks for equivalent IPv6 representations, IPv4-mapped
  private addresses, link-local ranges and multicast destinations; reject malformed
  DNS answers before downloading.
- Avoid treating ordinary hostnames beginning with `fc`/`fd` as private IPs and
  avoid unnecessary DNS lookups for public IP literals.
- Reject zero-dimension image headers without caching them.
- Preserve the Base comment and emit a diagnostic for unsupported or missing
  extension versions, instead of interpreting their effects as version 1.
- Add regression coverage, a runnable integration example and a packed-consumer
  installation check. Extend CI to Linux/Windows and Node.js 18/20/22/24.
- Add English documentation, contribution/security guidance and an explicit roadmap.

Upgrade note: producers sending `danmux.effects` must include
`danmux.extensionVersion: 1`. Plain legacy `p`/`m` input remains supported.

## 0.3.0 and earlier

The initial reference implementation and debug demo are recorded in
[repository history](https://github.com/xlmc/danmux/commits/main/). Earlier package
versions did not have GitHub releases; this changelog does not invent release dates.
