# Personal-Assistant

> **Status: superseded by [`pa-agent`](https://github.com/badhope/pa-agent).**
> This v2 (TypeScript) implementation is kept for reference and remains
> functional, but the active development line is the Python rewrite in
> `pa-agent/`. The two share the same design — three-layer
> local-IO · model-gateway · tool-runtime — but the new project has a
> cleaner pipeline, real SSE streaming, and a Streamlit web UI.
> See the [pa-agent README](https://github.com/badhope/pa-agent/blob/main/README.md) for the current build.

A self-hosted AI agent with a 6-stage pipeline — **understand → plan →
execute → validate → reflect** — wired to real tools and 10 LLM providers.
React web UI + CLI + SDK, all talking to the same core.

I got tired of agent demos where the tool calls were hard-coded mocks.
This one calls real endpoints. If your shell command fails, you see the
real error. If a file write fails, you see the real `EACCES`. No
"success" path that's secretly a stub.

---

## What's in the box

- **6-stage pipeline** with live progress events you can hook a UI onto.
- **10 LLM providers** — OpenAI, Anthropic, Google, DeepSeek, SiliconFlow,
  Aliyun, Zhipu, Baidu, Ollama, LM Studio.
- **7 real tools** — `writeFile`, `readFile`, `shell`, `search`,
  `remember`, `analyze`, `respond`. No mock layer.
- **React web UI** with SSE streaming, 13 pages, a knowledge graph view,
  a personality switcher, an emotion-state panel.
- **CLI** for interactive chat and one-shot agent tasks.
- **SDK** (`@personal-assistant/sdk`) so you can embed the agent in
  your own app without forking the runtime.
- **i18n**: English + Simplified Chinese (348 keys).
- **Clean Architecture**: ports, adapters, pure domain logic. The core
  has zero framework dependencies; the web UI is one adapter among many.

## Quick start

```bash
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant
npm run install:all
# edit .env with your LLM provider key
npm run dev:web      # React UI on :5173
npm run dev:cli      # interactive CLI
```

---

### Key features

- **6-stage pipeline** — understand → plan → execute → validate → reflect, with live progress events
- **10 LLM providers** — OpenAI, Anthropic, Google, DeepSeek, SiliconFlow, Aliyun, Zhipu, Baidu, Ollama, LM Studio
- **7 real tools** — writeFile, readFile, shell, search, remember, analyze, respond
- **React web UI** — 13 pages with SSE streaming, knowledge graph, personality switcher, emotion state
- **CLI** — interactive chat and one-shot agent tasks
- **SDK** — `@personal-assistant/sdk` for embedding in your own app
- **i18n** — English and Simplified Chinese (348 keys)
- **Clean Architecture** — ports, adapters, pure domain logic; the core has zero framework dependencies

---

## Quick start

### Web UI

```bash
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant
npm run install:all
npm run build
npm run web:build
npm run server          # Express on :3000, override with PORT
```

Open http://localhost:3000.

### CLI

```bash
export SILICONFLOW_API_KEY=sk-your-real-key
npx tsx src/cli/index.ts agent "Introduce yourself in one sentence"
```

### Persist API keys

```bash
node dist/cli/index.js config set-key siliconflow sk-your-real-key
node dist/cli/index.js config set-default siliconflow
node dist/cli/index.js chat
```

> **Why `npm run install:all` and not just `npm install`?**
> Root and `frontend/` each have their own `package.json` (this is not a workspaces monorepo). A plain `npm install` at the root gets the CLI and the server but leaves the web UI's `node_modules` empty, so `npm run web:dev` / `npm run web:build` fail with `Cannot find module 'react'`. `install:all` runs both installs.

---

## Web UI pages

| Route | What it does | Backend |
| --- | --- | --- |
| `/dashboard` | Counts: chats, memories, agent runs, provider readiness | `/api/dashboard`, `/api/config/snapshot` |
| `/chat`, `/chat/:id` | Real SSE streaming, 10-model switcher | `/api/chat/stream` (SSE) |
| `/agent` | 6-stage pipeline with live progress | `/api/agent/run` (SSE) |
| `/agents` | Agent management and configuration | `/api/agents` |
| `/tools` | The 7 tools, with execute buttons | `/api/tools`, `/api/tools/execute` |
| `/tool-templates` | Pre-built tool templates for common tasks | `/api/tool-templates` |
| `/memory` | Browse / search / tag-filter / delete / clear long-term memory | `/api/memory/*` |
| `/config` | 10 providers, key management, live connectivity test | `/api/config/*` |
| `/graph` | Canvas 2D force-directed knowledge graph | `/api/graph` |
| `/settings` | 4 personality switcher, emotion state, theme | `/api/personality`, `/api/emotion` |
| `/personality` | Personality configuration and system prompts | `/api/personality` |
| `/emotion` | Emotion state visualization and history | `/api/emotion` |
| `/skills` | Skill management and configuration | `/api/skills` |

---

## LLM providers

The project has no mock layer. When an LLM call fails (401, 403, network error, rate limit), the caller sees the real error — there is no synthetic "success" path that hides it.

| Provider | Type | Default base URL | Default model | Protocol | API key |
| --- | --- | --- | --- | --- | --- |
| `openai` | Cloud | `https://api.openai.com/v1` | `gpt-4o` | OpenAI | Required |
| `anthropic` | Cloud | `https://api.anthropic.com` | `claude-3-5-sonnet-...` | Anthropic | Required |
| `google` | Cloud | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` | Google | Required |
| `deepseek` | Cloud | `https://api.deepseek.com/v1` | `deepseek-chat` | OpenAI-compatible | Required |
| `siliconflow` | Cloud | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | OpenAI-compatible | Required |
| `aliyun` | Cloud | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | OpenAI-compatible | Required |
| `zhipu` | Cloud | `https://open.bigmodel.cn/api/paas/v4` | `glm-4` | OpenAI-compatible | Required |
| `baidu` | Cloud | `https://aip.baidubce.com/rpc/2.0/ai_custom/v1` | `ernie-4.0-8k` | Baidu | Required |
| `ollama` | Local | `http://localhost:11434/v1` | `llama3.2` | OpenAI-compatible | Not needed |
| `lmstudio` | Local | `http://localhost:1234/v1` | `local-model` | OpenAI-compatible | Not needed |

Default: `siliconflow` — Chinese vendor, free tier, ships Qwen2.5 / DeepSeek / GLM.

### Storing keys

```bash
node dist/cli/index.js config set-key <provider> <YOUR_API_KEY>
node dist/cli/index.js config set-default <provider>
node dist/cli/index.js config show
node dist/cli/index.js config providers
```

Keys are stored in `conf` (default `~/.config/personal-assistant-nodejs/config.json`, mode `0600`).

### Env vars win over the store

Lookup order: conf → `PERSONAL_ASSISTANT_<PROVIDER>` → `<PROVIDER>_API_KEY`.

```bash
export OPENAI_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat -p openai

export ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
node dist/cli/index.js agent "Write a quicksort" -p anthropic

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

### Custom base URL (proxy / Azure / self-hosted)

Every provider reads `<PROVIDER>_BASE_URL`:

```bash
# Azure OpenAI
export OPENAI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deploy
export OPENAI_API_KEY=your-azure-key
node dist/cli/index.js chat -p openai -m your-deploy-name

# OpenAI-compatible proxy
export OPENAI_BASE_URL=https://api.your-proxy.com/v1
export OPENAI_API_KEY=sk-proxy
```

All ten: `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` / `GOOGLE_BASE_URL` / `DEEPSEEK_BASE_URL` / `SILICONFLOW_BASE_URL` / `ALIYUN_BASE_URL` / `ZHIPU_BASE_URL` / `BAIDU_BASE_URL` / `OLLAMA_BASE_URL` / `LMSTUDIO_BASE_URL`.

### Local LLMs

```bash
# Ollama
ollama serve &
ollama pull llama3.2
node dist/cli/index.js chat -p ollama -m llama3.2

# LM Studio — start the local server on :1234 first
node dist/cli/index.js chat -p lmstudio
```

---

## CLI commands

```bash
# Interactive multi-turn chat (readline)
node dist/cli/index.js chat [-p provider] [-m model]

# One-shot 6-stage pipeline
node dist/cli/index.js agent "<task>" [-p provider] [-m model]

# Config
node dist/cli/index.js config show
node dist/cli/index.js config set-key <provider> [key]      # reads from stdin if omitted
node dist/cli/index.js config remove-key <provider>
node dist/cli/index.js config set-default <provider>
node dist/cli/index.js config providers
```

---

## Pipeline architecture

Each `agent` task runs these stages in order:

1. **initialize** — set up context (taskId, metadata, error list)
2. **understand** — LLM classifies intent (`chat` / `code` / `analyze` / `refactor` / `shell` / `search`) and scans the workspace
3. **plan** — LLM drafts the step list + tool picks, with a template fallback if the LLM call fails
4. **execute** — invoke the tools step by step
5. **validate** — check syntax, exit codes, file existence
6. **reflect** — self-reflection, emotion update, write to long-term memory

---

## Built-in tools

| Tool | Purpose | Backend |
| --- | --- | --- |
| `writeFile` | Write to file | `StorageAdapter` (real filesystem) |
| `readFile` | Read from file | `StorageAdapter` (real filesystem) |
| `shell` | Run a shell command | `child_process` (real process) |
| `search` | Search long-term memory | `MemoryAdapter.recall` (MiniSearch) |
| `remember` | Write to long-term memory | `MemoryAdapter.remember` |
| `analyze` | LLM analysis of a piece of text | `LLMAdapter.chat` (real LLM) |
| `respond` | LLM conversational reply | `LLMAdapter.chat` (real LLM) |

---

## No mock layer

A couple of sanity checks you can run yourself to confirm nothing is being stubbed:

```bash
# 1. No key — should not silently fall back, should error
$ node dist/cli/index.js chat
✗ No API key configured for provider "siliconflow".
Run: personal-assistant config set-key siliconflow <YOUR_KEY>
Or set the env var: PERSONAL_ASSISTANT_SILICONFLOW / SILICONFLOW_API_KEY

# 2. Fake key — real HTTP call gets a real vendor 401
$ SILICONFLOW_API_KEY=sk-fake-key node dist/cli/index.js agent "hi"
📍 execute
  Running step: Generate conversational response
  ✗ LLM request failed (siliconflow): 401 "Api key is invalid"
```

Every LLM call is a real `fetch` to the vendor's endpoint.

---

## Project structure

```
Personal-Assistant/
├── src/                          # Core (Clean Architecture)
│   ├── adapters/                 # LLM / Config / Memory / Storage / Shell / Tools / Git / Context
│   ├── core/                     # Pipeline + EventBus
│   ├── stages/                   # 6 stages: init / understand / plan / execute / validate / reflect
│   ├── ports/                    # Interface contracts
│   ├── domain/                   # personality / memory / trust / emotion
│   ├── infrastructure/           # Circuit Breaker (opossum), logger, secret storage
│   ├── machines/                 # XState agent FSM
│   ├── cli/                      # CLI entry (chat / agent / config)
│   └── __tests__/                # Unit + integration + e2e tests
├── server/                       # Express backend
│   ├── index.ts                  # Entry
│   ├── app.ts                    # Routes + static hosting of frontend/dist
│   ├── providers.ts              # 10-provider metadata
│   ├── session-store.ts          # Chat session persistence
│   ├── tools-setup.ts            # 7-tool registration
│   └── routes/                   # REST + SSE routes
├── frontend/                     # React 18 + TypeScript + Vite + Tailwind
│   ├── src/
│   │   ├── api/                  # fetch client + sseStream()
│   │   ├── stores/               # zustand: theme / config / locale
│   │   ├── i18n/                 # EN / 中文 translations
│   │   ├── pages/                # 13 pages
│   │   ├── components/           # Layout + UI components
│   │   ├── types/                # TypeScript types
│   │   └── styles/               # Tailwind + CSS variables
│   └── dist/                     # Build output (served by /server)
├── .github/
│   ├── workflows/ci-cd.yml       # CI/CD (Node 20/22, frontend build)
│   ├── ISSUE_TEMPLATE/           # bug / feature / docs / new_provider
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS                # Code review owners
├── sdk/                          # Standalone npm package (@personal-assistant/sdk)
├── docs/                         # ARCHITECTURE / SETUP / TROUBLESHOOTING / DEPLOYMENT / API / SDK
├── README.md                     # English
├── README_zh.md                  # 中文
├── CHANGELOG.md                  # Keep-a-Changelog
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md            # Contributor Covenant 2.1
├── LICENSE                       # MIT
├── .editorconfig
├── .prettierrc
├── .npmignore
├── codecov.yml
├── typedoc.json
└── package.json
```

---

## i18n

The web UI ships in English and Simplified Chinese. The globe icon in the header switches between them; the choice is persisted to `localStorage` and survives page refreshes. Both locales cover the same 348 keys across all 13 pages.

Translation files live in [`frontend/src/i18n/`](frontend/src/i18n/) and follow the standard i18next JSON format. To add a new language:

1. Copy `frontend/src/i18n/en.json` to `frontend/src/i18n/<code>.json` and translate
2. Register it in [`frontend/src/i18n/index.ts`](frontend/src/i18n/index.ts) — `SUPPORTED_LANGUAGES` and `resources`
3. Add a tab to the language switcher in [`Layout.tsx`](frontend/src/components/Layout.tsx)

---

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for:

- Recommended topology (nginx / Caddy reverse proxy + TLS)
- nginx + Caddy config snippets
- Dockerfile + docker-compose
- systemd unit with security hardening
- Production security checklist
- Backup & restore

---

## Development commands

```bash
npm install              # Backend deps
npm run build            # Compile backend (tsc)
npm run server           # Express with tsx watch
npm run web:dev          # Vite frontend (HMR, /api proxy → :3000)
npm run web:build        # Frontend production build
npm test                 # vitest run
npm run test:coverage    # vitest with v8 coverage
npm run lint             # ESLint 9.x flat config
npm run format           # Prettier
npm run verify           # lint + test + tsc + frontend build (CI in a box)
```

---

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `No API key configured for provider "..."` | 1) No key set; 2) key name typo (note `PERSONAL_ASSISTANT_<PROVIDER>` uppercase) |
| `LLM request failed (openai): 401` | Invalid or expired key — regenerate in the vendor console |
| `LLM request failed (openai): 429` | Rate limit — wait a few seconds or switch model |
| `fetch failed` | Network blocked or proxy unreachable — `curl https://api.openai.com/v1/models` to test |
| `Anthropic request failed: 403` | 1) Wrong key; 2) IP in a region Anthropic denies (common in CN) |
| `ollama` / `lmstudio` unreachable | Local service not started — `ollama serve` or launch LM Studio's local server |
| Want to change base URL | Set `<PROVIDER>_BASE_URL` |

---

## Protocol details

- **OpenAI-compatible** (7 providers): `POST {base_url}/chat/completions`, `Authorization: Bearer <key>`
- **Anthropic**: `POST {base_url}/v1/messages`, `x-api-key: <key>` + `anthropic-version: 2023-06-01`
- **Google**: `POST {base_url}/models/{model}:generateContent?key=<key>`
- **Baidu**: `POST {base_url}/wenxinworkshop/chat/{model}?access_token=<key>`

All calls go straight to the vendor via `fetch`.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow. Use the [issue](.github/ISSUE_TEMPLATE/) and [PR](.github/PULL_REQUEST_TEMPLATE.md) templates.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). For security issues, follow [`SECURITY.md`](SECURITY.md) and use [private disclosure](https://github.com/badhope/Personal-Assistant/security/advisories/new) instead of a public issue.

## License

MIT — see [LICENSE](LICENSE).
