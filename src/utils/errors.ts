export class PersonalAssistantError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'PersonalAssistantError';
  }
}

export class ValidationError extends PersonalAssistantError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends PersonalAssistantError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class AuthenticationError extends PersonalAssistantError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
  }
}

export class NetworkError extends PersonalAssistantError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'NETWORK_ERROR', 0, details);
  }
}

export function formatError(error: unknown): { code: string; message: string; details?: Record<string, unknown> } {
  if (error instanceof PersonalAssistantError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof Error) {
    return { code: 'UNKNOWN_ERROR', message: error.message };
  }
  return { code: 'UNKNOWN_ERROR', message: String(error) };
}
