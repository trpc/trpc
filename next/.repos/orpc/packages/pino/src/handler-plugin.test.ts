import type { StandardLazyRequest } from '@standard-server/core'
import { ORPCError, os } from '@orpc/server'
import { StandardHandler } from '@orpc/server/standard'
import { AbortError } from '@orpc/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLogger, LOGGER_CONTEXT_SYMBOL } from './context'
import { PinoHandlerPlugin } from './handler-plugin'

const globalSpies = {
  child: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  setBindings: vi.fn(),
}

class FakeLogger {
  private _bindings: any

  constructor(initial: any = {}, private readonly childDepth: number = 0) {
    this._bindings = initial
  }

  child(opts: any) {
    globalSpies.child(opts)
    return new FakeLogger({ ...this._bindings, ...opts }, this.childDepth + 1)
  }

  debug(...args: any[]) {
    expect(this.childDepth).toBeGreaterThan(0)
    globalSpies.debug(...args)
  }

  info(...args: any[]) {
    expect(this.childDepth).toBeGreaterThan(0)
    globalSpies.info(...args)
  }

  warn(...args: any[]) {
    expect(this.childDepth).toBeGreaterThan(0)
    globalSpies.warn(...args)
  }

  error(...args: any[]) {
    expect(this.childDepth).toBeGreaterThan(0)
    globalSpies.error(...args)
  }

  setBindings(bindings: any) {
    expect(this.childDepth).toBeGreaterThan(0)
    globalSpies.setBindings(bindings)
    this._bindings = { ...this._bindings, ...bindings }
  }

  bindings() {
    return this._bindings
  }
}

function createRequest(method: string, url: string, signal?: AbortSignal): StandardLazyRequest {
  return {
    method,
    url,
    headers: {
      'content-type': 'application/json',
    },
    resolveBody: () => Promise.resolve(undefined),
    signal,
  } as StandardLazyRequest
}

function createCodec(procedure: any) {
  return {
    resolveProcedure: vi.fn(async (request: StandardLazyRequest) => {
      if (request.url !== '/ping') {
        return undefined
      }

      return {
        path: ['ping'],
        procedure,
        decodeInput: vi.fn().mockResolvedValue(undefined),
      }
    }),
    encodeOutput: vi.fn(async (output: unknown) => ({
      status: 200,
      headers: {},
      body: output,
    })),
    encodeError: vi.fn(async (error: unknown) => ({
      status: 500,
      headers: {},
      body: error,
    })),
  }
}

