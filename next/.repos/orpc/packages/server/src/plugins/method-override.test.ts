import { RPCHandler } from '../adapters/fetch'
import { os } from '../builder'
import { MethodOverrideHandlerPlugin } from './method-override'

function getInterceptor(options?: ConstructorParameters<typeof MethodOverrideHandlerPlugin>[0]) {
  const existingInterceptor = vi.fn()

  const handlerOptions = new MethodOverrideHandlerPlugin<any>(options).init({
    routingInterceptors: [existingInterceptor],
  } as any)

  return {
    interceptor: handlerOptions.routingInterceptors![0]!,
    existingInterceptor,
    routingInterceptors: handlerOptions.routingInterceptors!,
  }
}

async function invokeInterceptor(
  request: { method: string, url: string },
  options?: ConstructorParameters<typeof MethodOverrideHandlerPlugin>[0],
) {
  const nextResult = { matched: true, response: 'ok' } as any
  const next = vi.fn().mockResolvedValue(nextResult)
  const { interceptor } = getInterceptor(options)

  const result = await interceptor({
    context: {},
    request,
    next,
  } as any)

  return { result, next, nextResult }
}

describe('methodOverrideHandlerPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prepends its routing interceptor before existing ones', () => {
    const { routingInterceptors, existingInterceptor } = getInterceptor()

    expect(routingInterceptors).toHaveLength(2)
    expect(routingInterceptors[0]).not.toBe(existingInterceptor)
    expect(routingInterceptors[1]).toBe(existingInterceptor)
  })

  it('ignores non-POST requests', async () => {
    const { result, next, nextResult } = await invokeInterceptor({ method: 'GET', url: '/todos/1?method=DELETE' })

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(result).toBe(nextResult)
  })

  it('ignores POST requests without the override param', async () => {
    const { result, next, nextResult } = await invokeInterceptor({ method: 'POST', url: '/todos/1?x=1' })

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(result).toBe(nextResult)
  })

  it('overrides the method and strips the param', async () => {
    const { result, next, nextResult } = await invokeInterceptor({ method: 'POST', url: '/todos/1?method=DELETE' })

    expect(next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      request: expect.objectContaining({ method: 'DELETE', url: '/todos/1' }),
    }))
    expect(result).toBe(nextResult)
  })

  it('matches the override value case-insensitively', async () => {
    const { next } = await invokeInterceptor({ method: 'POST', url: '/todos/1?method=delete' })

    expect(next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      request: expect.objectContaining({ method: 'DELETE', url: '/todos/1' }),
    }))
  })

  it('uses the last occurrence when the param is repeated and strips all of them', async () => {
    const { next } = await invokeInterceptor({ method: 'POST', url: '/todos/1?method=PUT&method=DELETE' })

    expect(next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      request: expect.objectContaining({ method: 'DELETE', url: '/todos/1' }),
    }))
  })

  it('preserves other query params and the hash', async () => {
    const { next } = await invokeInterceptor({ method: 'POST', url: '/a?x=1&method=DELETE&y=2#h' })

    expect(next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      request: expect.objectContaining({ method: 'DELETE', url: '/a?x=1&y=2#h' }),
    }))
  })

  it.each(['FOO', 'GET', 'HEAD', 'POST'])('silently ignores an override value that is not allowed: %s', async (method) => {
    const { result, next, nextResult } = await invokeInterceptor({ method: 'POST', url: `/todos/1?method=${method}` })

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(result).toBe(nextResult)
  })

  it('honors a custom param name', async () => {
    const { next } = await invokeInterceptor({ method: 'POST', url: '/todos/1?_method=DELETE&method=PUT' }, { param: '_method' })

    expect(next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      request: expect.objectContaining({ method: 'DELETE', url: '/todos/1?method=PUT' }),
    }))
  })

  it('honors custom allowed methods', async () => {
    const { next } = await invokeInterceptor({ method: 'POST', url: '/todos/1?method=GET' }, { methods: ['get'] })

    expect(next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      request: expect.objectContaining({ method: 'GET', url: '/todos/1' }),
    }))

    const { next: next2 } = await invokeInterceptor({ method: 'POST', url: '/todos/1?method=DELETE' }, { methods: ['GET'] })

    expect(next2).toHaveBeenCalledExactlyOnceWith()
  })

  it('works with RPCHandler', async () => {
    const procedureHandler = vi.fn(() => 'pong')
    const handler = new RPCHandler(
      {
        ping: os.handler(procedureHandler),
      },
      {
        plugins: [new MethodOverrideHandlerPlugin()],
      },
    )

    const { matched, response } = await handler.handle(new Request('https://example.com/ping?method=DELETE', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: 'input' }),
    }))

    expect(matched).toBe(true)
    expect(response!.status).toBe(200)
    await expect(response!.text()).resolves.toContain('pong')
    expect(procedureHandler).toHaveBeenCalledWith(expect.any(Object), 'input')
  })
})
