# Security policy

## Reporting

Use [GitHub private vulnerability reporting](https://github.com/xlmc/danmux/security/advisories/new)
for suspected vulnerabilities. Include affected versions, a minimal reproduction,
impact and any proposed fix. Do not post credentials, private messages or working
exploits against third-party services. There is no guaranteed response SLA.

请通过以上私密通道报告安全问题，并附最小复现、受影响版本和影响说明。

## Scope and supported versions

Security fixes target the latest source release and `main`; older prototype
versions do not have a separate maintenance branch. Use a currently supported
Node.js release in production even though CI retains Node.js 18/20 compatibility.

Relevant boundaries include untrusted platform metadata, optional effects and
remote texture URLs. Tests use injected DNS/fetch implementations and synthetic
fixtures; they do not probe external or private networks.

## Asset resolver boundaries

The resolver checks HTTPS, optional host allowlists, private/local/multicast IP
ranges (including IPv4-mapped IPv6), all DNS answers, redirects, image MIME,
streamed byte limits, header dimensions and optional content hashes. A failed
resolution must fall back to the Base color.

These checks are not a complete network sandbox or image decoder:

- DNS is checked before fetching, but the actual connection is not pinned to the
  checked address. Use a trusted host allowlist and controlled outbound proxy to
  address DNS rebinding and deployment-specific routing.
- `timeoutMs` bounds fetching and body reading; `dnsTimeoutMs` separately bounds
  DNS waiting (defaults to `timeoutMs`). A timed-out injected lookup may continue
  internally, but its result cannot trigger a fetch.
- Image dimensions are read from selected headers, not a full decoder. In
  particular, WebP support covers the VP8X header. Validate/decode images in the
  consuming application before rendering them.
- The in-memory cache uses LRU eviction with `maxCacheEntries` (default 32;
  zero disables caching). Deployments must still define freshness and revalidation
  requirements. Injected caches must support Map-compatible ordering and methods.
- Vendor data and diagnostics can contain source metadata. Redact them before
  logging or sharing reports.

The demo binds to loopback for local debugging. It is not a public hosting service.
