# SDK — `@personal-assistant/sdk`

`@personal-assistant/sdk` is a small, dependency-free npm package
that exposes the agent runner and a few standalone utilities
(parser, editor, plugin loader) for embedding Personal Assistant
in third-party applications. The bundled VS Code extension
(`vscode/`) is itself a thin wrapper around it.

The SDK lives in [`sdk/`](../sdk/) and is independently buildable
via `tsc`. It is published to npm with the same version cadence as
the main package.

## What you get

The SDK has seven source files. Each is a focused module; you can
import from the top-level barrel or from a specific subpath.

| File                  | Exports                                                       |
| --------------------- | ------------------------------------------------------------- |
| `sdk/src/index.ts`    | Re-exports every module below                                 |
| `sdk/src/agent.ts`    | `PersonalAssistantAgent`, `runAgent`, `planTask`, `executePlan`, `ContextBuilderWrapper`, `PlanResult`, `ActResult` |
| `sdk/src/parser.ts`   | `PersonalAssistantParser`, `CodeIndexer`, `searchIndex`, `ContextBuilder` |
| `sdk/src/editor.ts`   | `PersonalAssistantEditor`                                      |
| `sdk/src/plugins.ts`  | `PersonalAssistantPlugins`                                     |
| `sdk/src/errors.ts`   | `PersonalAssistantError`, `ValidationError`, `NotFoundError`, `AuthenticationError`, `NetworkError`, `formatError` |
| `sdk/src/types.ts`    | `AgentOptions`, `AgentResult`, `AgentStep`, `ActModeConfig`, `KnowledgeEntry`, `ParseResult`, `Symbol`, `EditOptions`, ... |

The package exposes five sub-paths so a consumer can pull in only
what they need:

```jsonc
// sdk/package.json
"exports": {
  ".":          "...",
  "./agent":    "...",
  "./parser":   "...",
  "./editor":   "...",
  "./plugins":  "..."
}
```

## Quick start

Run a single task through the full agent loop:

```ts
import { runAgent, PersonalAssistantError } from '@personal-assistant/sdk';

const result = await runAgent('Refactor src/utils/strings.ts to use template literals');

console.log({
  success: result.success,
  output: result.output,
  files: result.changedFiles,
  steps: result.steps.length,
  intent: result.intent,
});
```

The free function `runAgent` is a one-liner around the
`PersonalAssistantAgent` class — it constructs an agent with default
options and calls `.run()`. Use the class directly when you need
to register event handlers or stream output.

## Streaming & events

The agent class is an event emitter with three named events:

```ts
import { PersonalAssistantAgent } from '@personal-assistant/sdk';

const agent = new PersonalAssistantAgent({
  model: 'claude-3-5-sonnet',
  temperature: 0.3,
  maxTokens: 2048,
  planFirst: true,        // default true; produces a plan before acting
  autoCheckpoint: true,   // default true; git checkpoint before writes
});

agent.on('step',   (step) => console.log('  ↳', step.description));
agent.on('output', (text) => process.stdout.write(text));
agent.on('error',  (err)  => console.error('  ✗', err.message));

const result = await agent.run('Add user authentication to the auth module');
```

You can change the most common options at runtime via `setModel()`
and `setTemperature()`, or read the current options with
`getOptions()`. To apply a wholesale change, construct a new
agent — instances are cheap.

## Plan / act mode

`PersonalAssistantAgent` exposes the plan-then-act flow as two
separate methods so you can show the plan to a human before
running it:

```ts
const agent = new PersonalAssistantAgent({ model: 'claude-3-5-sonnet' });

// 1. Generate a plan, do not mutate any files
const plan = await agent.plan('Add user authentication');
console.log('Intent:', plan.intent);
console.log('Steps:', plan.steps.length);
console.log('Files to modify:', plan.filesToModify);
console.log('Risks:', plan.risks);

// 2. (Optional) let a human review the plan ...

// 3. Execute it
const act = await agent.execute(plan, {
  autoApprove: false,   // require explicit per-step approval
  dryRun: false,        // when true, only the summary is generated
  enableChangeControl: true,
});

console.log('All succeeded:', act.allSuccess);
console.log('Summary:', act.summary);
console.log('Stats:', act.changeControlStats);
```

The top-level `planTask(input, options?)` and `executePlan(plan,
options?)` helpers wrap this two-step flow.

## Context builder

`agent.contextBuilder` exposes the same context-assembler the
backend uses to feed the LLM (repo map + code index + knowledge
graph). Use it when you want to inspect what the agent will see
before running a task:

```ts
const result = await agent.contextBuilder.build({
  rootDir: './src',
  query: 'authentication logic',
  maxTokens: 8000,
  includeRepoMap: true,
  includeKnowledge: true,
  includeCodeSearch: true,
});

console.log('Context length:', result.context.length, 'chars');
console.log('Repo map included:', result.repoMapIncluded);
console.log('Code entries:', result.codeEntryCount);
```

You can also query the knowledge graph directly:

```ts
const entries = await agent.contextBuilder.queryKnowledge('OAuth');
```

## Error handling

The SDK exports a small error hierarchy so callers can branch on
failure mode without parsing strings:

```ts
import {
  runAgent,
  PersonalAssistantError,   // base class — catch-all
  ValidationError,          // 400
  NotFoundError,            // 404
  AuthenticationError,      // 401
  NetworkError,             // network / DNS / socket failures
  formatError,              // serialise any thrown value
} from '@personal-assistant/sdk';

try {
  await runAgent('…');
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.error('Bad API key — check your provider config');
  } else if (err instanceof NetworkError) {
    console.error('Network failed:', err.details);
  } else if (err instanceof PersonalAssistantError) {
    console.error(`[${err.code}] ${err.message}`);
  } else {
    throw err;
  }
}
```

Every `PersonalAssistantError` carries `code` (string), `statusCode`
(number, `0` for network errors) and an optional `details` object.
`formatError(any)` is a safe way to serialise an unknown thrown
value into `{ code, message, details? }`.

## Standalone utilities

The parser, editor, and plugin modules are useful on their own and
do not require the agent:

```ts
import {
  PersonalAssistantParser,    // parse a file into symbols
  CodeIndexer,                // build a searchable symbol index
  searchIndex,                // query an index
  PersonalAssistantEditor,    // apply search/replace edits safely
  PersonalAssistantPlugins,   // load and validate third-party plugins
} from '@personal-assistant/sdk';
```

See the source for full signatures; the types in `sdk/src/types.ts`
(`ParseResult`, `Symbol`, `EditOptions`, ...) are the contract.

## Versioning

The SDK follows the main package's version. A breaking change in
`@personal-assistant/sdk` ships as a major version bump of the
whole `personal-assistant` monorepo.

## When *not* to use the SDK

- If you only need to run the agent from the command line, use
  `npx tsx src/cli/index.ts agent "…"` — the SDK adds nothing for
  that.
- If you want the web UI, install the server and the frontend
  separately. The SDK is for embedding the agent in another app.
- If you need the seven built-in tools (writeFile, readFile,
  shell, search, remember, analyze, respond), use the CLI. The
  SDK deliberately does not register them — third-party callers
  almost always want to bring their own.

## See also

- [API.md](./API.md) — full type-level reference for ports,
  adapters, events, and the pipeline engine.
- [ARCHITECTURE.md](./ARCHITECTURE.md#sdk) — how the SDK fits into
  the six-layer model.
- [vscode/](../vscode/) — the bundled VS Code extension, which is
  itself a thin wrapper around this SDK.
