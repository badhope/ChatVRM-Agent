# Examples

Working, runnable examples that demonstrate how to use Personal-Assistant
from different angles. Each file is self-contained and can be run with:

```bash
npx tsx examples/<filename>
```

| #   | File                       | What it shows                                                                  |
| --- | -------------------------- | ------------------------------------------------------------------------------ |
| 01  | [01-basic-chat.ts](01-basic-chat.ts)             | One-shot chat to the configured default provider with streaming               |
| 02  | [02-multi-turn.ts](02-multi-turn.ts)             | Interactive REPL using a `readline` loop and a growing `Message[]` array     |
| 03  | [03-pipeline-run.ts](03-pipeline-run.ts)         | Full 6-stage Pipeline with real-time event streaming from the event bus       |
| 04  | [04-tool-execution.ts](04-tool-execution.ts)     | Invoke all 7 tools directly (`writeFile`, `readFile`, `shell`, `search`, …)   |
| 05  | [05-memory.ts](05-memory.ts)                     | Add memories, full-text search, tag filter, and stats                         |
| 06  | [06-custom-provider.ts](06-custom-provider.ts)   | Wire a custom OpenAI-compatible endpoint (HuggingFace, Groq, Together, …)     |
| 07  | [07-sdk-quickstart.ts](07-sdk-quickstart.ts)     | Plan-then-execute workflow via the standalone SDK                             |
| 08  | [08-server-api.ts](08-server-api.ts)             | Talk to the running server (`npm run dev:server`) over REST + SSE              |
| —   | [language-demo.ts](language-demo.ts)             | Multi-language UI demo (EN / 中文 / Español / …)                              |

## Prerequisites

Most examples expect that you have either:

1. **Configured a provider + API key** in the Web UI (recommended):
   ```bash
   npm run dev               # open http://localhost:5173 → Config page
   ```
2. **Or set an environment variable** for at least one provider:
   ```bash
   export OPENAI_API_KEY=sk-...
   export ANTHROPIC_API_KEY=sk-ant-...
   export SILICONFLOW_API_KEY=sk-...
   ```

Examples 04 (tools) and 05 (memory) work **without any LLM** because they
exercise local adapters only.

## Build before running

Some examples import from `../dist/`. Build the project first:

```bash
npm run build
```

Or run a TypeScript file directly with `tsx`:

```bash
npx tsx examples/01-basic-chat.ts
```

## Adding a new example

1. Create `examples/09-my-thing.ts` and copy the header comment from any
   existing example.
2. Use ESM imports (`import { ... } from '../dist/...'`).
3. Add a row to the table above.
4. Make it self-contained — no manual setup required beyond the API key.
