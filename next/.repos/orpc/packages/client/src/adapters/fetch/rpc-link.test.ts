import { toFetchBody } from '@standard-server/fetch'
import { createORPCClient } from '../../client'
import { RPCLink } from './rpc-link'

vi.mock('@orpc/shared', async (loadOrigin) => {
  const origin = await loadOrigin() as any

  return {
    ...origin,
    once: (fn: any) => fn,
  }
})

vi.mock('@standard-server/fetch', async (loadOrigin) => {
  const origin = await loadOrigin() as any

  return {
    ...origin,
    toFetchBody: vi.fn(origin.toFetchBody),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('rpcLink', () => {
  it('calls endpoint with fetch transport', async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ json: 'pong' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const orpc = createORPCClient(new RPCLink({
      fetch,
      origin: 'http://api.example.com',
    })) as any

    await expect(orpc.ping('input')).resolves.toEqual('pong')

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'http://api.example.com/ping',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
      }),
      expect.objectContaining({
        context: {},
      }),
      ['ping'],
    )
  })

  it('sends QUERY requests with body-encoded input', async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ json: 'pong' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const orpc = createORPCClient(new RPCLink({
      fetch,
      method: 'QUERY',
      origin: 'http://api.example.com',
    })) as any

    await expect(orpc.ping('input')).resolves.toEqual('pong')

    expect(fetch).toHaveBeenCalledWith(
      'http://api.example.com/ping',
      expect.objectContaining({
        body: JSON.stringify({ json: 'input' }),
        method: 'QUERY',
      }),
      expect.objectContaining({ context: {} }),
      ['ping'],
    )
  })

  it('supports custom headers and query parameters in origin', async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ json: 'pong' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const headers = vi.fn(() => ({ 'x-custom-header': 'value' }))

    const orpc = createORPCClient(new RPCLink({
      fetch,
      origin: 'http://api.example.com/api?token=abc',
      headers,
    })) as any

    await expect(orpc.ping('input')).resolves.toEqual('pong')

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('http://api.example.com/api?token=abc'),
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: expect.toSatisfy((h: Headers) => h.get('x-custom-header') === 'value'),
      }),
      expect.objectContaining({
        context: {},
      }),
      ['ping'],
    )
  })

  it('uses default global fetch when fetch option is not provided', async ({ onTestFinished }) => {
    const fetchSpy = vi.fn(async () => {
      return new Response(JSON.stringify({ json: 'pong' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = fetchSpy

    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const orpc = createORPCClient(new RPCLink({
      origin: 'http://api.example.com/',
    })) as any

    await expect(orpc.ping('input')).resolves.toEqual('pong')

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://api.example.com/ping',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
      }),
    )
  })

  it('uses the current global fetch even when it is patched after link construction', async ({ onTestFinished }) => {
    const orpc = createORPCClient(new RPCLink({
      origin: 'http://api.example.com/',
    })) as any

    const fetchSpy = vi.fn(async () => {
      return new Response(JSON.stringify({ json: 'pong' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = fetchSpy

    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    await expect(orpc.ping('input')).resolves.toEqual('pong')

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://api.example.com/ping',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
      }),
    )
  })

  it('calls custom fetch without a receiver so native browser fetch can be passed directly', async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ json: 'pong' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const orpc = createORPCClient(new RPCLink({
      fetch,
      origin: 'http://api.example.com',
    })) as any

    await expect(orpc.ping('input')).resolves.toEqual('pong')

    expect(fetch.mock.contexts).toEqual([undefined])
  })

  it('supports custom fetch and toFetchRequest options', async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ json: 'pong' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const toFetchRequestOptions = { eventStream: { keepAlive: { enabled: true, comment: 'ok' } } }

    const orpc = createORPCClient(new RPCLink({
      fetch,
      origin: 'http://api.example.com',
      toFetchRequest: toFetchRequestOptions,
    })) as any

    await expect(orpc.ping('input')).resolves.toEqual('pong')

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'http://api.example.com/ping',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
      }),
      expect.objectContaining({ context: {} }),
      ['ping'],
    )
    expect(toFetchBody).toHaveBeenCalledWith({ json: 'input' }, {}, toFetchRequestOptions)
  })

  it('supports request without origin', async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ json: 'pong' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const orpc = createORPCClient(new RPCLink({
      fetch,
    })) as any

    await expect(orpc.ping('input')).resolves.toEqual('pong')

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      '/ping',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
      }),
      expect.objectContaining({
        context: {},
      }),
      ['ping'],
    )
  })

  it('sets duplex mode for ReadableStream body when supported', async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ json: 'pong' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const orpc = createORPCClient(new RPCLink({
      fetch,
      origin: 'http://api.example.com',
      toFetchRequest: { eventStream: { keepAlive: { enabled: true, comment: 'ok' } } },
    })) as any

    await expect(orpc.ping(new ReadableStream())).resolves.toEqual('pong')

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'http://api.example.com/ping',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        duplex: 'half',
      }),
      expect.objectContaining({
        context: {},
      }),
      ['ping'],
    )
  })

  it('does not set duplex mode for ReadableStream body when not supported', async ({ onTestFinished }) => {
    const OriginalRequest = globalThis.Request
    ;(globalThis as any).Request = class ThrowsDuplex extends OriginalRequest {
      constructor(input: any, init?: any) {
        if (init?.duplex !== undefined) {
          throw new Error('duplex not supported')
        }
        super(input, init)
      }
    }

    onTestFinished(() => {
      (globalThis as any).Request = OriginalRequest
    })

    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ json: 'pong' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const orpc = createORPCClient(new RPCLink({
      fetch,
      origin: 'http://api.example.com',
      toFetchRequest: { eventStream: { keepAlive: { enabled: true, comment: 'ok' } } },
    })) as any

    await expect(orpc.ping(new ReadableStream())).resolves.toEqual('pong')

    expect(fetch).toHaveBeenCalledOnce()
    const init = (fetch as any).mock.calls[0][1]
    expect(init).not.toHaveProperty('duplex')
  })

  it.each([
    ['opaqueredirect', 'Unexpected redirect response: redirects are not followed.'],
    ['opaque', 'Unexpected opaque response: the response is unreadable, likely due to a no-cors request.'],
  ])('throws on %s responses', async (type, message) => {
    const fetch = vi.fn(async () => {
      // Browsers return opaque responses with status 0 and no headers or body
      const response = Response.error()
      Object.defineProperty(response, 'type', { value: type })
      return response
    })

    const orpc = createORPCClient(new RPCLink({
      fetch,
      origin: 'http://api.example.com',
    })) as any

    await expect(orpc.ping('input')).rejects.toThrow(new TypeError(message))
    expect(fetch).toHaveBeenCalledOnce()
  })
})
