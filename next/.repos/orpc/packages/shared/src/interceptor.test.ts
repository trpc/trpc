import { intercept, onAsyncIteratorObjectError, onError, onFinish, onReadableStreamError, onStart, onSuccess } from './interceptor'
import { promiseWithResolvers } from './promise'

describe('intercept', () => {
  const interceptor1 = vi.fn(({ next }) => next())
  const interceptor2 = vi.fn(({ next }) => next())
  const asyncMain = vi.fn(() => Promise.resolve('__main__'))

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when an interceptor returns its own result', () => {
    it('should keep a synchronous interceptor result and defer main until next is called', async () => {
      const main = vi.fn(() => '__main__')
      interceptor2.mockReturnValueOnce('__interceptor2__')

      const result = await intercept(
        [
          interceptor1,
          interceptor2,
        ],
        {
          foo: 'bar',
        },
        main,
      )

      expect(result).toEqual('__interceptor2__')
      expect(interceptor1).toHaveBeenCalledTimes(1)
      expect(interceptor1).toHaveBeenCalledWith({
        foo: 'bar',
        next: expect.any(Function),
      })

      expect(interceptor2).toHaveBeenCalledTimes(1)
      expect(interceptor2).toHaveBeenCalledWith({
        foo: 'bar',
        next: expect.any(Function),
      })

      expect(main).toHaveBeenCalledTimes(0)

      expect(interceptor2.mock.calls[0]![0].next()).toEqual('__main__')
      expect(main).toHaveBeenCalledTimes(1)
      expect(main).toHaveBeenCalledWith({
        foo: 'bar',
      })
    })

    it('should keep an asynchronous interceptor result and defer main until next is called', async () => {
      interceptor2.mockReturnValueOnce(Promise.resolve('__interceptor2__'))

      const result = await intercept(
        [
          interceptor1,
          interceptor2,
        ],
        {
          foo: 'bar',
        },
        asyncMain,
      )

      expect(result).toEqual('__interceptor2__')
      expect(interceptor1).toHaveBeenCalledTimes(1)
      expect(interceptor1).toHaveBeenCalledWith({
        foo: 'bar',
        next: expect.any(Function),
      })

      expect(interceptor2).toHaveBeenCalledTimes(1)
      expect(interceptor2).toHaveBeenCalledWith({
        foo: 'bar',
        next: expect.any(Function),
      })

      expect(asyncMain).toHaveBeenCalledTimes(0)

      expect(await interceptor2.mock.calls[0]![0].next()).toEqual('__main__')
      expect(asyncMain).toHaveBeenCalledTimes(1)
      expect(asyncMain).toHaveBeenCalledWith({
        foo: 'bar',
      })
    })
  })

  describe('when forwarding execution', () => {
    it('should allow an interceptor to replace the forwarded options', async () => {
      interceptor1.mockImplementationOnce(({ next }) => next({ bar: 'foo' }))

      const result = await intercept(
        [
          interceptor1,
          interceptor2,
        ],
        {
          foo: 'bar',
        },
        asyncMain,
      )

      expect(result).toEqual('__main__')

      expect(interceptor1).toHaveBeenCalledTimes(1)
      expect(interceptor1).toHaveBeenCalledWith({
        foo: 'bar',
        next: expect.any(Function),
      })

      expect(interceptor2).toHaveBeenCalledTimes(1)
      expect(interceptor2).toHaveBeenCalledWith({
        bar: 'foo',
        next: expect.any(Function),
      })

      expect(asyncMain).toHaveBeenCalledTimes(1)
      expect(asyncMain).toHaveBeenCalledWith({
        bar: 'foo',
      })
    })

    it('should keep a user-provided next field when forwarding custom options', async () => {
      interceptor2.mockImplementationOnce(({ next }) => next({ bar: 'foo', next: 'hello2' }))

      const result = await intercept(
        [
          interceptor1,
          interceptor2,
        ],
        {
          foo: 'bar',
          next: 'hello',
        },
        asyncMain,
      )

      expect(result).toEqual('__main__')

      expect(interceptor1).toHaveBeenCalledTimes(1)
      expect(interceptor1).toHaveBeenCalledWith({
        foo: 'bar',
        next: expect.any(Function),
      })

      expect(interceptor2).toHaveBeenCalledTimes(1)
      expect(interceptor2).toHaveBeenCalledWith({
        foo: 'bar',
        next: expect.any(Function),
      })

      expect(asyncMain).toHaveBeenCalledTimes(1)
      expect(asyncMain).toHaveBeenCalledWith({
        bar: 'foo',
        next: 'hello2',
      })
    })

    it('should allow calling next multiple times', async () => {
      interceptor2.mockReturnValueOnce(Promise.resolve('__interceptor2__'))

      const result = await intercept(
        [
          async ({ next }) => [await next(), await next(), await next()],
          interceptor1,
          interceptor2,
        ],
        {
          foo: 'bar',
        },
        asyncMain,
      )

      expect(result).toEqual(['__interceptor2__', '__main__', '__main__'])

      expect(interceptor1).toHaveBeenCalledTimes(3)
      expect(interceptor1).toHaveBeenCalledWith({
        foo: 'bar',
        next: expect.any(Function),
      })

      expect(interceptor2).toHaveBeenCalledTimes(3)
      expect(interceptor2).toHaveBeenCalledWith({
        foo: 'bar',
        next: expect.any(Function),
      })

      expect(asyncMain).toHaveBeenCalledTimes(2)
      expect(asyncMain).toHaveBeenCalledWith({
        foo: 'bar',
      })
    })

    it('should allow overriding options independently for each next call', async () => {
      const main: any = vi.fn(async (options: { foo: string, requestId: number }) => `${options.foo}:${options.requestId}`)

      const result = await intercept(
        [
          async ({ next }) => [
            await next({ foo: 'first', requestId: 1 }),
            await next({ foo: 'second', requestId: 2 }),
            await next({ foo: 'third', requestId: 3 }),
          ],
          interceptor1,
          interceptor2,
        ],
        {
          foo: 'initial',
          requestId: 0,
        },
        main,
      )

      expect(result).toEqual(['first:1', 'second:2', 'third:3'])

      expect(interceptor1).toHaveBeenCalledTimes(3)
      expect(interceptor1).toHaveBeenNthCalledWith(1, {
        foo: 'first',
        requestId: 1,
        next: expect.any(Function),
      })
      expect(interceptor1).toHaveBeenNthCalledWith(2, {
        foo: 'second',
        requestId: 2,
        next: expect.any(Function),
      })
      expect(interceptor1).toHaveBeenNthCalledWith(3, {
        foo: 'third',
        requestId: 3,
        next: expect.any(Function),
      })

      expect(interceptor2).toHaveBeenCalledTimes(3)
      expect(interceptor2).toHaveBeenNthCalledWith(1, {
        foo: 'first',
        requestId: 1,
        next: expect.any(Function),
      })
      expect(interceptor2).toHaveBeenNthCalledWith(2, {
        foo: 'second',
        requestId: 2,
        next: expect.any(Function),
      })
      expect(interceptor2).toHaveBeenNthCalledWith(3, {
        foo: 'third',
        requestId: 3,
        next: expect.any(Function),
      })

      expect(main).toHaveBeenCalledTimes(3)
      expect(main).toHaveBeenNthCalledWith(1, {
        foo: 'first',
        requestId: 1,
      })
      expect(main).toHaveBeenNthCalledWith(2, {
        foo: 'second',
        requestId: 2,
      })
      expect(main).toHaveBeenNthCalledWith(3, {
        foo: 'third',
        requestId: 3,
      })
    })
  })

  describe('when interceptors are not provided', () => {
    it('should call the main handler directly', () => {
      const main = vi.fn(() => '__main__')

      const result = intercept(undefined, { foo: 'bar' }, main)

      expect(result).toEqual('__main__')
      expect(main).toHaveBeenCalledTimes(1)
      expect(main).toHaveBeenCalledWith({
        foo: 'bar',
      })

      const result2 = intercept([], { foo: 'bar' }, main)
      expect(result2).toEqual('__main__')

      expect(main).toHaveBeenCalledTimes(2)
      expect(main).toHaveBeenCalledWith({
        foo: 'bar',
      })
    })
  })
})

