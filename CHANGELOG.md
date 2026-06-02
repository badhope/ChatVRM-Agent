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
- **8 runnable TypeScript examples** — `examples/01-basic-chat.ts` through `examples/08-server-api.ts`
  - Plus `examples/README.md` documenting all 9 examples
- **`docs/DEPLOYMENT.md`** — production deployment guide (nginx, Caddy, Docker, systemd, security checklist, backup/restore)
- **`docs/API.md`** — full API reference (adapters, ports, pipeline, REST + SSE)
- **README improvements**
  - Top-of-file badge bar (license, Node, TS, React, Vite, Tailwind, CI)
  - Table of contents
  - New sections: i18n, Examples, Deployment, Contributing, Community, Acknowledgements
  - Expanded project structure (sdk/, vscode/, examples/, docs/DEPLOYMENT.md, etc.)

### Changed
- `README_zh.md` — added "Acknowledgement" footer and updated project structure mirror

## [2.0.0] - 2026-06-02

### Added
- **Full Web UI** — React 18 + TypeScript + Vite + Tailwind, 9 working pages with real SSE streaming
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
