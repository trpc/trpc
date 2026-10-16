import type { LockCallbackOptions, Locker, LockOptions } from '@orpc/experimental-lock'
import type { Promisable } from '@orpc/shared'
import { LockTimeoutError } from '@orpc/experimental-lock'
import { promiseWithResolvers, runWithSignal, throwIfAborted } from '@orpc/shared'

export interface experimental_DurableLockerOptions {
  /**
   * The prefix to use for Durable Object names.
   *
   * @default ''
   */
  prefix?: string

  /**
   * How long a lock is held before it expires automatically, in milliseconds.
   * Guards against holders that never release the lock. A crashed holder releases
   * the lock right away, since its socket drops. Can be overridden per call.
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
   * Custom function to get the Durable Object stub for a lock key.
   *
   * @default ((namespace, key) => namespace.getByName(key))
   */
  getStubByName?: (namespace: DurableObjectNamespace, key: string) => DurableObjectStub
}

/**
 * Locker adapter for Cloudflare Durable Objects. A caller holds a hibernatable WebSocket
 * to an `experimental_DurableLockObject` while it holds or waits for the lock, so the
 * object is not billed meanwhile, and closing the socket releases the lock.
 *
 * @see {@link https://orpc.dev/docs/helpers/lock#adapters | Lock Helpers - Adapters}
 */
export class experimental_DurableLocker implements Locker {
  private readonly prefix: string
  private readonly ttl: number
  private readonly timeout: number
  private readonly getStubByName: Exclude<experimental_DurableLockerOptions['getStubByName'], undefined>

  constructor(
    private readonly namespace: DurableObjectNamespace<any>,
    options: experimental_DurableLockerOptions,
  ) {
    this.prefix = options.prefix ?? ''
    this.ttl = options.ttl
    this.timeout = options.timeout ?? 10_000
    this.getStubByName = options.getStubByName ?? ((namespace, key) => namespace.getByName(key))
  }

  async lock<T>(key: string, fn: (options: LockCallbackOptions) => Promisable<T>, options: LockOptions = {}): Promise<T> {
    throwIfAborted(options.signal)

    const response = await this.getStubByName(this.namespace, `${this.prefix}${key}`).fetch('http://localhost/acquire', {
      headers: { upgrade: 'websocket' },
    })

    const websocket = response.webSocket

    if (!websocket) {
      throw new Error(`Failed to acquire the lock: ${response.status} ${response.statusText}`, {
        cause: response,
      })
    }

    const close = () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close()
      }
    }
    const waited = !response.headers.has('orpc-lock-acquired')

    websocket.accept()

    if (waited) {
      const timeout = options.timeout ?? this.timeout

      if (timeout <= 0) {
        close()
        throw new LockTimeoutError(key)
      }

      const granted = promiseWithResolvers<void>()
      const timer = setTimeout(() => granted.reject(new LockTimeoutError(key)), timeout)

      websocket.addEventListener('message', () => granted.resolve())
      websocket.addEventListener('close', () => granted.reject(new Error('The lock durable object closed the socket before handing the lock over')))
      websocket.addEventListener('error', event => granted.reject(new Error('Lock websocket error', { cause: event })))

      await runWithSignal(options.signal, () => granted.promise)
        .catch((error) => {
          close()
          throw error
        })
        .finally(() => clearTimeout(timer))
    }

    const expiry = setTimeout(close, options.ttl ?? this.ttl)

    try {
      return await fn({ waited })
    }
    finally {
      clearTimeout(expiry)
      close()
    }
  }
}
