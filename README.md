# Personal-Assistant

> **A pipeline-driven personal AI agent with a real Web UI and CLI.**
> 10 LLM providers, 7 real tools, 6-stage pipeline, full SSE streaming.
> **Zero mocks, zero fallbacks, zero fake data** — every API call hits the real vendor endpoint.

<p align="left">
  <a href="https://github.com/badhope/Personal-Assistant/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square"></a>
  <a href="https://nodejs.org"><img alt="Node ≥ 20" src="https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white"></a>
  <a href="https://www.typescriptlang.org"><img alt="TypeScript 5.8" src="https://img.shields.io/badge/typescript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="https://react.dev"><img alt="React 18" src="https://img.shields.io/badge/react-18-61DAFB?style=flat-square&logo=react&logoColor=black"></a>
  <a href="https://vitejs.dev"><img alt="Vite 5" src="https://img.shields.io/badge/vite-5-646CFF?style=flat-square&logo=vite&logoColor=white"></a>
  <a href="https://tailwindcss.com"><img alt="Tailwind 3" src="https://img.shields.io/badge/tailwind-3-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white"></a>
  <a href="https://expressjs.com"><img alt="Express 4" src="https://img.shields.io/badge/express-4-000000?style=flat-square&logo=express&logoColor=white"></a>
  <a href="https://vitest.dev"><img alt="Vitest" src="https://img.shields.io/badge/vitest-tested-6E9F18?style=flat-square&logo=vitest&logoColor=white"></a>
  <a href="https://github.com/badhope/Personal-Assistant/actions"><img alt="CI" src="https://img.shields.io/badge/CI-passing-brightgreen?style=flat-square&logo=github-actions&logoColor=white"></a>
  <a href="https://github.com/badhope/Personal-Assistant/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/badhope/Personal-Assistant?style=flat-square"></a>
  <a href="https://github.com/badhope/Personal-assistant/issues"><img alt="Issues" src="https://img.shields.io/github/issues/badhope/Personal-Assistant?style=flat-square"></a>
  <a href="https://github.com/badhope/Personal-Assistant/blob/main/SECURITY.md"><img alt="Security" src="https://img.shields.io/badge/security-policy-blueviolet?style=flat-square"></a>
</p>

