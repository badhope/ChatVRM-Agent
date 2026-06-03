# Architecture

This document describes the runtime architecture of Personal Assistant v2.0.
For decision history, see [docs/ADR/](ADR/); for the public type
surface, see [API.md](API.md); for deployment, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Goals

The codebase is organised around four non-negotiable properties:

1. **Swappable infrastructure.** Providers, storage, secrets, and the
   shell can be replaced without touching business logic.
2. **Deterministic core.** Domain logic is pure and testable; all
   side effects live behind ports.
3. **Observable pipeline.** Every stage emits strongly-typed events
   the UI, CLI, and server can all subscribe to.
4. **Single source of truth for the LLM contract.** Every adapter
   speaks the same `ILLMPort` regardless of provider.

## Top-level layout

```
Personal-Assistant/
├── src/                # Core (Clean Architecture, framework-free)
│   ├── ports/          # Interface contracts (what the core needs)
│   ├── adapters/       # Concrete implementations of those ports
│   ├── core/           # Pipeline engine, event bus, shared types
│   ├── stages/         # 6 stages of the agent pipeline
│   ├── domain/         # Pure domain logic (memory, personality, trust)
│   ├── infrastructure/ # Cross-cutting (logging, circuit-breaker, secrets)
│   ├── machines/       # XState machine describing the agent FSM
│   ├── cli/            # `personal-assistant` command-line entry point
│   └── __tests__/      # Unit, integration, e2e suites (707 tests)
├── server/             # Express + SSE backend (15 .ts files)
├── frontend/           # React 18 + Vite + Tailwind web UI (8 pages)
├── sdk/                # Standalone npm package (@personal-assistant/sdk)
├── vscode/             # VS Code extension (thin wrapper around the SDK)
├── examples/           # 8 runnable example scripts
├── docs/               # This folder
└── typedoc.json        # TypeDoc config for the API reference site
```

Each top-level folder has its own `tsconfig.json` and is independently
buildable, but they share a single root-level test runner (Vitest).

## The six layers

```
        ┌─────────────────────────────────────────────────────┐
        │  Frontends (CLI · Web UI · VS Code · Server REST)  │
        └────────────────────────┬────────────────────────────┘
                                 │ uses
        ┌────────────────────────▼────────────────────────────┐
        │  Stages (init · understand · plan · execute ·       │
        │           validate · reflect)                       │
        └────────────────────────┬────────────────────────────┘
                                 │ reads / writes
        ┌────────────────────────▼────────────────────────────┐
        │  Core (event bus · pipeline engine · shared types)  │
        └────────────────────────┬────────────────────────────┘
                                 │ depends on
        ┌────────────────────────▼────────────────────────────┐
        │  Ports (ILLMPort · IMemoryPort · IConfigPort ·       │
        │        IStoragePort · IShellPort · IToolPort ·       │
        │        IGitPort · IContextPort · ITrustPort)         │
        └────────────────────────┬────────────────────────────┘
                                 │ implemented by
        ┌────────────────────────▼────────────────────────────┐
        │  Adapters (LLM · Memory · Config · Storage ·         │
        │            Shell · Tools · Git · Context)            │
        └────────────────────────┬────────────────────────────┘
                                 │ calls
        ┌────────────────────────▼────────────────────────────┐
        │  Infrastructure & Domain (HTTP, fs, keytar,         │
        │  MiniSearch, Graphology, personality, trust)         │
        └─────────────────────────────────────────────────────┘
```

### 1. Ports — `src/ports/`

Interfaces the rest of the system depends on. They describe *what* the
core needs, never *how* it is provided. The set of ports in v2.0:

