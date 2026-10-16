import { describe, expect, test, vi } from 'vitest'
import { waitForReason } from '../src/await-signal'
import { waitFor } from '../src/load-client'
import { waitForRequest } from '../src/ssr/server'

test('waitForRequest aliases waitForReason through the server barrel', () => {
  expect(waitForRequest).toBe(waitForReason)
})

describe('waitFor', () => {
  test.each(['resolve', 'reject'] as const)(
    'removes its abort listener after the value %ss',
    async (outcome) => {
      const controller = new AbortController()
      const add = vi.spyOn(controller.signal, 'addEventListener')
      const remove = vi.spyOn(controller.signal, 'removeEventListener')
      const value =
        outcome === 'resolve' ? Promise.resolve(42) : Promise.reject(42)
      const result = waitFor(value, controller.signal)
      if (outcome === 'resolve') {
        await expect(result).resolves.toBe(42)
      } else {
        await expect(result).rejects.toBe(42)
      }
      expect(add).toHaveBeenCalledOnce()
      expect(remove).toHaveBeenCalledExactlyOnceWith(
        'abort',
        add.mock.calls[0]![1],
      )
    },
  )

  test('observes a late rejection and cleans up after an active wait is aborted', async () => {
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, 'addEventListener')
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    let rejectValue!: (error: Error) => void
    const value = new Promise<never>((_, reject) => {
      rejectValue = reject
    })
    const result = waitFor(value, controller.signal)
    const canceled = expect(result).rejects.toBe(controller.signal)

    controller.abort()
    await canceled
    rejectValue(new Error('late failure'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(add).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledExactlyOnceWith(
      'abort',
      add.mock.calls[0]![1],
    )
  })

  test('removes its abort listener when reading a thenable throws', async () => {
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, 'addEventListener')
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const error = new Error('then getter failed')
    const value: PromiseLike<never> = {
      get then(): never {
        throw error
      },
    }

    await expect(waitFor(value, controller.signal)).rejects.toBe(error)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(add).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledExactlyOnceWith(
      'abort',
      add.mock.calls[0]![1],
    )
  })

  test('observes a rejected value when the signal is already aborted', async () => {
    const controller = new AbortController()
    const error = new Error('late failure')
    controller.abort()

    await expect(waitFor(undefined, controller.signal)).rejects.toBe(
      controller.signal,
    )
    await expect(
      waitFor(Promise.reject(error), controller.signal),
    ).rejects.toBe(controller.signal)

    await Promise.resolve()
  })

  test('preserves reason-based cancellation and observes a late value', async () => {
    const controller = new AbortController()
    const reason = new Error('request canceled')
    const late = Promise.resolve('late response')
    const onLate = vi.fn()
    controller.abort(reason)

    await expect(waitForReason(late, controller.signal, onLate)).rejects.toBe(
      reason,
    )
    await vi.waitFor(() => expect(onLate).toHaveBeenCalledWith('late response'))
  })
})

