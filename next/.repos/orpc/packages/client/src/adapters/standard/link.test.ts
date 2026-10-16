import type { StandardLazyResponse, StandardRequest } from '@standard-server/core'
import type { StandardLinkCodec } from './codec'
import type { StandardLinkTransport } from './transport'
import { getTracer, isAsyncIteratorObject, setTracer } from '@orpc/shared'
import { ORPCError } from '../../error'
import { StandardLink } from './link'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('standardLink', () => {
  function makeCodec(): StandardLinkCodec<any> {
    return {
      encodeInput: vi.fn(),
      decodeResponse: vi.fn(),
    }
  }

  function makeTransport(): StandardLinkTransport<any> {
    return {
      send: vi.fn(),
    }
  }

  function makeStream(chunk: string): ReadableStream<string> {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(chunk)
        controller.close()
      },
    })
  }

  async function readAll(stream: ReadableStream): Promise<unknown[]> {
    const chunks: unknown[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    return chunks
  }

  function mockRoundTrip(codec: StandardLinkCodec<any>, transport: StandardLinkTransport<any>, output: unknown, headers: Record<string, string> = {}): StandardRequest {
    const request: StandardRequest = { method: 'POST', url: '/test', headers, body: undefined }
    vi.mocked(codec.encodeInput).mockResolvedValueOnce(request)
    vi.mocked(transport.send).mockResolvedValueOnce({ status: 200, headers: {}, resolveBody: () => Promise.resolve(undefined) })
    vi.mocked(codec.decodeResponse).mockResolvedValueOnce({ kind: 'output', output })
    return request
  }

  it('workflow is correct', async () => {
    const interceptor = vi.fn(({ next }) => next())
    const transportInterceptor = vi.fn(({ next }) => next())

    const codec = makeCodec()
    const transport = makeTransport()

    const link = new StandardLink(codec, transport, {
      interceptors: [interceptor],
      transportInterceptors: [transportInterceptor],
    })

    const __standardRequest: StandardRequest = {
      method: 'POST',
      url: '/planet/create',
      headers: {},
      body: '__standard_request__',
      signal: AbortSignal.timeout(100),
    }

    const __standardResponse: StandardLazyResponse = {
      status: 200,
      headers: {},
      resolveBody: () => Promise.resolve('__body__'),
    }

    vi.mocked(codec.encodeInput).mockResolvedValueOnce(__standardRequest)
    vi.mocked(transport.send).mockResolvedValueOnce(__standardResponse)
    vi.mocked(codec.decodeResponse).mockResolvedValueOnce({ kind: 'output', output: '__output__' })

    const context = { context: true }
    const signal = AbortSignal.timeout(100)
    const lastEventId = '__lastEventId__'

    const output = await link.call(['planet', 'create'], { name: 'Earth' }, { context, signal, lastEventId })

    expect(output).toEqual('__output__')

    expect(codec.encodeInput).toHaveBeenCalledTimes(1)
    expect(codec.encodeInput).toHaveBeenCalledWith(
      { name: 'Earth' },
      ['planet', 'create'],
      { context, signal, lastEventId },
    )

    expect(transport.send).toHaveBeenCalledTimes(1)
    expect(transport.send).toHaveBeenCalledWith(
      __standardRequest,
      ['planet', 'create'],
      { context, signal, lastEventId },
    )

    expect(codec.decodeResponse).toHaveBeenCalledTimes(1)
    expect(codec.decodeResponse).toHaveBeenCalledWith(
      __standardResponse,
      ['planet', 'create'],
      { context, signal, lastEventId },
    )

    expect(interceptor).toHaveBeenCalledTimes(1)
    expect(interceptor).toHaveBeenCalledWith({
      next: expect.any(Function),
      path: ['planet', 'create'],
      input: { name: 'Earth' },
      context,
      signal,
      lastEventId,
    })
    await expect(interceptor.mock.results[0]!.value).resolves.toBe('__output__')

    expect(transportInterceptor).toHaveBeenCalledTimes(1)
    expect(transportInterceptor).toHaveBeenCalledWith({
      next: expect.any(Function),
      request: __standardRequest,
      path: ['planet', 'create'],
      context,
      signal,
      lastEventId,
    })
    await expect(transportInterceptor.mock.results[0]!.value).resolves.toBe(__standardResponse)
  })

  it('throws decoded error when response kind is error', async () => {
    const codec = makeCodec()
    const transport = makeTransport()
    const link = new StandardLink(codec, transport)

    const error = new ORPCError('NOT_FOUND')

    vi.mocked(codec.encodeInput).mockResolvedValueOnce({
      method: 'POST',
      url: '/test',
      headers: {},
      body: undefined,
    })
    vi.mocked(transport.send).mockResolvedValueOnce({
      status: 404,
      headers: {},
      resolveBody: () => Promise.resolve(undefined),
    })
    vi.mocked(codec.decodeResponse).mockResolvedValueOnce({ kind: 'error', error })

    await expect(link.call(['test'], 'input', { context: {} })).rejects.toThrow(error)
  })

  it('traces input & output AsyncIteratorObject', async () => {
    const codec = makeCodec()
    const transport = makeTransport()
    const link = new StandardLink(codec, transport)

    async function* gen() {
      yield 1
      yield 2
    }
    const input = gen()
    const output = gen()

    vi.mocked(codec.encodeInput).mockResolvedValueOnce({
      method: 'POST',
      url: '/test',
      headers: {},
      body: undefined,
    })
    vi.mocked(transport.send).mockResolvedValueOnce({
      status: 200,
      headers: {},
      resolveBody: () => Promise.resolve(undefined),
    })
    vi.mocked(codec.decodeResponse).mockResolvedValueOnce({ kind: 'output', output })

    const tracedOutput = await link.call(['test'], input, { context: {} })

    const passedInput = vi.mocked(codec.encodeInput).mock.calls[0]![0]
    expect(passedInput).not.toBe(input) // should be a wrapped version of the original input
    expect(isAsyncIteratorObject(passedInput)).toBe(true)

    expect(tracedOutput).not.toBe(output) // should be a wrapped version of the original output
    expect(isAsyncIteratorObject(tracedOutput)).toBe(true)
  })

  it('traces input & output ReadableStream', async () => {
    const codec = makeCodec()
    const transport = makeTransport()
    const link = new StandardLink(codec, transport)

    const input = makeStream('in')
    const output = makeStream('out')

    mockRoundTrip(codec, transport, output)

    const tracedOutput = await link.call(['test'], input, { context: {} }) as ReadableStream

    const passedInput = vi.mocked(codec.encodeInput).mock.calls[0]![0] as ReadableStream
    expect(passedInput).not.toBe(input) // should be a wrapped version of the original input
    expect(passedInput).toBeInstanceOf(ReadableStream)
    await expect(readAll(passedInput)).resolves.toEqual(['in'])

    expect(tracedOutput).not.toBe(output) // should be a wrapped version of the original output
    expect(tracedOutput).toBeInstanceOf(ReadableStream)
    await expect(readAll(tracedOutput)).resolves.toEqual(['out'])
  })

  it('passes AsyncIteratorObject and ReadableStream through untouched without a tracer', async ({ onTestFinished }) => {
    const tracer = getTracer()
    setTracer(undefined)
    onTestFinished(() => setTracer(tracer))

    async function* gen() {
      yield 1
    }

    for (const [input, output] of [[gen(), gen()], [makeStream('in'), makeStream('out')]]) {
      const codec = makeCodec()
      const transport = makeTransport()
      const link = new StandardLink(codec, transport)

      mockRoundTrip(codec, transport, output)

      await expect(link.call(['test'], input, { context: {} })).resolves.toBe(output)
      expect(vi.mocked(codec.encodeInput).mock.calls[0]![0]).toBe(input)
    }
  })

  it('injects the trace context of the call into the request headers', async ({ onTestFinished }) => {
    const tracer = getTracer()
    const span = { setAttribute: vi.fn(), updateName: vi.fn(), addEvent: vi.fn(), recordException: vi.fn(), end: vi.fn() }
    const inject = vi.fn((_span: unknown, headers: Record<string, unknown>) => {
      headers.traceparent = '00-test'
    })
    setTracer({ getActiveSpan: () => undefined, startActiveSpan: (_name: string, _parent: unknown, fn: (span: unknown) => unknown) => fn(span), inject } as any)
    onTestFinished(() => setTracer(tracer))

    const codec = makeCodec()
    const transport = makeTransport()
    const link = new StandardLink(codec, transport)
    const request = mockRoundTrip(codec, transport, 'output', { 'x-custom': 'value' })

    await expect(link.call(['test'], 'input', { context: {} })).resolves.toBe('output')

    expect(inject).toHaveBeenCalledTimes(1)
    expect(inject).toHaveBeenCalledWith(span, { 'x-custom': 'value', 'traceparent': '00-test' })
    expect(vi.mocked(transport.send).mock.calls[0]![0].headers).toEqual({ 'x-custom': 'value', 'traceparent': '00-test' })
    expect(request.headers).toEqual({ 'x-custom': 'value' }) // the encoded request is not mutated
  })

  it('sends the request as is when the tracer does not propagate', async ({ onTestFinished }) => {
    const tracer = getTracer()
    const span = { setAttribute: vi.fn(), updateName: vi.fn(), addEvent: vi.fn(), recordException: vi.fn(), end: vi.fn() }
    setTracer({ getActiveSpan: () => undefined, startActiveSpan: (_name: string, _parent: unknown, fn: (span: unknown) => unknown) => fn(span) } as any)
    onTestFinished(() => setTracer(tracer))

    const codec = makeCodec()
    const transport = makeTransport()
    const link = new StandardLink(codec, transport)
    const request = mockRoundTrip(codec, transport, 'output')

    await expect(link.call(['test'], 'input', { context: {} })).resolves.toBe('output')

    expect(vi.mocked(transport.send).mock.calls[0]![0]).toBe(request)
  })

  it('supports plugins', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    const link = new StandardLink(codec, transport, {
      plugins: [{ name: 'test-plugin', init: () => ({ interceptors: [async () => '__INTERCEPTED__'] }) }],
    })

    await expect(link.call(['test'], 'input', { context: {} })).resolves.toBe('__INTERCEPTED__')
  })
})
