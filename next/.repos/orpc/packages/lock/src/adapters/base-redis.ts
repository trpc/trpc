import type { Promisable } from '@orpc/shared'
import type { LockCallbackOptions, Locker, LockOptions } from '../types'
import { sleep, throwIfAborted } from '@orpc/shared'
import { LockTimeoutError } from '../error'

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end

return 0
`

/**
 * Options shared by every Redis-backed locker adapter.
 *
 * @see {@link https://orpc.dev/docs/helpers/lock#adapters | Lock Helpers - Adapters}
 */
export interface BaseRedisLockerOptions {
  /**
   * The prefix to use for Redis keys.
   *
   * @default ''
   */
  prefix?: string

  /**
   * How long a lock is held before it expires automatically, in milliseconds.
   * Guards against holders that never release the lock, such as a crashed process.
   * Can be overridden per call.
   */
  ttl: number

  /**
   * How long to wait for a lock to become available, in milliseconds.
   * Can be overridden per call.
   *
   * @default 10000
   */
  timeout?: number

  /**
   * How long to wait between acquisition attempts while the lock
   * is held by someone else, in milliseconds.
   *
   * @default 100
   */
  retryInterval?: number
}

/**
 * Base class for Redis-backed locker adapters. It owns the key naming, the lock
 * token, the acquisition loop, and the atomic Lua release, so every adapter built
 * on it can share locks with the others regardless of the Redis client in use.
 *
 * Extend it and implement the abstract methods to support another Redis client.
 *
 * @see {@link https://orpc.dev/docs/helpers/lock#adapters | Lock Helpers - Adapters}
 */
export abstract class BaseRedisLocker implements Locker {
  protected readonly prefix: string
  protected readonly ttl: number
  protected readonly timeout: number
  protected readonly retryInterval: number

  constructor(options: BaseRedisLockerOptions) {
    this.prefix = options.prefix ?? ''
    this.ttl = options.ttl
    this.timeout = options.timeout ?? 10_000
    this.retryInterval = options.retryInterval ?? 100
  }

  /**
   * Sets `key` to `token` only when it does not exist yet, with an expiry
   * of `ttl` milliseconds (`SET key token NX PX ttl`), and resolves with
   * whether the key was set.
   */
  protected abstract acquire(key: string, token: string, ttl: number): Promise<boolean>

  /**
   * Runs a Lua script (`EVAL script numkeys key [key ...] arg [arg ...]`).
   */
  protected abstract evalScript(script: string, keys: string[], args: string[]): Promise<unknown>

  async lock<T>(key: string, fn: (options: LockCallbackOptions) => Promisable<T>, options: LockOptions = {}): Promise<T> {
    const prefixedKey = `${this.prefix}${key}`
    const ttl = options.ttl ?? this.ttl
    const deadline = Date.now() + (options.timeout ?? this.timeout)
    const token = crypto.randomUUID()
    let waited = false

    throwIfAborted(options.signal)

    while (!(await this.acquire(prefixedKey, token, ttl))) {
      const remaining = deadline - Date.now()

      if (remaining <= 0) {
        throw new LockTimeoutError(key)
      }

      waited = true
      await sleep(Math.min(this.retryInterval, remaining), { signal: options.signal })
    }

    try {
      return await fn({ waited })
    }
    finally {
      await this.evalScript(RELEASE_LOCK_SCRIPT, [prefixedKey], [token])
    }
  }
}
