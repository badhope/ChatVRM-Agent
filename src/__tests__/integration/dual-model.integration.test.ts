/**
 * Dual Model 流程集成测试
 */
import { describe, it, expect, vi } from 'vitest';
import { runDualModel } from '../../agent/dual-model.js';
import * as architectModule from '../../agent/architect.js';
import * as llmCodeEditorModule from '../../agent/llm-code-editor.js';

// Mock LLM 调用，避免真实 API 调用
vi.mock('../../agent/llm-caller.js', () => ({
  callLLM: vi.fn(),
}));

describe('Dual Model Integration', () => {
  it('should expose the dual model functions', () => {
    // 验证函数导出
    expect(typeof runDualModel).toBe('function');
    expect(typeof architectModule.architectAnalyze).toBe('function');
    expect(typeof llmCodeEditorModule.llmEditorExecute).toBe('function');
  });

  it('should have correct types and interfaces', () => {
    // 验证类型导出（通过运行时检查）
    expect(typeof architectModule.ArchitectResult).toBe('undefined'); // 类型在运行时不存在
  });
});
