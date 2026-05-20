/**
 * Agent Core 模块单元测试
 *
 * 测试覆盖：
 * - State Machine: 状态转换、历史记录、终止状态检查
 * - Response Parser: JSON提取、工具调用解析、意图识别
 * - Tool Executor: 工具执行、结果格式化、确认检查
 * - Agent Executor: 初始化、任务执行、错误处理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== Mocks (必须在导入之前) ====================

// Mock tool registry for response-parser
vi.mock('../tools/registry.js', () => ({
  toolRegistry: {
    has: vi.fn((name: string) => ['read_file', 'write_file', 'run_command', 'search', 'test'].includes(name)),
    keys: vi.fn(() => ['read_file', 'write_file', 'run_command', 'search', 'test']),
    toolsMap: {
      keys: vi.fn(() => ['read_file', 'write_file', 'run_command', 'search', 'test']),
    },
  },
}));

// Mock all external dependencies for AgentExecutor
vi.mock('./tools/registry.js', () => ({
  toolRegistry: {
    has: vi.fn(() => true),
    keys: vi.fn(() => ['read_file', 'write_file', 'run_command']),
    get: vi.fn(),
    toolsMap: {
      keys: vi.fn(() => ['read_file', 'write_file', 'run_command']),
    },
  },
}));

vi.mock('./memory/manager.js', () => ({
  memoryManager: {
    rememberChat: vi.fn(() => Promise.resolve()),
    loadAllRecords: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('./memory/knowledgeGraph.js', () => ({
  KnowledgeGraph: vi.fn().mockImplementation(() => ({
    init: vi.fn(() => Promise.resolve()),
    extractFromMemory: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('./reasoner.js', () => ({
  reasonWithSelfCorrection: vi.fn(() => Promise.resolve({ content: '推理结果', corrections: 0 })),
  reasonStep: vi.fn(() => Promise.resolve('推理结果')),
}));

vi.mock('./decision-reflector.js', () => ({
  DecisionReflector: vi.fn().mockImplementation(() => ({
    load: vi.fn(() => Promise.resolve()),
    save: vi.fn(() => Promise.resolve()),
    recordDecision: vi.fn(() => Promise.resolve('decision-id')),
    recordOutcome: vi.fn(() => Promise.resolve()),
    reflectOnTask: vi.fn(() => Promise.resolve({ improvements: [], failures: [], successes: [], overallRating: 0.8 })),
    generateImprovementReport: vi.fn(() => Promise.resolve(null)),
    learnFromExperience: vi.fn(() => Promise.resolve([])),
    getDecisionsByTask: vi.fn(() => Promise.resolve([])),
  })),
}));

vi.mock('./trust.js', () => ({
  detectIssues: vi.fn(() => []),
  generateTrustReport: vi.fn(() => ({ requiresConfirmation: false, issues: [], summary: '', overallLevel: 'safe' })),
  askUserConfirmation: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('./context-manager.js', () => ({
  ContextManager: vi.fn().mockImplementation(() => ({
    addToolResult: vi.fn(() => Promise.resolve()),
    getContext: vi.fn(() => []),
  })),
}));

vi.mock('./context-builder.js', () => ({
  ContextBuilder: vi.fn().mockImplementation(() => ({
    build: vi.fn(() => Promise.resolve({ context: '', repoMapIncluded: false, codeEntryCount: 0, knowledgeEntryCount: 0 })),
    queryKnowledgeGraph: vi.fn(() => Promise.resolve([])),
  })),
}));

vi.mock('./change-control.js', () => ({
  ChangeControlManager: vi.fn().mockImplementation(() => ({
    setEnabled: vi.fn(),
    executeProtectedChange: vi.fn((_, __, fn) => fn()),
  })),
}));

vi.mock('./git/index.js', () => ({
  DirtyProtect: vi.fn().mockImplementation(() => ({})),
  AutoCommitEngine: vi.fn().mockImplementation(() => ({
    autoCommit: vi.fn(() => Promise.resolve({ success: false, message: '' })),
  })),
  CheckpointManager: vi.fn().mockImplementation(() => ({
    create: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('./services/logger.js', () => ({
  agentLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./experience-store.js', () => ({
  ExperienceStore: vi.fn().mockImplementation(() => ({
    load: vi.fn(() => Promise.resolve()),
    addExperience: vi.fn(() => Promise.resolve()),
    generateBehaviorGuidelines: vi.fn(() => Promise.resolve('')),
    getExperienceCount: vi.fn(() => 0),
  })),
}));

vi.mock('./personality.js', () => ({
  PersonalityManager: vi.fn().mockImplementation(() => ({
    load: vi.fn(() => Promise.resolve()),
    save: vi.fn(() => Promise.resolve()),
    incrementInteractions: vi.fn(),
    getPersonalityPrompt: vi.fn(() => ''),
  })),
}));

vi.mock('./emotional-state.js', () => ({
  EmotionalStateManager: vi.fn().mockImplementation(() => ({
    decay: vi.fn(),
    onTaskSuccess: vi.fn(),
    onTaskFailure: vi.fn(),
    getEmotionalContext: vi.fn(() => ''),
  })),
}));

vi.mock('./config/project-config.js', () => ({
  projectConfigLoader: {
    getProjectInstructions: vi.fn(() => Promise.resolve('')),
  },
}));

vi.mock('./intent-recognizer.js', () => ({
  intentRecognizer: {
    recognizeSync: vi.fn(() => ({ intent: 'general', confidence: 0.5 })),
  },
}));

vi.mock('./task-planner.js', () => ({
  planTask: vi.fn(() => Promise.resolve([
    { id: 1, description: '步骤1', status: 'pending' },
    { id: 2, description: '步骤2', status: 'pending' },
  ])),
}));

vi.mock('./agent-utils.js', () => ({
  generateSummary: vi.fn(() => '任务摘要'),
  parseToolArgsFromAI: vi.fn(() => ({})),
}));

vi.mock('./step-executor.js', () => ({
  executeStep: vi.fn(() => Promise.resolve({ success: true, output: '执行结果' })),
}));

// ==================== Imports ====================

import {
  AgentStateMachine,
  createStateMachine,
  isValidTransition,
  getPhaseDisplayName,
} from './core/state-machine.js';
import { ExecutionPhase } from './core/types.js';
import {
  extractJsonBlock,
  extractJsonObject,
  parseToolCall,
  parseMultipleToolCalls,
  extractReasoning,
  extractSteps,
  parseIntent,
  parseConfidence,
  safeJsonParse,
  validateResponseFields,
  extractCodeBlock,
} from './core/response-parser.js';
import {
  formatToolResult,
  requiresConfirmation,
  isStepTimeout,
  getRemainingTime,
} from './core/tool-executor.js';
import { AgentExecutor, runAgentTask } from './core.js';
import type { ToolResult, StepExecutionContext, TaskStep } from './core/types.js';

// ==================== State Machine Tests ====================

describe('AgentStateMachine', () => {
  let stateMachine: AgentStateMachine;
  const taskId = 'test-task-123';

  beforeEach(() => {
    stateMachine = createStateMachine(taskId);
  });

  describe('初始状态', () => {
    it('初始状态应该是 initializing', () => {
      expect(stateMachine.getCurrentPhase()).toBe(ExecutionPhase.INITIALIZING);
    });

    it('初始状态显示名称应该是"初始化"', () => {
      expect(stateMachine.getCurrentPhaseName()).toBe('初始化');
    });

    it('初始阶段持续时间应该大于等于 0', () => {
      expect(stateMachine.getCurrentPhaseDuration()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('状态转换', () => {
    it('应该能够从 initializing 转换到 understanding', () => {
      const result = stateMachine.transitionTo(ExecutionPhase.UNDERSTANDING);
      expect(result.allowed).toBe(true);
      expect(result.newState).toBe(ExecutionPhase.UNDERSTANDING);
      expect(stateMachine.getCurrentPhase()).toBe(ExecutionPhase.UNDERSTANDING);
    });

    it('应该能够完成完整的状态转换链', () => {
      // initializing -> understanding
      let result = stateMachine.transitionTo(ExecutionPhase.UNDERSTANDING);
      expect(result.allowed).toBe(true);

      // understanding -> planning
      result = stateMachine.transitionTo(ExecutionPhase.PLANNING);
      expect(result.allowed).toBe(true);

      // planning -> executing
      result = stateMachine.transitionTo(ExecutionPhase.EXECUTING);
      expect(result.allowed).toBe(true);

      // executing -> validating
      result = stateMachine.transitionTo(ExecutionPhase.VALIDATING);
      expect(result.allowed).toBe(true);

      // validating -> reflecting
      result = stateMachine.transitionTo(ExecutionPhase.REFLECTING);
      expect(result.allowed).toBe(true);

      // reflecting -> completed
      result = stateMachine.transitionTo(ExecutionPhase.COMPLETED);
      expect(result.allowed).toBe(true);

      expect(stateMachine.getCurrentPhase()).toBe(ExecutionPhase.COMPLETED);
    });

    it('应该能够从任意执行状态转换到 failed', () => {
      stateMachine.transitionTo(ExecutionPhase.UNDERSTANDING);
      const result = stateMachine.transitionTo(ExecutionPhase.FAILED);
      expect(result.allowed).toBe(true);
      expect(stateMachine.getCurrentPhase()).toBe(ExecutionPhase.FAILED);
    });

    it('应该能够从任意执行状态转换到 timeout', () => {
      stateMachine.transitionTo(ExecutionPhase.UNDERSTANDING);
      stateMachine.transitionTo(ExecutionPhase.PLANNING);
      const result = stateMachine.transitionTo(ExecutionPhase.TIMEOUT);
      expect(result.allowed).toBe(true);
      expect(stateMachine.getCurrentPhase()).toBe(ExecutionPhase.TIMEOUT);
    });

    it('应该能够从 validating 直接跳转到 completed', () => {
      stateMachine.transitionTo(ExecutionPhase.UNDERSTANDING);
      stateMachine.transitionTo(ExecutionPhase.PLANNING);
      stateMachine.transitionTo(ExecutionPhase.EXECUTING);
      stateMachine.transitionTo(ExecutionPhase.VALIDATING);

      const result = stateMachine.transitionTo(ExecutionPhase.COMPLETED);
      expect(result.allowed).toBe(true);
      expect(stateMachine.getCurrentPhase()).toBe(ExecutionPhase.COMPLETED);
    });
  });

  describe('无效转换', () => {
    it('应该拒绝从 initializing 直接跳转到 executing', () => {
      const result = stateMachine.transitionTo(ExecutionPhase.EXECUTING);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('Invalid transition');
    });

    it('应该拒绝从 initializing 直接跳转到 completed', () => {
      const result = stateMachine.transitionTo(ExecutionPhase.COMPLETED);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('应该拒绝从 completed 转换到任何其他状态', () => {
      stateMachine.transitionTo(ExecutionPhase.UNDERSTANDING);
      stateMachine.transitionTo(ExecutionPhase.PLANNING);
      stateMachine.transitionTo(ExecutionPhase.EXECUTING);
      stateMachine.transitionTo(ExecutionPhase.VALIDATING);
      stateMachine.transitionTo(ExecutionPhase.COMPLETED);

      const result = stateMachine.transitionTo(ExecutionPhase.PLANNING);
      expect(result.allowed).toBe(false);
    });

    it('应该拒绝从 failed 转换到任何其他状态', () => {
      stateMachine.transitionTo(ExecutionPhase.FAILED);

      const result = stateMachine.transitionTo(ExecutionPhase.COMPLETED);
      expect(result.allowed).toBe(false);
    });

    it('相同状态转换应该被允许', () => {
      const result = stateMachine.transitionTo(ExecutionPhase.INITIALIZING);
      expect(result.allowed).toBe(true);
    });
  });

  describe('状态历史', () => {
    it('应该记录状态转换历史', () => {
      stateMachine.transitionTo(ExecutionPhase.UNDERSTANDING);
      stateMachine.transitionTo(ExecutionPhase.PLANNING);

      const history = stateMachine.getPhaseHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].phase).toBe(ExecutionPhase.INITIALIZING);
    });

    it('历史记录应该包含时间戳', () => {
      const history = stateMachine.getPhaseHistory();
      expect(history[0].startTime).toBeDefined();
      expect(history[0].startTime).toBeGreaterThan(0);
    });

    it('历史记录应该包含结束时间（转换后）', () => {
      stateMachine.transitionTo(ExecutionPhase.UNDERSTANDING);
      const history = stateMachine.getPhaseHistory();
      expect(history[0].endTime).toBeDefined();
    });
  });

  describe('辅助方法', () => {
    it('canTransitionTo 应该正确判断是否可以转换', () => {
      expect(stateMachine.canTransitionTo(ExecutionPhase.UNDERSTANDING)).toBe(true);
      expect(stateMachine.canTransitionTo(ExecutionPhase.EXECUTING)).toBe(false);
    });

    it('getValidNextPhases 应该返回有效的下一状态列表', () => {
      const validPhases = stateMachine.getValidNextPhases();
      expect(validPhases).toContain(ExecutionPhase.UNDERSTANDING);
      expect(validPhases).toContain(ExecutionPhase.FAILED);
      expect(validPhases).not.toContain(ExecutionPhase.COMPLETED);
    });

    it('isInTerminalState 应该正确判断终止状态', () => {
      expect(stateMachine.isInTerminalState()).toBe(false);

      // 使用 forceSetPhase 直接设置终止状态
      stateMachine.forceSetPhase(ExecutionPhase.COMPLETED);
      expect(stateMachine.isInTerminalState()).toBe(true);
    });

    it('isExecutable 应该正确判断可执行状态', () => {
      expect(stateMachine.isExecutable()).toBe(true);

      stateMachine.forceSetPhase(ExecutionPhase.COMPLETED);
      expect(stateMachine.isExecutable()).toBe(false);
    });

    it('forceSetPhase 应该强制设置状态', () => {
      stateMachine.forceSetPhase(ExecutionPhase.EXECUTING);
      expect(stateMachine.getCurrentPhase()).toBe(ExecutionPhase.EXECUTING);
    });
  });

  describe('静态方法', () => {
    it('mapTaskStatusToPhase 应该正确映射任务状态', () => {
      expect(AgentStateMachine.mapTaskStatusToPhase('planning')).toBe(ExecutionPhase.PLANNING);
      expect(AgentStateMachine.mapTaskStatusToPhase('executing')).toBe(ExecutionPhase.EXECUTING);
      expect(AgentStateMachine.mapTaskStatusToPhase('completed')).toBe(ExecutionPhase.COMPLETED);
      expect(AgentStateMachine.mapTaskStatusToPhase('failed')).toBe(ExecutionPhase.FAILED);
      expect(AgentStateMachine.mapTaskStatusToPhase('timeout')).toBe(ExecutionPhase.TIMEOUT);
    });

    it('mapPhaseToTaskStatus 应该正确映射执行阶段', () => {
      expect(AgentStateMachine.mapPhaseToTaskStatus(ExecutionPhase.PLANNING)).toBe('planning');
      expect(AgentStateMachine.mapPhaseToTaskStatus(ExecutionPhase.EXECUTING)).toBe('executing');
      expect(AgentStateMachine.mapPhaseToTaskStatus(ExecutionPhase.COMPLETED)).toBe('completed');
      expect(AgentStateMachine.mapPhaseToTaskStatus(ExecutionPhase.FAILED)).toBe('failed');
    });
  });
});

describe('isValidTransition', () => {
  it('应该返回 true 对于有效转换', () => {
    expect(isValidTransition(ExecutionPhase.INITIALIZING, ExecutionPhase.UNDERSTANDING)).toBe(true);
    expect(isValidTransition(ExecutionPhase.PLANNING, ExecutionPhase.EXECUTING)).toBe(true);
  });

  it('应该返回 false 对于无效转换', () => {
    expect(isValidTransition(ExecutionPhase.INITIALIZING, ExecutionPhase.COMPLETED)).toBe(false);
    expect(isValidTransition(ExecutionPhase.COMPLETED, ExecutionPhase.PLANNING)).toBe(false);
  });

  it('相同状态应该返回 true', () => {
    expect(isValidTransition(ExecutionPhase.PLANNING, ExecutionPhase.PLANNING)).toBe(true);
  });
});

describe('getPhaseDisplayName', () => {
  it('应该返回正确的显示名称', () => {
    expect(getPhaseDisplayName(ExecutionPhase.INITIALIZING)).toBe('初始化');
    expect(getPhaseDisplayName(ExecutionPhase.UNDERSTANDING)).toBe('理解任务');
    expect(getPhaseDisplayName(ExecutionPhase.PLANNING)).toBe('规划步骤');
    expect(getPhaseDisplayName(ExecutionPhase.EXECUTING)).toBe('执行任务');
    expect(getPhaseDisplayName(ExecutionPhase.VALIDATING)).toBe('验证结果');
    expect(getPhaseDisplayName(ExecutionPhase.REFLECTING)).toBe('反思总结');
    expect(getPhaseDisplayName(ExecutionPhase.COMPLETED)).toBe('已完成');
    expect(getPhaseDisplayName(ExecutionPhase.FAILED)).toBe('失败');
    expect(getPhaseDisplayName(ExecutionPhase.TIMEOUT)).toBe('超时');
  });
});

// ==================== Response Parser Tests ====================

describe('Response Parser', () => {
  describe('extractJsonBlock', () => {
    it('应该提取 ```json 代码块中的内容', () => {
      const response = '这是一些文本\n```json\n{"key": "value"}\n```\n更多文本';
      expect(extractJsonBlock(response)).toBe('{"key": "value"}');
    });

    it('应该提取 ``` 代码块中的内容（无语言标识）', () => {
      const response = '文本\n```\n{"key": "value"}\n```\n文本';
      expect(extractJsonBlock(response)).toBe('{"key": "value"}');
    });

    it('没有代码块时应该返回 null', () => {
      const response = '没有代码块的纯文本';
      expect(extractJsonBlock(response)).toBeNull();
    });

    it('应该处理多行 JSON', () => {
      const response = '```json\n{\n  "key": "value",\n  "nested": {\n    "a": 1\n  }\n}\n```';
      expect(extractJsonBlock(response)).toContain('"key": "value"');
    });
  });

  describe('extractJsonObject', () => {
    it('应该从文本中提取 JSON 对象', () => {
      const text = '这是响应 {"tool": "read_file", "args": {"path": "/test"}} 结束';
      const result = extractJsonObject(text);
      expect(result).toEqual({ tool: 'read_file', args: { path: '/test' } });
    });

    it('应该优先从代码块中提取', () => {
      const text = '文本 ```json\n{"tool": "write_file"}\n``` 文本 {"tool": "read_file"}';
      const result = extractJsonObject(text);
      expect(result?.tool).toBe('write_file');
    });

    it('应该处理嵌套 JSON', () => {
      const text = '{"outer": {"inner": {"deep": "value"}}}';
      const result = extractJsonObject(text);
      expect(result).toEqual({ outer: { inner: { deep: 'value' } } });
    });

    it('无效 JSON 时应该返回 null', () => {
      const text = '没有 JSON 对象的文本';
      expect(extractJsonObject(text)).toBeNull();
    });

    it('不完整的 JSON 时应该返回 null', () => {
      const text = '{"incomplete": ';
      expect(extractJsonObject(text)).toBeNull();
    });
  });

  describe('parseToolCall', () => {
    it('应该解析包含 tool 字段的响应', () => {
      const response = '{"tool": "read_file", "args": {"path": "/src/index.ts"}}';
      const result = parseToolCall(response);
      expect(result.success).toBe(true);
      expect(result.data?.tool).toBe('read_file');
      expect(result.data?.args).toEqual({ path: '/src/index.ts' });
    });

    it('应该解析包含 toolName 字段的响应', () => {
      const response = '{"toolName": "write_file", "arguments": {"path": "/test"}}';
      const result = parseToolCall(response);
      expect(result.success).toBe(true);
      expect(result.data?.tool).toBe('write_file');
    });

    it('应该解析包含 name 字段的响应', () => {
      const response = '{"name": "search", "params": {"pattern": "test"}}';
      const result = parseToolCall(response);
      expect(result.success).toBe(true);
      expect(result.data?.tool).toBe('search');
    });

    it('应该提取 reasoning 字段', () => {
      const response = '{"tool": "read_file", "args": {}, "reasoning": "需要读取文件"}';
      const result = parseToolCall(response);
      expect(result.success).toBe(true);
      expect(result.data?.reasoning).toBe('需要读取文件');
    });

    it('工具不存在时应该返回失败', () => {
      const response = '{"tool": "nonexistent_tool", "args": {}}';
      const result = parseToolCall(response);
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('缺少工具名称时应该返回失败', () => {
      const response = '{"args": {"path": "/test"}}';
      const result = parseToolCall(response);
      expect(result.success).toBe(false);
      expect(result.error).toContain('缺少工具名称');
    });

    it('无法提取 JSON 时应该返回失败', () => {
      const response = '纯文本响应';
      const result = parseToolCall(response);
      expect(result.success).toBe(false);
      expect(result.error).toContain('无法从响应中提取');
    });
  });

  describe('parseMultipleToolCalls', () => {
    it('应该解析单个工具调用（返回数组）', () => {
      const response = '{"tool": "read_file", "args": {"path": "/test"}}';
      const result = parseMultipleToolCalls(response);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].tool).toBe('read_file');
    });

    it('应该解析工具调用数组', () => {
      const response = '[{"tool": "read_file", "args": {}}, {"tool": "write_file", "args": {}}]';
      const result = parseMultipleToolCalls(response);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('应该处理数组中的无效项', () => {
      const response = '[{"tool": "read_file"}, {"invalid": true}, {"tool": "write_file"}]';
      const result = parseMultipleToolCalls(response);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('所有项都无效时应该返回失败', () => {
      const response = '[{"invalid": true}, {"also": "invalid"}]';
      const result = parseMultipleToolCalls(response);
      expect(result.success).toBe(false);
    });
  });

  describe('extractReasoning', () => {
    it('应该移除代码块并返回纯文本', () => {
      const response = '这是推理内容\n```json\n{"tool": "test"}\n```\n更多推理';
      const result = extractReasoning(response);
      expect(result).not.toContain('```');
      expect(result).toContain('这是推理内容');
      expect(result).toContain('更多推理');
    });

    it('应该移除 JSON 对象', () => {
      const response = '推理文本 {"tool": "test"} 更多文本';
      const result = extractReasoning(response);
      expect(result).not.toContain('{"tool": "test"}');
    });

    it('纯文本应该原样返回', () => {
      const response = '这是纯推理文本';
      expect(extractReasoning(response)).toBe('这是纯推理文本');
    });
  });

  describe('extractSteps', () => {
    it('应该提取数字编号的步骤（点号格式）', () => {
      const response = '1. 第一步\n2. 第二步\n3. 第三步';
      const steps = extractSteps(response);
      expect(steps).toEqual(['第一步', '第二步', '第三步']);
    });

    it('应该提取数字编号的步骤（括号格式）', () => {
      const response = '1) 第一步\n2) 第二步\n3) 第三步';
      const steps = extractSteps(response);
      expect(steps).toEqual(['第一步', '第二步', '第三步']);
    });

    it('应该提取列表项步骤（短横线格式）', () => {
      const response = '- 第一步\n- 第二步\n- 第三步';
      const steps = extractSteps(response);
      expect(steps).toEqual(['第一步', '第二步', '第三步']);
    });

    it('应该提取列表项步骤（星号格式）', () => {
      const response = '* 第一步\n* 第二步';
      const steps = extractSteps(response);
      expect(steps).toEqual(['第一步', '第二步']);
    });

    it('没有步骤时应该返回空数组', () => {
      const response = '没有步骤的文本';
      expect(extractSteps(response)).toEqual([]);
    });

    it('数字编号优先于列表项', () => {
      const response = '1. 编号步骤\n- 列表步骤';
      const steps = extractSteps(response);
      expect(steps).toEqual(['编号步骤']);
    });
  });

  describe('parseIntent', () => {
    it('应该从 JSON 中提取意图', () => {
      const response = '{"intent": "bug-fix"}';
      expect(parseIntent(response)).toBe('bug-fix');
    });

    it('应该处理 intention 字段', () => {
      const response = '{"intention": "refactor code"}';
      expect(parseIntent(response)).toBe('refactor-code');
    });

    it('应该处理 type 字段', () => {
      const response = '{"type": "Feature Request"}';
      expect(parseIntent(response)).toBe('feature-request');
    });

    it('没有 JSON 时应该从文本提取第一个单词', () => {
      const response = 'bug fix task description';
      expect(parseIntent(response)).toBe('bug');
    });

    it('无法识别时应该返回 general', () => {
      const response = '';
      expect(parseIntent(response)).toBe('general');
    });
  });

  describe('parseConfidence', () => {
    it('应该从 JSON 中提取置信度', () => {
      const response = '{"confidence": 0.85}';
      expect(parseConfidence(response)).toBe(0.85);
    });

    it('应该处理 score 字段', () => {
      const response = '{"score": 0.9}';
      expect(parseConfidence(response)).toBe(0.9);
    });

    it('应该处理字符串形式的置信度', () => {
      const response = '{"confidence": "0.75"}';
      expect(parseConfidence(response)).toBe(0.75);
    });

    it('应该从文本中提取百分比', () => {
      const response = '置信度 85%';
      expect(parseConfidence(response)).toBe(0.85);
    });

    it('应该从文本中提取小数', () => {
      const response = '置信度 0.92';
      expect(parseConfidence(response)).toBe(0.92);
    });

    it('无法识别时应该返回默认值 0.5', () => {
      const response = '没有置信度信息';
      expect(parseConfidence(response)).toBe(0.5);
    });

    it('应该限制在 0-1 范围内', () => {
      const response = '{"confidence": 1.5}';
      expect(parseConfidence(response)).toBe(1);

      const response2 = '{"confidence": -0.5}';
      expect(parseConfidence(response2)).toBe(0);
    });
  });

  describe('safeJsonParse', () => {
    it('应该解析有效的 JSON', () => {
      expect(safeJsonParse('{"key": "value"}', {})).toEqual({ key: 'value' });
    });

    it('无效 JSON 时应该返回默认值', () => {
      expect(safeJsonParse('invalid json', { default: true })).toEqual({ default: true });
    });

    it('应该支持各种默认值类型', () => {
      expect(safeJsonParse('invalid', 'default')).toBe('default');
      expect(safeJsonParse('invalid', [])).toEqual([]);
      expect(safeJsonParse('invalid', null)).toBeNull();
    });
  });

  describe('validateResponseFields', () => {
    it('应该验证所有必需字段存在', () => {
      const response = '{"tool": "test", "args": {}, "reasoning": "test"}';
      const result = validateResponseFields(response, ['tool', 'args']);
      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('应该返回缺失的字段', () => {
      const response = '{"tool": "test"}';
      const result = validateResponseFields(response, ['tool', 'args', 'reasoning']);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('args');
      expect(result.missingFields).toContain('reasoning');
    });

    it('无法解析 JSON 时应该返回所有字段为缺失', () => {
      const response = 'invalid json';
      const result = validateResponseFields(response, ['tool', 'args']);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toEqual(['tool', 'args']);
    });
  });

  describe('extractCodeBlock', () => {
    it('应该提取指定语言的代码块', () => {
      const response = '```typescript\nconst x = 1;\n```';
      expect(extractCodeBlock(response, 'typescript')).toBe('const x = 1;');
    });

    it('应该提取任意代码块（不指定语言）', () => {
      const response = '```\nsome code\n```';
      expect(extractCodeBlock(response)).toBe('some code');
    });

    it('语言不匹配时应该返回 null', () => {
      const response = '```javascript\nconst x = 1;\n```';
      expect(extractCodeBlock(response, 'typescript')).toBeNull();
    });

    it('没有代码块时应该返回 null', () => {
      const response = '没有代码块';
      expect(extractCodeBlock(response)).toBeNull();
    });
  });
});

// ==================== Tool Executor Tests ====================

describe('Tool Executor', () => {
  describe('formatToolResult', () => {
    it('应该格式化成功结果', () => {
      const result: ToolResult = { success: true, output: '文件内容' };
      expect(formatToolResult(result)).toBe('文件内容');
    });

    it('成功但无输出时应该返回"（无输出）"', () => {
      const result: ToolResult = { success: true };
      expect(formatToolResult(result)).toBe('（无输出）');
    });

    it('应该格式化失败结果', () => {
      const result: ToolResult = { success: false, error: '文件不存在' };
      expect(formatToolResult(result)).toBe('错误: 文件不存在');
    });

    it('失败但无错误信息时应该返回"未知错误"', () => {
      const result: ToolResult = { success: false };
      expect(formatToolResult(result)).toBe('错误: 未知错误');
    });
  });

  describe('requiresConfirmation', () => {
    it('失败结果应该需要确认', () => {
      const result: ToolResult = { success: false, error: '执行失败' };
      expect(requiresConfirmation(result)).toBe(true);
    });

    it('包含 error 关键词应该需要确认', () => {
      const result: ToolResult = { success: true, output: 'error: something went wrong' };
      expect(requiresConfirmation(result)).toBe(true);
    });

    it('包含 warning 关键词应该需要确认', () => {
      const result: ToolResult = { success: true, output: 'warning: deprecated API' };
      expect(requiresConfirmation(result)).toBe(true);
    });

    it('包含删除关键词应该需要确认', () => {
      const result: ToolResult = { success: true, output: '文件已删除' };
      expect(requiresConfirmation(result)).toBe(true);
    });

    it('包含 drop 关键词应该需要确认', () => {
      const result: ToolResult = { success: true, output: 'table dropped' };
      expect(requiresConfirmation(result)).toBe(true);
    });

    it('正常输出不需要确认', () => {
      const result: ToolResult = { success: true, output: '操作成功完成' };
      expect(requiresConfirmation(result)).toBe(false);
    });
  });

  describe('isStepTimeout', () => {
    it('未超时应该返回 false', () => {
      const context: StepExecutionContext = {
        stepIndex: 0,
        step: {} as TaskStep,
        globalContext: {},
        taskStartTime: Date.now() - 1000,
        timeoutMs: 10000,
      };
      expect(isStepTimeout(context)).toBe(false);
    });

    it('已超时应该返回 true', () => {
      const context: StepExecutionContext = {
        stepIndex: 0,
        step: {} as TaskStep,
        globalContext: {},
        taskStartTime: Date.now() - 20000,
        timeoutMs: 10000,
      };
      expect(isStepTimeout(context)).toBe(true);
    });

    it('刚好超时应该返回 true', () => {
      // 使用一个已经超时的上下文（taskStartTime 在过去很久）
      const context: StepExecutionContext = {
        stepIndex: 0,
        step: {} as TaskStep,
        globalContext: {},
        taskStartTime: Date.now() - 10001, // 确保已经超时
        timeoutMs: 10000,
      };
      expect(isStepTimeout(context)).toBe(true);
    });
  });

  describe('getRemainingTime', () => {
    it('应该返回剩余时间', () => {
      const context: StepExecutionContext = {
        stepIndex: 0,
        step: {} as TaskStep,
        globalContext: {},
        taskStartTime: Date.now() - 3000,
        timeoutMs: 10000,
      };
      const remaining = getRemainingTime(context);
      expect(remaining).toBeGreaterThan(6000);
      expect(remaining).toBeLessThanOrEqual(7000);
    });

    it('已超时应该返回 0', () => {
      const context: StepExecutionContext = {
        stepIndex: 0,
        step: {} as TaskStep,
        globalContext: {},
        taskStartTime: Date.now() - 20000,
        timeoutMs: 10000,
      };
      expect(getRemainingTime(context)).toBe(0);
    });
  });
});

// ==================== Agent Executor Tests (Mocked) ====================

describe('AgentExecutor', () => {
  describe('构造函数', () => {
    it('应该正确初始化', () => {
      const executor = new AgentExecutor('测试任务');
      expect(executor).toBeDefined();
    });

    it('应该接受回调函数', () => {
      const onStepChange = vi.fn();
      const onOutput = vi.fn();
      const executor = new AgentExecutor('测试任务', onStepChange, onOutput);
      expect(executor).toBeDefined();
    });

    it('应该接受配置选项', () => {
      // 使用当前工作目录，避免创建不存在的目录
      const executor = new AgentExecutor('测试任务', undefined, undefined, {
        rootDir: process.cwd(),
        enableRepoMap: true,
        enableKnowledgeGraph: true,
        enableChangeControl: false,
      });
      expect(executor).toBeDefined();
    });

    it('应该初始化状态机', () => {
      const executor = new AgentExecutor('测试任务');
      const stateMachine = executor.getStateMachine();
      expect(stateMachine).toBeDefined();
      expect(stateMachine.getCurrentPhase()).toBe(ExecutionPhase.INITIALIZING);
    });
  });

  describe('getTask', () => {
    it('应该返回当前任务', () => {
      const executor = new AgentExecutor('测试任务');
      const task = executor.getTask();
      expect(task).toBeDefined();
      expect(task.userInput).toBe('测试任务');
      expect(task.status).toBe('planning');
    });

    it('任务应该有有效的 ID', () => {
      const executor = new AgentExecutor('测试任务');
      const task = executor.getTask();
      expect(task.id).toBeDefined();
      expect(typeof task.id).toBe('string');
    });

    it('任务应该有开始时间', () => {
      const executor = new AgentExecutor('测试任务');
      const task = executor.getTask();
      expect(task.startedAt).toBeDefined();
      expect(task.startedAt).toBeGreaterThan(0);
    });
  });

  describe('getStateMachine', () => {
    it('应该返回状态机实例', () => {
      const executor = new AgentExecutor('测试任务');
      const stateMachine = executor.getStateMachine();
      expect(stateMachine).toBeInstanceOf(AgentStateMachine);
    });
  });

  describe('getChangeControl', () => {
    it('应该返回变更控制管理器', () => {
      const executor = new AgentExecutor('测试任务');
      const changeControl = executor.getChangeControl();
      expect(changeControl).toBeDefined();
    });
  });

  describe('getRepoMap', () => {
    it('应该返回 undefined（未构建时）', () => {
      const executor = new AgentExecutor('测试任务');
      expect(executor.getRepoMap()).toBeUndefined();
    });
  });

  describe('queryKnowledgeGraph', () => {
    it('应该返回知识图谱查询结果', async () => {
      const executor = new AgentExecutor('测试任务');
      const result = await executor.queryKnowledgeGraph('测试查询');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('executeProtected', () => {
    it('应该执行受保护的操作', async () => {
      const executor = new AgentExecutor('测试任务');
      const action = vi.fn(() => Promise.resolve('结果'));
      const result = await executor.executeProtected('read', '/test/file', action);
      expect(result).toBeDefined();
    });
  });
});

describe('runAgentTask', () => {
  it('应该是一个函数', () => {
    expect(typeof runAgentTask).toBe('function');
  });

  it('应该返回 Promise', () => {
    const result = runAgentTask('测试任务');
    expect(result).toBeInstanceOf(Promise);
  });
});

// ==================== Edge Cases and Error Handling ====================

describe('边界情况和错误处理', () => {
  describe('Response Parser 边界情况', () => {
    it('extractJsonObject 应该处理空字符串', () => {
      expect(extractJsonObject('')).toBeNull();
    });

    it('extractSteps 应该处理空字符串', () => {
      expect(extractSteps('')).toEqual([]);
    });

    it('parseIntent 应该处理空字符串', () => {
      expect(parseIntent('')).toBe('general');
    });

    it('extractReasoning 应该处理空字符串', () => {
      expect(extractReasoning('')).toBe('');
    });

    it('extractCodeBlock 应该处理空字符串', () => {
      expect(extractCodeBlock('')).toBeNull();
    });

    it('safeJsonParse 应该处理空字符串', () => {
      expect(safeJsonParse('', { default: true })).toEqual({ default: true });
    });
  });

  describe('State Machine 边界情况', () => {
    it('多次转换到相同状态应该被允许', () => {
      const sm = createStateMachine('test');
      sm.transitionTo(ExecutionPhase.UNDERSTANDING);
      const result = sm.transitionTo(ExecutionPhase.UNDERSTANDING);
      expect(result.allowed).toBe(true);
    });

    it('forceSetPhase 应该能够设置任何状态', () => {
      const sm = createStateMachine('test');
      sm.forceSetPhase(ExecutionPhase.COMPLETED);
      expect(sm.getCurrentPhase()).toBe(ExecutionPhase.COMPLETED);

      // 即使是终止状态也能强制设置
      sm.forceSetPhase(ExecutionPhase.PLANNING);
      expect(sm.getCurrentPhase()).toBe(ExecutionPhase.PLANNING);
    });
  });

  describe('Tool Executor 边界情况', () => {
    it('formatToolResult 应该处理 undefined output', () => {
      const result: ToolResult = { success: true, output: undefined };
      expect(formatToolResult(result)).toBe('（无输出）');
    });

    it('requiresConfirmation 应该处理空输出', () => {
      const result: ToolResult = { success: true, output: '' };
      expect(requiresConfirmation(result)).toBe(false);
    });

    it('getRemainingTime 应该处理刚好超时的情况', () => {
      const context: StepExecutionContext = {
        stepIndex: 0,
        step: {} as TaskStep,
        globalContext: {},
        taskStartTime: Date.now() - 10000,
        timeoutMs: 10000,
      };
      // 由于时间精度问题，结果可能是 0 或负数
      expect(getRemainingTime(context)).toBeGreaterThanOrEqual(0);
    });
  });
});
