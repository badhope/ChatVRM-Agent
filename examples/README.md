# Examples

Runnable scripts that show how to use Personal-Assistant from the
CLI, the SDK, or the server's HTTP API. Each file is self-contained;
run with `npx tsx examples/<filename>`.

| File                       | What it shows                                                |
| -------------------------- | ------------------------------------------------------------ |
| [01-basic-chat.ts](01-basic-chat.ts)    | One-shot streaming chat with the default provider            |
| [02-multi-turn.ts](02-multi-turn.ts)    | Interactive REPL that grows a `Message[]` history            |
| [03-pipeline-run.ts](03-pipeline-run.ts)| 6-stage pipeline with live event bus                         |
| [04-tool-execution.ts](04-tool-execution.ts) | Invoke all 7 tools directly, no LLM                      |
| [05-memory.ts](05-memory.ts)            | Add memories, full-text search, tag filter                   |
| [06-sdk-quickstart.ts](06-sdk-quickstart.ts) | Plan-then-execute via the standalone SDK                 |
| [07-server-api.ts](07-server-api.ts)    | Talk to the running server over REST + SSE                   |

## Prerequisites

Configure a provider + API key — either via the Web UI Config page or
an env var like `OPENAI_API_KEY`. Examples 04 (tools) and 05 (memory)
work without any LLM because they only touch local adapters.

## Build

Some examples import from `../dist/`. Build the project first:

```bash
npm run build
```

## Adding a new example

Keep it self-contained. Don't add numbered "step 1 / step 2" comments
inside the script — the file's top-of-file JSDoc is the only header
it should need.
