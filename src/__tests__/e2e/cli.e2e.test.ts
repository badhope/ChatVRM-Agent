import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { PipelineEngine } from '../../core/pipeline.js';
import { createDefaultStages } from '../../stages/index.js';
import { resetEventBus } from '../../core/event-bus.js';
import type { PipelineContext, PipelineEvents, Stage } from '../../core/types.js';
import type { LLMAdapter } from '../../adapters/llm.adapter.js';
import type { ConfigAdapter } from '../../adapters/config.adapter.js';

const mockLLM = {
  chat: vi.fn().mockResolvedValue({
    content: 'Here is the result of the task.',
    model: 'gpt-4',
    usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
  }),
  stream: vi.fn(),
  listModels: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
} as unknown as LLMAdapter;

const mockConfig = {
  getDefaultProvider: vi.fn().mockReturnValue('openai'),
  getApiKey: vi.fn().mockResolvedValue('sk-mock'),
  setDefaultProvider: vi.fn(),
  getAllConfig: vi.fn().mockReturnValue({ defaultProvider: 'openai' }),
  getChatConfig: vi.fn().mockReturnValue({}),
  getSandboxConfig: vi.fn().mockReturnValue({}),
  getCircuitBreakerConfig: vi.fn().mockReturnValue({}),
  exists: vi.fn().mockResolvedValue(true),
  init: vi.fn().mockResolvedValue(undefined),
  setApiKey: vi.fn().mockResolvedValue(undefined),
  removeApiKey: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigAdapter;

describe('full pipeline: code task', () => {
  let eventBus: EventEmitter<PipelineEvents>;

  beforeEach(() => {
    resetEventBus();
    eventBus = new EventEmitter<PipelineEvents>();
  });

  afterEach(() => {
    resetEventBus();
  });

  it('should complete code task through all stages', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('write a hello world function');

    expect(result).toBeDefined();
    expect(result.errors.filter((e) => !e.recoverable)).toHaveLength(0);
    expect(result.phaseHistory.length).toBe(6);
  });

  it('should have code intent', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('implement a binary search algorithm');

    expect(result.intent).toBe('code');
  });

  it('should generate plan with multiple steps', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('write a class for user authentication');

    expect(result.plan).toBeDefined();
    expect(result.plan!.length).toBeGreaterThan(1);
    expect(result.plan!.every((s) => s.status === 'completed')).toBe(true);
  });

  it('should execute all steps', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('refactor the database module');

    expect(result.results).toBeDefined();
    expect(result.results!.length).toBeGreaterThan(0);
    expect(result.results!.every((r) => r.success)).toBe(true);
  });

  it('should have reflection with lessons learned', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('implement a sorting algorithm');

    expect(result.metadata.reflection).toBeDefined();
    const reflection = result.metadata.reflection as Record<string, unknown>;
    expect(reflection.completedCount).toBeDefined();
    expect(reflection.failedCount).toBe(0);
    expect(reflection.totalSteps).toBeGreaterThan(0);
    expect(Array.isArray(reflection.lessonsLearned)).toBe(true);
  });
});

describe('full pipeline: chat task', () => {
  let eventBus: EventEmitter<PipelineEvents>;

  beforeEach(() => {
    resetEventBus();
    eventBus = new EventEmitter<PipelineEvents>();
  });

  afterEach(() => {
    resetEventBus();
  });

  it('should complete chat task', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('hello, how are you today?');

    expect(result).toBeDefined();
    expect(result.phaseHistory.length).toBe(6);
  });

  it('should have chat intent', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('tell me about the weather');

    expect(result.intent).toBe('chat');
  });

  it('should have single step plan', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('explain how promises work');

    expect(result.plan).toBeDefined();
    expect(result.plan!.length).toBe(1);
  });

  it('should complete without errors', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('hi there');

    const nonRecoverableErrors = result.errors.filter((e) => !e.recoverable);
    expect(nonRecoverableErrors).toHaveLength(0);
  });
});

describe('full pipeline: file operation task', () => {
  let eventBus: EventEmitter<PipelineEvents>;

  beforeEach(() => {
    resetEventBus();
    eventBus = new EventEmitter<PipelineEvents>();
  });

  afterEach(() => {
    resetEventBus();
  });

  it('should complete file operation', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('read the package.json file');

    expect(result).toBeDefined();
    expect(result.phaseHistory.length).toBe(6);
  });

  it('should have file-op intent', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('create a new config file');

    expect(result.intent).toBe('file-op');
  });
});

describe('full pipeline: search task', () => {
  let eventBus: EventEmitter<PipelineEvents>;

  beforeEach(() => {
    resetEventBus();
    eventBus = new EventEmitter<PipelineEvents>();
  });

  afterEach(() => {
    resetEventBus();
  });

  it('should complete search task', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('search for all test files');

    expect(result).toBeDefined();
    expect(result.phaseHistory.length).toBe(6);
  });

  it('should have search intent', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('find the main entry point');

    expect(result.intent).toBe('search');
  });
});

