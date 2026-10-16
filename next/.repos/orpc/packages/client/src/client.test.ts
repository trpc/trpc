import type { ClientContext, ClientLink } from './types'
import { createORPCClient } from './client'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createORPCClient', () => {
  const mockedLink: ClientLink<ClientContext> = {
    call: vi.fn().mockReturnValue('__mocked__'),
  }

  it('works', async () => {
    const client = createORPCClient(mockedLink) as any

    expect(await client.ping({ value: 'hello' })).toEqual('__mocked__')
    expect(mockedLink.call).toHaveBeenCalledTimes(1)
    expect(mockedLink.call).toHaveBeenCalledWith(['ping'], { value: 'hello' }, { context: {} })

    vi.clearAllMocks()
    expect(await client.nested.pong({ value: 'hello' })).toEqual('__mocked__')
    expect(mockedLink.call).toHaveBeenCalledTimes(1)
    expect(mockedLink.call).toHaveBeenCalledWith(['nested', 'pong'], { value: 'hello' }, { context: {} })
  })

  it('works with signal', async () => {
    const controller = new AbortController()
    const signal = controller.signal
    const client = createORPCClient(mockedLink) as any

    expect(await client.ping({ value: 'hello' }, { signal })).toEqual('__mocked__')
    expect(mockedLink.call).toHaveBeenCalledTimes(1)
    expect(mockedLink.call).toHaveBeenCalledWith(['ping'], { value: 'hello' }, { signal, context: {} })
  })

  it('works with context', async () => {
    const client = createORPCClient(mockedLink) as any

    expect(await client.ping({ value: 'hello' }, { context: { userId: '123' } })).toEqual('__mocked__')
    expect(mockedLink.call).toHaveBeenCalledTimes(1)
    expect(mockedLink.call).toHaveBeenCalledWith(['ping'], { value: 'hello' }, { context: { userId: '123' } })
  })

  it('works with base path', async () => {
    const client = createORPCClient(mockedLink, { path: ['base'] }) as any

    expect(await client.ping({ value: 'hello' })).toEqual('__mocked__')
    expect(mockedLink.call).toHaveBeenCalledTimes(1)
    expect(mockedLink.call).toHaveBeenCalledWith(['base', 'ping'], { value: 'hello' }, { context: {} })
  })

  it('works with interceptors', async () => {
    const controller = new AbortController()
    const signal = controller.signal
    const order: string[] = []

    const firstInterceptor = vi.fn(async ({ path, input, context, signal, next }) => {
      order.push('first:before')

      expect(path).toEqual(['ping'])
      expect(input).toEqual({ value: 'hello' })
      expect(context).toEqual({ requestId: 'request_1' })
      expect(signal).toBe(controller.signal)

      const result = await next({
        path,
        input,
        context: { ...context, userId: '123' },
        signal,
      })

      order.push('first:after')

      return result
    })

    const secondInterceptor = vi.fn(async ({ path, input, context, signal, next }) => {
      order.push('second:before')

      expect(path).toEqual(['ping'])
      expect(input).toEqual({ value: 'hello' })
      expect(context).toEqual({ requestId: 'request_1', userId: '123' })
      expect(signal).toBe(controller.signal)

      const result = await next({
        path,
        input: { value: 'intercepted' },
        context: { ...context, traceId: 'trace_1' },
        signal,
      })

      order.push('second:after')

      return result
    })

    const client = createORPCClient(mockedLink, {
      interceptors: [firstInterceptor, secondInterceptor],
    }) as any

    expect(await client.ping({ value: 'hello' }, { context: { requestId: 'request_1' }, signal })).toEqual('__mocked__')
    expect(order).toEqual(['first:before', 'second:before', 'second:after', 'first:after'])

    expect(firstInterceptor).toHaveBeenCalledTimes(1)
    expect(secondInterceptor).toHaveBeenCalledTimes(1)

    expect(mockedLink.call).toHaveBeenCalledTimes(1)
    expect(mockedLink.call).toHaveBeenCalledWith(
      ['ping'],
      { value: 'intercepted' },
      { context: { requestId: 'request_1', userId: '123', traceId: 'trace_1' }, signal },
    )
  })

  it('works with scoped', async () => {
    const rootInterceptor = vi.fn(({ path, input, context, next }) => next({
      path,
      input,
      context: { ...context, rootPath: path.join('.') },
    }))

    const pingScopedInterceptor = vi.fn(({ path, input, context, next }) => {
      expect(path).toEqual(['ping'])
      expect(input).toEqual({ value: 'hello' })
      expect(context).toEqual({ requestId: 'request_1', rootPath: 'ping' })

      return next({
        path,
        input: { value: 'ping scoped' },
        context: { ...context, procedure: 'ping' },
      })
    })

    const pongScopedInterceptor = vi.fn(({ path, input, context, next }) => {
      expect(path).toEqual(['nested', 'pong'])
      expect(input).toEqual({ value: 'world' })
      expect(context).toEqual({ requestId: 'request_2', rootPath: 'nested.pong' })

      return next({
        path,
        input: { value: 'pong scoped' },
        context: { ...context, procedure: 'nested.pong' },
      })
    })

    const client = createORPCClient(mockedLink, {
      interceptors: [rootInterceptor],
      scoped: {
        ping: {
          interceptors: [pingScopedInterceptor],
        },
        nested: {
          pong: {
            interceptors: [pongScopedInterceptor],
          },
        },
      },
    } as any) as any

    expect(await client.ping({ value: 'hello' }, { context: { requestId: 'request_1' } })).toEqual('__mocked__')
    expect(await client.nested.pong({ value: 'world' }, { context: { requestId: 'request_2' } })).toEqual('__mocked__')

    expect(rootInterceptor).toHaveBeenCalledTimes(2)
    expect(pingScopedInterceptor).toHaveBeenCalledTimes(1)
    expect(pongScopedInterceptor).toHaveBeenCalledTimes(1)

    expect(mockedLink.call).toHaveBeenNthCalledWith(
      1,
      ['ping'],
      { value: 'ping scoped' },
      { context: { requestId: 'request_1', rootPath: 'ping', procedure: 'ping' } },
    )

    expect(mockedLink.call).toHaveBeenNthCalledWith(
      2,
      ['nested', 'pong'],
      { value: 'pong scoped' },
      { context: { requestId: 'request_2', rootPath: 'nested.pong', procedure: 'nested.pong' } },
    )
  })

  it('returns strictly equal client on repeated access', async () => {
    const client = createORPCClient(mockedLink) as any

    expect(client.ping).toBe(client.ping)
    expect(client.nested).toBe(client.nested)
    expect(client.nested.pong).toBe(client.nested.pong)
    expect(client.nested.pong).not.toBe(client.ping)

    expect(createORPCClient(mockedLink)).not.toBe(client)
  })

  it('not recursive on symbol and unwrap keys', async () => {
    const client = createORPCClient(mockedLink) as any
    expect(client[Symbol('test')]).toBeUndefined()
    expect(client.then).toBeUndefined()
    expect(await client).toBe(client)
    expect(client.bind).toBe(client.bind)
    expect(client.toString).toBe(client.toString)
    expect(client.call).toBe(Function.prototype.call)
    expect(client.apply).toBe(Function.prototype.apply)
  })

  it('supports invoking procedures via call/apply/bind', async () => {
    const client = createORPCClient(mockedLink) as any

    expect(await client.ping.call(undefined, { value: 'call' })).toEqual('__mocked__')
    expect(mockedLink.call).toHaveBeenLastCalledWith(['ping'], { value: 'call' }, { context: {} })

    expect(await client.nested.pong.apply(undefined, [{ value: 'apply' }])).toEqual('__mocked__')
    expect(mockedLink.call).toHaveBeenLastCalledWith(['nested', 'pong'], { value: 'apply' }, { context: {} })

    expect(await client.ping.bind(undefined)({ value: 'bind' })).toEqual('__mocked__')
    expect(mockedLink.call).toHaveBeenLastCalledWith(['ping'], { value: 'bind' }, { context: {} })
  })
})
