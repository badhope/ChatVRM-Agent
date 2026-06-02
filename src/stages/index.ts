import { InitStage } from './init.stage.js';
import { UnderstandStage } from './understand.stage.js';
import { PlanStage } from './plan.stage.js';
import { ExecuteStage } from './execute.stage.js';
import { ValidateStage } from './validate.stage.js';
import { ReflectStage } from './reflect.stage.js';
import type { Stage, PipelineEvents } from '../core/types.js';
import type { LLMAdapter } from '../adapters/llm.adapter.js';
import type { ConfigAdapter } from '../adapters/config.adapter.js';
import type { StorageAdapter } from '../adapters/storage.adapter.js';
import type { MemoryAdapter } from '../adapters/memory.adapter.js';
import type { ShellExecutor } from '../adapters/shell.adapter.js';
import type { ToolsRegistry } from '../adapters/tools.registry.js';
import type { RAGService } from '../domain/memory/rag.service.js';
import { EventEmitter } from 'eventemitter3';

export interface StageDependencies {
  llm: LLMAdapter;
  config: ConfigAdapter;
  storage?: StorageAdapter;
  memory?: MemoryAdapter;
  shell?: ShellExecutor;
  tools?: ToolsRegistry;
  rag?: RAGService;
  eventBus?: EventEmitter<PipelineEvents>;
}

export function createDefaultStages(deps: StageDependencies): Stage[] {
  const bus = deps.eventBus ?? new EventEmitter<PipelineEvents>();
  return [
    new InitStage(bus, deps.config),
    new UnderstandStage(deps.storage ?? null, deps.rag ?? null, deps.llm ?? null, bus),
    new PlanStage(deps.llm, deps.config, bus),
    new ExecuteStage(deps.llm, deps.config, bus, { storage: deps.storage, memory: deps.memory, shell: deps.shell, tools: deps.tools }),
    new ValidateStage(bus),
    new ReflectStage(bus, deps.llm, deps.config, deps.memory),
  ];
}

export { InitStage, UnderstandStage, PlanStage, ExecuteStage, ValidateStage, ReflectStage };