// Re-export common types that match the backend
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: any };
  timestamp: string;
}

export interface AgentResult {
  success: boolean;
  output: string;
  steps: any[];
  changedFiles: string[];
  duration: number;
}

// Re-export error types for client use
export interface DevFlowError {
  code: string;
  message: string;
  statusCode?: number;
  details?: any;
}

export interface ValidationError {
  code: 'VALIDATION_ERROR';
  message: string;
  details?: any;
}

export interface NotFoundError {
  code: 'NOT_FOUND';
  message: string;
}

export interface AuthenticationError {
  code: 'AUTH_ERROR';
  message: string;
}

export interface NetworkError {
  code: 'NETWORK_ERROR';
  message: string;
  details?: any;
}

// Unified error format helper
export function formatError(error: unknown): { code: string; message: string; details?: any } {
  if (error && typeof error === 'object' && 'code' in error) {
    const err = error as { code: string; message?: string; details?: any };
    return { code: err.code, message: err.message || 'Unknown error', details: err.details };
  }
  if (error instanceof Error) {
    return { code: 'UNKNOWN_ERROR', message: error.message };
  }
  return { code: 'UNKNOWN_ERROR', message: String(error) };
}

// Helper to create error responses
export function createErrorResponse(error: unknown): ApiResponse<null> {
  const { code, message, details } = formatError(error);
  return {
    success: false,
    error: { code, message, details },
    timestamp: new Date().toISOString()
  };
}

// Helper to create success responses
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };
}