describe('pinoHandlerPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs request lifecycle for matched and unmatched requests', async () => {
    const baseLogger = new FakeLogger({ rpc: {} })
    const codec = createCodec(os.handler(() => {
      throw new Error('boom')
    }))

    const handler = new StandardHandler(codec as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any, logLifecycle: true })],
    })

    await handler.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })

    expect(globalSpies.info).toHaveBeenNthCalledWith(1, 'request received')
    expect(globalSpies.info).toHaveBeenNthCalledWith(2, {
      msg: 'request handled',
      res: {
        status: 500,
      },
      responseTime: expect.toSatisfy(v => Number.isInteger(v) && v > 0),
    })

    vi.clearAllMocks()

    await handler.handle(createRequest('GET', '/notfound'), { prefix: undefined, context: {} })

    expect(globalSpies.info).toHaveBeenCalledWith('request received')
    expect(globalSpies.info).toHaveBeenCalledWith('no matching procedure found')
  })

  it('logs abort events with reason', async () => {
    const baseLogger = new FakeLogger({ rpc: {} })
    const controller = new AbortController()
    const codec = createCodec(os.handler(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      return 'pong'
    }))

    const handler = new StandardHandler(codec as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any, logAbort: true })],
    })

    const promise = handler.handle(createRequest('GET', '/ping', controller.signal), { prefix: undefined, context: {} })

    setTimeout(() => controller.abort('manual'), 0)
    await promise

    expect(globalSpies.info).toHaveBeenCalledWith('request is aborted (manual)')

    await handler.handle(createRequest('GET', '/ping', controller.signal), { prefix: undefined, context: {} })

    expect(globalSpies.info).toHaveBeenCalledWith('request was aborted before handling (manual)')
  })

  it('logs business errors (ORPCError) as warn except INTERNAL_SERVER_ERROR, unexpected errors as error, and abort errors as info', async () => {
    const baseLogger = new FakeLogger({ rpc: {} })
    const businessError = new ORPCError('UNAUTHORIZED')
    const handler1 = new StandardHandler(createCodec(os.handler(() => {
      throw businessError
    })) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any })],
    })

    const result1 = await handler1.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })

    expect(result1.matched).toBe(true)
    expect(globalSpies.warn).toHaveBeenCalledWith(businessError)
    expect(globalSpies.error).not.toHaveBeenCalled()

    vi.clearAllMocks()

    const unexpectedError = new Error('boom')
    const handler2 = new StandardHandler(createCodec(os.handler(() => {
      throw unexpectedError
    })) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any })],
    })

    const result2 = await handler2.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })

    expect(result2.matched).toBe(true)
    expect(result2.response?.status).toBe(500)
    expect(globalSpies.error).toHaveBeenCalledWith(unexpectedError)
    expect(globalSpies.warn).not.toHaveBeenCalled()

    vi.clearAllMocks()

    const abortError = new AbortError('reason')
    const handler3 = new StandardHandler(createCodec(os.handler(() => {
      throw abortError
    })) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any })],
    })

    const result3 = await handler3.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })

    expect(result3.matched).toBe(true)
    expect(globalSpies.info).toHaveBeenCalledWith(abortError)
    expect(globalSpies.warn).not.toHaveBeenCalled()
    expect(globalSpies.error).not.toHaveBeenCalled()

    vi.clearAllMocks()

    const internalError = new ORPCError('INTERNAL_SERVER_ERROR')
    const handler4 = new StandardHandler(createCodec(os.handler(() => {
      throw internalError
    })) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any })],
    })

    const result4 = await handler4.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })

    expect(result4.matched).toBe(true)
    expect(globalSpies.error).toHaveBeenCalledWith(internalError)
    expect(globalSpies.warn).not.toHaveBeenCalled()
  })

  it('honors the procedureErrorLevel option, passing the error and its default level', async () => {
    const baseLogger = new FakeLogger({ rpc: {} })
    const businessError = new ORPCError('UNAUTHORIZED')
    const procedureErrorLevel = vi.fn(
      (error: unknown, level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace') =>
        error instanceof ORPCError && error.code === 'UNAUTHORIZED' ? 'debug' as const : level,
    )

    const handler1 = new StandardHandler(createCodec(os.handler(() => {
      throw businessError
    })) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any, procedureErrorLevel })],
    })

    await handler1.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })

    expect(procedureErrorLevel).toHaveBeenCalledWith(businessError, 'warn')
    expect(globalSpies.debug).toHaveBeenCalledWith(businessError)
    expect(globalSpies.warn).not.toHaveBeenCalled()

    vi.clearAllMocks()

    const otherError = new ORPCError('CONFLICT')
    const handler2 = new StandardHandler(createCodec(os.handler(() => {
      throw otherError
    })) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any, procedureErrorLevel })],
    })

    await handler2.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })

    expect(procedureErrorLevel).toHaveBeenCalledWith(otherError, 'warn')
    expect(globalSpies.debug).not.toHaveBeenCalled()
    expect(globalSpies.warn).toHaveBeenCalledWith(otherError)
  })

  it('logs internal errors', async () => {
    const error = new Error('internal-error')
    const baseLogger = new FakeLogger({ rpc: {} })
    const handler = new StandardHandler(createCodec(os.handler(() => 'pong')) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any })],
      routingInterceptors: [
        async () => {
          throw error
        },
      ],
    })

    await expect(handler.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })).rejects.toThrow(error)
    expect(globalSpies.error).toHaveBeenCalledWith(error)
  })

  it('sets the rpc method on the interceptor', async () => {
    const baseLogger = new FakeLogger({ rpc: {} })
    let capturedBindings: any

    const handler = new StandardHandler(createCodec(os.handler(({ context }) => {
      capturedBindings = getLogger(context)?.bindings()
      return 'pong'
    })) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any })],
    })

    const result = await handler.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })

    expect(result.matched).toBe(true)
    expect(capturedBindings.rpc.method).toBe('ping')
  })

  it('logs AsyncIteratorObject errors as error and aborted stream errors as info', async () => {
    const baseLogger = new FakeLogger({ rpc: {} })
    const streamError = new Error('stream-error')
    const handler1 = new StandardHandler(createCodec(os.handler(async function* () {
      yield 1
      throw streamError
    })) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any })],
    })

    const result1 = await handler1.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })

    try {
      for await (const _ of result1.response?.body as AsyncIterable<unknown>) {
        // consume only
      }
    }
    catch (error) {
      expect(error).toBe(streamError)
    }

    expect(globalSpies.info).toHaveBeenCalledTimes(0)
    expect(globalSpies.error).toHaveBeenCalledTimes(1)
    expect(globalSpies.error).toHaveBeenCalledWith(streamError)

    vi.clearAllMocks()

    const abortedStreamError = new AbortError('reason')
    const handler2 = new StandardHandler(createCodec(os.handler(async function* () {
      throw abortedStreamError
    })) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any })],
    })

    const result2 = await handler2.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })

    try {
      for await (const _ of result2.response?.body as AsyncIterable<unknown>) {
        // consume only
      }
    }
    catch (error) {
      expect(error).toBe(abortedStreamError)
    }

    expect(globalSpies.error).toHaveBeenCalledTimes(0)
    expect(globalSpies.info).toHaveBeenCalledTimes(1)
    expect(globalSpies.info).toHaveBeenCalledWith(abortedStreamError)
  })

  it('logs octet stream errors as error and aborted stream errors as info', async () => {
    const baseLogger = new FakeLogger({ rpc: {} })
    const streamError = new Error('stream-error')
    const handler1 = new StandardHandler(createCodec(os.handler(async () => {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('chunk1'))
          controller.error(streamError)
        },
      })
    })) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any })],
    })

    const result1 = await handler1.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })

    try {
      const reader = (result1.response?.body as ReadableStream<unknown>).getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) {
          break
        }
      }
    }
    catch (error) {
      expect(error).toBe(streamError)
    }

    expect(globalSpies.info).toHaveBeenCalledTimes(0)
    expect(globalSpies.error).toHaveBeenCalledTimes(1)
    expect(globalSpies.error).toHaveBeenCalledWith(streamError)

    vi.clearAllMocks()

    const abortedStreamError = new AbortError('reason')
    const handler2 = new StandardHandler(createCodec(os.handler(async () => {
      return new ReadableStream({
        start(controller) {
          controller.error(abortedStreamError)
        },
      })
    })) as any, {
      plugins: [new PinoHandlerPlugin({ logger: baseLogger as any })],
    })

    const result2 = await handler2.handle(createRequest('GET', '/ping'), { prefix: undefined, context: {} })
    try {
      const reader = (result2.response?.body as ReadableStream<unknown>).getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) {
          break
        }
      }
    }
    catch (error) {
      expect(error).toBe(abortedStreamError)
    }

    expect(globalSpies.error).toHaveBeenCalledTimes(0)
    expect(globalSpies.info).toHaveBeenCalledTimes(1)
    expect(globalSpies.info).toHaveBeenCalledWith(abortedStreamError)
  })

  describe('edge cases', () => {
    it('creates a child logger with id and req when none is provided in context', async () => {
      const baseLogger = new FakeLogger({ rpc: { existing: true } })
      const handler = new StandardHandler(createCodec(os.handler(() => 'pong')) as any, {
        plugins: [new PinoHandlerPlugin({ logger: baseLogger as any, generateRequestId: () => 'test-id' })],
      })

      const request = createRequest('POST', '/ping')
      await handler.handle(request, { prefix: undefined, context: {} })

      expect(globalSpies.child).toHaveBeenCalledWith({})
      expect(globalSpies.setBindings).toHaveBeenCalledWith(expect.objectContaining({
        req: expect.objectContaining({
          id: 'test-id',
          url: '/ping',
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
          }),
        }),
      }))
      expect(globalSpies.error).not.toHaveBeenCalled()
    })

    it('preserves an existing req binding from the context logger', async () => {
      const loggerWithReq = new FakeLogger({ rpc: {}, req: { url: '/original', method: 'POST' } })
      const handler = new StandardHandler(createCodec(os.handler(() => 'pong')) as any, {
        plugins: [new PinoHandlerPlugin({ logger: loggerWithReq as any, generateRequestId: () => 'test-id' })],
      })

      await handler.handle(createRequest('GET', '/ping'), {
        prefix: undefined,
        context: { [LOGGER_CONTEXT_SYMBOL]: loggerWithReq },
      })

      const setBindingsCalls = globalSpies.setBindings.mock.calls
      expect(setBindingsCalls.some(call => call[0]?.req !== undefined)).toBe(false)
    })

    it('uses the default pino logger when none is provided', () => {
      const plugin = new PinoHandlerPlugin()

      // @ts-expect-error accessing private property for test
      expect(plugin.logger).toBeDefined()
    })
  })
})
