# Troubleshooting

Real issues and their real fixes. The CLI is `personal-assistant` (or
`npx tsx src/cli/index.ts` during development); its only subcommands
are `chat`, `agent <task>`, and `config {show,set-key,remove-key,
set-default,providers}`. If a command in older documentation does not
appear here, it does not exist.

For installation steps see [SETUP.md](./SETUP.md); for architecture
see [ARCHITECTURE.md](./ARCHITECTURE.md); for deployment see
[DEPLOYMENT.md](./DEPLOYMENT.md).

## Contents

- [Installation](#installation)
- [LLM providers](#llm-providers)
- [CLI](#cli)
- [Agent pipeline](#agent-pipeline)
- [Backend / Web UI](#backend--web-ui)
- [Shell tool](#shell-tool)
- [Memory](#memory)
- [VS Code extension](#vs-code-extension)
- [Capturing a useful bug report](#capturing-a-useful-bug-report)

## Installation

### `npm install` fails on `keytar`

`keytar` links against the OS keychain. Install the system library
first.

```bash
# Debian / Ubuntu
sudo apt-get install -y libsecret-1-dev

# Fedora / RHEL
sudo dnf install -y libsecret-devel

# macOS — works out of the box (Keychain.app is built in)

# Windows — prebuilt binary is fetched automatically
```

If you cannot install the system library, the secret-storage
infrastructure falls back to a 0600-protected JSON file in
`~/.config/personal-assistant-nodejs/`. This fallback is automatic
but slower; a warning is logged once at startup.

### `npm install` warns about peer dependencies

The project uses `npm install` (no `--legacy-peer-deps` needed). If
your environment forces the flag, the project still builds and tests
pass. The legacy flag is only required if a transitive dependency
declares a peer range that excludes Node 20.

### `tsc` reports `Cannot find module` or `import.meta` errors

You are on Node 18. The project's `engines` field requires
`>=20.0.0 <25.0.0`. Install Node 20+ (or use `.nvmrc`):

```bash
nvm install 22
nvm use
```

## LLM providers

### `No API key configured for provider "openai"`

The CLI checks three sources in this order: environment variable,
keychain, 0600 config file.

```bash
# Persist to disk (0600, never logged)
npx tsx src/cli/index.ts config set-key openai

# Or set the env var for this session only
export OPENAI_API_KEY=sk-...
```

Ollama and LM Studio are exceptions: they do not require an API key,
but the server has to be reachable on `http://localhost:11434` or
`http://localhost:1234` respectively. The CLI will not complain about
a missing key for these two providers.

### `401 Unauthorized` / `403 Forbidden` from the provider

The key is wrong, revoked, or scoped to a different org. Regenerate
it in the provider's dashboard, then re-run:

```bash
npx tsx src/cli/index.ts config set-key openai sk-NEW_KEY
```

### `429 Too Many Requests` / rate limit

The circuit breaker in `src/infrastructure/circuit-breaker.ts` will
back off automatically; just retry after a few seconds. For sustained
load, lower `maxTokens` in the chat config or switch to a model with
a higher RPM quota.

### Provider not in the list

The list of providers is fixed: `openai`, `anthropic`, `google`,
`deepseek`, `siliconflow`, `aliyun`, `zhipu`, `baidu`, `ollama`,
`lmstudio`. If you need another one, add a new case to the dispatch
table in `src/adapters/llm.adapter.ts` and wire it into
`getProviderHelp()` in `src/cli/index.ts`.

### `connect ECONNREFUSED 127.0.0.1:11434` (Ollama)

Ollama is not running. Start it with `ollama serve` (or the desktop
app) and pull a model with `ollama pull llama3.1`.

## CLI

### The `personal-assistant` binary is not found

There are three ways to invoke the CLI:

```bash
# 1. From a build (after `npm run build`)
node dist/cli/index.js chat

# 2. From source via tsx (no build step)
npx tsx src/cli/index.ts chat

# 3. Global install
npm link
personal-assistant chat
```

### `chat` exits immediately with no message

Either the default provider has no key, or the key resolves to a
provider that returns an error. Run `config show` to confirm which
provider is selected, then `config set-key` to fix it.

### I want to use a different model than the default

Pass `--model` to either subcommand:

```bash
npx tsx src/cli/index.ts chat --model claude-3-5-sonnet-latest
npx tsx src/cli/index.ts agent --model deepseek-chat "Refactor src/utils/"
```

If the model name is wrong the provider returns `400 model_not_found`;
the error message from the provider is shown verbatim.

### How do I clear the conversation?

`chat` accepts the slash command `/clear` to drop all messages except
the system prompt. `/exit` (or `/quit`) ends the session. `/emotion`
prints the current emotion state. `/help` lists all of them.

## Agent pipeline

### Pipeline fails at `understand`

The LLM could not classify the task. Usually this means the
intent-prompt is too ambiguous. Try:

- Reword the task with a single, concrete verb
  ("Refactor X to Y", "Add Z to W", "Explain …").
- Pass a model with a larger context window via `--model`.

### Pipeline fails at `plan` with `no plan returned`

Same root cause as above: the LLM produced a response the planner
could not parse. Inspect the raw response by re-running with
`LOG_LEVEL=debug`:

```bash
LOG_LEVEL=debug npx tsx src/cli/index.ts agent "..."
```

### Pipeline fails at `validate`

A tool produced an output that did not pass validation (type-check,
lint, or a tool-level dry run). The stage's error message includes
the file path and the failing check. Re-run the agent with a more
specific instruction, or run the failed check by hand first and
re-run the agent once it is green.

### Pipeline succeeds but no files changed

The plan was a no-op (often because the task was a question, not a
change). Inspect `ctx.createdFiles` and `ctx.modifiedFiles` on the
final result — the CLI prints them, the SSE stream emits them in
the `pipeline-end` event, and the web UI surfaces them on the Agent
page.

## Backend / Web UI

### `EADDRINUSE: address already in use :::3000`

Another process is bound to port 3000. Either stop it or pick a
different port:

```bash
PORT=3100 npm run server
```

If you change the port, update `frontend/vite.config.ts` `server.proxy`
to match, otherwise the SPA will not be able to reach the API.

### Web UI loads but every API call 404s

The Vite dev proxy is misconfigured. Open
`frontend/vite.config.ts` and confirm:

```ts
server: {
  proxy: { '/api': 'http://localhost:3000' },
}
```

The dev server only honours this on restart — `npm run web:dev`
must be relaunched after editing the config.

### `GET /api/health` returns 500

The server is up but an adapter failed to initialise. The most
common cause is a corrupted config file. Move it aside and let the
server recreate it:

```bash
mv ~/.config/personal-assistant-nodejs/config.json{,.bak}
npm run server
```

### SSE stream stalls mid-task

Reverse proxies buffer SSE by default. If you are running behind
nginx, make sure `proxy_buffering off;` and
`proxy_read_timeout 86400;` are set on the location block that
proxies to the backend. See [DEPLOYMENT.md](./DEPLOYMENT.md) for
the full nginx and Caddy snippets.

## Shell tool

### `shell: command timed out after 60000ms`

The default timeout is 60 s. If you need longer, pass the timeout
in the tool call:

```json
{ "command": "npm run build", "timeout": 300000 }
```

There is no global config for the shell timeout; the value is set
per invocation.

### `shell: permission denied for "/etc/passwd"`

The shell adapter runs commands with the current user but does not
elevate. Commands that need root must be run by the user outside
the agent. There is no `sudo` inside the agent.

### `shell: command not allowlisted`

The shell adapter has an optional allow-list read from the config
file (`shell.allowedCommands`). If you set it, only commands that
match the regex are allowed. To inspect the current value, open
`~/.config/personal-assistant-nodejs/config.json` in your editor.

## Memory

### Memory search returns nothing

`memory.search` uses MiniSearch with stemming. Queries that are
single very common words ("the", "a", "to") match too many entries
and are filtered out by the score threshold. Use 2-3 distinctive
words instead.

### Memory file is corrupted

The memory store is JSONL at
`~/.local/share/personal-assistant-nodejs/memory/entries.jsonl`.
If it is corrupted, the adapter falls back to an empty index and
logs a warning. To rebuild:

```bash
rm -rf ~/.local/share/personal-assistant-nodejs/memory
```

You will lose the existing entries; back the directory up first if
you want to keep them.

### Memory grows unbounded

The memory adapter has no automatic eviction. Periodically prune:

```bash
rm ~/.local/share/personal-assistant-nodejs/memory/entries.jsonl
```

Or implement a retention policy in your fork — the `IMemoryPort`
interface in `src/ports/memory.port.ts` is the extension point.

## VS Code extension

### Extension is installed but `Personal Assistant` view is empty

The extension shells out to the CLI. It searches for
`personal-assistant` on `PATH`, then `npx tsx src/cli/index.ts` in
the workspace root. Open a workspace that contains this repo (or
run `npm link` so the binary is on `PATH`) and reload the window.

### `command 'personalAssistant.chat' not found`

The extension did not activate. Check the Output panel:
View → Output → Personal Assistant. The most common cause is a
missing CLI; the second most common is a Node version mismatch.

## Capturing a useful bug report

When opening an issue, include:

```bash
# Personal Assistant version (from package.json, or commit hash)
git rev-parse --short HEAD

# Node / npm / OS
node --version
npm --version
uname -a        # Linux / macOS
systeminfo      # Windows

# Configured providers (keys are redacted)
npx tsx src/cli/index.ts config show

# Failing command, with the env var that enables verbose logs
LOG_LEVEL=debug npx tsx src/cli/index.ts agent "the exact task that fails"
```

`LOG_LEVEL=debug` (accepted values: `trace`, `debug`, `info`, `warn`,
`error`, `fatal`; default `info`) bumps the Pino logger to its
lowest level. Every LLM request, every tool call, and every stage
transition is logged to stderr.

Search existing issues first:
<https://github.com/badhope/Personal-Assistant/issues>.
