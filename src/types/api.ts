/**
 * API response wrapper type
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

/**
 * Create a successful API response
 *
 * @param data - Response data
 * @returns Success API response
 */
export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, timestamp: new Date().toISOString() };
}

/**
 * Create a failed API response
 *
 * @param error - Error value (Error instance or unknown)
 * @returns Failed API response
 */
export function fail(error: unknown): ApiResponse {
  const code = 'ERROR';
  const message = error instanceof Error ? error.message : String(error);
  const details: Record<string, unknown> | undefined = undefined;

  return { success: false, error: { code, message, details }, timestamp: new Date().toISOString() };
}