[🌐 Live Demo](http://localhost:3000) · [📖 中文文档](README_zh.md) · [📋 Changelog](CHANGELOG.md) · [🤝 Contributing](CONTRIBUTING.md) · [🔒 Security](SECURITY.md) · [📄 License](LICENSE)

---

## 📑 Table of contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [🖥 Web UI — 9 pages](#-web-ui--9-pages)
- [🔌 10 LLM providers](#-10-llm-providers)
- [⌨️ CLI commands](#-cli-commands)
- [🏗 Architecture](#-architecture)
- [🛠 7 tools](#-7-tools)
- [📂 Project structure](#-project-structure)
- [🌍 i18n — EN / 中文](#-i18n--en--中文)
- [💡 Examples](#-examples)
- [🚀 Deployment](#-deployment)
- [📦 API protocol](#-api-protocol)
- [🛠 Development](#-development)
- [🤝 Contributing](#-contributing)
- [🐛 Troubleshooting](#-troubleshooting)
- [📜 License](#-license)

---

## ✨ Features

- **🔌 10 LLM providers** — OpenAI, Anthropic, Google, DeepSeek, SiliconFlow, Aliyun, Zhipu, Baidu, Ollama, LMStudio
- **🛠 7 real tools** — `writeFile` / `readFile` / `shell` / `search` / `remember` / `analyze` / `respond`
- **⚙️ 6-stage pipeline** — `initialize` → `understand` → `plan` → `execute` → `validate` → `reflect`
- **🌐 Full Web UI** — React 18 + TypeScript + Vite + Tailwind, 9 working pages with real SSE streaming
- **💬 Multi-turn chat** with persistent sessions (JSON-backed)
- **🧠 Long-term memory** — MiniSearch full-text retrieval + graphology knowledge graph
- **🎭 4 personalities** + dynamic emotion state
- **📡 Server-Sent Events** for real-time chat and pipeline progress
- **🛡 Circuit Breaker** (opossum) for resilience
- **📱 Responsive** — works on mobile / tablet / desktop
- **🌍 i18n** — English / 中文 switcher in the UI

---

## 🚀 Quick Start

### Web Mode (Recommended)

```bash
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant

# Install all dependencies (backend + frontend)
npm install
cd frontend && npm install && cd ..

# Build backend and frontend
npm run build
npm run web:build

# Start the server (Express on port 3000)
npm run server
```

Open **http://localhost:3000** in your browser.

### CLI Mode

```bash
export SILICONFLOW_API_KEY=sk-your-real-key
npx tsx src/cli/index.ts agent "Introduce yourself in one sentence"
```

### Persist API Keys

```bash
node dist/cli/index.js config set-key siliconflow sk-your-real-key
node dist/cli/index.js config set-default siliconflow
node dist/cli/index.js chat
```

---

## 🖥 Web UI Pages

| Route | Description | Backend API |
| --- | --- | --- |
| `/dashboard` | Stats: chat count, memory, agent runs, provider readiness | `/api/dashboard`, `/api/config/snapshot` |
| `/chat`, `/chat/:id` | Real SSE streaming chat, 10 model switcher | `/api/chat/stream` (SSE) |
| `/agent` | 6-stage pipeline with real-time progress | `/api/agent/run` (SSE) |
| `/tools` | 7 real tools: `writeFile` / `readFile` / `shell` / `search` / `remember` / `analyze` / `respond` | `/api/tools`, `/api/tools/execute` |
| `/memory` | Browse, search, tag-filter, delete, clear long-term memory | `/api/memory/*` |
| `/config` | 10 provider config + key management + real connectivity test | `/api/config/*` |
| `/graph` | Canvas 2D force-directed knowledge graph | `/api/graph` |
| `/settings` | 4 personality switcher + emotion state + theme | `/api/personality`, `/api/emotion` |

---

## 🤖 LLM Providers (10, all real HTTP)

> **Zero mock fallback** — this project never returns fake data when the real API fails. 401 / 403 / network errors are surfaced as-is.

| Provider | Type | Default Base URL | Default Model | Protocol | API Key |
| --- | --- | --- | --- | --- | --- |
| `openai` | Cloud | `https://api.openai.com/v1` | `gpt-4o` | OpenAI | ✅ |
| `anthropic` | Cloud | `https://api.anthropic.com` | `claude-3-5-sonnet-...` | Anthropic | ✅ |
| `google` | Cloud | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` | Google | ✅ |
| `deepseek` | Cloud | `https://api.deepseek.com/v1` | `deepseek-chat` | OpenAI-compatible | ✅ |
| `siliconflow` | Cloud | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | OpenAI-compatible | ✅ |
| `aliyun` | Cloud | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | OpenAI-compatible | ✅ |
| `zhipu` | Cloud | `https://open.bigmodel.cn/api/paas/v4` | `glm-4` | OpenAI-compatible | ✅ |
| `baidu` | Cloud | `https://aip.baidubce.com/rpc/2.0/ai_custom/v1` | `ernie-4.0-8k` | Baidu | ✅ |
| `ollama` | Local | `http://localhost:11434/v1` | `llama3.2` | OpenAI-compatible | ❌ |
| `lmstudio` | Local | `http://localhost:1234/v1` | `local-model` | OpenAI-compatible | ❌ |

**Default provider:** `siliconflow` (Chinese vendor, free tier, Qwen2.5 / DeepSeek / GLM available).

### CLI: Persist Keys

```bash
node dist/cli/index.js config set-key <provider> <YOUR_API_KEY>

# Examples
node dist/cli/index.js config set-key openai sk-xxxxxxxx
node dist/cli/index.js config set-key anthropic sk-ant-xxxxxxxx
node dist/cli/index.js config set-key siliconflow sk-xxxxxxxx

# Switch default provider
node dist/cli/index.js config set-default openai

# Show current config
node dist/cli/index.js config show

# List all supported providers
node dist/cli/index.js config providers
```

API keys are stored in conf (default `~/.config/personal-assistant-nodejs/config.json`, file mode `0600`).

### Env Vars (Higher Priority)

CLI lookup order: conf → `PERSONAL_ASSISTANT_<PROVIDER>` → `<PROVIDER>_API_KEY`.

```bash
export OPENAI_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat -p openai

export ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
node dist/cli/index.js agent "Write a quicksort" -p anthropic

export GOOGLE_API_KEY=AIza-xxxxxxxx
node dist/cli/index.js chat -p google

export SILICONFLOW_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat

export DEEPSEEK_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat -p deepseek

export ALIYUN_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat -p aliyun

export ZHIPU_API_KEY=xxxxxxxx.xxxxxxxx
node dist/cli/index.js chat -p zhipu

export BAIDU_API_KEY=xxxxxxxx
node dist/cli/index.js chat -p baidu
```

### Custom Base URL (Proxy / Azure / Self-hosted)

Every provider supports `<PROVIDER>_BASE_URL`:

```bash
# Azure OpenAI
export OPENAI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deploy
export OPENAI_API_KEY=your-azure-key
node dist/cli/index.js chat -p openai -m your-deploy-name

# OpenAI-compatible proxy
export OPENAI_BASE_URL=https://api.your-proxy.com/v1
export OPENAI_API_KEY=sk-proxy
```

Override vars: `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` / `GOOGLE_BASE_URL` / `DEEPSEEK_BASE_URL` / `SILICONFLOW_BASE_URL` / `ALIYUN_BASE_URL` / `ZHIPU_BASE_URL` / `BAIDU_BASE_URL` / `OLLAMA_BASE_URL` / `LMSTUDIO_BASE_URL`.

### Local LLMs (Ollama / LM Studio)

```bash
# Ollama
ollama serve &
ollama pull llama3.2
node dist/cli/index.js chat -p ollama -m llama3.2

# LM Studio — start local server on port 1234 first
node dist/cli/index.js chat -p lmstudio
```

---

## 📟 CLI Commands

```bash
# Interactive multi-turn chat (readline real terminal)
node dist/cli/index.js chat [-p provider] [-m model]

# Single-task 6-stage Pipeline
node dist/cli/index.js agent "<task>" [-p provider] [-m model]

# Config management
node dist/cli/index.js config show
node dist/cli/index.js config set-key <provider> [key]   # reads key from stdin if omitted
node dist/cli/index.js config remove-key <provider>
node dist/cli/index.js config set-default <provider>
node dist/cli/index.js config providers
```

---

## 🏗 Pipeline Architecture (6 stages)

Each `agent` task runs sequentially:

1. **initialize** — set up context (taskId, metadata, error list)
2. **understand** — LLM identifies intent (`chat` / `code` / `analyze` / `refactor` / `shell` / `search`) + workspace scan
3. **plan** — LLM generates execution plan (step list + tool selection), template fallback if LLM fails
4. **execute** — invoke tools step by step (`writeFile` / `readFile` / `shell` / `search` / `remember` / `analyze` / `respond`)
5. **validate** — verify results (syntax, exit codes, file existence)
6. **reflect** — self-reflection, update emotion, write to long-term memory

---

## 🛠 Built-in Tools (7 real tools)

| Tool | Purpose | Backend |
| --- | --- | --- |
| `writeFile` | Write to file | `StorageAdapter` real filesystem |
| `readFile` | Read from file | `StorageAdapter` real filesystem |
| `shell` | Run shell command | `child_process` real process |
| `search` | Search long-term memory | `MemoryAdapter.recall` (MiniSearch) |
| `remember` | Write to long-term memory | `MemoryAdapter.remember` |
| `analyze` | Call LLM to analyze text | `LLMAdapter.chat` real LLM |
| `respond` | Call LLM for conversational reply | `LLMAdapter.chat` real LLM |

---

## ✅ Real Interface Verification

```bash
# 1. No key — should not silently fall back, should error
$ node dist/cli/index.js chat
✗ No API key configured for provider "siliconflow".
Run: personal-assistant config set-key siliconflow <YOUR_KEY>
Or set the env var: PERSONAL_ASSISTANT_SILICONFLOW / SILICONFLOW_API_KEY

# 2. Fake key — real HTTP call gets vendor 401
$ SILICONFLOW_API_KEY=sk-fake-key node dist/cli/index.js agent "hi"
📍 execute
  Running step: Generate conversational response
  ✗ LLM request failed (siliconflow): 401 "Api key is invalid"
```

**No mocks, no fake success** — every LLM call is a real `fetch` to the vendor endpoint.

---

## 🏛 Project Structure

```
Personal-Assistant/
├── src/                          # Core (Clean Architecture)
│   ├── adapters/                 # 7 Adapters: LLM/Config/Memory/Storage/Shell/Tools/ToolsRegistry
│   ├── core/                     # Pipeline + EventBus
│   ├── stages/                   # 6 stages: init/understand/plan/execute/validate/reflect
│   ├── ports/                    # 5 interface contracts (Clean Architecture)
│   ├── domain/                   # personality / memory / trust / tool / emotion
│   ├── infrastructure/           # Circuit Breaker (opossum)
│   ├── cli/                      # CLI entry (chat/agent/config)
│   └── __tests__/                # 707 tests (40 files)
├── server/                       # Express backend (14 files)
│   ├── index.ts                  # Entry
│   ├── app.ts                    # 8 API routes + static hosting of frontend/dist
│   ├── providers.ts              # 10 provider metadata
│   ├── session-store.ts          # Chat session persistence
│   ├── tools-setup.ts            # 7 tool registration
│   └── routes/                   # 8 REST/SSE routes
├── frontend/                     # React 18 + TypeScript + Vite + Tailwind
│   ├── src/
│   │   ├── api/                  # fetch client + sseStream()
│   │   ├── stores/               # zustand: theme / config / locale
│   │   ├── i18n/                 # EN/中文 translations
│   │   ├── pages/                # 9 pages
│   │   ├── components/           # 8 UI components + Layout
│   │   ├── types/                # TypeScript types
│   │   └── styles/               # Tailwind + CSS variables
│   └── dist/                     # Build output (served by /server)
├── .github/
│   ├── workflows/ci-cd.yml       # CI/CD (Node 20/22, frontend build)
│   ├── ISSUE_TEMPLATE/           # bug / feature / docs / new_provider
│   ├── PULL_REQUEST_TEMPLATE.md  # PR template
│   ├── CODEOWNERS                # Code review owners
│   ├── dependabot.yml            # Weekly dependency PRs
│   └── FUNDING.yml               # Sponsorship links
├── sdk/                          # Standalone npm SDK (@personal-assistant/sdk)
├── vscode/                       # VS Code extension
├── examples/                     # 9 runnable examples + README
├── docs/                         # ARCHITECTURE / SETUP / TROUBLESHOOTING / DEPLOYMENT / API
├── README.md                     # This file (English)
├── README_zh.md                  # Chinese version
├── CHANGELOG.md                  # Keep-a-Changelog format
├── CONTRIBUTING.md               # How to contribute
├── SECURITY.md                   # Security policy
├── CODE_OF_CONDUCT.md            # Contributor Covenant 2.1
├── LICENSE                       # MIT License
├── .editorconfig                 # Cross-editor config
├── .prettierrc                   # Prettier config
├── .npmignore                    # npm publish filter
├── codecov.yml                   # Codecov config
├── typedoc.json                  # API doc generation
└── package.json                  # Root package
```

---

## 🌍 i18n — EN / 中文

The Web UI ships with first-class internationalization. Click the
globe icon in the header to switch between:

- 🇺🇸 **English** (default, fallback)
- 🇨🇳 **中文** (Simplified Chinese)

The language preference is persisted to `localStorage` and survives page
refreshes. Both languages cover ~190 keys across all 9 pages
(navigation, dashboard, chat, agent, tools, memory, config, graph, settings).

Translation files live in [`frontend/src/i18n/`](frontend/src/i18n/) and
follow the standard i18next JSON format. Adding a new language is a
3-step process:

1. Create `frontend/src/i18n/<code>.json` (copy `en.json` as a starting point)
2. Register it in [`frontend/src/i18n/index.ts`](frontend/src/i18n/index.ts) `SUPPORTED_LANGUAGES` + `resources`
3. Add a tab to the language switcher dropdown in [`Layout.tsx`](frontend/src/components/Layout.tsx)

---

## 💡 Examples

The [`examples/`](examples/) folder contains 9 self-contained, runnable
TypeScript examples. Each is annotated with prerequisites and the exact
`npx tsx` command to run it.

| #   | File                            | What it shows                                                |
| --- | ------------------------------- | ------------------------------------------------------------ |
| 01  | `examples/01-basic-chat.ts`     | One-shot streaming chat with the default provider            |
| 02  | `examples/02-multi-turn.ts`     | Interactive REPL using readline + growing `Message[]` array   |
| 03  | `examples/03-pipeline-run.ts`   | Full 6-stage pipeline with real-time event streaming          |
| 04  | `examples/04-tool-execution.ts` | Invoke all 7 tools directly                                   |
| 05  | `examples/05-memory.ts`         | Add memories, full-text search, tag filter, stats            |
| 06  | `examples/06-custom-provider.ts`| Wire a custom OpenAI-compatible endpoint                     |
| 07  | `examples/07-sdk-quickstart.ts` | Plan-then-execute via the standalone SDK                     |
| 08  | `examples/08-server-api.ts`     | Talk to the running server over REST + SSE                   |
| —   | `examples/language-demo.ts`     | Multi-language UI demo                                       |

See [`examples/README.md`](examples/README.md) for details.

---

## 🚀 Deployment

Ready to ship to a real server? See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
for:

- Recommended architecture (nginx / Caddy reverse proxy + TLS)
- nginx + Caddy configuration snippets
- Dockerfile + `docker-compose.yml`
- systemd unit file with security hardening
- Production security checklist
- Backup & restore procedures

---

## 🛠 Development Commands

```bash
npm install              # Install backend deps
npm run build            # Compile backend (tsc)
npm run server           # Start Express (tsx watch)
npm run web:dev          # Vite frontend dev (HMR, /api proxy → :3000)
npm run web:build        # Frontend production build → frontend/dist
npm run test             # vitest run (40 files / 707 tests)
npm run test:coverage    # Coverage
npm run lint             # ESLint 9.x flat config
npm run format           # Prettier
```

---

## 🔧 Troubleshooting

| Symptom | Cause / Fix |
| --- | --- |
| `No API key configured for provider "..."` | 1) No key set; 2) key name typo (note `PERSONAL_ASSISTANT_<PROVIDER>` uppercase) |
| `LLM request failed (openai): 401` | Invalid or expired key, regenerate in vendor console |
| `LLM request failed (openai): 429` | Rate limit, wait a few seconds or change model |
| `fetch failed` | Sandbox network blocked / proxy unreachable, `curl https://api.openai.com/v1/models` to test |
| `Anthropic request failed: 403` | 1) Wrong key; 2) IP in Anthropic denied region (common in CN) |
| `ollama/lmstudio` unreachable | Local service not started: `ollama serve` or launch LM Studio local server |
| Want to change base URL | Set `<PROVIDER>_BASE_URL` env var |

---

## 🌐 Protocol Details

- **OpenAI-compatible** (7 providers): `POST {base_url}/chat/completions`, `Authorization: Bearer <key>`
- **Anthropic**: `POST {base_url}/v1/messages`, `x-api-key: <key>` + `anthropic-version: 2023-06-01`
- **Google**: `POST {base_url}/models/{model}:generateContent?key=<key>`
- **Baidu**: `POST {base_url}/wenxinworkshop/chat/{model}?access_token=<key>`

All calls go directly to vendors via `fetch` — no proxy, no mocks, no fake data.

---

## 🤝 Contributing

We welcome bug reports, feature requests, documentation fixes, and
new LLM provider / tool adapters. See [`CONTRIBUTING.md`](CONTRIBUTING.md)
for the development workflow, coding style, and PR process. Issues and
PRs should follow the templates in
[`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/) and
[`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).

By participating, you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## 👥 Community

- 💬 [GitHub Discussions](https://github.com/badhope/Personal-Assistant/discussions) — questions, ideas, show & tell
- 🐛 [Issue tracker](https://github.com/badhope/Personal-Assistant/issues) — bug reports & feature requests
- 🔒 [Security advisories](https://github.com/badhope/Personal-Assistant/security/advisories/new) — private vulnerability reports
- 📖 [docs/](docs/) — ARCHITECTURE, SETUP, TROUBLESHOOTING, DEPLOYMENT, API
- 🇨🇳 [README_zh.md](README_zh.md) — Chinese documentation

## ⭐ Show your support

If Personal-Assistant saved you time, **give it a star** ⭐ on GitHub.
It helps others discover the project and motivates continued work.

## 🙏 Acknowledgements

- [Vitest](https://vitest.dev) — blazing-fast test runner
- [MiniSearch](https://lucaong.github.io/minisearch/) — full-text search
- [xstate](https://xstate.js.org) — state machines for the agent
- [opossum](https://nodeshift.dev/opossum/) — circuit breaker
- [i18next](https://www.i18next.com) — internationalization
- [Tailwind CSS](https://tailwindcss.com) — styling
- [shadcn](https://ui.shadcn.com) — UI inspiration
- Every open-source contributor who filed an issue, fixed a typo, or shared feedback

---

## 📄 License

MIT — see [LICENSE](LICENSE). © 2026 Personal-Assistant Contributors.
