import { ORPCError } from '@orpc/client'
import * as sharedExperimental from '@orpc/shared'
import { ErrorEvent } from '@standard-server/core'
import { createProcedureClient } from '../../procedure-client'
import { StandardHandler } from './handler'

vi.mock('../../procedure-client', () => ({
  createProcedureClient: vi.fn(),
}))

const OK_RESPONSE = { status: 200, headers: {}, body: 'ok' }

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    url: '/api/v1/ping',
    headers: {},
    signal: new AbortController().signal,
    ...overrides,
  } as any
}

function makeCodec() {
  return {
    resolveProcedure: vi.fn(),
    encodeOutput: vi.fn(),
    encodeError: vi.fn(),
  }
}

function makeResolved(overrides: Record<string, unknown> = {}) {
  return {
    path: ['ping'],
    procedure: {} as any,
    decodeInput: vi.fn().mockResolvedValue('__input__'),
    ...overrides,
  }
}

describe('standardHandler', () => {
  const OPTIONS = { context: {}, prefix: '/api/v1' } as const

  let codec: ReturnType<typeof makeCodec>
  let client: ReturnType<typeof vi.fn>
  let handler: StandardHandler<any>

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    codec = makeCodec()
    client = vi.fn().mockResolvedValue('__output__')
    vi.mocked(createProcedureClient).mockReturnValue(client as any)
    handler = new StandardHandler(codec as any, {})
  })

  function setupHappyPath(resolvedOverrides?: Record<string, unknown>) {
    const resolved = makeResolved(resolvedOverrides)
    codec.resolveProcedure.mockResolvedValue(resolved)
    codec.encodeOutput.mockResolvedValue(OK_RESPONSE)
    return resolved
  }

  it('workflow is correct', async () => {
    const routingInterceptor = vi.fn(({ next }) => next())
    const interceptor = vi.fn(({ next }) => next())
    const clientInterceptor = vi.fn()

    codec = makeCodec()
    client = vi.fn().mockResolvedValue('__output__')
    vi.mocked(createProcedureClient).mockReturnValue(client as any)

    handler = new StandardHandler(codec as any, {
      routingInterceptors: [routingInterceptor],
      interceptors: [interceptor],
      clientInterceptors: [clientInterceptor],
    })

    const resolved = makeResolved()
    codec.resolveProcedure.mockResolvedValue(resolved)
    codec.encodeOutput.mockResolvedValue(OK_RESPONSE)

    const request = makeRequest()
    const result = await handler.handle(request, OPTIONS)

    expect(result).toEqual({ matched: true, response: OK_RESPONSE })

    expect(codec.resolveProcedure).toHaveBeenCalledTimes(1)
    expect(codec.resolveProcedure).toHaveBeenCalledWith(request, OPTIONS)

    expect(resolved.decodeInput).toHaveBeenCalledTimes(1)

    expect(createProcedureClient).toHaveBeenCalledTimes(1)
    expect(createProcedureClient).toHaveBeenCalledWith(resolved.procedure, {
      context: OPTIONS.context,
      path: ['ping'],
      interceptors: [clientInterceptor],
    })

    expect(client).toHaveBeenCalledTimes(1)
    expect(client).toHaveBeenCalledWith('__input__', {
      signal: request.signal,
      lastEventId: undefined,
    })

    expect(codec.encodeOutput).toHaveBeenCalledTimes(1)
    expect(codec.encodeOutput).toHaveBeenCalledWith('__output__', resolved.procedure, ['ping'], OPTIONS)

    expect(codec.encodeError).not.toHaveBeenCalled()

    expect(routingInterceptor).toHaveBeenCalledTimes(1)
    expect(routingInterceptor).toHaveBeenCalledWith({
      next: expect.any(Function),
      request,
      context: OPTIONS.context,
      prefix: OPTIONS.prefix,
    })
    await expect(routingInterceptor.mock.results[0]!.value).resolves.toEqual({ matched: true, response: OK_RESPONSE })

    expect(interceptor).toHaveBeenCalledTimes(1)
    expect(interceptor).toHaveBeenCalledWith({
      next: expect.any(Function),
      request,
      path: ['ping'],
      procedure: resolved.procedure,
      decodeInput: resolved.decodeInput,
      context: OPTIONS.context,
      prefix: OPTIONS.prefix,
    })
    await expect(interceptor.mock.results[0]!.value).resolves.toEqual(OK_RESPONSE)
  })

  describe('prefix matching', () => {
    it('returns unmatched when URL does not start with prefix', async () => {
      const result = await handler.handle(makeRequest({ url: '/other/ping' }), OPTIONS)

      expect(result).toEqual({ matched: false })
      expect(codec.resolveProcedure).not.toHaveBeenCalled()
    })

    it.each([
      ['/api/v1/ping', '/api/v1', 'path after prefix'],
      ['/api/v1?foo=bar', '/api/v1', 'query string'],
      ['/api/v1#fragment', '/api/v1', 'hash fragment'],
      ['/api/v1', '/api/v1', 'exact match'],
      ['/api/v1/users', '/api/v1/', 'trailing slash prefix'],
    ] as const)('matches URL=%s with prefix=%s (%s)', async (url, prefix, _description) => {
      codec.resolveProcedure.mockResolvedValue(undefined)

      await handler.handle(makeRequest({ url }), { context: {}, prefix })

      expect(codec.resolveProcedure).toHaveBeenCalledOnce()
    })

    it('skips prefix check when prefix is undefined', async () => {
      codec.resolveProcedure.mockResolvedValue(undefined)

      await handler.handle(makeRequest({ url: '/anything' }), { context: {} })

      expect(codec.resolveProcedure).toHaveBeenCalledOnce()
    })
  })

  describe('context resolution', () => {
    it('resolves a sync context function with the request before routing', async () => {
      const routingInterceptor = vi.fn(({ next }) => next())
      handler = new StandardHandler(codec as any, { routingInterceptors: [routingInterceptor] })
      setupHappyPath()

      const request = makeRequest()
      const context = vi.fn(() => ({ db: 'postgres' }))

      const result = await handler.handle(request, { context, prefix: '/api/v1' })

      expect(result).toEqual({ matched: true, response: OK_RESPONSE })
      expect(context).toHaveBeenCalledTimes(1)
      expect(context).toHaveBeenCalledWith(request)
      expect(routingInterceptor).toHaveBeenCalledWith(expect.objectContaining({ context: { db: 'postgres' } }))
      expect(codec.resolveProcedure).toHaveBeenCalledWith(request, { context: { db: 'postgres' }, prefix: '/api/v1' })
      expect(createProcedureClient).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ context: { db: 'postgres' } }))
      expect(codec.encodeOutput).toHaveBeenCalledWith('__output__', expect.anything(), ['ping'], { context: { db: 'postgres' }, prefix: '/api/v1' })
    })

    it('resolves an async context function', async () => {
      setupHappyPath()
      const request = makeRequest()
      const context = vi.fn(async () => ({ db: 'postgres' }))

      await handler.handle(request, { context, prefix: '/api/v1' })

      expect(context).toHaveBeenCalledTimes(1)
      expect(context).toHaveBeenCalledWith(request)
      expect(codec.resolveProcedure).toHaveBeenCalledWith(request, { context: { db: 'postgres' }, prefix: '/api/v1' })
    })

    it('does not run the context function when the prefix does not match', async () => {
      const context = vi.fn(() => ({ db: 'postgres' }))

      const result = await handler.handle(makeRequest({ url: '/other/ping' }), { context, prefix: '/api/v1' })

      expect(result).toEqual({ matched: false })
      expect(context).not.toHaveBeenCalled()
      expect(codec.resolveProcedure).not.toHaveBeenCalled()
    })

    it('rejects when the context function throws and skips routing', async () => {
      const error = new Error('context failed')
      const context = vi.fn(() => {
        throw error
      })

      await expect(handler.handle(makeRequest(), { context, prefix: '/api/v1' })).rejects.toBe(error)
      expect(codec.resolveProcedure).not.toHaveBeenCalled()
      expect(codec.encodeError).not.toHaveBeenCalled()
    })
  })

  describe('procedure resolution', () => {
    it('returns unmatched when codec resolves no procedure', async () => {
      codec.resolveProcedure.mockResolvedValue(undefined)
      const request = makeRequest()

      const result = await handler.handle(request, OPTIONS)

      expect(result).toEqual({ matched: false })
      expect(codec.resolveProcedure).toHaveBeenCalledWith(request, OPTIONS)
      expect(codec.encodeOutput).not.toHaveBeenCalled()
      expect(codec.encodeError).not.toHaveBeenCalled()
    })
  })

  describe('successful procedure call', () => {
    it('decodes input, calls procedure client, and encodes output', async () => {
      const resolved = setupHappyPath()
      const request = makeRequest()

      const result = await handler.handle(request, OPTIONS)

      expect(result).toEqual({ matched: true, response: OK_RESPONSE })
      expect(resolved.decodeInput).toHaveBeenCalledOnce()
      expect(client).toHaveBeenCalledWith('__input__', expect.objectContaining({ signal: request.signal }))
      expect(codec.encodeOutput).toHaveBeenCalledWith('__output__', resolved.procedure, ['ping'], OPTIONS)
      expect(codec.encodeError).not.toHaveBeenCalled()
    })

    it('passes clientInterceptors to createProcedureClient', async () => {
      setupHappyPath()
      const clientInterceptor = vi.fn()

      handler = new StandardHandler(codec as any, { clientInterceptors: [clientInterceptor] })
      await handler.handle(makeRequest(), OPTIONS)

      expect(createProcedureClient).toHaveBeenCalledWith(expect.anything(), {
        context: OPTIONS.context,
        path: ['ping'],
        interceptors: [clientInterceptor],
      })
    })

    it('flattens last-event-id header array and passes to client', async () => {
      setupHappyPath()

      await handler.handle(
        makeRequest({ headers: { 'last-event-id': ['event-a', 'event-b'] } }),
        OPTIONS,
      )

      expect(client.mock.calls[0]?.[1]?.lastEventId).toBe('event-a, event-b')
    })

    it('passes undefined lastEventId when header is absent', async () => {
      setupHappyPath()

      await handler.handle(makeRequest(), OPTIONS)

      expect(client.mock.calls[0]?.[1]?.lastEventId).toBeUndefined()
    })

    it('safely traces AsyncIteratorObject input', async () => {
      async function* input() {
        yield 'e1'
        yield 'e2'
      }

      setupHappyPath({ decodeInput: vi.fn().mockResolvedValue(input()) })
      client.mockImplementation(async (iter: AsyncIterable<unknown>) => {
        const out: unknown[] = []
        for await (const v of iter) out.push(v)
        return out
      })

      const result = await handler.handle(makeRequest(), OPTIONS)

      expect(result).toEqual({ matched: true, response: OK_RESPONSE })
      expect(codec.encodeOutput).toHaveBeenCalledWith(['e1', 'e2'], expect.anything(), ['ping'], expect.anything())
    })

    it('safely traces ReadableStream input', async () => {
      const input = new ReadableStream({
        start(controller) {
          controller.enqueue('chunk')
          controller.close()
        },
      })

      setupHappyPath({ decodeInput: vi.fn().mockResolvedValue(input) })
      client.mockImplementation(async (stream: ReadableStream) => {
        expect(stream).not.toBe(input)
        const out: unknown[] = []
        for await (const v of stream) out.push(v)
        return out
      })

      const result = await handler.handle(makeRequest(), OPTIONS)

      expect(result).toEqual({ matched: true, response: OK_RESPONSE })
      expect(codec.encodeOutput).toHaveBeenCalledWith(['chunk'], expect.anything(), ['ping'], expect.anything())
    })

    it('passes AsyncIteratorObject and ReadableStream input through untouched without a tracer', async ({ onTestFinished }) => {
      const tracer = sharedExperimental.getTracer()
      sharedExperimental.setTracer(undefined)
      onTestFinished(() => sharedExperimental.setTracer(tracer))

      for (const input of [(async function* () {})(), new ReadableStream()]) {
        setupHappyPath({ decodeInput: vi.fn().mockResolvedValue(input) })

        await handler.handle(makeRequest(), OPTIONS)

        expect(client).toHaveBeenLastCalledWith(input, expect.anything())
      }
    })
  })

  describe('error handling', () => {
    it('wraps non-ORPCError decode failures as BAD_REQUEST', async () => {
      const cause = new Error('invalid body')
      codec.resolveProcedure.mockResolvedValue(
        makeResolved({ decodeInput: vi.fn().mockRejectedValue(cause) }),
      )
      codec.encodeError.mockResolvedValue({ status: 400, headers: {}, body: 'bad request' })

      const result = await handler.handle(makeRequest(), OPTIONS)

      expect(result).toEqual({ matched: true, response: { status: 400, headers: {}, body: 'bad request' } })
      expect(createProcedureClient).not.toHaveBeenCalled()

      const error = codec.encodeError.mock.calls[0]?.[0]
      expect(error).toBeInstanceOf(ORPCError)
      expect(error.code).toBe('BAD_REQUEST')
      expect(error.cause).toBe(cause)
    })

    it('passes ORPCError decode failures through without wrapping', async () => {
      const orpcError = new ORPCError('PAYLOAD_TOO_LARGE')
      codec.resolveProcedure.mockResolvedValue(
        makeResolved({ decodeInput: vi.fn().mockRejectedValue(orpcError) }),
      )
      codec.encodeError.mockResolvedValue({ status: 413, headers: {}, body: 'too large' })

      const result = await handler.handle(makeRequest(), OPTIONS)

      expect(result).toEqual({ matched: true, response: { status: 413, headers: {}, body: 'too large' } })
      expect(codec.encodeError.mock.calls[0]?.[0]).toBe(orpcError)
    })

    it('encodes ORPCError from procedure call as-is', async () => {
      const procedureError = new ORPCError('BAD_GATEWAY')
      client.mockRejectedValue(procedureError)

      codec.resolveProcedure.mockResolvedValue(makeResolved())
      codec.encodeError.mockResolvedValue({ status: 502, headers: {}, body: 'bad gateway' })

      const result = await handler.handle(makeRequest(), OPTIONS)

      expect(result).toEqual({ matched: true, response: { status: 502, headers: {}, body: 'bad gateway' } })
      expect(codec.encodeError).toHaveBeenCalledWith(procedureError, expect.anything(), ['ping'], OPTIONS)
    })

    it('wraps non-ORPCError from procedure call as INTERNAL_SERVER_ERROR', async () => {
      client.mockRejectedValue(new Error('unexpected'))

      codec.resolveProcedure.mockResolvedValue(makeResolved())
      codec.encodeError.mockResolvedValue({ status: 500, headers: {}, body: 'internal' })

      await handler.handle(makeRequest(), OPTIONS)

      const error = codec.encodeError.mock.calls[0]?.[0]
      expect(error).toBeInstanceOf(ORPCError)
      expect(error.code).toBe('INTERNAL_SERVER_ERROR')
    })
  })

  describe('plugins', () => {
    it('initializes plugins and applies their routing interceptors', async () => {
      const pluginInterceptor = vi.fn(async () => ({
        matched: true as const,
        response: { status: 200, headers: {}, body: 'from-plugin' },
      }))

      const plugin = {
        name: 'test-plugin',
        init: vi.fn((options: any) => ({
          ...options,
          routingInterceptors: [pluginInterceptor],
        })),
      }

      handler = new StandardHandler(codec as any, { plugins: [plugin] })
      const result = await handler.handle(makeRequest(), OPTIONS)

      expect(plugin.init).toHaveBeenCalledOnce()
      expect(pluginInterceptor).toHaveBeenCalledOnce()
      expect(result).toEqual({ matched: true, response: { status: 200, headers: {}, body: 'from-plugin' } })
      expect(codec.resolveProcedure).not.toHaveBeenCalled()
    })
  })

  describe('tracing', () => {
    function createSpan() {
      return { setAttribute: vi.fn(), updateName: vi.fn(), addEvent: vi.fn(), recordException: vi.fn(), end: vi.fn() }
    }

    let span: ReturnType<typeof createSpan>
    let tracer: {
      startSpan: ReturnType<typeof vi.fn>
      startActiveSpan: ReturnType<typeof vi.fn>
      withActiveSpan: ReturnType<typeof vi.fn>
      getActiveSpan: () => typeof span
      extract: ReturnType<typeof vi.fn> | undefined
    }

    beforeEach(() => {
      span = createSpan()
      tracer = {
        startSpan: vi.fn(() => span),
        // the request span is the first active span started
        startActiveSpan: vi.fn((_name, _parent, fn) => fn(createSpan())).mockImplementationOnce((_name, _parent, fn) => fn(span)),
        withActiveSpan: vi.fn((_span, fn) => fn()),
        getActiveSpan: () => span,
        extract: vi.fn(),
      }
      sharedExperimental.setTracer(tracer as any)
    })

    afterEach(() => {
      sharedExperimental.setTracer(undefined)
    })

    async function drain(body: AsyncIterable<unknown>) {
      const values: unknown[] = []
      for await (const value of body) values.push(value)
      return values
    }

    async function handleBody(body: unknown) {
      setupHappyPath()
      codec.encodeOutput.mockResolvedValue({ status: 200, headers: {}, body })

      const result = await handler.handle(makeRequest(), OPTIONS)

      return result.response!.body as any
    }

    it('does nothing without a tracer', async () => {
      sharedExperimental.setTracer(undefined)
      setupHappyPath()

      await expect(handler.handle(makeRequest(), OPTIONS)).resolves.toEqual({ matched: true, response: OK_RESPONSE })
    })

    it('starts the request span under the parent extracted from request headers and ends it when nothing matches', async () => {
      codec.resolveProcedure.mockResolvedValue(undefined)
      const parent = { name: 'parent' }
      tracer.extract!.mockReturnValue(parent)

      const request = makeRequest({ headers: { traceparent: '00-test' }, url: '/api/v1/ping?search=1' })
      await expect(handler.handle(request, OPTIONS)).resolves.toEqual({ matched: false })

      expect(tracer.extract).toHaveBeenCalledWith(request.headers)
      expect(tracer.startActiveSpan).toHaveBeenNthCalledWith(1, 'POST /api/v1/ping', parent, expect.any(Function))
      expect(tracer.startSpan).not.toHaveBeenCalled()
      expect(tracer.withActiveSpan).not.toHaveBeenCalled()
      expect(tracer.startActiveSpan).toHaveBeenCalledWith('find_procedure', undefined, expect.any(Function))
      expect(span.updateName).toHaveBeenCalledWith('orpc_no_match')
      expect(span.recordException).not.toHaveBeenCalled()
      expect(span.end).toHaveBeenCalledTimes(1)
    })

    it('starts the request span without parent when the tracer cannot extract one', async () => {
      codec.resolveProcedure.mockResolvedValue(undefined)
      tracer.extract = undefined

      await handler.handle(makeRequest(), OPTIONS)

      expect(tracer.startActiveSpan).toHaveBeenNthCalledWith(1, 'POST /api/v1/ping', undefined, expect.any(Function))
    })

    it('ends the request span right away for a non-streaming body', async () => {
      await expect(handleBody('ok')).resolves.toBe('ok')

      expect(span.recordException).not.toHaveBeenCalled()
      expect(span.end).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['a regular error', new Error('interceptor failure')],
      ['an abort error', new DOMException('interceptor failure', 'AbortError')],
    ])('records %s at error level and ends the request span when handling throws', async (_, error) => {
      handler = new StandardHandler(codec as any, {
        routingInterceptors: [() => { throw error }],
      })

      await expect(handler.handle(makeRequest(), OPTIONS)).rejects.toBe(error)

      expect(span.recordException).toHaveBeenCalledExactlyOnceWith('error', expect.objectContaining({ message: 'interceptor failure' }))
      expect(span.end).toHaveBeenCalledTimes(1)
    })

    describe.each([
      ['async iterator', (body: AsyncIterable<unknown>) => body],
      ['readable stream', (body: AsyncIterable<unknown>) => ReadableStream.from(body)],
    ])('%s body', (_, toBody) => {
      it('keeps the request span active and open until the body is drained', async () => {
        const body = Object.assign(toBody((async function* () {
          yield 'a'
          yield 'b'
        })()), { custom: 'kept' })

        const wrapped = await handleBody(body)

        expect(wrapped).not.toBe(body)
        expect(wrapped.custom).toBe('kept')
        expect(span.end).not.toHaveBeenCalled()

        tracer.withActiveSpan.mockClear()
        await expect(drain(wrapped)).resolves.toEqual(['a', 'b'])

        expect(tracer.withActiveSpan).toHaveBeenCalledWith(span, expect.any(Function))
        expect(span.recordException).not.toHaveBeenCalled()
        expect(span.end).toHaveBeenCalledTimes(1)
      })

      it('ends the request span when the consumer stops early', async () => {
        const wrapped = await handleBody(toBody((async function* () {
          yield 'a'
          yield 'b'
        })()))

        const iterator = wrapped[Symbol.asyncIterator]()
        await iterator.next()
        await iterator.return()

        expect(span.recordException).not.toHaveBeenCalled()
        expect(span.end).toHaveBeenCalledTimes(1)
      })

      it('records failures on the request span', async () => {
        const wrapped = await handleBody(toBody((async function* () {
          yield 'a'
          throw new Error('body failure')
        })()))

        await expect(drain(wrapped)).rejects.toThrow('body failure')

        expect(span.recordException).toHaveBeenCalledExactlyOnceWith('error', expect.objectContaining({ message: 'body failure' }))
        expect(span.end).toHaveBeenCalledTimes(1)
      })
    })

    it('does not record ErrorEvent failures of an async iterator body on the request span', async () => {
      const errorEvent = new ErrorEvent({ code: 'BAD_REQUEST' })
      const wrapped = await handleBody((async function* () {
        yield 'a'
        throw errorEvent
      })())

      await expect(drain(wrapped)).rejects.toBe(errorEvent)

      expect(span.recordException).not.toHaveBeenCalled()
      expect(span.end).toHaveBeenCalledTimes(1)
    })
  })
})
