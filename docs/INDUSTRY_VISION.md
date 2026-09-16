# DanmuX: industry value and adoption vision

## The intended contribution

DanmuX aims to make timed comments portable across film and television playback,
streaming products and interactive viewing experiences. A service that aggregates
comments and a player that renders them need a shared contract for time, display
mode, text, source identity and optional style information.

The reference implementation brings four responsibilities together:

- **A platform-neutral model:** adapters normalize source-specific representations
  into Base + Effects + Source instead of making one platform's wire format the
  internal model.
- **Progressive visual enhancement:** compatible consumers can preserve native
  gradient textures or use caller-defined linear gradients.
- **Readable fallback:** existing `p`/`m` consumers keep a monochrome comment, and
  unknown effects or extension versions do not remove the Base comment.
- **Inspectable boundaries:** schemas, TypeScript declarations, diagnostics and
  resource checks give implementers concrete integration and testing surfaces.

This combination is the project's design focus. A claim that no other project
provides similar capabilities would require a separate, documented comparison;
no such global uniqueness claim is made here.

## Intended applications, not existing customers

| Scenario | Potential value | Work still required |
| --- | --- | --- |
| Film/TV and streaming players | A common input contract for timed-comment overlays with gradual effect support | Player integration, rendering behavior and accessibility validation |
| Cross-source comment services | Reuse normalization and compatibility output rather than rebuilding them per consumer | Authorized source fixtures and end-to-end adapter verification |
| Watch parties and interactive screenings | Portable comment metadata and optional visual styling | Playback synchronization, moderation, product UX and deployment testing |

The current repository does not implement a player, synchronization service,
moderation system or film production pipeline. These scenarios describe possible
downstream use, not shipped features or verified adoption.

## What would demonstrate broad applicability

Progress should be grounded in a reviewed downstream integration, public consumer
examples, anonymized fixtures with provenance and a compatibility matrix across
players. Later evidence could include active integrations, issue reports from real
users and measured reductions in adapter work. Stars, tests and source releases are
useful signals but do not themselves establish industry adoption.

Codex-assisted maintenance can support this path by producing reproducible bug
cases, reviewing boundary changes, extending conformance tests and helping prepare
documented releases. See [ROADMAP.md](../ROADMAP.md) for the planned work.

## 中文说明

本项目的意义是为影视播放、流媒体和互动观影提供开放、可复用的弹幕数据互操作基础。
平台无关模型、可选渐变、来源身份和兼容降级构成其设计重点。它有助于不同客户端在
逐步支持新效果时继续消费同一份基础弹幕数据，减少重复适配工作。

维护者希望推动其在影视相关产品中广泛应用。这是长期愿景，需要真实集成和使用证据
支持，不是对当前行业采用规模或全球独占性的事实声明。
