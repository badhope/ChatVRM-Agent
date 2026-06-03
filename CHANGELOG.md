# Changelog

All notable changes to **Personal-Assistant** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Added
- Dual-Agent collaboration system (Planner + Executor)
- Knowledge graph system with auto-extraction, reasoning, version control, conflict detection
- Long-term memory with importance scoring, forgetting mechanism, association network, RAG
- Personality & emotion system (4 preset personalities, 8 emotion states, user preference learning)
- Security & trust system (risk assessment, audit log, dynamic trust adjustment)
- Advanced tool ecosystem (20+ specialized tools)
- Performance monitoring system
- TypeScript/JavaScript deep analysis engine
- 348+ tests, 100% pass rate

### Enhanced
- MCP tool ecosystem expansion
- Git smart tools (conflict resolution, history analysis)
- Code quality analysis tools
- Smart caching and performance optimization
- LLM call optimization (batching, cost control)

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
