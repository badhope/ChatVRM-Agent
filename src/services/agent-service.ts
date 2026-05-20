// ============================================================
// Agent 服务 - 处理智能任务执行
// ============================================================

import { BaseService } from './base.js';
import { injectable, inject } from 'tsyringe';
import { TOKENS } from '../di/tokens.js';
import { AgentExecutor } from '../agent/core.js';
import type { Task, TaskStep } from '../agent/types.js';

/**
 * Agent 任务
 */
export interface AgentTask {
  /** 用户输入 */
  input: string;
  /** 执行选项 */
  options?: {
    /** 是否先规划 */
    planFirst?: boolean;
    /** 是否自动创建检查点 */
    autoCheckpoint?: boolean;
  };
}

/**
 * Agent 任务结果
 */
export interface AgentTaskResult {
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  output: string;
  /** 执行步骤 */
  steps: TaskStep[];
  /** 变更的文件列表 */
  changedFiles: string[];
  /** 执行耗时（毫秒） */
  duration: number;
}

/**
 * Agent 服务
 * 封装 Agent 核心执行逻辑
 */
@injectable()
export class AgentService extends BaseService {
  constructor(
    @inject(TOKENS.ConfigManager) private config: IConfigManager
  ) {
    super();
  }

  /**
   * 执行 Agent 任务
   * @param task 任务定义
   * @returns 任务执行结果
   */
  async executeTask(task: AgentTask): Promise<AgentTaskResult> {
    return this.withErrorHandling('executeTask', async () => {
      const executor = new AgentExecutor(
        task.input,
        (step) => this.logger.debug({ step }, 'Agent step'),
        (output) => this.logger.debug({ output }, 'Agent output')
      );

      const startTime = Date.now();
      const result = await executor.run();

      return {
        success: result.status === 'completed',
        output: result.result || '',
        steps: result.steps || [],
        changedFiles: this.extractChangedFiles(result),
        duration: Date.now() - startTime
      };
    });
  }

  /**
   * 执行带回调的任务
   * @param task 任务定义
   * @param onStepChange 步骤变化回调
   * @param onOutput 输出回调
   * @returns 任务执行结果
   */
  async executeTaskWithCallbacks(
    task: AgentTask,
    onStepChange?: (step: TaskStep) => void,
    onOutput?: (text: string) => void
  ): Promise<AgentTaskResult> {
    return this.withErrorHandling('executeTaskWithCallbacks', async () => {
      const executor = new AgentExecutor(
        task.input,
        (step) => {
          this.logger.debug({ step }, 'Agent step');
          onStepChange?.(step);
        },
        (output) => {
          this.logger.debug({ output }, 'Agent output');
          onOutput?.(output);
        }
      );

      const startTime = Date.now();
      const result = await executor.run();

      return {
        success: result.status === 'completed',
        output: result.result || '',
        steps: result.steps || [],
        changedFiles: this.extractChangedFiles(result),
        duration: Date.now() - startTime
      };
    });
  }

  /**
   * 从任务结果中提取变更的文件
   * @param result Agent 任务结果
   * @returns 变更的文件路径列表
   */
  private extractChangedFiles(result: Task): string[] {
    const changedFiles: string[] = [];

    for (const step of result.steps || []) {
      if (step.tool === 'write_file' && step.args?.path) {
        changedFiles.push(String(step.args.path));
      } else if (step.tool === 'edit_file' && step.args?.path) {
        changedFiles.push(String(step.args.path));
      }
    }

    return [...new Set(changedFiles)];
  }
}

// 导入 IConfigManager 类型
import type { IConfigManager } from './interfaces.js';