describe('waitForReason', () => {
  test('handles nested abort dispatch before its listener runs', async () => {
    const source = new AbortController()
    const nested = new AbortController()
    const signal = AbortSignal.any([source.signal])
    signal.addEventListener('abort', () => nested.abort())

    const reason = new Error('request canceled')
    const result = waitForReason(Promise.resolve('late'), signal)
    source.abort(reason)

    await expect(result).rejects.toBe(reason)
  })

  test('removes its abort listener once the wait settles', async () => {
    const controller = new AbortController()
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener')
    const removeEventListener = vi.spyOn(
      controller.signal,
      'removeEventListener',
    )
    let resolveFirst!: (value: string) => void
    let rejectSecond!: (error: unknown) => void
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<string>((_resolve, reject) => {
      rejectSecond = reject
    })

    const firstResult = waitForReason(first, controller.signal)
    const secondResult = waitForReason(second, controller.signal)
    expect(addEventListener).toHaveBeenCalledTimes(2)

    resolveFirst('first')
    await expect(firstResult).resolves.toBe('first')
    const failure = new Error('wait failed')
    rejectSecond(failure)
    await expect(secondResult).rejects.toBe(failure)

    for (const [, listener] of addEventListener.mock.calls) {
      expect(removeEventListener).toHaveBeenCalledWith('abort', listener)
    }
  })

  test('rejects all active waits and observes their late values', async () => {
    const controller = new AbortController()
    const reason = new Error('request canceled')
    const onFirstLate = vi.fn()
    const onSecondLate = vi.fn()
    let resolveFirst!: (value: string) => void
    let resolveSecond!: (value: string) => void
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<string>((resolve) => {
      resolveSecond = resolve
    })
    const firstResult = waitForReason(first, controller.signal, onFirstLate)
    const secondResult = waitForReason(second, controller.signal, onSecondLate)

    controller.abort(reason)
    await expect(firstResult).rejects.toBe(reason)
    await expect(secondResult).rejects.toBe(reason)

    resolveFirst('first')
    resolveSecond('second')
    await vi.waitFor(() => {
      expect(onFirstLate).toHaveBeenCalledWith('first')
      expect(onSecondLate).toHaveBeenCalledWith('second')
    })
  })

  test('aborts remaining waits after an out-of-order rejection', async () => {
    const controller = new AbortController()
    const reason = new Error('request canceled')
    const failure = new Error('wait failed')
    const lateFailure = new Error('late failure')
    const onLate = vi.fn()
    const onLateError = vi.fn()
    let resolveFirst!: (value: string) => void
    let rejectSecond!: (error: Error) => void
    let rejectThird!: (error: Error) => void
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<string>((_, reject) => {
      rejectSecond = reject
    })
    const third = new Promise<string>((_, reject) => {
      rejectThird = reject
    })
    const firstResult = waitForReason(first, controller.signal, onLate)
    const secondResult = waitForReason(second, controller.signal)
    const thirdResult = waitForReason(
      third,
      controller.signal,
      undefined,
      onLateError,
    )

    rejectSecond(failure)
    await expect(secondResult).rejects.toBe(failure)

    controller.abort(reason)
    await expect(firstResult).rejects.toBe(reason)
    await expect(thirdResult).rejects.toBe(reason)

    resolveFirst('late')
    rejectThird(lateFailure)
    await vi.waitFor(() => {
      expect(onLate).toHaveBeenCalledWith('late')
      expect(onLateError).toHaveBeenCalledWith(lateFailure)
    })
  })

  test('isolates waits for different signals', async () => {
    const firstController = new AbortController()
    const secondController = new AbortController()
    const firstReason = new Error('first request canceled')
    const firstAddEventListener = vi.spyOn(
      firstController.signal,
      'addEventListener',
    )
    const secondAddEventListener = vi.spyOn(
      secondController.signal,
      'addEventListener',
    )
    let resolveFirst!: (value: string) => void
    let resolveSecond!: (value: string) => void
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<string>((resolve) => {
      resolveSecond = resolve
    })
    const firstResult = waitForReason(first, firstController.signal)
    const secondResult = waitForReason(second, secondController.signal)

    expect(firstAddEventListener).toHaveBeenCalledOnce()
    expect(secondAddEventListener).toHaveBeenCalledOnce()

    firstController.abort(firstReason)
    await expect(firstResult).rejects.toBe(firstReason)

    resolveSecond('second result')
    await expect(secondResult).resolves.toBe('second result')
    resolveFirst('late first result')
    await Promise.resolve()
  })

  test('observes fulfilled and rejected values when already aborted', async () => {
    const controller = new AbortController()
    const reason = new Error('request canceled')
    const lateError = new Error('late failure')
    const onLate = vi.fn()
    const onLateError = vi.fn()
    controller.abort(reason)

    await expect(
      waitForReason(Promise.resolve('late'), controller.signal, onLate),
    ).rejects.toBe(reason)
    await expect(
      waitForReason(
        Promise.reject(lateError),
        controller.signal,
        undefined,
        onLateError,
      ),
    ).rejects.toBe(reason)

    await vi.waitFor(() => {
      expect(onLate).toHaveBeenCalledWith('late')
      expect(onLateError).toHaveBeenCalledWith(lateError)
    })
  })

  test('handles an abort during listener registration', async () => {
    const controller = new AbortController()
    const reason = new Error('request canceled')
    const onLate = vi.fn()
    const addEventListener = controller.signal.addEventListener.bind(
      controller.signal,
    )
    vi.spyOn(controller.signal, 'addEventListener').mockImplementation(
      (type, listener, options) => {
        addEventListener(type, listener, options)
        controller.abort(reason)
      },
    )
    let resolve!: (value: string) => void
    const value = new Promise<string>((resolveValue) => {
      resolve = resolveValue
    })

    const result = waitForReason(value, controller.signal, onLate)
    await expect(result).rejects.toBe(reason)

    resolve('late')
    await vi.waitFor(() => expect(onLate).toHaveBeenCalledWith('late'))
  })

  test('observes errors from late callbacks', async () => {
    const unhandled: Array<unknown> = []
    const onUnhandled = (error: unknown) => {
      unhandled.push(error)
    }
    process.on('unhandledRejection', onUnhandled)

    try {
      const reason = new Error('request canceled')
      const thrownError = new Error('late callback threw')
      const rejectedError = new Error('late callback rejected')
      const throwLate = vi.fn(() => {
        throw thrownError
      })
      const rejectLate = vi.fn(() => {
        return Promise.reject(rejectedError)
      })
      const expectCanceled = (promise: Promise<unknown>) => {
        return expect(promise).rejects.toBe(reason)
      }
      const alreadyAborted = new AbortController()
      alreadyAborted.abort(reason)

      await Promise.all([
        expectCanceled(
          waitForReason(
            Promise.resolve('late'),
            alreadyAborted.signal,
            throwLate,
          ),
        ),
        expectCanceled(
          waitForReason(
            Promise.reject(new Error('late failure')),
            alreadyAborted.signal,
            undefined,
            rejectLate,
          ),
        ),
      ])

      const controller = new AbortController()
      const fulfilledWait = waitForReason(
        Promise.resolve('late'),
        controller.signal,
        rejectLate,
      )
      const rejectedWait = waitForReason(
        Promise.reject(new Error('late failure')),
        controller.signal,
        undefined,
        throwLate,
      )
      controller.abort(reason)

      await Promise.all([
        expectCanceled(fulfilledWait),
        expectCanceled(rejectedWait),
      ])
      await new Promise<void>((resolve) => setTimeout(resolve, 0))

      expect(throwLate).toHaveBeenCalledTimes(2)
      expect(rejectLate).toHaveBeenCalledTimes(2)
      expect(unhandled).not.toContain(thrownError)
      expect(unhandled).not.toContain(rejectedError)
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
