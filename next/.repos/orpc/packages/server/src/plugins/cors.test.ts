import { RPCHandler } from '../adapters/fetch/rpc-handler'
import { os } from '../builder'
import { CORSHandlerPlugin } from './cors'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('corsHandlerPlugin', () => {
  const handlerFn = vi.fn(() => 'pong')
  const router = {
    ping: os.handler(handlerFn),
  }

  it('default behavior', async () => {
    const handler = new RPCHandler(router, {
      plugins: [new CORSHandlerPlugin()],
    })

    const { response } = await handler.handle(new Request('https://example.com', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://example.com',
      },
    }))

    expect(handlerFn).toHaveBeenCalledTimes(0)
    expect(response!.status).toBe(204)
    expect(response!.headers.get('access-control-allow-origin')).toBe('*')
    expect(response!.headers.get('vary')).toBeNull()
    expect(response!.headers.get('access-control-allow-methods')).toBe('GET, HEAD, PUT, POST, DELETE, PATCH, QUERY')
    expect(response!.headers.get('access-control-max-age')).toBeNull()
  })

  it('applies maxAge and allowHeaders on OPTIONS requests when specified', async () => {
    const plugin = new CORSHandlerPlugin({
      maxAge: 600,
      allowHeaders: ['Content-Type', 'Authorization'],
    })

    const handler = new RPCHandler(router, {
      plugins: [plugin],
    })

    const { response } = await handler.handle(new Request('https://example.com/test', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://example.com',
      },
    }))

    expect(response!.headers.get('access-control-max-age')).toBe('600')
    expect(response!.headers.get('access-control-allow-methods')).toBe('GET, HEAD, PUT, POST, DELETE, PATCH, QUERY')
    expect(response!.headers.get('access-control-allow-headers')).toBe('Content-Type, Authorization')
  })

  it('omits allow-methods and allow-headers when configured as empty', async () => {
    const plugin = new CORSHandlerPlugin({
      allowMethods: [],
      allowHeaders: [],
    })

    const handler = new RPCHandler(router, {
      plugins: [plugin],
    })

    const { response } = await handler.handle(new Request('https://example.com', {
      method: 'OPTIONS',
      headers: {
        'origin': 'https://example.com',
        'access-control-request-headers': 'X-Requested-With',
      },
    }))

    expect(response!.headers.get('access-control-allow-methods')).toBeNull()
    expect(response!.headers.get('access-control-allow-headers')).toBeNull()
  })

  it('uses an explicitly configured method list instead of the default', async () => {
    const handler = new RPCHandler(router, {
      plugins: [new CORSHandlerPlugin({ allowMethods: ['POST'] })],
    })

    const { response } = await handler.handle(new Request('https://example.com', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://example.com',
      },
    }))

    expect(response!.headers.get('access-control-allow-methods')).toBe('POST')
  })

  it('sets allowed origin only when custom origin function approves', async () => {
    const customOrigin = (origin: string) => origin === 'https://allowed.com' ? origin : null
    const customRouter = {
      custom: os.handler(() => 'ok'),
    }

    const plugin = new CORSHandlerPlugin({ origin: customOrigin })
    const handler = new RPCHandler(customRouter, {
      plugins: [plugin],
    })

    // Request from allowed origin
    const { response } = await handler.handle(new Request('https://example.com/custom', {
      method: 'POST',
      headers: {
        'origin': 'https://allowed.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response!.headers.get('access-control-allow-origin')).toBe('https://allowed.com')

    // Request from a disallowed origin should not get the header set
    const { response: response2 } = await handler.handle(new Request('https://example.com/custom', {
      method: 'POST',
      headers: {
        'origin': 'https://disallowed.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response2!.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('handles timingOrigin option correctly', async () => {
    const customTimingOrigin = (origin: string) => origin === 'https://timing.com' ? origin : null
    const customRouter = {
      timing: os.handler(() => 'ok'),
    }

    const plugin = new CORSHandlerPlugin({ timingOrigin: customTimingOrigin })
    const handler = new RPCHandler(customRouter, {
      plugins: [plugin],
    })

    // Request with allowed timing origin
    const { response } = await handler.handle(new Request('https://example.com/timing', {
      method: 'POST',
      headers: {
        'origin': 'https://timing.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response!.headers.get('timing-allow-origin')).toBe('https://timing.com')
    expect(response!.headers.get('vary')).toBe('Origin')

    // Request with not allowed timing origin should not have the header,
    // but a function may answer differently per origin so the response still varies
    const { response: response2 } = await handler.handle(new Request('https://example.com/timing', {
      method: 'POST',
      headers: {
        'origin': 'https://not-timing.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response2!.headers.get('timing-allow-origin')).toBeNull()
    expect(response2!.headers.get('vary')).toBe('Origin')
  })

  it('sets credentials and exposeHeaders when specified in options', async () => {
    const plugin = new CORSHandlerPlugin({
      credentials: true,
      exposeHeaders: ['X-Custom-Header', 'X-Another-Header'],
    })

    const handler = new RPCHandler(router, {
      plugins: [plugin],
    })

    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response!.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response!.headers.get('access-control-expose-headers')).toBe('X-Custom-Header, X-Another-Header')
  })

  it('returns "*" for access-control-allow-origin when origin function returns "*"', async () => {
    const plugin = new CORSHandlerPlugin({ origin: () => '*' })
    const handler = new RPCHandler(router, {
      plugins: [plugin],
    })

    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://any-origin.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response!.headers.get('access-control-allow-origin')).toBe('*')
    // a function may answer differently per origin, so the response is always marked as varying
    expect(response!.headers.get('vary')).toBe('Origin')
  })

  it('returns "*" for timing-allow-origin when timingOrigin returns "*"', async () => {
    const plugin = new CORSHandlerPlugin({ timingOrigin: () => '*' })
    const handler = new RPCHandler(router, {
      plugins: [plugin],
    })

    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://any-origin.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response!.headers.get('timing-allow-origin')).toBe('*')
    expect(response!.headers.get('vary')).toBe('Origin')
  })

  it('adds Vary: Origin when timingOrigin is origin-specific even though origin is "*"', async () => {
    const plugin = new CORSHandlerPlugin({ timingOrigin: ['https://timing.com'] })
    const handler = new RPCHandler(router, {
      plugins: [plugin],
    })

    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://timing.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response!.headers.get('access-control-allow-origin')).toBe('*')
    expect(response!.headers.get('timing-allow-origin')).toBe('https://timing.com')
    expect(response!.headers.get('vary')).toBe('Origin')

    // a request without an origin gets no timing header, but must still be marked as varying by origin
    const { response: response2 } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response2!.headers.get('access-control-allow-origin')).toBe('*')
    expect(response2!.headers.get('timing-allow-origin')).toBeNull()
    expect(response2!.headers.get('vary')).toBe('Origin')
  })

  it('does not add Vary: Origin when timingOrigin is null', async () => {
    const plugin = new CORSHandlerPlugin({ timingOrigin: null })
    const handler = new RPCHandler(router, {
      plugins: [plugin],
    })

    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://timing.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response!.headers.get('timing-allow-origin')).toBeNull()
    expect(response!.headers.get('vary')).toBeNull()
  })

  it('falls back to access-control-request-headers when allowHeaders is not set', async () => {
    const handler = new RPCHandler(router, {
      plugins: [new CORSHandlerPlugin()],
    })

    const { response } = await handler.handle(new Request('https://example.com', {
      method: 'OPTIONS',
      headers: {
        'origin': 'https://example.com',
        'access-control-request-headers': 'X-Requested-With, Content-Type',
      },
    }))

    expect(response!.headers.get('access-control-allow-headers')).toBe('X-Requested-With, Content-Type')
  })

  it('only runs origin functions for requests that carry an Origin header', async () => {
    const originFn = vi.fn((origin: string) => origin)
    const timingOriginFn = vi.fn((origin: string) => origin)
    const handler = new RPCHandler(router, {
      plugins: [new CORSHandlerPlugin({ origin: originFn, timingOrigin: timingOriginFn })],
    })

    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))

    // nothing to reflect, but the response still varies by origin so caches keep it apart from allowed origins
    expect(originFn).not.toHaveBeenCalled()
    expect(timingOriginFn).not.toHaveBeenCalled()
    expect(response!.headers.get('access-control-allow-origin')).toBeNull()
    expect(response!.headers.get('timing-allow-origin')).toBeNull()
    expect(response!.headers.get('vary')).toBe('Origin')

    const { response: response2 } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://app.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))

    expect(originFn).toHaveBeenCalledExactlyOnceWith('https://app.com', expect.objectContaining({ request: expect.any(Object) }))
    expect(timingOriginFn).toHaveBeenCalledExactlyOnceWith('https://app.com', expect.objectContaining({ request: expect.any(Object) }))
    expect(response2!.headers.get('access-control-allow-origin')).toBe('https://app.com')
    expect(response2!.headers.get('timing-allow-origin')).toBe('https://app.com')
    expect(response2!.headers.get('vary')).toBe('Origin')
  })

  it('emits static wildcards even when the request has no Origin header', async () => {
    const handler = new RPCHandler(router, {
      plugins: [new CORSHandlerPlugin({ timingOrigin: '*' })],
    })

    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))

    expect(response!.headers.get('access-control-allow-origin')).toBe('*')
    expect(response!.headers.get('timing-allow-origin')).toBe('*')
    expect(response!.headers.get('vary')).toBeNull()
  })

  it('supports an async origin function resolved per request', async () => {
    const plugin = new CORSHandlerPlugin({
      origin: async origin => origin === 'https://allowed.com' ? origin : null,
    })
    const handler = new RPCHandler(router, {
      plugins: [plugin],
    })

    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://allowed.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response!.headers.get('access-control-allow-origin')).toBe('https://allowed.com')

    const { response: response2 } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://disallowed.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response2!.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('supports an async timingOrigin function resolved per request', async () => {
    const plugin = new CORSHandlerPlugin({
      timingOrigin: async origin => origin === 'https://timing.com' ? origin : null,
    })
    const handler = new RPCHandler(router, {
      plugins: [plugin],
    })

    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://timing.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response!.headers.get('timing-allow-origin')).toBe('https://timing.com')
  })

  it('does not copy Vary from the request', async () => {
    const handler = new RPCHandler(router, {
      plugins: [new CORSHandlerPlugin({ origin: origin => origin })],
    })

    const { response } = await handler.handle(new Request('https://example.com', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://example.com',
        vary: 'Accept-Encoding',
      },
    }))

    expect(response!.headers.get('access-control-allow-origin')).toBe('https://example.com')
    expect(response!.headers.get('vary')).toBe('Origin')
  })

  it('appends Origin to an existing response Vary header', async () => {
    const handler = new RPCHandler(router, {
      plugins: [
        {
          name: 'set-vary',
          init(options) {
            return {
              ...options,
              routingInterceptors: [
                async (opts) => {
                  const result = await opts.next()
                  if (!result.matched) {
                    return result
                  }
                  return {
                    ...result,
                    response: {
                      ...result.response,
                      headers: {
                        ...result.response.headers,
                        vary: 'Accept-Encoding',
                      },
                    },
                  }
                },
                ...options.routingInterceptors ?? [],
              ],
            }
          },
        },
        new CORSHandlerPlugin({ origin: origin => origin }),
      ],
    })

    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))

    expect(response!.headers.get('vary')).toBe('Accept-Encoding, Origin')
  })

  it('does not duplicate Origin in Vary when already present', async () => {
    const handler = new RPCHandler(router, {
      plugins: [
        {
          name: 'set-vary',
          init(options) {
            return {
              ...options,
              routingInterceptors: [
                async (opts) => {
                  const result = await opts.next()
                  if (!result.matched) {
                    return result
                  }
                  return {
                    ...result,
                    response: {
                      ...result.response,
                      headers: {
                        ...result.response.headers,
                        vary: 'Accept-Encoding, origin',
                      },
                    },
                  }
                },
                ...options.routingInterceptors ?? [],
              ],
            }
          },
        },
        new CORSHandlerPlugin({ origin: origin => origin }),
      ],
    })

    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))

    expect(response!.headers.get('vary')).toBe('Accept-Encoding, origin')
  })

  it('does not add CORS headers when request does not match any procedure', async () => {
    const handler = new RPCHandler(router, {
      plugins: [new CORSHandlerPlugin()],
    })

    const { matched, response } = await handler.handle(new Request('https://example.com/nonexistent', {
      method: 'POST',
      headers: {
        'origin': 'https://example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))

    expect(matched).toBe(false)
    expect(response).toBeUndefined()
  })

  it('supports origin as an array of allowed origins', async () => {
    const plugin = new CORSHandlerPlugin({
      origin: ['https://a.com', 'https://b.com'],
    })
    const handler = new RPCHandler(router, {
      plugins: [plugin],
    })

    // Allowed origin
    const { response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://a.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response!.headers.get('access-control-allow-origin')).toBe('https://a.com')

    // Not allowed origin
    const { response: response2 } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: {
        'origin': 'https://c.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: null }),
    }))
    expect(response2!.headers.get('access-control-allow-origin')).toBeNull()
  })
})
