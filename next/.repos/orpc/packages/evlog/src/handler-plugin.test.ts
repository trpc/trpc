import type { LogLevel } from 'evlog'
import { ORPCError, RPCSerializer } from '@orpc/client'
import { AbortError, ORPC_NAME, sleep } from '@orpc/shared'
import { ErrorEvent } from '@standard-server/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOGGER_CONTEXT_SYMBOL } from './context'
import { EvlogHandlerPlugin } from './handler-plugin'

const mocks = vi.hoisted(() => ({
  defineFrameworkIntegration: vi.fn(),
  start: vi.fn(),
  spec: undefined as any,
}))

vi.mock('evlog/toolkit', () => ({
  defineFrameworkIntegration: mocks.defineFrameworkIntegration.mockImplementation((spec) => {
    mocks.spec = spec

    return {
      start: mocks.start,
    }
  }),
}))

function createRequest(
  url: string,
  options: { headers?: Record<string, string | string[]>, signal?: AbortSignal } = {},
) {
  return {
    method: 'GET',
    url,
    headers: options.headers ?? {},
    signal: options.signal,
  } as any
}

function createLogger() {
  return {
    set: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
  }
}

function mockIntegration(logger = createLogger()) {
  const finish = vi.fn().mockResolvedValue(null)
  const runWith = vi.fn(async (run: () => Promise<unknown>) => await run())

  mocks.start.mockReturnValue({
    skipped: false,
    finish,
    runWith,
    logger,
  })

  return {
    finish,
    runWith,
    logger,
  }
}

function getPluginHooks(plugin: EvlogHandlerPlugin<any>, options: Record<string, unknown> = {}) {
  const initialized = plugin.init(options as any)

  return {
    routing: initialized.routingInterceptors?.[0] as any,
    interceptor: initialized.interceptors?.[0] as any,
    client: initialized.clientInterceptors?.[0] as any,
    initialized,
  }
}

async function collectIterator<T>(iterator: AsyncIterable<T>) {
  const values: T[] = []

  for await (const value of iterator) {
    values.push(value)
  }

  return values
}

async function collectStream<T>(stream: ReadableStream<T>) {
  const reader = stream.getReader()
  const values: T[] = []

  while (true) {
    const result = await reader.read()

    if (result.done) {
      return values
    }

    values.push(result.value)
  }
}

