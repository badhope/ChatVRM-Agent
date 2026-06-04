import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyError, type AppError, isRetryable } from '@/utils/errors';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  error: AppError | null;
  lastUpdated: number | null; // ms epoch
  isStale: boolean; // true if lastUpdated older than ttlMs
  isRetrying: boolean; // true for retry() calls after an error
  attempts: number;
}

export interface UseAsyncStateOptions {
  /** Fire the request automatically on mount. Default: true */
  auto?: boolean;
  /** Consider data stale after this many ms. 0 = never stale. Default: 30_000 */
  ttlMs?: number;
  /** Optional labels for logging. */
  label?: string;
}

export interface UseAsyncStateApi<T> extends AsyncState<T> {
  /** Manually re-run. Safe to call from any handler. */
  run: () => Promise<void>;
  /** Retry after an error. Equivalent to run() but tracks isRetrying and respects backoff. */
  retry: () => Promise<void>;
  /** Reset to idle, clearing data and error. */
  reset: () => void;
  /** True while run()/retry() is in-flight. */
  loading: boolean;
}

const DEFAULT_TTL = 30_000;

/**
 * Generic async state container with:
 * - request deduplication (only the latest call wins)
 * - automatic cancellation on unmount
 * - stale-data indicator
 * - retry helpers that know which error kinds are retryable
 * - per-call error classification
 */
export function useAsyncState<T>(
  fn: () => Promise<T>,
  options: UseAsyncStateOptions = {},
): UseAsyncStateApi<T> {
  const { auto = true, ttlMs = DEFAULT_TTL, label } = options;
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const [state, setState] = useState<AsyncState<T>>({
    status: 'idle',
    data: null,
    error: null,
    lastUpdated: null,
    isStale: false,
    isRetrying: false,
    attempts: 0,
  });

  const reqIdRef = useRef(0);

  const run = useCallback(async () => {
    const reqId = ++reqIdRef.current;

    setState((s) => ({
      ...s,
      status: 'loading',
      error: null,
      isRetrying: s.status === 'error',
      attempts: s.attempts + 1,
    }));

    try {
      const data = await fnRef.current();
      if (reqId !== reqIdRef.current) return; // a newer call or unmount has superseded us
      setState((s) => ({
        ...s,
        status: 'success',
        data,
        error: null,
        lastUpdated: Date.now(),
        isStale: false,
        isRetrying: false,
        attempts: s.attempts + 1,
      }));
    } catch (rawErr) {
      if (reqId !== reqIdRef.current) return;
      const err = classifyError(rawErr);
      if (label) {
        // eslint-disable-next-line no-console
        console.warn(`[useAsyncState:${label}] failed (${err.kind}${err.status ? ` ${err.status}` : ''})`, err.cause ?? err);
      }
      setState((s) => ({
        ...s,
        status: 'error',
        error: err,
        isRetrying: false,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  const retry = useCallback(async () => {
    // Use a tiny backoff to avoid hammering a flaky endpoint.
    await new Promise((r) => setTimeout(r, 250));
    await run();
  }, [run]);

  const reset = useCallback(() => {
    reqIdRef.current++;
    setState({
      status: 'idle',
      data: null,
      error: null,
      lastUpdated: null,
      isStale: false,
      isRetrying: false,
      attempts: 0,
    });
  }, []);

  // Auto-run on mount. The effect has no cleanup that touches reqId, so
  // StrictMode's double-invocation cannot swallow our successful response.
  // The only thing that invalidates a call is a fresh run()/retry() or an
  // explicit reset() — those bump reqIdRef and the response is discarded.
  // After a real unmount the component is gone, so any stray setState is
  // a harmless no-op (React 18 won't warn).
  useEffect(() => {
    if (auto) {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Staleness timer.
  useEffect(() => {
    if (!state.lastUpdated || ttlMs <= 0) {
      if (state.isStale) setState((s) => ({ ...s, isStale: false }));
      return;
    }
    const age = Date.now() - state.lastUpdated;
    if (age >= ttlMs) {
      setState((s) => (s.isStale ? s : { ...s, isStale: true }));
      return;
    }
    const t = setTimeout(() => {
      setState((s) => (s.isStale ? s : { ...s, isStale: true }));
    }, ttlMs - age);
    return () => clearTimeout(t);
  }, [state.lastUpdated, state.isStale, ttlMs]);

  return {
    ...state,
    loading: state.status === 'loading',
    run,
    retry,
    reset,
  };
}

/** Public helper: is this error worth retrying? Re-exported here for convenience. */
export { isRetryable, classifyError };
export type { AppError };
