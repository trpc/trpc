import type { RouterContractClient } from '@orpc/contract'
import type { AnyRouter } from '@orpc/server'
import type { ResponseHeadersHandlerPluginContext } from '@orpc/server/plugins'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { createORPCClient, isDefinedError, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { asyncIteratorObject, oc } from '@orpc/contract'
import { RPCHandler } from '@orpc/server/fetch'
import { ResponseHeadersHandlerPlugin } from '@orpc/server/plugins'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import z from 'zod'
import { createHTTPUtils } from './index'

const contract = {
  planet: {
    find: oc
      .errors({ NOT_FOUND: { message: 'Planet not found', data: z.object({ id: z.number() }) } })
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string(), discoveredAt: z.date() })),
    list: oc
      .output(z.array(z.object({ id: z.number(), name: z.string() }))),
    updates: oc
      .input(z.object({ id: z.number() }))
      .output(asyncIteratorObject(z.object({ message: z.string() }))),
  },
}

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const orpc = createHTTPUtils(contract, {
  origin: 'http://localhost:3000',
  prefix: '/rpc',
  handler: router => new RPCHandler(router),
})

const client: RouterContractClient<typeof contract> = createORPCClient(new RPCLink({
  origin: 'http://localhost:3000',
  url: '/rpc',
}))