describe('evlogHandlerPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.start.mockReset()
    mocks.spec = undefined
    vi.useRealTimers()
  })

  it('configures the framework integration and prepends its interceptors', () => {
    const storage = {} as any
    const existingRouting = vi.fn()
    const existingInterceptor = vi.fn()
    const existingClientInterceptor = vi.fn()

    const plugin = new EvlogHandlerPlugin({
      storage,
      logAbort: true,
      include: ['/rpc/*'],
    })

    expect(mocks.defineFrameworkIntegration).toHaveBeenCalledTimes(1)
    expect(mocks.spec.name).toBe(ORPC_NAME)
    expect(mocks.spec.storage).toBe(storage)
    expect(mocks.spec.extractRequest({
      request: createRequest('/hello/world?debug=1', {
        headers: { 'x-request-id': 'request-id' },
      }),
    })).toEqual({
      method: 'GET',
      path: '/hello/world',
      headers: { 'x-request-id': 'request-id' },
      requestId: 'request-id',
    })
    expect(mocks.spec.attachLogger({}, createLogger())).toBeUndefined()

    const initialized = plugin.init({
      routingInterceptors: [existingRouting],
      interceptors: [existingInterceptor],
      clientInterceptors: [existingClientInterceptor],
    } as any)

    expect(initialized.routingInterceptors).toEqual([
      expect.any(Function),
      existingRouting,
    ])
    expect(initialized.interceptors).toEqual([
      expect.any(Function),
      existingInterceptor,
    ])
    expect(initialized.clientInterceptors).toEqual([
      expect.any(Function),
      existingClientInterceptor,
    ])
  })

  it('bypasses the routing interceptor when evlog skips the request', async () => {
    const plugin = new EvlogHandlerPlugin()
    const { routing } = getPluginHooks(plugin)
    const next = vi.fn().mockResolvedValue('skipped')

    mocks.start.mockReturnValue({
      skipped: true,
      finish: vi.fn(),
      runWith: vi.fn(),
      logger: createLogger(),
    })

    await expect(routing({
      next,
      context: { existing: true },
      request: createRequest('/skip'),
    })).resolves.toBe('skipped')

    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      context: { existing: true },
      request: expect.objectContaining({ url: '/skip' }),
    }), {})
    expect(next).toHaveBeenCalledWith()
  })

  it('injects the request logger into matched plain responses and finishes immediately', async () => {
    const plugin = new EvlogHandlerPlugin({ include: ['/rpc/*'] })
    const { routing } = getPluginHooks(plugin)
    const { finish, logger, runWith } = mockIntegration()
    const next = vi.fn(async (options: any) => {
      expect(options.context.existing).toBe(true)
      expect(options.context[LOGGER_CONTEXT_SYMBOL]).toBe(logger)

      return {
        matched: true,
        response: {
          status: 204,
          body: 'pong',
        },
      }
    })

    const result = await routing({
      next,
      context: { existing: true },
      request: createRequest('/ping'),
    })

    expect(result).toEqual({
      matched: true,
      response: {
        status: 204,
        body: 'pong',
      },
    })
    expect(runWith).toHaveBeenCalledTimes(1)
    expect(finish).toHaveBeenCalledWith({ status: 204 })
    expect(mocks.start).toHaveBeenCalledWith(expect.any(Object), { include: ['/rpc/*'] })
  })

  it('marks unmatched requests before finishing', async () => {
    const plugin = new EvlogHandlerPlugin()
    const { routing } = getPluginHooks(plugin)
    const { finish, logger } = mockIntegration()

    const result = await routing({
      next: vi.fn().mockResolvedValue({ matched: false, response: undefined }),
      context: {},
      request: createRequest('/missing'),
    })

    expect(result).toEqual({ matched: false, response: undefined })
    expect(logger.set).toHaveBeenCalledWith({ message: 'No procedure matched' })
    expect(finish).toHaveBeenCalledWith({ status: undefined })
  })

  it('logs internal routing failures and rethrows them', async () => {
    const plugin = new EvlogHandlerPlugin()
    const { routing } = getPluginHooks(plugin)
    const { finish, logger } = mockIntegration()
    const error = new Error('internal-error')

    await expect(routing({
      next: vi.fn().mockRejectedValue(error),
      context: {},
      request: createRequest('/ping'),
    })).rejects.toThrow(error)

    expect(logger.error).toHaveBeenCalledWith(error)
    expect(finish).toHaveBeenCalledWith()
  })

  it('wraps matched AsyncIteratorObject and finishes after successful consumption', async () => {
    const plugin = new EvlogHandlerPlugin()
    const { routing } = getPluginHooks(plugin)
    const { finish } = mockIntegration()

    async function* source() {
      yield 1
      yield 2
    }

    const iterator = source() as unknown as AsyncIterable<number> & { meta: string }
    iterator.meta = 'preserved'

    const result = await routing({
      next: vi.fn().mockResolvedValue({
        matched: true,
        response: {
          status: 200,
          body: iterator,
        },
      }),
      context: {},
      request: createRequest('/iterable'),
    })

    expect((result.response.body as typeof iterator).meta).toBe('preserved')
    await expect(collectIterator(result.response.body as AsyncIterable<number>)).resolves.toEqual([1, 2])
    expect(finish).toHaveBeenCalledWith({ status: 200 })
  })

  it('logs AsyncIteratorObject wrapper errors as internal failures', async () => {
    const plugin = new EvlogHandlerPlugin()
    const { routing } = getPluginHooks(plugin)
    const { finish, logger } = mockIntegration()

    async function* source() {
      // eslint-disable-next-line no-throw-literal
      throw 'iterator-failure'
    }

    const result = await routing({
      next: vi.fn().mockResolvedValue({
        matched: true,
        response: {
          status: 200,
          body: source(),
        },
      }),
      context: {},
      request: createRequest('/iterable-error'),
    })

    await expect(collectIterator(result.response.body as AsyncIterable<unknown>)).rejects.toBe('iterator-failure')
    expect(logger.error).toHaveBeenCalledWith('iterator-failure')
    expect(finish).toHaveBeenCalledWith({ status: 200 })
    expect(logger.error).toHaveBeenCalledBefore(finish)
  })

  it('does not log ErrorEvent from response body iterators', async () => {
    const plugin = new EvlogHandlerPlugin()
    const { routing } = getPluginHooks(plugin)
    const { finish, logger } = mockIntegration()

    async function* source() {
      throw new ORPCError('UNAUTHORIZED')
    }

    const result = await routing({
      next: vi.fn().mockResolvedValue({
        matched: true,
        response: {
          status: 200,
          body: new RPCSerializer().serialize(source()),
        },
      }),
      context: {},
      request: createRequest('/iterable-error-event'),
    })

    await expect(collectIterator(result.response.body as AsyncIterable<unknown>)).rejects.toBeInstanceOf(ErrorEvent)
    expect(logger.error).not.toHaveBeenCalled()
    expect(finish).toHaveBeenCalledWith({ status: 200 })
  })

  it('wraps matched readable streams and finishes after they close', async () => {
    const plugin = new EvlogHandlerPlugin()
    const { routing } = getPluginHooks(plugin)
    const { finish } = mockIntegration()

    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('chunk-1')
        controller.enqueue('chunk-2')
        controller.close()
      },
    }) as ReadableStream<string> & { meta: string }

    stream.meta = 'preserved'

    const result = await routing({
      next: vi.fn().mockResolvedValue({
        matched: true,
        response: {
          status: 206,
          body: stream,
        },
      }),
      context: {},
      request: createRequest('/stream'),
    })

    expect((result.response.body as typeof stream).meta).toBe('preserved')
    await expect(collectStream(result.response.body as ReadableStream<string>)).resolves.toEqual(['chunk-1', 'chunk-2'])
    await sleep(0)
    expect(finish).toHaveBeenCalledWith({ status: 206 })
  })

  it('logs readable stream wrapper errors as internal failures', async () => {
    const plugin = new EvlogHandlerPlugin()
    const { routing } = getPluginHooks(plugin)
    const { finish, logger } = mockIntegration()
    const streamError = new Error('stream-error')

    const result = await routing({
      next: vi.fn().mockResolvedValue({
        matched: true,
        response: {
          status: 200,
          body: new ReadableStream({
            start(controller) {
              controller.error(streamError)
            },
          }),
        },
      }),
      context: {},
      request: createRequest('/stream-error'),
    })

    await expect(collectStream(result.response.body as ReadableStream<unknown>)).rejects.toThrow(streamError)
    await sleep(0)
    expect(logger.error).toHaveBeenCalledWith(streamError)
    expect(finish).toHaveBeenCalledWith({ status: 200 })
    expect(logger.error).toHaveBeenCalledBefore(finish)
  })

  it('sets rpc metadata and logs abort state', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T12:00:00.000Z'))

    const controller = new AbortController()
    const logger = createLogger()
    const plugin = new EvlogHandlerPlugin({ logAbort: true })
    const { interceptor } = getPluginHooks(plugin)

    await expect(interceptor({
      next: vi.fn(async () => {
        controller.abort('manual')
        return 'pong'
      }),
      context: { [LOGGER_CONTEXT_SYMBOL]: logger },
      path: ['nested', 'ping'],
      request: createRequest('/ping', { signal: controller.signal }),
    })).resolves.toBe('pong')

    expect(logger.set).toHaveBeenNthCalledWith(1, {
      rpc: { system: ORPC_NAME, method: 'nested.ping' },
    })
    expect(logger.set).toHaveBeenNthCalledWith(2, {
      abort: {
        reason: 'manual',
        abortedAt: '2026-05-30T12:00:00.000Z',
      },
    })

    const alreadyAborted = new AbortController()
    alreadyAborted.abort('before')

    await expect(interceptor({
      next: vi.fn().mockResolvedValue('done'),
      context: { [LOGGER_CONTEXT_SYMBOL]: logger },
      path: ['ping'],
      request: createRequest('/ping', { signal: alreadyAborted.signal }),
    })).resolves.toBe('done')

    expect(logger.set).toHaveBeenCalledWith({
      abort: {
        message: 'request was aborted before handling',
        reason: 'before',
      },
    })
  })

  it('downgrades business errors (ORPCError) to warn level and abort errors to info level, keeps INTERNAL_SERVER_ERROR and unexpected errors at error level', async () => {
    const logger = createLogger()
    const plugin = new EvlogHandlerPlugin()
    const { interceptor } = getPluginHooks(plugin)
    const businessError = new ORPCError('UNAUTHORIZED')

    await expect(interceptor({
      next: vi.fn().mockRejectedValue(businessError),
      context: { [LOGGER_CONTEXT_SYMBOL]: logger },
      path: ['ping'],
      request: createRequest('/ping'),
    })).rejects.toThrow(businessError)

    expect(logger.error).toHaveBeenCalledWith(businessError)
    expect(logger.setLevel).toHaveBeenCalledWith('warn')

    logger.error.mockClear()
    logger.setLevel.mockClear()

    const unexpectedError = new Error('boom')

    await expect(interceptor({
      next: vi.fn().mockRejectedValue(unexpectedError),
      context: { [LOGGER_CONTEXT_SYMBOL]: logger },
      path: ['ping'],
      request: createRequest('/ping'),
    })).rejects.toThrow(unexpectedError)

    expect(logger.error).toHaveBeenCalledWith(unexpectedError)
    expect(logger.setLevel).not.toHaveBeenCalled()

    logger.error.mockClear()
    logger.setLevel.mockClear()

    const abortError = new AbortError('reason')

    await expect(interceptor({
      next: vi.fn().mockRejectedValue(abortError),
      context: { [LOGGER_CONTEXT_SYMBOL]: logger },
      path: ['ping'],
      request: createRequest('/ping'),
    })).rejects.toThrow(abortError)

    expect(logger.error).toHaveBeenCalledWith(abortError)
    expect(logger.setLevel).toHaveBeenCalledWith('info')

    logger.error.mockClear()
    logger.setLevel.mockClear()

    const internalError = new ORPCError('INTERNAL_SERVER_ERROR')

    await expect(interceptor({
      next: vi.fn().mockRejectedValue(internalError),
      context: { [LOGGER_CONTEXT_SYMBOL]: logger },
      path: ['ping'],
      request: createRequest('/ping'),
    })).rejects.toThrow(internalError)

    expect(logger.error).toHaveBeenCalledWith(internalError)
    expect(logger.setLevel).not.toHaveBeenCalled()
  })

  it('skips procedure error logging when no logger is in the context', async () => {
    const procedureErrorLevel = vi.fn()
    const plugin = new EvlogHandlerPlugin({ procedureErrorLevel })
    const { interceptor } = getPluginHooks(plugin)
    const error = new Error('boom')

    await expect(interceptor({
      next: vi.fn().mockRejectedValue(error),
      context: {},
      path: ['ping'],
      request: createRequest('/ping'),
    })).rejects.toThrow(error)

    expect(procedureErrorLevel).not.toHaveBeenCalled()
  })

  it('honors the procedureErrorLevel option, passing the error and its default level', async () => {
    const logger = createLogger()
    const procedureErrorLevel = vi.fn(
      (error: unknown, level: LogLevel) =>
        error instanceof ORPCError && error.code === 'UNAUTHORIZED' ? 'debug' as const : level,
    )
    const plugin = new EvlogHandlerPlugin({ procedureErrorLevel })
    const { interceptor } = getPluginHooks(plugin)
    const businessError = new ORPCError('UNAUTHORIZED')

    await expect(interceptor({
      next: vi.fn().mockRejectedValue(businessError),
      context: { [LOGGER_CONTEXT_SYMBOL]: logger },
      path: ['ping'],
      request: createRequest('/ping'),
    })).rejects.toThrow(businessError)

    expect(procedureErrorLevel).toHaveBeenCalledWith(businessError, 'warn')
    expect(logger.error).toHaveBeenCalledWith(businessError)
    expect(logger.setLevel).toHaveBeenCalledWith('debug')

    logger.error.mockClear()
    logger.setLevel.mockClear()

    const otherError = new ORPCError('CONFLICT')

    await expect(interceptor({
      next: vi.fn().mockRejectedValue(otherError),
      context: { [LOGGER_CONTEXT_SYMBOL]: logger },
      path: ['ping'],
      request: createRequest('/ping'),
    })).rejects.toThrow(otherError)

    expect(procedureErrorLevel).toHaveBeenCalledWith(otherError, 'warn')
    expect(logger.setLevel).toHaveBeenCalledWith('warn')
  })

  it('returns non-stream client outputs unchanged', async () => {
    const plugin = new EvlogHandlerPlugin()
    const { client } = getPluginHooks(plugin)

    await expect(client({
      next: vi.fn().mockResolvedValue('pong'),
      context: {},
    })).resolves.toBe('pong')
  })

  it('logs client AsyncIteratorObject errors', async () => {
    const logger = createLogger()
    const plugin = new EvlogHandlerPlugin()
    const { client } = getPluginHooks(plugin)
    const streamError = new Error('stream-error')

    async function* source() {
      throw streamError
    }

    const output = await client({
      next: vi.fn().mockResolvedValue(source()),
      context: { [LOGGER_CONTEXT_SYMBOL]: logger },
    })

    await expect(collectIterator(output as AsyncIterable<unknown>)).rejects.toThrow(streamError)
    expect(logger.error).toHaveBeenCalledWith(streamError)
    expect(logger.setLevel).not.toHaveBeenCalled()
  })

  it('logs client readable stream abort errors and downgrades them to info level', async () => {
    const logger = createLogger()
    const plugin = new EvlogHandlerPlugin()
    const { client } = getPluginHooks(plugin)
    const abortError = new AbortError('stream-abort')

    const output = await client({
      next: vi.fn().mockResolvedValue(new ReadableStream({
        start(controller) {
          controller.error(abortError)
        },
      })),
      context: { [LOGGER_CONTEXT_SYMBOL]: logger },
    })

    await expect(collectStream(output as ReadableStream<unknown>)).rejects.toThrow(abortError)
    expect(logger.error).toHaveBeenCalledWith(abortError)
    expect(logger.setLevel).toHaveBeenCalledWith('info')
  })
})
