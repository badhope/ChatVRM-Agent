# @devflow/sdk

Programmatic API for DevFlow Agent.

## Installation

```bash
npm install @devflow/sdk
```

## Quick Start

```typescript
import { runAgent, parseFile, generateRepoMap, DevFlowError } from '@devflow/sdk';

// Run agent
const result = await runAgent('Add error handling to the auth module');
console.log(result.output);

// Parse a file
const parsed = await parseFile('./src/auth.ts');
console.log(parsed.symbols);

// Generate repo map
const map = await generateRepoMap('./src');
console.log(map);

// Handle errors
try {
  await runAgent('Do something');
} catch (error) {
  if (error instanceof DevFlowError) {
    console.error(`[${error.code}] ${error.message}`);
  }
}
```

## API Reference

### Agent

The `DevFlowAgent` class provides full control over agent execution.

```typescript
import { DevFlowAgent } from '@devflow/sdk/agent';

const agent = new DevFlowAgent({
  model: 'claude-3-5-sonnet',
  temperature: 0.3,
  autoCheckpoint: true
});

// Listen to events
agent.on('step', (step) => {
  console.log(`Step ${step.id}: ${step.description}`);
});

agent.on('output', (text) => {
  console.log(text);
});

// Run a task
const result = await agent.run('Refactor the database module');

if (result.success) {
  console.log('Task completed successfully');
  console.log('Changed files:', result.changedFiles);
} else {
  console.error('Task failed:', result.output);
}
```

#### Plan and Execute Mode

The SDK supports a two-phase workflow inspired by Cline's Plan/Act mode:

```typescript
// Phase 1: Plan (read-only, generates execution plan)
const plan = await agent.plan('Add user authentication', { rootDir: './src' });
console.log('Planned steps:', plan.steps.length);
console.log('Files to modify:', plan.filesToModify);
console.log('Risks:', plan.risks);

// Phase 2: Execute (runs the plan with full permissions)
const result = await agent.execute(plan, { autoApprove: false });
console.log('Summary:', result.summary);
console.log('All steps succeeded:', result.allSuccess);
```

#### Agent Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | `'claude-3-5-sonnet'` | LLM model to use |
| `temperature` | `number` | `0.3` | Generation temperature (0-1) |
| `maxTokens` | `number` | `2048` | Maximum response tokens |
| `planFirst` | `boolean` | `true` | Plan before executing |
| `autoCheckpoint` | `boolean` | `true` | Create git checkpoints |
| `onStep` | `function` | - | Step progress callback |
| `onOutput` | `function` | - | Output text callback |

#### Convenience Functions

```typescript
import { runAgent, planTask, executePlan } from '@devflow/sdk';

// Run agent
const result = await runAgent('Add tests for the API module', {
  model: 'gpt-4',
  temperature: 0.5
});

// Plan task
const plan = await planTask('Add user authentication', { rootDir: './src' });

// Execute plan
const result = await executePlan(plan, { autoApprove: true });
```

### Context Builder

The `ContextBuilder` class builds comprehensive context for the agent by combining:
- **Repo Map**: Codebase structure overview
- **Code Index**: Searchable symbol index
- **Knowledge Graph**: Prior context from memory

```typescript
import { ContextBuilder } from '@devflow/sdk/parser';

const builder = new ContextBuilder();
const result = await builder.build({
  rootDir: './src',
  query: 'user authentication',
  maxTokens: 8000,
  includeRepoMap: true,
  includeKnowledge: true,
  includeCodeSearch: true
});

console.log('Context:', result.context);
console.log('Repo map included:', result.repoMapIncluded);
console.log('Code entries found:', result.codeEntryCount);
console.log('Knowledge entries found:', result.knowledgeEntryCount);
```

Or via the agent:

```typescript
const agent = new DevFlowAgent();
const result = await agent.contextBuilder.build({
  rootDir: './src',
  query: 'authentication'
});
```

### Code Indexing

Build a searchable index of code symbols:

```typescript
import { buildCodeIndex, searchIndex, CodeIndexer } from '@devflow/sdk/parser';

// Build an index
const index = await buildCodeIndex('./src');

// Search the index
const results = searchIndex(index, 'authentication', { maxResults: 10 });
results.forEach(r => console.log(`${r.name} - ${r.filePath}`));

// Or use the class API
const index = await CodeIndexer.build('./src');
```

### Parser

The `DevFlowParser` class provides code parsing and analysis.

