export type AgentMessageType =
  | 'task_decomposition_request'
  | 'task_decomposition_response'
  | 'execute_task_request'
  | 'execute_task_response'
  | 'task_status_update'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancel'
  | 'heartbeat';

export interface SubTask {
  id: string;
  parentId?: string;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  dependencies: string[];
  priority: number;
  estimatedTimeMs?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
}

export interface TaskDecompositionRequest {
  type: 'task_decomposition_request';
  taskId: string;
  userInput: string;
  intent: string;
  context?: string;
  maxDepth?: number;
  maxSubtasks?: number;
}

export interface TaskDecompositionResponse {
  type: 'task_decomposition_response';
  taskId: string;
  subtasks: SubTask[];
  strategy: string;
  estimatedTotalTimeMs?: number;
}

export interface ExecuteTaskRequest {
  type: 'execute_task_request';
  taskId: string;
  subtask: SubTask;
  context?: Record<string, unknown>;
}

export interface ExecuteTaskResponse {
  type: 'execute_task_response';
  taskId: string;
  subtaskId: string;
  success: boolean;
  result?: string;
  error?: string;
  context?: Record<string, unknown>;
  durationMs?: number;
}

export interface TaskStatusUpdate {
  type: 'task_status_update';
  taskId: string;
  subtaskId: string;
  status: SubTask['status'];
  progress?: number;
  message?: string;
  timestamp: number;
}

export interface TaskCompleted {
  type: 'task_completed';
  taskId: string;
  subtaskResults: Record<string, string>;
  summary: string;
  durationMs: number;
}

export interface TaskFailed {
  type: 'task_failed';
  taskId: string;
  failedSubtaskId: string;
  error: string;
  partialResults?: Record<string, string>;
}

export interface TaskCancel {
  type: 'task_cancel';
  taskId: string;
  reason?: string;
}

export interface Heartbeat {
  type: 'heartbeat';
  agentId: string;
  timestamp: number;
  status: 'idle' | 'busy' | 'error';
}

export type AgentMessage =
  | TaskDecompositionRequest
  | TaskDecompositionResponse
  | ExecuteTaskRequest
  | ExecuteTaskResponse
  | TaskStatusUpdate
  | TaskCompleted
  | TaskFailed
  | TaskCancel
  | Heartbeat;

export interface AgentMessageEnvelope {
  messageId: string;
  senderId: string;
  receiverId: string;
  message: AgentMessage;
  timestamp: number;
  replyTo?: string;
}

export interface AgentState {
  agentId: string;
  agentType: 'planning' | 'execution';
  status: 'idle' | 'busy' | 'error';
  currentTaskId?: string;
  lastHeartbeat: number;
}

export interface CollaborationContext {
  taskId: string;
  userInput: string;
  intent: string;
  subtasks: SubTask[];
  completedSubtasks: string[];
  failedSubtasks: string[];
  currentSubtaskId?: string;
  sharedContext: Record<string, unknown>;
  startTime: number;
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';
}