# Documentation

Where to find what.

## Reading order

1. [ARCHITECTURE.md](ARCHITECTURE.md) — overall design (Clean Architecture,
   ports, adapters, pipeline).
2. [SETUP.md](SETUP.md) — install and first run.
3. [API.md](API.md) — REST + SSE contracts, port interfaces.
4. [DEPLOYMENT.md](DEPLOYMENT.md) — production deployment.
5. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — common pitfalls.
6. [GIT_GUIDELINES.md](GIT_GUIDELINES.md) — commit message style.

> **Note:** [SDK.md](SDK.md) documents the standalone
> `@personal-assistant/sdk` npm package. The SDK is part of the v2
> (TypeScript) line and is **deprecated** — see the banner at the top
> of the file. The current build is `pa-agent` (Python).

## Architecture decision records

- [ADR/001-record-architecture-decisions.md](ADR/001-record-architecture-decisions.md) — why we use ADRs
- [ADR/002-use-domain-driven-design.md](ADR/002-use-domain-driven-design.md) — DDD / Clean Architecture choice
- [ADR/003-typescript-as-primary-language.md](ADR/003-typescript-as-primary-language.md) — language choice
- [ADR/004-implement-dual-agent-system.md](ADR/004-implement-dual-agent-system.md) — pipeline + memory architecture
- [ADR/005-build-sdk-and-vscode-extension.md](ADR/005-build-sdk-and-vscode-extension.md) — distribution strategy
