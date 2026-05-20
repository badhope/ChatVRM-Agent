// ============================================================
// Async Lock - backed by the async-lock npm package
// ============================================================

import AsyncLockLib from 'async-lock';

/**
 * Async lock for preventing concurrent access to shared resources.
 *
 * Wraps the `async-lock` npm package to match the project's original
 * `AsyncLock` API so that existing callers continue to work unchanged.
 */
export class AsyncLock {
  private lock: AsyncLockLib;

  /**
   * Create a new AsyncLock instance.
   *
   * @param maxQueueSize - Maximum number of queued acquires (default 100)
   */
  constructor(maxQueueSize = 100) {
    this.lock = new AsyncLockLib({
      maxPending: maxQueueSize,
    });
  }

  /**
   * Acquire the lock, execute `fn`, then release.
   *
   * @param fn - The async function to execute while holding the lock
   * @returns The return value of `fn`
   */
  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    return this.lock.acquire('__default__', fn) as Promise<T>;
  }

  /**
   * Acquire a named lock, execute `fn`, then release.
   *
   * @param key - Lock key for granular locking
   * @param fn  - The async function to execute while holding the lock
   * @returns The return value of `fn`
   */
  async acquireByKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.lock.acquire(key, fn) as Promise<T>;
  }
}
