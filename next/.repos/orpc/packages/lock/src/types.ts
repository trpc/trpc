import type { Promisable } from '@orpc/shared'

export interface LockOptions {
  /**
   * How long the lock is held before it expires automatically, in milliseconds.
   * Guards against holders that never release the lock, such as a crashed process.
   *
   * @default the adapter default
   */
  ttl?: number

  /**
   * How long to wait for the lock to become available, in milliseconds.
   *
   * @default the adapter default
   */
  timeout?: number

  /**
   * Aborts waiting for the lock. Has no effect once the lock is acquired.
   */
  signal?: AbortSignal
}

export interface LockCallbackOptions {
  /**
   * Whether the lock was acquired only after waiting for another holder to release it.
   * `false` means the lock was acquired immediately.
   */
  waited: boolean
}

/**
 * Standard interface for running work under a lock, so that work sharing
 * the same key never runs concurrently.
 * Implement it for custom strategies, or use one of the provided adapters.
 *
 * @see {@link https://orpc.dev/docs/helpers/lock | Lock Helpers}
 */
export interface Locker {
  /**
   * Runs `fn` while holding the lock for `key`, and releases the lock afterwards,
   * even when `fn` throws.
   *
   * @throws {LockTimeoutError} when the lock cannot be acquired before the timeout elapses
   */
  lock<T>(key: string, fn: (options: LockCallbackOptions) => Promisable<T>, options?: LockOptions): Promise<T>
}