describe('lifecycle interceptors', () => {
  const onStartFn = vi.fn()
  const onSuccessFn = vi.fn()
  const onErrorFn = vi.fn()
  const onFinishFn = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should run start, success, and finish hooks for successful calls', async () => {
    const result = await intercept(
      [
        onStart(onStartFn),
        onSuccess(onSuccessFn),
        onError(onErrorFn),
        onFinish(onFinishFn),
      ],
      {
        foo: 'bar',
      },
      () => Promise.resolve('__main__'),
    )

    expect(result).toEqual('__main__')

    expect(onStartFn).toHaveBeenCalledTimes(1)
    expect(onStartFn).toHaveBeenCalledWith({
      foo: 'bar',
      next: expect.any(Function),
    })

    expect(onSuccessFn).toHaveBeenCalledTimes(1)
    expect(onSuccessFn).toHaveBeenCalledWith(
      '__main__',
      {
        foo: 'bar',
        next: expect.any(Function),
      },
    )

    expect(onFinishFn).toHaveBeenCalledTimes(1)
    expect(onFinishFn).toHaveBeenCalledWith(
      [null, '__main__', true],
      {
        foo: 'bar',
        next: expect.any(Function),
      },
    )

    expect(onErrorFn).toHaveBeenCalledTimes(0)
  })

  it('should run start, error, and finish hooks for failed calls', async () => {
    const error = new Error('__error__')

    await expect(intercept(
      [
        onStart(onStartFn),
        onSuccess(onSuccessFn),
        onError(onErrorFn),
        onFinish(onFinishFn),
      ],
      {
        foo: 'bar',
      },
      () => Promise.reject(error),
    )).rejects.toThrow('__error__')

    expect(onStartFn).toHaveBeenCalledTimes(1)
    expect(onStartFn).toHaveBeenCalledWith({
      foo: 'bar',
      next: expect.any(Function),
    })

    expect(onErrorFn).toHaveBeenCalledTimes(1)
    expect(onErrorFn).toHaveBeenCalledWith(
      error,
      {
        foo: 'bar',
        next: expect.any(Function),
      },
    )

    expect(onFinishFn).toHaveBeenCalledTimes(1)
    expect(onFinishFn).toHaveBeenCalledWith(
      [error, undefined, false],
      {
        foo: 'bar',
        next: expect.any(Function),
      },
    )

    expect(onSuccessFn).toHaveBeenCalledTimes(0)
  })
})

