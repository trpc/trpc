import type { TimeoutHandlerPluginOptions } from './timeout'
import { COMMON_ERROR_STATUS_MAP, ORPCError } from '@orpc/client'
import { AbortError } from '@orpc/shared'
import { RPCHandler } from '../adapters/fetch'
import { os } from '../builder'
import { TimeoutHandlerPlugin } from './timeout'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})

describe('timeoutHandlerPlugin', () => {
  const procedure_handler = vi.fn()
  const procedure = os.handler(procedure_handler)

  function makeHandler(options: TimeoutHandlerPluginOptions<any>, router: any = procedure) {
    return new RPCHandler(router, {
      allowMethods: ['GET'], // tests below send GET requests
      plugins: [new TimeoutHandlerPlugin(options)],
    })
  }

  /** A sleep that honors the signal by rejecting with the abort reason, or ignores it when no signal is given. */
  function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(signal.reason)
      }, { once: true })
    })
  }

  it('should respond and clear the timeout when the procedure finishes in time', async () => {
    procedure_handler.mockResolvedValueOnce('success')
    const handler = makeHandler({ timeout: 5000 })

    const { response } = await handler.handle(new Request('http://localhost'))
    expect(response?.status).toBe(200)

    const { signal } = procedure_handler.mock.calls[0]![0]
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })

  it('should abort the signal with an AbortError and respond once the procedure honors it', async () => {
    procedure_handler.mockImplementationOnce(({ signal }) => sleepWithSignal(100_000, signal))
    const handler = makeHandler({ timeout: 1000 })

    const promise = handler.handle(new Request('http://localhost'))
    await vi.advanceTimersByTimeAsync(1000)

    const { response } = await promise
    expect(response?.status).toBe(COMMON_ERROR_STATUS_MAP.INTERNAL_SERVER_ERROR)

    const { signal } = procedure_handler.mock.calls[0]![0]
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBeInstanceOf(AbortError)
    expect(signal.reason.message).toBe('Request timed out after 1000ms')
  })

  it('should not preempt a procedure that ignores the abort signal', async () => {
    procedure_handler.mockImplementationOnce(async () => {
      await sleepWithSignal(100_000)
      return 'late success'
    })
    const handler = makeHandler({ timeout: 1000 })

    const promise = handler.handle(new Request('http://localhost'))

    await vi.advanceTimersByTimeAsync(1000)
    expect(procedure_handler.mock.calls[0]![0].signal.aborted).toBe(true)

    await vi.advanceTimersByTimeAsync(99_000)
    const { response } = await promise
    expect(response?.status).toBe(200) // the late result is still delivered
  })

  it('should not mask procedure errors thrown after the timeout', async () => {
    procedure_handler.mockImplementationOnce(async () => {
      await sleepWithSignal(100_000)
      throw new ORPCError('NOT_ACCEPTABLE')
    })
    const handler = makeHandler({ timeout: 1000 })

    const promise = handler.handle(new Request('http://localhost'))
    await vi.advanceTimersByTimeAsync(100_000)

    const { response } = await promise
    expect(response?.status).toBe(COMMON_ERROR_STATUS_MAP.NOT_ACCEPTABLE)
  })

  it('should support dynamic timeout based on interceptor options', async () => {
    procedure_handler.mockImplementationOnce(({ signal }) => sleepWithSignal(100_000, signal))

    const timeout = vi.fn(({ context }: any) => context.timeout)
    const handler = makeHandler({ timeout })

    const promise = handler.handle(new Request('http://localhost'), { context: { timeout: 1000 } })
    await vi.advanceTimersByTimeAsync(1000)

    const { response } = await promise
    expect(response?.status).toBe(COMMON_ERROR_STATUS_MAP.INTERNAL_SERVER_ERROR)

    expect(timeout).toHaveBeenCalledTimes(1)
    expect(timeout).toHaveBeenCalledWith(expect.objectContaining({
      path: [],
      procedure,
      context: { timeout: 1000 },
    }))
  })

  it.each([null, undefined])('should dynamically disable timeout when value is %s', async (timeout) => {
    procedure_handler.mockImplementationOnce(() => sleepWithSignal(100_000).then(() => 'success'))
    const handler = makeHandler({ timeout: () => timeout })

    const promise = handler.handle(new Request('http://localhost'))
    await vi.advanceTimersByTimeAsync(100_000)

    const { response } = await promise
    expect(response?.status).toBe(200)
  })

  it.each([
    ['not provided', {}],
    ['null', { streamingTimeout: () => null }],
    ['undefined', { streamingTimeout: () => undefined }],
  ])('should let streaming responses outlive the timeout when streamingTimeout is %s', async (_, options) => {
    const handler = makeHandler({ timeout: 1000, ...options }, os.handler(async function* () {
      yield 'first'
      await sleepWithSignal(100_000)
      yield 'second'
    }))

    const { response } = await handler.handle(new Request('http://localhost'))
    expect(response?.status).toBe(200)

    const textPromise = response!.text()
    await vi.advanceTimersByTimeAsync(100_000)

    const text = await textPromise
    expect(text).toContain('first')
    expect(text).toContain('second')
    expect(text).not.toContain('event: error')
  })

  it('should end event iterator bodies with an error event when streamingTimeout is exceeded', async () => {
    let cleaned = false
    const handler = makeHandler({ timeout: 1000, streamingTimeout: 2000 }, os.handler(async function* ({ signal }) {
      try {
        yield 'first'
        await sleepWithSignal(100_000, signal)
        yield 'second'
      }
      finally {
        cleaned = true
      }
    }))

    const { response } = await handler.handle(new Request('http://localhost'))
    expect(response?.status).toBe(200)

    const textPromise = response!.text()
    await vi.advanceTimersByTimeAsync(2000)

    const text = await textPromise
    expect(text).toContain('first')
    expect(text).not.toContain('second')
    expect(text).toContain('event: error')
    expect(cleaned).toBe(true)
  })

  it('should end readable stream bodies once the producer honors the signal when streamingTimeout is exceeded', async () => {
    const handler = new RPCHandler(procedure, {
      allowMethods: ['GET'],
      interceptors: [async ({ request }) => ({
        status: 200,
        headers: {},
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('first'))
            request.signal!.addEventListener('abort', () => {
              controller.error(request.signal!.reason)
            }, { once: true })
          },
        }),
      })],
      plugins: [new TimeoutHandlerPlugin({ timeout: 1000, streamingTimeout: 2000 })],
    })

    const { response } = await handler.handle(new Request('http://localhost'))
    expect(response?.status).toBe(200)

    const reader = response!.body!.getReader()
    await expect(reader.read()).resolves.toEqual({ done: false, value: new TextEncoder().encode('first') })

    const nextRead = reader.read()
    nextRead.catch(() => {})
    await vi.advanceTimersByTimeAsync(2000)

    await expect(nextRead).rejects.toSatisfy(error =>
      error instanceof AbortError && error.message === 'Request timed out after 2000ms',
    )
  })

  it('should let streaming responses finish in time and clear the streaming timeout', async () => {
    const handler = makeHandler({ timeout: 1000, streamingTimeout: 5000 }, os.handler(async function* () {
      yield 'first'
      await sleepWithSignal(1000)
      yield 'second'
    }))

    const { response } = await handler.handle(new Request('http://localhost'))
    const textPromise = response!.text()
    await vi.advanceTimersByTimeAsync(1000)

    const text = await textPromise
    expect(text).toContain('first')
    expect(text).toContain('second')
    expect(text).not.toContain('event: error')
  })

  it('should support dynamic streamingTimeout based on interceptor options', async () => {
    const streamingTimeout = vi.fn(({ context }: any) => context.streamingTimeout)
    const handler = makeHandler({ timeout: 1000, streamingTimeout }, os.handler(async function* ({ signal }) {
      yield 'first'
      await sleepWithSignal(100_000, signal)
      yield 'second'
    }))

    const { response } = await handler.handle(new Request('http://localhost'), {
      context: { streamingTimeout: 2000 },
    })

    const textPromise = response!.text()
    await vi.advanceTimersByTimeAsync(2000)

    const text = await textPromise
    expect(text).toContain('first')
    expect(text).not.toContain('second')
    expect(text).toContain('event: error')

    expect(streamingTimeout).toHaveBeenCalledTimes(1)
    expect(streamingTimeout).toHaveBeenCalledWith(expect.objectContaining({
      context: { streamingTimeout: 2000 },
    }))
  })

  it('should forward abort from the request signal while the timeout is still active', async () => {
    procedure_handler.mockImplementationOnce(({ signal }) => sleepWithSignal(100_000, signal))
    const handler = makeHandler({ timeout: 5000 })

    const controller = new AbortController()
    const promise = handler.handle(new Request('http://localhost', { signal: controller.signal }))

    await vi.advanceTimersByTimeAsync(500)
    controller.abort(new Error('user cancelled'))

    const { response } = await promise
    expect(response?.status).toBe(500) // not a timeout response
  })
})
