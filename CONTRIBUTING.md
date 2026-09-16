# Contributing / 贡献指南

Bug reports, compatibility fixtures, documentation improvements and focused pull
requests are welcome in English or Chinese. The current primary maintainer is
[@xlmc](https://github.com/xlmc).

## Local checks

Use Node.js 18+ and run from the repository root:

```sh
npm run check
npm run example
npm run check:package
```

There are no runtime or development dependencies to install. Package checks use a
temporary directory under `work/` and do not publish anything. `npm run demo` opens
a local debug server on port 4173; `DANMUX_DEMO_PORT` can override the port.

## Report a bug

Include the Node.js version, operating system, smallest input that reproduces the
problem, expected output and actual diagnostics. Remove tokens, account identifiers,
personal messages and signed URLs. State whether a fixture is synthetic or adapted
from an authorized source. Report suspected vulnerabilities through the private
channel in [SECURITY.md](SECURITY.md), not a public issue.

## Make a change

1. Keep a pull request focused on one behavior or a closely related set of fixes.
2. For a behavior fix, add a test that reproduces the failure before changing code.
3. Preserve `p`/`m` compatibility and Base fallback when an effect cannot be handled.
4. Keep runtime behavior, JSON Schemas and TypeScript declarations consistent when
   changing public fields. Explain intentional differences in the PR.
5. Update the changelog for user-visible changes and include the validation result.

AI-assisted changes are welcome and are reviewed under the same requirements.
Reviewers need reproducible evidence; generated explanations alone are not evidence.
Do not add secrets, unverified adoption claims or dependencies without a clear need.

## Release checks

Before creating a version tag, verify the package version and changelog, pass CI,
and run the local package-consumer check. Use a new immutable tag for changed code.
GitHub source releases and npm registry publication are separate actions; a source
release does not imply a package has been published to npm.

中文说明：请提供最小复现和可脱敏的输入，保留基础弹幕兼容性，并在提交前运行以上三个命令。
真实来源样例应说明来源与脱敏方式；不要将示例、格式兼容或测试数量描述成用户规模。
