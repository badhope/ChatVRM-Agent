# 5. Build the standalone SDK

**Date:** 2024-05-28
**Updated:** 2026-06-03 — the original decision paired the SDK with
a VS Code extension (`vscode/`). That extension was removed in the
v2.0 cleanup because it called a CLI surface (`agent run <task>
--plan --model X`) that never matched the real binary and shipped
references to a deleted `mcp/` subsystem. This ADR now records the
SDK decision only.

## Status

Accepted (SDK only).

## Context

To let third-party applications embed Personal Assistant's agent
loop without pulling in the CLI, the Express server, the React UI,
or any of the build-time tooling, we need a small, dependency-free
npm package that re-exports the core types and the agent runner.

## Decision

We build **`@personal-assistant/sdk`**, a separately versioned npm
package that lives in `sdk/` and is independently buildable via
`tsc`. It depends on `personal-assistant` but not on the CLI,
server, or frontends. Its public surface is the seven files
listed in [docs/SDK.md](../SDK.md).

## Consequences

**Positive**

- Third-party apps (chatbots, IDE plugins, dashboards, internal
  tools) can `npm install @personal-assistant/sdk` and call the
  agent with one line of code.
- The SDK is small (no React, no Express, no `tsx`) so it does not
  bloat the consumer's bundle.
- Versioning is coupled to the main package, so a major version
  bump of `personal-assistant` always ships a corresponding major
  of `@personal-assistant/sdk`.

**Negative**

- The SDK must stay forward-compatible: any breaking change to a
  port type forces a new major.
- The SDK is duplicated type surface; if the core types change, the
  SDK must be re-published. CI catches this via the `release` job
  in `.github/workflows/ci-cd.yml`.

**Neutral**

- The SDK exposes seven modules. The barrel re-export makes the
  common path trivial (`import { runAgent } from '@personal-assistant/sdk'`)
  and the sub-path exports (`@personal-assistant/sdk/agent`,
  `/parser`, `/editor`, `/plugins`) keep tree-shaking honest.
