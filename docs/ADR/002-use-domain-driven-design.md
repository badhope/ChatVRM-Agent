# 2. Use Clean Architecture (6 layers)

**Date:** 2024-05-28
**Updated:** 2026-06-03 (replaces the original "Use Domain-Driven
Design" decision — see "Why we changed course" below)

## Status

Accepted.

## Context

The project needs an architecture that supports:

- A complex pipeline with strict stage boundaries
- Swappable infrastructure (10 LLM providers, multiple storage and
  shell backends)
- The same business logic running in a CLI, an Express server, a
  React web UI, and a VS Code extension
- Fast, deterministic tests without mocking the world

The original ADR-002 chose Domain-Driven Design's classic 4-layer
layout (interface / application / domain / infrastructure). That
worked for the first iteration, but as the code grew it became
unclear where cross-cutting concerns (event bus, pipeline engine,
shared types) belonged, and adapters started bleeding into the
application layer.

## Decision

We adopt a **6-layer Clean Architecture** organised by direction of
dependency. The layers, in dependency order (outer depends on inner):

| #  | Layer             | Path                       | Owns                                    |
| -- | ----------------- | -------------------------- | --------------------------------------- |
| 1  | Domain            | `src/domain/`              | Pure business rules, no I/O             |
| 2  | Ports             | `src/ports/`               | Interface contracts (`IXxxPort`)        |
| 3  | Adapters          | `src/adapters/`            | Port implementations, all I/O           |
| 4  | Core              | `src/core/`                | Pipeline engine, event bus, types       |
| 5  | Stages            | `src/stages/`              | The 6 stages of the agent pipeline     |
| 6  | Frontends         | `src/cli/`, `server/`, `frontend/`            | User-facing surfaces |

Infrastructure (`src/infrastructure/` — logger, circuit-breaker,
secret-storage) sits *between* adapters and the outside world, but
its dependencies always point inward: infrastructure → domain, never
the other way around.

The dependency rule is enforced by code review and by the placement
of unit tests: `src/__tests__/unit/core/` is allowed to import
domain and ports only; `src/__tests__/unit/adapters/` is the only
test folder allowed to import infrastructure.

## Consequences

**Positive**

- Adapters can be swapped without touching the pipeline.
- The pipeline engine and the six stages have no I/O of their own;
  they are tested with hand-rolled fakes that take milliseconds.
- Three different frontends (CLI, server, web UI) share the exact
  same `ILLMPort` and `IMemoryPort` interfaces; there is one
  implementation per port.
- New LLM providers are added in `src/adapters/llm.adapter.ts` and
  become available to every frontend automatically.

**Negative**

- There is more boilerplate at the boundary: every port has an
  interface, an adapter, and a factory call.
- The pure-domain layer is small (memory, personality, trust); for
  trivial logic the indirection feels heavy. We accept this because
  the cost is paid once per port and the benefit compounds as the
  surface area grows.

**Neutral**

- The XState machine in `src/machines/agent.machine.ts` is a
  *specification* of the pipeline, not a runtime dependency. The
  pipeline engine in `core/pipeline.ts` is the canonical
  implementation; the machine is used by the Agent page to render
  the live state graph.

## Why we changed course

The original DDD-style 4-layer split was the right starting point —
it forced us to think in terms of bounded contexts. By the time we
hit ~50% of the v2 surface area, two pain points forced a rethink:

1. **The application layer became a junk drawer.** Commands, use
   cases, orchestrators, and cross-cutting helpers all wanted to
   live in `src/application/`. Splitting them into Stages and Core
   gave each a clear home.
2. **The infrastructure layer was doing too much.** Secrets,
   logging, circuit breaking, persistence, and provider HTTP all
   piled up; pulling "ports" out of "infrastructure" and giving
   adapters their own folder made the boundary explicit.

We kept the parts of DDD that helped (ubiquitous language,
domain purity, repository pattern → memory port) and dropped the
parts that did not (aggregate roots, domain services as the unit
of reuse — Core replaces them).