```typescript
import { DevFlowParser } from '@devflow/sdk/parser';

const parser = new DevFlowParser();

// Parse a file
const result = await parser.parseFile('./src/app.ts');
console.log(`Language: ${result.language}`);
console.log(`Symbols: ${result.symbols.length}`);
console.log(`Tokens: ${result.tokens}`);

// Parse source code directly
const parsed = await parser.parseSource(
  'function hello() { return "world"; }',
  'typescript'
);

// Generate repo map for context
const map = await parser.generateRepoMap('./src', {
  maxTokens: 4096,
  excludePatterns: ['**/*.test.ts']
});
```

#### Symbol Types

```typescript
interface Symbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'method' | 'variable' | 'type' | 'enum';
  startLine: number;
  endLine: number;
  signature?: string;
  parent?: string;
}
```

### Editor

The `DevFlowEditor` class provides code editing capabilities using the SEARCH/REPLACE pattern.

```typescript
import { DevFlowEditor } from '@devflow/sdk/editor';

const editor = new DevFlowEditor();

// Single edit
const result = await editor.edit({
  filePath: './src/app.ts',
  search: 'function oldName()',
  replace: 'function newName()'
});

if (result.success) {
  console.log('Edit applied');
  console.log('Diff:', result.diff);
}

// Multiple edits
const results = await editor.applyEdits([
  { filePath: './src/a.ts', search: 'foo', replace: 'bar' },
  { filePath: './src/b.ts', search: 'baz', replace: 'qux' }
]);

// Locate a symbol
const location = await editor.locateSymbol('./src/app.ts', 'myFunction');
if (location) {
  console.log(`Found at line ${location.line}, column ${location.column}`);
}

// Find all references
const refs = await editor.findReferences('myFunction', './src');
refs.forEach(ref => {
  console.log(`${ref.filePath}:${ref.line}`);
});
```

### Plugins

The `DevFlowPlugins` class manages plugins and MCP servers.

```typescript
import { DevFlowPlugins } from '@devflow/sdk/plugins';

const plugins = new DevFlowPlugins();

// List plugins
const list = await plugins.list();
list.forEach(p => {
  console.log(`${p.name} (${p.version}): ${p.enabled ? 'enabled' : 'disabled'}`);
});

// Enable/disable plugins
await plugins.enable('my-plugin');
await plugins.disable('other-plugin');

// List MCP servers
const mcpServers = await plugins.listMCP();
mcpServers.forEach(s => {
  console.log(`${s.name}: ${s.tools.length} tools`);
});
```

### Error Handling

The SDK provides unified error types that correspond to the backend:

```typescript
import { DevFlowError, ValidationError, NotFoundError, AuthenticationError, NetworkError, formatError } from '@devflow/sdk';

try {
  await agent.run('Do something');
} catch (error) {
  // Check error type
  if (error instanceof DevFlowError) {
    console.error(`[${error.code}] ${error.message}`);
    console.error(`Status: ${error.statusCode}`);
    if (error.details) {
      console.error('Details:', error.details);
    }
  }

  // Or use formatError for a simple object
  const { code, message, details } = formatError(error);
  console.error(`[${code}] ${message}`);
}

// Specific error types
try {
  // validation operation
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.details);
  }
}

try {
  await agent.run('Access resource');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error('Resource not found');
  }
}

try {
  await agent.run('API call');
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Please authenticate');
  }
}

try {
  await agent.run('Network operation');
} catch (error) {
  if (error instanceof NetworkError) {
    console.error('Network error:', error.details);
  }
}
```

## Events

The agent emits events during execution:

```typescript
agent.on('step', (step: AgentStep) => {
  // step.id - Step number
  // step.description - What the step does
  // step.tool - Tool being used (if any)
  // step.status - 'pending' | 'running' | 'done' | 'error' | 'skipped'
  // step.result - Output (if completed)
  // step.error - Error message (if failed)
});

agent.on('output', (text: string) => {
  // Console output from the agent
});

agent.on('error', (error: Error) => {
  // Error occurred
});
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type {
  AgentOptions,
  AgentResult,
  AgentStep,
  ParseResult,
  Symbol,
  EditOptions,
  PluginInfo,
  PlanResult,
  ActResult,
  ContextBuilderOptions,
  ContextBuildResult,
  KnowledgeEntry,
  ChangeControlStats,
  ApiResponse
} from '@devflow/sdk';
```

### New Types Added

- **PlanResult**: Result from plan mode with steps, files, risks
- **ActResult**: Result from act mode execution
- **ContextBuilderOptions**: Options for building context
- **ContextBuildResult**: Result of context building
- **KnowledgeEntry**: Entry from the knowledge graph
- **ChangeControlStats**: Statistics from change control
- **ApiResponse**: Standard API response wrapper
- **DevFlowError**: Base error class (re-exported from errors)

## License

MIT
