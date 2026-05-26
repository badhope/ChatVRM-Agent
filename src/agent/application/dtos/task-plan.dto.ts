/**
 * 任务计划 DTO
 * 应用层数据传输对象
 */

export interface TaskPlanRequest {
  userInput: string;
  intent?: string;
}

export interface TaskPlanResponse {
  taskId: string;
  intent: string;
  steps: TaskPlanStepDTO[];
  estimatedDurationMinutes?: number;
}

export interface TaskPlanStepDTO {
  id: string;
  description: string;
  order: number;
  tool?: string;
  estimatedComplexity?: 'low' | 'medium' | 'high';
}
