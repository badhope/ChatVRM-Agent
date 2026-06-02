export { ConfigAdapter } from './config.adapter.js';
export { LLMAdapter } from './llm.adapter.js';
export { StorageAdapter } from './storage.adapter.js';
export { MemoryAdapter } from './memory.adapter.js';
export { GitAdapter } from './git.adapter.js';
export { ShellExecutor } from './shell.adapter.js';
export { ContextBuilder } from './context.builder.js';
export { ToolsRegistry } from './tools.registry.js';

import type { IConfigPort } from '../ports/config.port.js';
import type { ILLMPort } from '../ports/llm.port.js';
import type { IStoragePort } from '../ports/storage.port.js';
import type { IMemoryPort } from '../ports/memory.port.js';
import type { IGitPort } from '../ports/git.port.js';
import type { IShellPort } from '../ports/shell.port.js';
import type { IContextPort } from '../ports/context.port.js';
import type { IToolsPort } from '../ports/tools.port.js';
import { ConfigAdapter } from './config.adapter.js';
import { LLMAdapter } from './llm.adapter.js';
import { StorageAdapter } from './storage.adapter.js';
import { MemoryAdapter } from './memory.adapter.js';
import { GitAdapter } from './git.adapter.js';
import { ShellExecutor } from './shell.adapter.js';
import { ContextBuilder } from './context.builder.js';
import { ToolsRegistry } from './tools.registry.js';

export interface Adapters {
  config: IConfigPort;
  llm: ILLMPort;
  storage: IStoragePort;
  memory: IMemoryPort;
  git: IGitPort;
  shell: IShellPort;
  context: IContextPort;
  tools: IToolsPort;
}

export function createAdapters(): Adapters {
  const config = new ConfigAdapter();
  const llm = new LLMAdapter(config);
  const storage = new StorageAdapter();
  const memory = new MemoryAdapter();
  const git = new GitAdapter();
  const shell = new ShellExecutor();
  const context = new ContextBuilder(storage);
  const tools = new ToolsRegistry();

  return { config, llm, storage, memory, git, shell, context, tools };
}

export function createConfigAdapter(): IConfigPort {
  return new ConfigAdapter();
}

export function createLLMAdapter(configAdapter: IConfigPort): ILLMPort {
  return new LLMAdapter(configAdapter);
}

export function createStorageAdapter(): IStoragePort {
  return new StorageAdapter();
}

export function createMemoryAdapter(): IMemoryPort {
  return new MemoryAdapter();
}

export function createGitAdapter(): IGitPort {
  return new GitAdapter();
}

export function createShellAdapter(): IShellPort {
  return new ShellExecutor();
}

export function createContextAdapter(storage: IStoragePort): IContextPort {
  return new ContextBuilder(storage);
}

export function createToolsAdapter(): IToolsPort {
  return new ToolsRegistry();
}