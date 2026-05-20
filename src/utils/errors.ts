export class DevFlowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'DevFlowError';
  }
}

export class ValidationError extends DevFlowError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends DevFlowError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class AuthenticationError extends DevFlowError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
  }
}

export class NetworkError extends DevFlowError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'NETWORK_ERROR', 0, details);
  }
}

export function formatError(error: unknown): { code: string; message: string; details?: Record<string, unknown> } {
  if (error instanceof DevFlowError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof Error) {
    return { code: 'UNKNOWN_ERROR', message: error.message };
  }
  return { code: 'UNKNOWN_ERROR', message: String(error) };
}