| Port                | Responsibility                                              |
| ------------------- | ----------------------------------------------------------- |
| `ILLMPort`          | Provider-agnostic chat, streaming, token counting           |
| `IMemoryPort`      | Long-term memory CRUD, semantic search, stats              |
| `IConfigPort`       | Persistent configuration, provider keys, chat defaults      |
| `IStoragePort`      | File system abstraction with workspace scoping             |
| `IShellPort`       | Sandboxed shell execution with timeout and redaction        |
| `IToolPort`         | Tool registry, invocation, schema exposure                 |
| `IGitPort`          | Diff, status, commit, history — no raw `simple-git` leaks   |
| `IContextPort`      | Build LLM context windows from working set + memory        |
| `ITrustPort`        | Trust scoring for tools, providers, and command sources     |

A port is always a `*.port.ts` file exporting an `IXxxPort` interface
plus the value types it operates on. Ports must not import from
adapters, infrastructure, or frontends.

### 2. Adapters — `src/adapters/`

The only place in the codebase that talks to the outside world. Each
adapter implements exactly one port and contains all of its I/O,
parsing, and provider-specific quirks.

```
src/adapters/
├── llm.adapter.ts        # Routes ILLMPort to one of 10 LLM providers
├── memory.adapter.ts     # MiniSearch + JSONL persistence
├── config.adapter.ts     # `conf` package, 0600-protected files
├── storage.adapter.ts    # Path-safe fs wrapper, atomic writes
├── shell.adapter.ts      # child_process + redaction + timeout
├── git.adapter.ts        # thin simple-git wrapper
├── context.builder.ts    # Implements IContextPort
├── tools.registry.ts     # Name → handler map, schema validation
└── index.ts              # `createAdapters()` factory (singleton)
```

The `createAdapters()` factory returns the same singleton per process
and is the only sanctioned way to obtain an adapter from the CLI or
server. The server and CLI both call it during bootstrap.

### 3. Core — `src/core/`

Framework-free orchestration. Three files:

- `core/pipeline.ts` — runs the six stages in order, manages the
  shared `PipelineContext`, surfaces a single `run()` entry point.
- `core/event-bus.ts` — typed `EventEmitter<PipelineEvents>` wrapper
  used by every stage and consumed by the CLI, server, and web UI.
- `core/types.ts` — `PipelineContext`, `PipelineEvents`,
  `StageResult`, and the cross-stage error type.

Nothing in `core/` may import from `adapters/`, `infrastructure/`, or
any frontend. Tests in `__tests__/unit/core/` use a hand-rolled fake
bus and in-memory port implementations.

### 4. Stages — `src/stages/`

The six stages of the agent pipeline. Each stage is a pure function
`(ctx) => Promise<ctx>`, receives the shared `PipelineContext`, and
emits events on the bus:

| # | Stage              | File                  | Responsibility                                     |
| - | ------------------ | --------------------- | -------------------------------------------------- |
| 1 | `init`             | `init.stage.ts`       | Allocate task ID, seed metadata, validate input  |
| 2 | `understand`       | `understand.stage.ts` | LLM intent classification + confidence score      |
| 3 | `plan`             | `plan.stage.ts`       | Produce a `PlanStep[]` with tool bindings         |
| 4 | `execute`          | `execute.stage.ts`    | Run each step, call tools, collect outputs        |
| 5 | `validate`         | `validate.stage.ts`   | Type-check, lint, dry-run tools on changed files  |
| 6 | `reflect`          | `reflect.stage.ts`    | LLM self-review, store reflection in memory       |

Stages are registered via `createDefaultStages({...adapters, eventBus})`
in `stages/index.ts`. The pipeline engine in `core/pipeline.ts` walks
the array in order. A stage can short-circuit by setting
`ctx.shouldConfirm = true`, which halts the pipeline before
`execute`.

### 5. Domain — `src/domain/`

Pure business logic with no I/O. The current domains are:

- `domain/memory` — entry, recall, decay scoring, tag taxonomy.
- `domain/personality` — `PersonalityService` (system-prompt builder)
  and `EmotionService` (valence / intensity state machine).
- `domain/trust` — trust scoring for tool calls, providers, command
  sources; gates sensitive operations.

Domain modules never touch adapters or ports — they take plain values
in and return plain values out. This keeps unit tests trivial and
allows the same domain logic to be reused in the SDK.

