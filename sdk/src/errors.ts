/**
 * DevFlow SDK - Error Classes
 *
 * Unified error handling for the DevFlow SDK.
 * These errors correspond to the backend error types in src/utils/errors.ts.
 */

/**
 * Base error class for DevFlow-specific errors.
 *
 * @example
 * ```typescript
 * try {
 *   await agent.run('some task');
 * } catch (error) {
 *   if (error instanceof DevFlowError) {
 *     console.error(`Error [${error.code}]: ${error.message}`);
 *   }
 * }
 * ```
 */
export class DevFlowError extends Error {
  /**
   * Error code for programmatic handling.
   */
  public readonly code: string;

  /**
   * HTTP status code (0 for network errors).
   */
  public readonly statusCode: number;

  /**
   * Additional error details.
   */
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    code: string = 'ERROR',
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'DevFlowError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Error for validation failures (HTTP 400).
 *
 * @example
 * ```typescript
 * throw new ValidationError('Invalid input', { field: 'email' });
 * ```
 */
export class ValidationError extends DevFlowError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Error for resource not found (HTTP 404).
 *
 * @example
 * ```typescript
 * throw new NotFoundError('File not found: ./src/missing.ts');
 * ```
 */
export class NotFoundError extends DevFlowError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Error for authentication failures (HTTP 401).
 *
 * @example
 * ```typescript
 * throw new AuthenticationError('API key is invalid or expired');
 * ```
 */
export class AuthenticationError extends DevFlowError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error for network-related failures.
 *
 * @example
 * ```typescript
 * throw new NetworkError('Failed to connect to API', { host: 'api.example.com' });
 * ```
 */
export class NetworkError extends DevFlowError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'NETWORK_ERROR', 0, details);
    this.name = 'NetworkError';
  }
}

/**
 * Format an error into a standardized error object.
 *
 * @param error - Any error object or value
 * @returns A standardized error representation
 *
 * @example
 * ```typescript
 * try {
 *   await doSomething();
 * } catch (error) {
 *   const { code, message, details } = formatError(error);
 *   console.error(`[${code}] ${message}`);
 * }
 * ```
 */
export function formatError(error: unknown): { code: string; message: string; details?: any } {
  if (error instanceof DevFlowError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
  };
}
