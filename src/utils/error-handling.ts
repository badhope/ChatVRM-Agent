/**
 * Error Handling Utilities
 *
 * Provides type-safe error handling functions for use in catch blocks
 * and other error processing contexts. These utilities help eliminate
 * the need for `any` type in error handling.
 */

/**
 * Type guard to check if an unknown value is an Error instance.
 *
 * @param error - The value to check
 * @returns True if the value is an Error instance
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error: unknown) {
 *   if (isError(error)) {
 *     console.error(error.message);
 *   }
 * }
 * ```
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if an unknown value is an object with a 'message' property.
 * This is useful for handling errors from external sources that may not be Error instances.
 *
 * @param error - The value to check
 * @returns True if the value is an object with a message property
 */
export function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Type guard to check if an unknown value is an object with a 'code' property.
 *
 * @param error - The value to check
 * @returns True if the value is an object with a code property
 */
export function hasCode(error: unknown): error is { code: string | number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (typeof (error as { code: unknown }).code === 'string' ||
      typeof (error as { code: unknown }).code === 'number')
  );
}

/**
 * Safely extract an error message from an unknown error value.
 *
 * @param error - The error value to extract message from
 * @returns A string message, or 'Unknown error' if no message can be extracted
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error: unknown) {
 *   const message = getErrorMessage(error);
 *   console.error(`Operation failed: ${message}`);
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (hasMessage(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Safely extract an error stack trace from an unknown error value.
 *
 * @param error - The error value to extract stack from
 * @returns The stack trace string if available, undefined otherwise
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error: unknown) {
 *   const stack = getErrorStack(error);
 *   if (stack) {
 *     logger.debug('Stack trace:', stack);
 *   }
 * }
 * ```
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }
  return undefined;
}

/**
 * Safely extract an error code from an unknown error value.
 *
 * @param error - The error value to extract code from
 * @returns The error code if available, undefined otherwise
 */
export function getErrorCode(error: unknown): string | number | undefined {
  if (hasCode(error)) {
    return error.code;
  }
  return undefined;
}

/**
 * Convert an unknown error to a plain object for logging or serialization.
 *
 * @param error - The error value to convert
 * @returns An object containing error information
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error: unknown) {
 *   logger.error('Operation failed', toErrorObject(error));
 * }
 * ```
 */
export function toErrorObject(error: unknown): {
  message: string;
  name?: string;
  stack?: string;
  code?: string | number;
} {
  const result: {
    message: string;
    name?: string;
    stack?: string;
    code?: string | number;
  } = {
    message: getErrorMessage(error),
  };

  if (isError(error)) {
    result.name = error.name;
    result.stack = error.stack;
  }

  const code = getErrorCode(error);
  if (code !== undefined) {
    result.code = code;
  }

  return result;
}

/**
 * Wrap an async function with error handling, returning a result object.
 *
 * @param fn - The async function to wrap
 * @returns A function that returns a result object with success/error status
 *
 * @example
 * ```typescript
 * const result = await safeAsync(() => fetchData());
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export async function safeAsync<T>(
  fn: () => Promise<T>
): Promise<
  | { success: true; data: T; error: undefined }
  | { success: false; data: undefined; error: string }
> {
  try {
    const data = await fn();
    return { success: true, data, error: undefined };
  } catch (error: unknown) {
    return { success: false, data: undefined, error: getErrorMessage(error) };
  }
}

/**
 * Wrap a sync function with error handling, returning a result object.
 *
 * @param fn - The function to wrap
 * @returns A result object with success/error status
 */
export function safeSync<T>(
  fn: () => T
): 
  | { success: true; data: T; error: undefined }
  | { success: false; data: undefined; error: string }
{
  try {
    const data = fn();
    return { success: true, data, error: undefined };
  } catch (error: unknown) {
    return { success: false, data: undefined, error: getErrorMessage(error) };
  }
}