describe('onFinish', () => {
  // Pins the per-call state contract. It passes with `state` in the factory closure too: that version
  // only leaked the last result, which needs forced garbage collection to observe and is not tested.
  it('gives each call its own state when calls overlap', async () => {
    const callback = vi.fn()
    const interceptor = onFinish(callback)
    const error = new Error('__error__')
    const { promise, resolve } = promiseWithResolvers<string>()

    const first = interceptor({ next: () => promise })
    await expect(interceptor({ next: () => Promise.reject(error) })).rejects.toBe(error)
    resolve('__first__')
    await expect(first).resolves.toBe('__first__')

    expect(callback).toHaveBeenNthCalledWith(1, [error, undefined, false], expect.anything())
    expect(callback).toHaveBeenNthCalledWith(2, [null, '__first__', true], expect.anything())
  })
})

describe('stream interceptors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('onAsyncIteratorObjectError', () => {
    it('does not invoke callback for non-iterator output', async () => {
      const callback = vi.fn()

      const result = await intercept(
        [onAsyncIteratorObjectError(callback)],
        { foo: 'bar' },
        () => '__OUTPUT__',
      )

      expect(result).toBe('__OUTPUT__')
      expect(callback).not.toHaveBeenCalled()
    })

    it('invokes callback when the returned async iterator errors while being consumed', async () => {
      const error = new Error('__ITERATOR_ERROR__')
      const iterator = (async function* () {
        yield 'event'
        throw error
      })()

      const callback = vi.fn()

      const wrapped = await intercept(
        [onAsyncIteratorObjectError(callback)],
        { foo: 'bar' },
        () => iterator,
      ) as AsyncIterableIterator<string>

      await expect(wrapped.next()).resolves.toEqual({ value: 'event', done: false })
      await expect(wrapped.next()).rejects.toThrow(error)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ foo: 'bar', next: expect.any(Function) }),
      )
    })

    it('does not invoke callback when the async iterator completes successfully', async () => {
      const iterator = (async function* () {
        yield 'event'
        return 'done'
      })()

      const callback = vi.fn()

      const wrapped = await intercept(
        [onAsyncIteratorObjectError(callback)],
        { foo: 'bar' },
        () => iterator,
      ) as AsyncIterableIterator<string>

      await expect(wrapped.next()).resolves.toEqual({ value: 'event', done: false })
      await expect(wrapped.next()).resolves.toEqual({ value: 'done', done: true })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('onReadableStreamError', () => {
    it('does not invoke callback for non-stream output', async () => {
      const callback = vi.fn()

      const result = await intercept(
        [onReadableStreamError(callback)],
        { foo: 'bar' },
        () => '__OUTPUT__',
      )

      expect(result).toBe('__OUTPUT__')
      expect(callback).not.toHaveBeenCalled()
    })

    it('invokes callback when the returned readable stream errors while being consumed', async () => {
      const error = new Error('__STREAM_ERROR__')
      const stream = new ReadableStream({
        pull(controller) {
          controller.error(error)
        },
      })

      const callback = vi.fn()

      const wrapped = await intercept(
        [onReadableStreamError(callback)],
        { foo: 'bar' },
        () => stream,
      ) as ReadableStream<string>

      const reader = wrapped.getReader()
      await expect(reader.read()).rejects.toThrow(error)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ foo: 'bar', next: expect.any(Function) }),
      )
    })

    it('does not invoke callback when the readable stream completes successfully', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue('event')
          controller.close()
        },
      })

      const callback = vi.fn()

      const wrapped = await intercept(
        [onReadableStreamError(callback)],
        { foo: 'bar' },
        () => stream,
      ) as ReadableStream<string>

      const reader = wrapped.getReader()
      await expect(reader.read()).resolves.toEqual({ value: 'event', done: false })
      await expect(reader.read()).resolves.toEqual({ value: undefined, done: true })

      expect(callback).not.toHaveBeenCalled()
    })
  })
})