describe('full pipeline: error recovery', () => {
  let eventBus: EventEmitter<PipelineEvents>;

  beforeEach(() => {
    resetEventBus();
    eventBus = new EventEmitter<PipelineEvents>();
  });

  afterEach(() => {
    resetEventBus();
  });

  it('should continue after non-required stage failure', async () => {
    const failingReflectStage: Stage = {
      name: 'reflect',
      required: false,
      async execute(_ctx: PipelineContext): Promise<PipelineContext> {
        throw new Error('Reflection service unavailable');
      },
    };

    const allStages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const stages = [...allStages.slice(0, 5), failingReflectStage];

    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('write a hello function');

    expect(result).toBeDefined();
    expect(result.intent).toBe('code');

    const reflectError = result.errors.find((e) => e.phase === 'reflect');
    expect(reflectError).toBeDefined();
    expect(reflectError!.recoverable).toBe(true);
    expect(reflectError!.message).toBe('Reflection service unavailable');
  });

  it('should collect errors in context', async () => {
    const failingReflectStage: Stage = {
      name: 'reflect',
      required: false,
      async execute(_ctx: PipelineContext): Promise<PipelineContext> {
        throw new Error('Reflection failed');
      },
    };

    const allStages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const stages = [...allStages.slice(0, 5), failingReflectStage];

    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('search for config files');

    expect(result.errors.length).toBeGreaterThan(0);
    const error = result.errors[0];
    expect(error.phase).toBe('reflect');
    expect(error.timestamp).toBeGreaterThan(0);
  });
});

describe('full pipeline: event emission', () => {
  let eventBus: EventEmitter<PipelineEvents>;

  beforeEach(() => {
    resetEventBus();
    eventBus = new EventEmitter<PipelineEvents>();
  });

  afterEach(() => {
    resetEventBus();
  });

  it('should emit pipeline:start', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    let startEmitted = false;

    eventBus.on('pipeline:start', (data) => {
      startEmitted = true;
      expect(data.context).toBeDefined();
      expect(data.context.taskId).toBeDefined();
      expect(data.context.input).toBeDefined();
    });

    const engine = new PipelineEngine({ stages, eventBus });
    await engine.run('write a test function');

    expect(startEmitted).toBe(true);
  });

  it('should emit pipeline:complete', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    let completeEmitted = false;

    eventBus.on('pipeline:complete', (data) => {
      completeEmitted = true;
      expect(data.context).toBeDefined();
      expect(data.totalDurationMs).toBeGreaterThan(0);
    });

    const engine = new PipelineEngine({ stages, eventBus });
    await engine.run('hello world');

    expect(completeEmitted).toBe(true);
  });

  it('should emit stage events for all default stages', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const startedStages: string[] = [];
    const completedStages: string[] = [];

    eventBus.on('stage:start', (data) => {
      startedStages.push(data.stage);
    });
    eventBus.on('stage:complete', (data) => {
      completedStages.push(data.stage);
    });

    const engine = new PipelineEngine({ stages, eventBus });
    await engine.run('implement a binary search');

    const expectedStages = ['initialize', 'understand', 'plan', 'execute', 'validate', 'reflect'];
    expect(startedStages).toEqual(expectedStages);
    expect(completedStages).toEqual(expectedStages);
  });

  it('should emit stage events in correct order', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const orderedEvents: string[] = [];

    eventBus.on('pipeline:start', () => orderedEvents.push('pipeline:start'));
    eventBus.on('stage:start', (data) => orderedEvents.push(`stage:start:${data.stage}`));
    eventBus.on('stage:complete', (data) => orderedEvents.push(`stage:complete:${data.stage}`));
    eventBus.on('pipeline:complete', () => orderedEvents.push('pipeline:complete'));

    const engine = new PipelineEngine({ stages, eventBus });
    await engine.run('search for config');

    expect(orderedEvents[0]).toBe('pipeline:start');
    expect(orderedEvents[orderedEvents.length - 1]).toBe('pipeline:complete');

    const stageNames = ['initialize', 'understand', 'plan', 'execute', 'validate', 'reflect'];
    for (const name of stageNames) {
      const startIdx = orderedEvents.indexOf(`stage:start:${name}`);
      const completeIdx = orderedEvents.indexOf(`stage:complete:${name}`);
      expect(startIdx).toBeGreaterThan(-1);
      expect(completeIdx).toBeGreaterThan(-1);
      expect(startIdx).toBeLessThan(completeIdx);
    }
  });
});

describe('full pipeline: context integrity', () => {
  let eventBus: EventEmitter<PipelineEvents>;

  beforeEach(() => {
    resetEventBus();
    eventBus = new EventEmitter<PipelineEvents>();
  });

  afterEach(() => {
    resetEventBus();
  });

  it('should have taskId set', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('write a utility function');

    expect(result.taskId).toBeDefined();
    expect(typeof result.taskId).toBe('string');
    expect(result.taskId.length).toBeGreaterThan(0);
  });

  it('should have phaseHistory with all stages', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('implement error handling');

    expect(result.phaseHistory.length).toBe(6);

    const phaseNames = result.phaseHistory.map((p) => p.phase);
    expect(phaseNames).toContain('initialize');
    expect(phaseNames).toContain('understand');
    expect(phaseNames).toContain('plan');
    expect(phaseNames).toContain('execute');
    expect(phaseNames).toContain('validate');
    expect(phaseNames).toContain('reflect');

    for (const phase of result.phaseHistory) {
      expect(phase.phase).toBeDefined();
      expect(phase.startTime).toBeGreaterThan(0);
      expect(phase.status).toBe('completed');
    }
  });

  it('should have metadata populated', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const result = await engine.run('tell me about TypeScript');

    expect(result.metadata).toBeDefined();
    expect(result.metadata.startTime).toBeDefined();
    expect(result.metadata.intentConfidence).toBeDefined();
    expect(result.metadata.reflection).toBeDefined();
    expect(result.metadata.validated).toBeDefined();
    expect(result.metadata.validationIssues).toBeDefined();
  });

  it('should have input preserved', async () => {
    const stages = createDefaultStages({ llm: mockLLM, config: mockConfig });
    const engine = new PipelineEngine({ stages, eventBus });

    const input = 'write a class for data processing';
    const result = await engine.run(input);

    expect(result.input).toBe(input);
  });
});