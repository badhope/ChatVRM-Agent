# Setup Guide

This guide walks you from a clean checkout to a running Personal
Assistant — backend, CLI, and web UI.

## Prerequisites

| Tool        | Version                    | Notes                           |
| ----------- | -------------------------- | ------------------------------- |
| **Node.js** | `>=20.0.0 <25.0.0`         | enforced by `engines` in `package.json` |
| **npm**     | 10+ (bundled with Node 20) | Yarn / pnpm work but are untested         |
| **Git**     | 2.30+                      | for the Git adapter and checkpoints       |

`.nvmrc` pins the project to Node 20.20.2. If you use `nvm`:

```bash
nvm install 20.20.2
nvm use
```

## 1. Clone & install

```bash
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant
npm install
```

`npm install` also triggers `husky install` via the `prepare` script,
which wires up the pre-commit hook (Prettier + ESLint on staged files).

## 2. Configure an LLM provider

Personal Assistant ships with **no API keys committed** and no `.env`
file required. Pick one of three ways to provide a key:

```bash
# 1. Interactive prompt (recommended for local dev)
npx tsx src/cli/index.ts config set-key openai

# 2. Pass it as an argument
npx tsx src/cli/index.ts config set-key openai sk-...

# 3. Environment variable (highest priority, never persisted)
export OPENAI_API_KEY=sk-...
```

Keys are stored with 0600 permissions in
`~/.config/personal-assistant-nodejs/config.json` and never logged.
The same file holds your default provider, chat defaults, and the
shell allow-list.

To switch providers, see [README.md → LLM Providers](../README.md#llm-providers).
The list includes OpenAI, Anthropic, Google, DeepSeek, SiliconFlow,
Aliyun, Zhipu, Baidu, Ollama, and LM Studio.

## 3. Start the backend

```bash
npm run server         # tsx watch server/index.ts  →  http://localhost:3000
```

The server reads `PORT` from the environment and falls back to `3000`.
It also serves the built frontend from `frontend/dist` if present.

## 4. Start the web UI

In a second terminal:

```bash
npm run web:dev        # Vite dev server  →  http://localhost:5173
```

Vite proxies `/api/*` to the backend on port 3000, so you do not need
to configure CORS during development.

## 5. (Optional) Build the production bundle

```bash
npm run build          # tsc → dist/         (core + CLI)
npm run web:build      # vite build          →  frontend/dist/
```

After `npm run web:build`, the same `npm run server` process will
serve the SPA from `/` while still exposing `/api/*` for the SPA to
call.

## 6. Run the tests

```bash
npm test               # vitest run   (707 tests across 40 files)
```

The full suite runs in under four seconds on a developer laptop; it
uses in-memory fakes for every port, so no LLM calls and no network.

Targeted runs:

```bash
npm run test:unit        # exclude integration & e2e
npm run test:integration # src/__tests__/integration/**
npm run test:e2e         # src/__tests__/e2e/**
npm run test:watch       # vitest --watch
npm run test:coverage    # v8 coverage report in coverage/
npm run test:ui          # open the Vitest UI
```

## 7. Try the CLI

```bash
# Interactive chat with the default provider
npx tsx src/cli/index.ts chat

# Or run a single task through the 6-stage pipeline
npx tsx src/cli/index.ts agent "Refactor src/adapters/llm.adapter.ts to split the OpenAI provider into its own file"

# See what providers are configured
npx tsx src/cli/index.ts config show
```

`npx tsx` runs the TypeScript entry point directly, so there is no
compilation step. After `npm run build`, the same binary is exposed
as `personal-assistant` via the `bin` field in `package.json`; you
can install it globally with `npm link`.

## Day-to-day workflow

| Task                           | Command                          |
| ------------------------------ | -------------------------------- |
| Re-typecheck on save           | `npm run dev`                    |
| Restart the backend on save    | `npm run server`                 |
| Restart the web UI on save     | `npm run web:dev`                |
| Format all files               | `npm run format`                 |
| Check formatting (CI-friendly) | `npm run format:check`           |
| Lint                           | `npm run lint`                   |
| Auto-fix lint errors           | `npm run lint:fix`               |
| Run the full test suite        | `npm test`                       |
| Generate API reference docs    | `npm run docs`                   |

## Project configuration

| File                  | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `tsconfig.json`       | `ES2022`, `NodeNext`, `strict: true`                 |
| `eslint.config.js`    | Flat-config ESLint 9 with TypeScript-ESLint 8        |
| `.prettierrc`         | `printWidth: 100`, `singleQuote: true`, `semi: true`|
| `.editorconfig`       | LF line endings, UTF-8, 2-space indent              |
| `vitest.config.ts`    | Vitest 3, jsdom for component tests                  |
| `vitest.setup.ts`     | Global test setup (env, time-mocking hooks)         |
| `typedoc.json`        | TypeDoc entrypoints (publishes to GitHub Pages)      |
| `codecov.yml`         | Codecov thresholds and ignore rules                  |
| `husky/` + `.lintstagedrc` | Pre-commit: Prettier + ESLint on staged files   |

There is no `.env.example` in the repository on purpose: every secret
is read at runtime from the OS keychain, a 0600 file, or a per-provider
environment variable. If you find yourself wanting to commit a `.env`,
stop and use `config set-key` instead.

## Common pitfalls

- **`npm install` fails on `keytar`.** Keytar needs `libsecret-1-dev`
  on Debian / Ubuntu. On macOS it builds out of the box; on Windows
  it pulls a prebuilt binary.
- **TypeScript complains about `import.meta`.** You are on Node 18.
  Install Node 20+ or update `engines` deliberately.
- **ESLint reports a missing `eslint.config.js`.** Older versions of
  the project used `.eslintrc.cjs`; the v2.0 setup is the flat config
  only. Don't add an old-style config file.
- **The web UI cannot reach the backend.** Vite's proxy is
  `http://localhost:3000`. If you change `PORT` for the backend,
  update `frontend/vite.config.ts` `server.proxy` too.

## Next steps

- Architecture overview: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Public API: [API.md](./API.md)
- Deploy behind a reverse proxy: [DEPLOYMENT.md](./DEPLOYMENT.md)
- Diagnose runtime issues: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- Decision history: [ADR/](./ADR/)
