# Changelog

All notable changes to **Personal-Assistant** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions 0.1.0 → 1.0.0 (May 2024) refer to a *previous* architecture
(dual-agent, MCP-centric) that was rewritten from scratch into the
v2.0 6-stage pipeline. Their release notes are preserved verbatim
for the historical record; nothing in the current `main` source
predates v2.0.

## [Unreleased]

### Added
- **GitHub project completeness** — full open-source hygiene
  - 4 issue templates (bug / feature / docs / new_provider)
  - Pull Request template
  - `.github/CODEOWNERS` (per-area reviewers)
  - `.github/dependabot.yml` (weekly npm + GitHub Actions updates)
  - `.github/FUNDING.yml` (sponsorship links)
  - `SECURITY.md` (private vulnerability disclosure, supported versions, security best practices)
  - `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
  - `.editorconfig` (cross-editor formatting)
- **8 runnable TypeScript examples** — `examples/01-basic-chat.ts` through `examples/08-server-api.ts` plus `examples/language-demo.ts`
  - `examples/README.md` documents all of them
- **`docs/DEPLOYMENT.md`** — production deployment guide (nginx, Caddy, Docker, systemd, security checklist, backup/restore)
- **`docs/API.md`** — full API reference (adapters, ports, pipeline, REST + SSE)
- **README improvements**
  - Top-of-file badge bar (license, Node, TS, React, Vite, Tailwind, CI)
  - Table of contents
  - New sections: i18n, Examples, Deployment, Contributing
  - Expanded project structure (sdk/, vscode/, examples/, docs/DEPLOYMENT.md, etc.)

### Changed
- `README_zh.md` — keeps parity with English README

### Housekeeping
- Removed planning documents under `docs/` (PHASE_*, TASK_*, *_ANALYSIS, *_DETAIL, *_PLAN) — kept only architecture-relevant ADRs and user-facing guides
- Stripped emoji section headers and marketing-speak filler from README
- Trimmed `SECURITY.md` (no placeholder Hall of Fame, no TBD GPG fingerprint)
- Simplified `.github/PULL_REQUEST_TEMPLATE.md` and issue templates (less checkbox-heavy)
- Replaced repetitive tutorial-style code in `examples/04-tool-execution.ts` with a loop over a tool/args table
- Added `.trae/`, `.cursor/`, `.ai/`, `.claude/` to `.gitignore` so AI-assistant session metadata never lands in the repo

### W17 — Deep audit (pass 1)
- 13 high + 14 medium + 6 low findings remediated
- Vector store hardening: `PersistentVectorStore` now uses temp-file + atomic `rename` for `persist()`, holds a `Promise`-mutex so concurrent writes cannot interleave, flushes on `SIGTERM` / `beforeExit` so container restarts don't lose the last batch
- Ingestion pipeline: per-batch try/catch around `embedder.embedBatch` with a length check so a misbehaving embedder cannot push `undefined` vectors into the store; per-instance monotonic `idCounter` mixed into chunk IDs to guarantee cross-run uniqueness; bounded output size with `MAX_OUTPUT_BYTES`
- ReAct agent: tool name validation, argument schema validation, replan on validation failure, depth cap with a single `final` action enforcement, per-call timeout
- Trust gate: domain + path + argument validation; per-rule cap (`maxMatches`); `readFileSafe` with size cap
- Mermaid/dot sanitisation: now strips event handlers (`onclick=`, `onerror=`, `onload=`, `onmouseover=`), `javascript:` URLs, data-URI scripts, raw `<script>` and `<iframe>` tags before SVG render
- LLM cache: typed `cachedChat` / `cachedChatExact` wrappers with both read-side and write-side `signal.aborted` checks so a cancelled request never resolves a cached value
- Port contract: `IQueue` got `removed` + `done` events and a `clear()` method; `InProcessQueue` and `BullMqQueue` implement both; new `POST /api/queue/clear` route for the dashboard
- Skill loaders (`csv`, `json`, `html`, `pdf`, `text`) all apply a size cap via the shared `size-cap.ts` helper with a per-format `PA_<FORMAT>_LOADER_MAX_BYTES` env var (25 MB default)

### W18 — Deep audit (pass 2)
- 8 critical + 17 high + 23 medium + 14 low findings remediated
- Webhook delivery: fire-and-forget SSRF pre-check at registration time, exponential backoff with jitter, per-webhook concurrency slot (`withSlot`), typed `WebhookDeliveryError` so callers can distinguish 4xx (no retry) from 5xx (retry)
- LLM cache: `keyOf` now uses a stable `stableStringify` (sorted keys) so `{a:1,b:2}` and `{b:2,a:1}` produce the same key; also key by `requestId` if the caller provides one for `cachedChatExact`
- Token budget: distinguishes "rate-limited" from "hard-cap-exceeded"; records the actual `usage` only when `cacheHit === false` so a cache hit doesn't double-count
- Pipeline: per-stage timeout aborts the stage-local `AbortController`, which is wired into every async call; pre-W18 the timeout was a `Promise.race` that rejected but the in-flight LLM call had no way to know
- ReAct: max iterations enforced; per-iteration LLM call gets a fresh `AbortController` with a per-iteration timeout; plan-validation errors degrade gracefully instead of throwing
- Web-client: bounded response size (`MAX_DOWNLOAD_BYTES`), per-host rate limit, retry with backoff for 429/5xx, schema validation for the JSON content-mode path
- MCP server bridge: per-client `initialize` handshake with capability advertisement; tool registrations mirror the local port; `tools/call` returns `{content:[{type:'text',...}], isError?:true}`

### W19 — Deep audit (pass 3)
- 7 critical + 14 high + 19 medium + 16 low findings remediated in `4b127e2`
- W19 final cleanup in `3aa58e7` filled in the M-tier (`M4, M6, M10, M12, M13`) and L-tier (`L3, L4, L6, L7, L8, L12, L14`) gaps that the W19 commit message claimed but didn't ship, plus three new findings from a follow-up audit (resilient-llm固化signal, token-budget signal pre-check, dead `stableStringify`)
- Embedder port: `embed` / `embedBatch` now accept `opts?: { signal?: AbortSignal }`; OpenAI and Ollama adapters combine the caller's signal with a per-call timeout (`AbortSignal.any`) so a hang on the embed endpoint gets killed either when the user cancels or when the per-call deadline fires; Hashing embedder checks the signal once per batch
- Pipeline context: top-level `signal` field (L12) populated from the SSE route's `AbortController.signal`; per-stage controller aborts when the parent does *and* when the stage timeout fires
- Webhooks: `register()` is now `async`; it `await`s the SSRF pre-check before binding the webhook to the bus. The pre-W19 code did `void validateWebhookUrl(...)` and synchronously returned 201, so a malicious URL would silently start receiving events. The route handler surfaces a 400 with the underlying SSRF error.
- ReAct tool signal: `IToolsPort.execute(name, args, opts?)` accepts a signal; `ToolDefinition.handler(args, opts?)` is the matching second-arg signature; `ReActAgent` forwards `this.cfg.signal` to every tool call
- QueuedTool: `run(args, opts?)` accepts a signal; the `InProcessQueue` stashes it on the internal `Job` and clones it onto the `Job` the processor receives; `runJob` early-fails with an `AbortError` if the signal is already aborted at pickup
- MCP tools: `MCPClient.callTool(name, args, opts?)` now accepts `{ signal?, timeoutMs? }` (60s default) composed via `AbortSignal.any` and wired into the underlying `request()` so a user-cancel propagates back into the JSON-RPC request map
- Resilient LLM: `wrap()` composes the boot-time `this.signal` with the per-request `req.signal` via `AbortSignal.any`; pre-W19 the per-request signal was silently ignored
- Token budget: `wrap()` and `withSession()` early-throw an `AbortError` *before* `preCallCheck` consumes the rate-limit budget; pre-W19 a cancelled call was still counted in the budget window and would throttle a real follow-up
- DOCX/XLSX loaders: now call `enforceFileSizeCap` / `enforceBufferSizeCap` (M4); the W19 L11 cap was only on `text.loader.ts`
- HTML loader: `parseError: 'empty_after_strip'` metadata when the input is non-empty but no text survives tag-strip; downstream chunkers can filter the ghost chunk
- Size-cap helper consolidated: `src/loaders/size-cap.ts` exports `enforceFileSizeCap` / `enforceBufferSizeCap`; all 7 loaders use it with per-format env vars
- 1141/1141 vitest tests pass; `tsc --noEmit` clean; `eslint .` 0 errors

### Documentation overhaul
- **`docs/ARCHITECTURE.md`** — rewritten to describe the current 6-layer Clean Architecture (domain / ports / adapters / core / stages / frontends) instead of the obsolete 4-layer DDD plan
- **`docs/SETUP.md`** — rewritten around real scripts (`npm run server` / `npm run web:dev`), real engines range (>=20 <25), real test count (707 across 40 files), real ESLint flat config; dropped the fake `.env.example` and `.eslintrc.cjs` references
- **`docs/DEPLOYMENT.md`** — port 4317 → 3000 in all 10 occurrences (architecture diagram, nginx, Caddy, Docker, systemd, health check, security checklist)
- **`docs/TROUBLESHOOTING.md`** — replaced invented CLI flags with the real command surface (`chat`, `agent <task>`, `config {show,set-key,remove-key,set-default,providers}`) and documented real failure modes (provider 401/429, Ollama not running, keytar build, port 3000 in use, SSE buffering, memory file corruption); `DEBUG=1` env var (which never existed) replaced with `LOG_LEVEL=debug` (Pino)
- **`docs/ADR/002`** — superseded DDD 4-layer decision; recorded the migration to 6 layers and why
- **`docs/ADR/004`** — superseded dual-agent decision; recorded the collapse into the current 6-stage single-agent pipeline
- **`docs/SDK.md`** — new; documents the real `@personal-assistant/sdk` surface (`runAgent`, `planTask`, `executePlan`, `PersonalAssistantAgent`, `PersonalAssistantParser`, `PersonalAssistantEditor`, `PersonalAssistantPlugins`, error hierarchy)

### Tooling
- **`npm run install:all`** — new top-level script. The repo is not a workspaces monorepo; root and `frontend/` each have their own `package.json`, so a single `npm install` left the web UI unbuildable (the previous README quick start had a two-line install that was easy to miss). `install:all` chains the two `npm install` calls.
- **`npm run verify`** — new top-level script that runs `lint + 707 tests + tsc build + frontend build` and exits non-zero on the first failure, so the full pipeline is green in one command.
- **`.github/workflows/ci.yml`** — new. Runs the same `verify` on every push / PR to `main`, then starts the backend on port 3500 and smoke-tests 10 REST endpoints + the root SPA, asserting every response is `200` and the HTML contains the expected title. This is the proof that the full stack is real, not mocked.
- **`docs/SETUP.md`** — quick start now uses `npm run install:all`; added a "Verifying the install" section that lists every endpoint, the curl to call it, and what real data you should see.
- **`README.md`** — quick start updated to use `install:all`; added a "Why install:all?" callout so the two-package layout is no longer a surprise.

## [2.0.0] - 2026-06-02

### Added
- **Full Web UI** — React 18 + TypeScript + Vite + Tailwind, 8 working pages with real SSE streaming
- **Express backend** (`server/`) — 8 API routes (REST + SSE) + static hosting of `frontend/dist`
- **Clean Architecture** — `src/adapters`, `src/core`, `src/stages`, `src/ports`, `src/domain`, `src/infrastructure`
- **10 LLM providers** — OpenAI / Anthropic / Google / DeepSeek / SiliconFlow / Aliyun / Zhipu / Baidu / Ollama / LMStudio
- **7 real tools** — `writeFile` / `readFile` / `shell` / `search` / `remember` / `analyze` / `respond`
- **6-stage Pipeline** — `initialize` → `understand` → `plan` → `execute` → `validate` → `reflect`
- **Long-term memory** — MiniSearch full-text retrieval + graphology knowledge graph
- **4 personalities** + dynamic emotion state
- **Server-Sent Events** for real-time chat and pipeline progress
- **Circuit Breaker** (opossum) for resilience
- **i18n** — English / 中文 switcher in the UI
- **Multi-language documentation** — `README.md` (English) + `README_zh.md` (中文)
- **707 unit tests** (40 files) all passing

### Fixed
- MemoryAdapter `forget()` method — real single-record deletion
- ConfigStore — pulls from `/api/config/snapshot` instead of hardcoded `siliconflow`
- Dashboard StatCard — uses real backend `agentRunCount` field
- Agent.tsx / Chat.tsx — use `useConfigStore` hook subscription (no more one-time `getState()`)
- Settings.tsx — real emotion state display
- emotion.routes.ts — fields aligned with real `EmotionService` shape

## [1.0.0] - 2024-05-28

> **Note:** v1.0.0 referred to a *previous* version of this project
> (a dual-agent, MCP-centric design) that was rewritten from scratch
> into the v2.0 6-stage pipeline. The v1.0.0 release notes are kept
> here for reference but no source from that release is in the
> current `main`. See the [README](../README.md) for the current
> feature list and the [docs/ADR/](docs/ADR/) folder for the
> architectural decisions behind v2.0.

## [0.9.0] - 2024-05-20

### Added
- LLM integration and driver
- Batch operation tools
- Performance monitoring panel
- Basic personality system

## [0.8.0] - 2024-05-15

### Added
- Code parsing system
- Basic MCP tools
- Single-Agent execution system
- CLI command framework

## [0.1.0] - 2024-05-01

### Added
- Project initialization
- Basic architecture design
- Module system framework

[2.0.0]: https://github.com/badhope/Personal-Assistant/releases/tag/v2.0.0
[1.0.0]: https://github.com/badhope/Personal-Assistant/releases/tag/v1.0.0
