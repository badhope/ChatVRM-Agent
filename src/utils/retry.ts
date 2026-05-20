// ============================================================
// Retry utilities - backed by p-retry
// ============================================================

import pRetry, { AbortError } from 'p-retry';

// ------------------------------------------------------------------
// Public types (backward-compatible)
// ------------------------------------------------------------------

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export type ErrorCategory = 'rate_limit' | 'auth' | 'server' | 'timeout' | 'invalid_request' | 'unknown';

// ------------------------------------------------------------------
// Error classification (unchanged)
// ------------------------------------------------------------------

/**
 * Classify an error into a category.
 */
export function classifyError(error: Error | Response): ErrorCategory {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as Response).status;
    if (status === 429) return 'rate_limit';
    if (status === 401 || status === 403) return 'auth';
    if (status >= 500) return 'server';
    if (status === 400) return 'invalid_request';
    return 'unknown';
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('rate limit') || message.includes('429')) return 'rate_limit';
    if (message.includes('unauthorized') || message.includes('401') || message.includes('invalid key')) return 'auth';
    if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
    if (message.includes('500') || message.includes('server error')) return 'server';
    if (message.includes('400') || message.includes('bad request')) return 'invalid_request';
  }
  return 'unknown';
}

/**
 * Determine whether an error is retryable.
 */
export function shouldRetry(error: Error | Response): boolean {
  const category = classifyError(error);
  return category === 'rate_limit' || category === 'server' || category === 'timeout';
}

/**
 * Sleep for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ------------------------------------------------------------------
// p-retry based implementations
// ------------------------------------------------------------------

/**
 * Retry an async function with exponential backoff using p-retry.
 *
 * @param fn          - The async function to execute
 * @param config      - Retry configuration (maxRetries, baseDelay, maxDelay)
 * @param shouldRetryFn - Optional custom retry predicate (default: shouldRetry)
 * @returns The result of fn on first success
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  shouldRetryFn: (error: Error) => boolean = shouldRetry as (e: Error) => boolean,
): Promise<T> {
  return pRetry(fn, {
    retries: config.maxRetries - 1,
    signal: AbortSignal.timeout(config.maxDelay * config.maxRetries),
    onFailedAttempt: (context) => {
      if (!shouldRetryFn(context.error)) {
        throw new AbortError(context.error.message);
      }
    },
  });
}

/**
 * Retry a streaming request with exponential backoff.
 *
 * Identical to retryWithBackoff but kept as a separate export for
 * backward compatibility with existing callers.
 *
 * @param fn          - The async function returning a Response
 * @param config      - Retry configuration
 * @param shouldRetryFn - Optional custom retry predicate
 * @returns The Response from the first successful call
 */
export async function retryStreamWithBackoff(
  fn: () => Promise<Response>,
  config: RetryConfig,
  shouldRetryFn: (error: Error) => boolean = shouldRetry as (e: Error) => boolean,
): Promise<Response> {
  return pRetry(fn, {
    retries: config.maxRetries - 1,
    signal: AbortSignal.timeout(config.maxDelay * config.maxRetries),
    onFailedAttempt: (context) => {
      if (!shouldRetryFn(context.error)) {
        throw new AbortError(context.error.message);
      }
    },
  });
}
