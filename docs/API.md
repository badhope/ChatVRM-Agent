# API Reference

Complete reference for the public API. The npm package (`personal-assistant`)
and the SDK (`@personal-assistant/sdk`) both follow the same naming.

## Table of contents

- [Adapters](#adapters)
- [LLM port](#llm-port)
- [Memory port](#memory-port)
- [Config port](#config-port)
- [Tool port](#tool-port)
- [Pipeline engine](#pipeline-engine)
- [Event bus](#event-bus)
- [Server REST API](#server-rest-api)
- [Server SSE streams](#server-sse-streams)

---

## Adapters

```ts
import { createAdapters } from 'personal-assistant';

const {
  llm,        // ILLMPort
  memory,     // IMemoryPort
  config,     // IConfigPort
  tools,      // IToolPort
  // ... see dist/adapters/index.ts for the full list
} = createAdapters();
```

All adapters are stateless singletons — calling `createAdapters()` returns
the same instance per process. Use this in a single Node process. For
multi-process deployments, construct adapters explicitly:

```ts
import { LLMAdapter, ConfigAdapter } from 'personal-assistant';
const llm = new LLMAdapter(new ConfigAdapter());
```

## LLM port

```ts
interface ILLMPort {
  listProviders(): Promise<ProviderMeta[]>;
  stream(messages: Message[], params: ChatParams): AsyncIterable<Chunk>;
  chat(messages: Message[], params: ChatParams): Promise<ChatResponse>;
  countTokens(messages: Message[], provider: ProviderType): Promise<number>;
}
```

### `Message`

```ts
type Message =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'tool';   toolCallId: string; content: string };
```

### `ChatParams`

```ts
interface ChatParams {
  provider: ProviderType;        // 'openai' | 'anthropic' | 'google' | 'deepseek' | 'siliconflow' | 'aliyun' | 'zhipu' | 'baidu' | 'ollama' | 'lmstudio'
  model?: string;               // provider-specific; falls back to default
  temperature?: number;         // 0..2, default 0.7
  maxTokens?: number;           // default 2048
  topP?: number;                // default 1
  stop?: string[];              // stop sequences
  tools?: ToolSpec[];           // function-calling schema
  signal?: AbortSignal;         // cancellation
}
```

### `Chunk`

```ts
interface Chunk {
  content: string;     // incremental text
  done: boolean;       // true on the final chunk
  toolCall?: ToolCall; // present on function-call deltas
  usage?: {            // present on the final chunk
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

## Memory port

```ts
interface IMemoryPort {
  add(content: string, opts?: { tags?: string[]; importance?: number; metadata?: Record<string, unknown> }): Promise<string>;
  get(id: string): Promise<MemoryEntry | null>;
  search(query: string, opts?: { limit?: number; tags?: string[]; threshold?: number }): Promise<Array<{ record: MemoryEntry; score: number }>>;
  list(opts?: { tags?: string[]; limit?: number; offset?: number }): Promise<MemoryEntry[]>;
  forget(id: string): Promise<boolean>;
  clear(): Promise<void>;
  stats(): Promise<{ count: number; totalTokens: number; avgImportance: number; byTag: Record<string, number> }>;
}
```

### `MemoryEntry`

```ts
interface MemoryEntry {
  id: string;
  content: string;          // primary text
  tags: string[];           // for filtering
  importance: number;       // 0..10
  tokens: number;           // estimated token count
  createdAt: string;        // ISO 8601
  metadata?: Record<string, unknown>;
}
```

## Config port

```ts
interface IConfigPort {
  get<K extends keyof Config>(key: K): Promise<Config[K]>;
  set<K extends keyof Config>(key: K, value: Config[K]): Promise<void>;
  getDefaultProvider(): Promise<ProviderType>;
  setDefaultProvider(p: ProviderType): Promise<void>;
  getProviderKey(p: ProviderType): Promise<string | undefined>;
  setProviderKey(p: ProviderType, key: string): Promise<void>;
  removeProviderKey(p: ProviderType): Promise<void>;
  getChatConfig(): Promise<ChatConfig>;
  setChatConfig(c: Partial<ChatConfig>): Promise<void>;
}
```

## Tool port

```ts
interface IToolPort {
  list(): Promise<ToolMeta[]>;
  invoke(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}
```

### `ToolResult`

```ts
interface ToolResult {
  success: boolean;
  toolName: string;
  output?: unknown;
  error?: string;
  durationMs: number;
  durationMsRecorded: boolean;
}
```

## Pipeline engine

```ts
import { PipelineEngine, createEventBus, AgentMachine } from 'personal-assistant';

const engine = new PipelineEngine({
  adapters: createAdapters(),
  eventBus: createEventBus(),
  machine: new AgentMachine(),
});

const result = await engine.run('Write a Python function that counts lines', {
  cwd: process.cwd(),
  provider: 'siliconflow',
});

console.log(result); // { success, failed?, error?, createdFiles, modifiedFiles, steps, ... }
```

## Event bus

The engine emits strongly-typed events. Subscribe to react to a running
task in real time:

```ts
const bus = createEventBus();
bus.on('stage',     (e) => console.log(`stage ${e.stage} → ${e.status}`));
bus.on('understand',(e) => console.log(`intent: ${e.intent}`));
bus.on('plan',      (e) => console.log(`${e.steps.length} steps`));
bus.on('step',      (e) => console.log(`step ${e.step.id} → ${e.status}`));
bus.on('error',     (e) => console.error(e.message));
bus.on('pipeline-end', (e) => console.log(e.success ? 'OK' : `FAILED @ ${e.failed}`));
```

## Server REST API

| Method | Path                          | Description                          |
| ------ | ----------------------------- | ------------------------------------ |
| GET    | `/api/health`                 | Liveness probe                        |
| GET    | `/api/dashboard`              | Aggregated stats                      |
| GET    | `/api/config/snapshot`        | Current config                        |
| GET    | `/api/config/providers`       | All provider metadata                 |
| POST   | `/api/config/set-key`         | Set API key (body: `{provider, key}`) |
| POST   | `/api/config/remove-key`      | Remove API key                        |
| POST   | `/api/config/set-default`     | Set default provider                  |
| POST   | `/api/config/set-chat-config` | Set chat defaults                     |
| POST   | `/api/config/test-message`    | Test a provider (real LLM call)       |
| GET    | `/api/tools`                  | List tools                            |
| POST   | `/api/tools/execute`          | Execute a tool                        |
| GET    | `/api/memory`                 | Search / list memories                |
| DELETE | `/api/memory/:id`             | Delete a single memory                |
| POST   | `/api/memory/clear`           | Clear all memories                    |
| GET    | `/api/graph`                  | Knowledge graph (nodes + edges)       |
| GET    | `/api/emotion`                | Current emotion state                 |
| POST   | `/api/personality`            | Switch personality                    |
| GET    | `/api/personality/list`       | List available personalities          |
| POST   | `/api/chat/stream`            | SSE stream of a chat completion       |
| POST   | `/api/agent/run`              | SSE stream of a 6-stage pipeline run  |

See [examples/08-server-api.ts](../examples/08-server-api.ts) for a working client.

## Server SSE streams

`/api/chat/stream` and `/api/agent/run` emit Server-Sent Events. Each frame
follows the standard `event: <name>\ndata: <json>\n\n` shape.

**Chat events**

| Event          | Data                                                |
| -------------- | --------------------------------------------------- |
| `session`      | `{ id, title }` (only on first message of a session) |
| `chunk`        | `{ content, done }`                                 |
| `tool_call`    | `{ name, args }` (function calling deltas)           |
| `assistant-end`| `{}` (end of stream)                                |
| `error`        | `{ message }`                                       |

**Agent events**

| Event          | Data                                                                |
| -------------- | ------------------------------------------------------------------- |
| `stage`        | `{ stage, status }` (status: pending / running / done / failed)     |
| `understand`   | `{ intent, confidence }`                                            |
| `plan`         | `{ steps: PlanStep[] }`                                             |
| `workspace`    | `{ files: string[] }`                                               |
| `step`         | `{ step, status, result }`                                          |
| `pipeline-end` | `{ success, failed?, error?, createdFiles, modifiedFiles }`         |
| `error`        | `{ message }`                                                       |

---

For the full TypeDoc-generated reference, see the
[GitHub Pages docs site](https://badhope.github.io/Personal-Assistant/).