describe('handler', () => {
  it('resolves with rpc serialization intact', async () => {
    server.use(orpc.planet.find.handler(({ input }) => ({
      id: input.id,
      name: 'Earth',
      discoveredAt: new Date('2020-01-01'),
    })))

    const planet = await client.planet.find({ id: 42 })

    expect(planet).toEqual({ id: 42, name: 'Earth', discoveredAt: new Date('2020-01-01') })
    expect(planet.discoveredAt).toBeInstanceOf(Date)
  })

  it('exposes msw resolver info through the context option', async () => {
    const fn = vi.fn(({ input }: { input: { id: number } }) => ({
      id: input.id,
      name: 'Earth',
      discoveredAt: new Date('2020-01-01'),
    }))

    const infoORPC = createHTTPUtils(contract, {
      origin: 'http://localhost:3000',
      prefix: '/rpc',
      // clone so the raw body stays readable after input deserialization
      context: info => ({ request: info.request.clone(), requestId: info.requestId }),
      handler: router => new RPCHandler(router),
    })

    server.use(infoORPC.planet.find.handler(fn))
    await client.planet.find({ id: 1 })

    const { context } = fn.mock.calls[0]![0] as any
    expect(context.request).toBeInstanceOf(Request)
    expect(context.request.url).toBe('http://localhost:3000/rpc/planet/find')
    expect(context.requestId).toBeTypeOf('string')
    await expect(context.request.json()).resolves.toEqual({ json: { id: 1 } })
  })

  it('validates input like the real rpc handler', async () => {
    server.use(orpc.planet.find.handler(({ input }) => ({
      id: input.id,
      name: 'Earth',
      discoveredAt: new Date('2020-01-01'),
    })))

    await expect(client.planet.find({ id: 'invalid' } as any)).rejects.toSatisfy(
      error => error instanceof ORPCError && error.code === 'BAD_REQUEST',
    )
  })

  it('validates the mocked output', async () => {
    server.use(orpc.planet.find.handler(() => ({ id: 1 }) as any))

    await expect(client.planet.find({ id: 1 })).rejects.toSatisfy(
      error => error instanceof ORPCError && error.code === 'INTERNAL_SERVER_ERROR',
    )
  })

  it('supports throwing typed errors via the errors constructors', async () => {
    server.use(orpc.planet.find.handler(({ input, errors }) => {
      throw errors.NOT_FOUND({ data: { id: input.id } })
    }))

    try {
      await client.planet.find({ id: 7 })
      expect.unreachable()
    }
    catch (error) {
      expect(error).toBeInstanceOf(ORPCError)
      expect(isDefinedError(error)).toBe(true)
      expect((error as any).code).toBe('NOT_FOUND')
      expect((error as any).message).toBe('Planet not found')
      expect((error as any).data).toEqual({ id: 7 })
    }
  })

  it('supports event iterator outputs', async () => {
    server.use(orpc.planet.updates.handler(async function* () {
      yield { message: 'hello' }
      yield { message: 'world' }
    }))

    const messages: string[] = []

    for await (const { message } of await client.planet.updates({ id: 1 })) {
      messages.push(message)
    }

    expect(messages).toEqual(['hello', 'world'])
  })

  it('matches any origin by default', async () => {
    const defaultORPC = createHTTPUtils(contract, { prefix: '/rpc', handler: router => new RPCHandler(router) })

    server.use(defaultORPC.planet.list.handler(() => [{ id: 1, name: 'Venus' }]))

    await expect(client.planet.list()).resolves.toEqual([{ id: 1, name: 'Venus' }])
  })

  it('supports wildcard base urls', async () => {
    const wildcardORPC = createHTTPUtils(contract, { origin: '*', prefix: '/api/rpc', handler: router => new RPCHandler(router) })

    server.use(wildcardORPC.planet.list.handler(() => [{ id: 1, name: 'Mars' }]))

    const wildcardClient: RouterContractClient<typeof contract> = createORPCClient(new RPCLink({
      origin: 'http://example.com',
      url: '/api/rpc',
    }))

    await expect(wildcardClient.planet.list()).resolves.toEqual([{ id: 1, name: 'Mars' }])
  })

  it('serves mocks through the provided handler, e.g. with plugins', async () => {
    const factory = vi.fn((router: AnyRouter) => new RPCHandler(router, {
      routingInterceptors: [async ({ next }) => {
        const result = await next()

        if (result.matched) {
          result.response.headers['x-mocked'] = '1'
        }

        return result
      }],
    }))

    const customORPC = createHTTPUtils(contract, {
      origin: 'http://localhost:3000',
      prefix: '/rpc',
      handler: factory,
    })

    server.use(customORPC.planet.list.handler(() => []))

    const response = await fetch('http://localhost:3000/rpc/planet/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    expect(response.headers.get('x-mocked')).toBe('1')
    await expect(response.json()).resolves.toEqual({ json: [] })

    // the factory receives a router containing only the mocked procedure
    expect(Object.keys(factory.mock.calls[0]![0])).toEqual(['planet'])
  })

  it('supports controlling the handler context, e.g. for response headers', async () => {
    interface MockServerContext extends ResponseHeadersHandlerPluginContext {
      request: Request
    }

    const contextORPC = createHTTPUtils(contract, {
      origin: 'http://localhost:3000',
      prefix: '/rpc',
      context: (info): MockServerContext => ({ request: info.request }),
      handler: router => new RPCHandler(router, {
        plugins: [new ResponseHeadersHandlerPlugin()],
      }),
    })

    server.use(contextORPC.planet.list.handler(({ context }) => {
      expect(context.request).toBeInstanceOf(Request)
      context.resHeaders?.set('x-mocked-context', '1')
      return []
    }))

    const response = await fetch('http://localhost:3000/rpc/planet/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    expect(response.headers.get('x-mocked-context')).toBe('1')
    await expect(response.json()).resolves.toEqual({ json: [] })
  })

  it('does not match other origins when origin is empty', async () => {
    const sameOriginORPC = createHTTPUtils(contract, {
      origin: '',
      prefix: '/rpc',
      handler: router => new RPCHandler(router),
    })

    server.use(
      sameOriginORPC.planet.list.handler(() => []),
      http.all('http://localhost:3000/*', () => HttpResponse.text('fallback')),
    )

    // the mask stays relative, so it never matches an absolute origin
    const response = await fetch('http://localhost:3000/rpc/planet/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    await expect(response.text()).resolves.toBe('fallback')
  })

  it('leaves unmatched requests to other msw handlers', async () => {
    server.use(
      orpc.planet.list.handler(() => []),
      http.all('http://localhost:3000/*', () => HttpResponse.text('fallback')),
    )

    // GET is not allowed by the rpc handler by default, so it should fall through
    const response = await fetch('http://localhost:3000/rpc/planet/list', { method: 'GET' })

    await expect(response.text()).resolves.toBe('fallback')
  })
})

describe('error', () => {
  it('responds with a defined error like a real server', async () => {
    server.use(orpc.planet.find.error('NOT_FOUND', { data: { id: 42 } }))

    try {
      await client.planet.find({ id: 42 })
      expect.unreachable()
    }
    catch (error) {
      expect(error).toBeInstanceOf(ORPCError)
      expect(isDefinedError(error)).toBe(true)
      expect((error as any).code).toBe('NOT_FOUND')
      expect((error as any).message).toBe('Planet not found')
      expect((error as any).data).toEqual({ id: 42 })
    }
  })

  it('allows overriding the message', async () => {
    server.use(orpc.planet.find.error('NOT_FOUND', { message: 'custom message', data: { id: 1 } }))

    await expect(client.planet.find({ id: 1 })).rejects.toThrow('custom message')
  })
})

describe('passthrough', () => {
  it('performs the request against the real server', async () => {
    const realServer = createServer((req, res) => {
      let body = ''
      req.on('data', chunk => (body += chunk))
      req.on('end', () => res.end(`real:${body}`))
    })
    await new Promise<void>(resolve => realServer.listen(0, resolve))
    const port = (realServer.address() as AddressInfo).port

    try {
      const realORPC = createHTTPUtils(contract, {
        origin: `http://localhost:${port}`,
        prefix: '/rpc',
        handler: router => new RPCHandler(router),
      })

      server.use(
        realORPC.planet.list.passthrough(),
        realORPC.planet.find.handler(({ input }) => ({
          id: input.id,
          name: 'Earth',
          discoveredAt: new Date('2020-01-01'),
        })),
      )

      // the body must survive the matching attempt to reach the real server
      const response = await fetch(`http://localhost:${port}/rpc/planet/list`, { method: 'POST', body: '{}' })

      await expect(response.text()).resolves.toBe('real:{}')

      // other procedures fall through the passthrough handler and stay mocked
      const mocked = await fetch(`http://localhost:${port}/rpc/planet/find`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ json: { id: 1 } }),
      })

      await expect(mocked.json()).resolves.toEqual({
        json: { id: 1, name: 'Earth', discoveredAt: '2020-01-01T00:00:00.000Z' },
        meta: [['date', 'discoveredAt']],
      })
    }
    finally {
      realServer.close()
    }
  })
})

describe('loading', () => {
  it('rejects immediately when the request is already aborted', async () => {
    const controller = new AbortController()

    const abortedORPC = createHTTPUtils(contract, {
      origin: 'http://localhost:3000',
      prefix: '/rpc',
      context: async () => {
        controller.abort()
        await new Promise(resolve => setTimeout(resolve, 20))
        return {}
      },
      handler: router => new RPCHandler(router),
    })

    server.use(abortedORPC.planet.list.loading())

    await expect(client.planet.list(undefined, { signal: controller.signal })).rejects.toThrow()
  })

  it('never resolves', async () => {
    server.use(orpc.planet.list.loading())

    const controller = new AbortController()
    const pending = client.planet.list(undefined, { signal: controller.signal })
    pending.catch(() => {}) // silence the abort rejection below

    await expect(Promise.race([
      pending,
      new Promise(resolve => setTimeout(resolve, 100, 'still-loading')),
    ])).resolves.toBe('still-loading')

    // aborting rejects the pending mock, releasing its resources
    controller.abort()
    await expect(pending).rejects.toThrow()
    await new Promise(resolve => setTimeout(resolve, 50))
  })
})
