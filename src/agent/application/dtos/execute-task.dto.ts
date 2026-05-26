/**
 * 执行任务 DTO
 * 应用层数据传输对象
 */

export interface ExecuteTaskRequest {
  userInput: string;
  rootDir?: string;
  enableRepoMap?: boolean;
  enableKnowledgeGraph?: boolean;
  enableChangeControl?: boolean;
}

export interface ExecuteTaskResponse {
  taskId: string;
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'timeout';
  steps: TaskStepDTO[];
  result?: string;
  error?: string;
  durationMs?: number;
}

export interface TaskStepDTO {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
  tool?: string;
  result?: string;
  error?: string;
}
