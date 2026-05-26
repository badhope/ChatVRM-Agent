/**
 * 任务与步骤领域模型
 */

/**
 * 任务步骤接口
 */
export interface TaskStep {
  id: number;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  result?: string;
  error?: string;
}

/**
 * 任务接口
 */
export interface Task {
  id: string;
  userInput: string;
  intent?: string;
  steps: TaskStep[];
  currentStep: number;
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'timeout';
  result?: string;
  startedAt: number;
  completedAt?: number;
}
