# DanmuX v1

[中文](README.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

[![CI](https://github.com/xlmc/danmux/actions/workflows/test.yml/badge.svg)](https://github.com/xlmc/danmux/actions/workflows/test.yml)

DanmuX is an MIT-licensed, dependency-free Node.js reference implementation for a
platform-neutral **timed comment (danmaku)** data model. It separates ordinary
comment data, optional visual effects and source identity, so adapters can preserve
native gradients while older consumers continue reading plain `p`/`m` comments.

This is an **early-stage reference implementation**. It is not a player, a platform
scraper or an established industry standard. Compatibility with another project's
format does not imply that project has deployed DanmuX.

## Why it exists

A Bilibili protobuf item can use milliseconds (`progress`), numeric display modes
and native texture metadata. A DanDanPlay-compatible consumer expects a different
wire format. DanmuX provides a shared boundary between those representations:

1. Normalize timing, mode, font size, color and source into a validated Base model.
2. Preserve supported native fill/stroke textures or attach caller-defined linear gradients.
3. Export a compatible monochrome Base plus an optional, versioned effects extension.
4. Drop unsupported effects with diagnostics while retaining the readable comment.

Its format work draws on interfaces used by the maintainer's related
[`danmu_api`](https://github.com/xlmc/danmu_api) project. Downstream adoption remains
to be demonstrated; see the [integration milestones](ROADMAP.md).

## Film, television and streaming vision

DanmuX aims to provide a reusable timed-comment interoperability layer for film/TV
playback, streaming and watch-party experiences. Its design brings together a
platform-neutral model, source identity, optional visual effects and backward
compatibility, so services and players can reuse adapters and preserve readable
comments when richer effects are unavailable.

Broad use in these products is an ambition to validate through real integrations,
user feedback and compatibility results. The project does not claim industry-wide
deployment or proven global uniqueness. See the [industry vision](docs/INDUSTRY_VISION.md)
for the intended use cases and evidence needed.

## Run from source

Node.js 18+ is required. Prefer an actively supported Node.js release for deployment;
18 and 20 remain compatibility test targets. No dependency installation or API key
is needed for these commands:

```sh
git clone https://github.com/xlmc/danmux.git
cd danmux
npm run check
npm run example
npm run check:package
npm run demo
```

The demo listens on `http://127.0.0.1:4173` and lets you inspect conversion results
and caller-defined gradients. `check:package` packs and installs a temporary local
tarball, then checks ESM import, schema and declaration exports; it does not publish.

To consume the tagged source from another project:

```sh
npm install github:xlmc/danmux#v0.3.1
```

This installation uses the GitHub tag; no npm registry publication is assumed.

## Minimal integration

```js
import { fromBilibili, applyGradient, toCompatibilityWire } from 'danmux';

const parsed = fromBilibili({
  id: 'example-1', progress: 12500, mode: 1, fontsize: 25,
  color: 0xffffff, content: 'Hello, DanmuX!',
});
if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));

const enhanced = applyGradient(parsed.value, {
  angle: 0,
  stops: [
    { position: 0, color: '#FB7299' },
    { position: 1, color: '#33B8FF' },
  ],
});
const wire = toCompatibilityWire(enhanced.value ?? parsed.value);
// wire.p === '12.5,1,16777215,[bilibili]'
// wire.m === 'Hello, DanmuX!'
// wire.danmux.effects contains the optional gradient.
```

The runnable equivalent is [examples/quickstart.js](examples/quickstart.js).
Always handle result diagnostics. An asset or effect failure must leave Base
available to the consumer.

## Compatibility contract

| Surface | Contract |
| --- | --- |
| Internal model | `schemaVersion: 1`; Base + Effects + Source |
| Enhanced wire | `danmux.extensionVersion: 1`; unknown or missing extension versions fall back to Base |
| Default `ddplay-json` profile | `time,mode,color,source` in `p`; text in `m` |
| `bilibili-xml` profile | `time,mode,fontSize,color,timestamp,pool,userHash,id` in `p` |
| Gradient target | `fill` or `stroke`; native effects take precedence by default |
| Linear gradient | 2–16 sorted stops; `#RRGGBB`, optional alpha; angle 0 is left-to-right |
| Unsupported effect | Ignore the effect, preserve the comment and report diagnostics |

The XML profile produces attribute values, not an XML document. Callers remain
responsible for XML escaping. The package exports JSON Schemas and TypeScript
declarations; runtime validation enforces additional semantic constraints.

## Validation and limits

[CI](https://github.com/xlmc/danmux/actions) runs on Linux and Windows with Node.js
18, 20, 22 and 24. It checks conversion fixtures, native/generated precedence,
legacy fallback, extension version isolation, resource address checks and package
consumption. Fixtures are examples, not evidence of production traffic or adoption.

`AssetResolver` enforces HTTPS, optional host allowlists, address checks, no redirects,
download byte limits, image header dimensions, a fetch timeout and optional SHA-256
verification. It does **not** pin DNS to the fetch connection, fully decode images,
scan content or provide a bounded persistent cache. Production integrations need
controlled egress, suitable cache limits and a real image decoder. Read
[SECURITY.md](SECURITY.md) before enabling remote textures.

BAS, Bilibili modes 8/9 rendering, dynamic gradients and player integration are
outside the current implementation. No claims of production readiness or broad
adoption are made.

## Contribute

Useful contributions include minimal reproduction fixtures, adapter compatibility
reports, downstream integration tests and security boundary tests. See
[CONTRIBUTING.md](CONTRIBUTING.md) for commands and review expectations, and
[ROADMAP.md](ROADMAP.md) for milestones with acceptance criteria.

License: [MIT](LICENSE).