### 6. Infrastructure — `src/infrastructure/`

Cross-cutting concerns that are not domain logic but are shared by
multiple adapters:

- `logger.ts` — Pino with redacting transport (API keys, tokens, PII).
- `circuit-breaker.ts` — `opossum`-backed breaker for outbound HTTP.
- `secret-storage.ts` — `keytar` for OS keychain; falls back to
  0600-protected files in dev.

Adapters depend on infrastructure; infrastructure depends on neither
adapters nor stages.

## State machine

`src/machines/agent.machine.ts` is an XState v5 state chart that
describes the legal transitions of a single task:

```
idle → planning → executing → validating → reflecting → done
                                       ↘ failed
```

The pipeline engine in `core/pipeline.ts` is the canonical
implementation; the XState machine is the *specification* and is used
by the web UI's Agent page to render the live state graph and by the
VS Code extension to display a progress indicator.

## Frontends

Three frontends share the same core and emit the same events:

- **CLI** (`src/cli/index.ts`) — `commander`-based, three top-level
  commands: `chat`, `agent <task>`, `config`. Configuration is
  persisted to `~/.config/personal-assistant-nodejs/config.json`
  (0600). The CLI subscribes to the event bus and prints
  stage-by-stage output to stdout.
- **Web UI** (`frontend/`) — React 18 + Vite + Tailwind. Eight
  pages: Chat, Agent, Tools, Memory, Graph, Config, Settings,
  Dashboard. i18n is handled by `react-i18next` with 348 keys across
  English and Simplified Chinese. The web UI talks to the server
  over the REST + SSE surface documented in [API.md](API.md).
- **VS Code extension** (`vscode/`) — thin client wrapping the SDK
  (`@personal-assistant/sdk`). It uses the same ports and emits the
  same events; the host is just a different renderer.

## Server

`server/` is an Express 4.21 application that exposes the core over
HTTP. It has 15 source files:

- `app.ts` — Express app wiring, CORS, static hosting of
  `frontend/dist`, error handler.
- `index.ts` — process entry point, binds to `PORT` (default `3000`).
- `session-store.ts` — in-memory session + SSE fan-out.
- `tools-setup.ts` — bridges the CLI's `ToolsRegistry` to the server.
- `providers.ts` — provider metadata for the dashboard.
- `types.ts` — request/response shared types.
- `routes/` — 9 route modules, one per resource: agent, chat,
  config, dashboard, emotion, graph, memory, personality, tools.
- `sse/` — Server-Sent Event helpers.

The server holds no state of its own beyond the in-memory session
store — persistence is the responsibility of the adapters.

## SDK

`@personal-assistant/sdk` (in `sdk/`) is a separately published npm
package that re-exports the core types and the agent runner for use
in third-party applications. It depends on `personal-assistant` but
not on the CLI, server, or frontends. See [SDK.md](SDK.md).

## Build & test

- `npm run build` — `tsc` to `dist/`
- `npm run dev` — `tsc --watch` (typecheck only, no dev server)
- `npm run server` — `tsx watch server/index.ts` (backend, port 3000)
- `npm run web:dev` — Vite dev server for the React UI
- `npm test` — Vitest single run (707 tests across 40 files)
- `npm run lint` — ESLint flat config (`eslint.config.js`)
- `npm run docs` — TypeDoc → static HTML

`tsconfig.json` targets `ES2022`, module `NodeNext`. Engine constraint
is Node `>=20.0.0 <25.0.0`.

## Why Clean Architecture and not framework-first

Two reasons:

1. **Portability.** The same core runs in the CLI, an Express
   server, a browser-hosted React app, and a VS Code extension.
   Coupling to a framework would force three different cores.
2. **Testability.** Domain logic and pipeline logic are tested with
   in-memory fakes; no mocks, no network, no `await new Promise(...)`
   in the suite. 707 tests run in under four seconds on a laptop.

The trade-off is more boilerplate at the boundary (you do write
adapters), but the boundary is small and the gain compounds.
