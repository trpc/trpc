import { ORPCError } from '@orpc/client'
import { openapi, OpenAPISerializer } from '@orpc/openapi'
import { os } from '@orpc/server'
import { promiseWithResolvers } from '@orpc/shared'
import { z } from 'zod'
import { Person } from '../rpc/__shared__/client-server'
import { createHonoFetchClientServerTest } from './__shared__/client-server.hono-fetch'
import { createNodeHttpClientServerTest } from './__shared__/client-server.node-http'

describe.each([
  ['hono-fetch', createHonoFetchClientServerTest],
  ['node-http', createNodeHttpClientServerTest],
])('openapi v2 data transfer: %s', async (_name, createClientServer) => {
  const date = new Date('2024-01-02T03:04:05.000Z')
  const blob = new Blob(['hello'], { type: 'text/plain' })
  const customSerializer = new OpenAPISerializer({
    handlers: {
      person: {
        condition: value => value instanceof Person,
        serialize: value => ({
          __person__: {
            name: value.name,
            age: value.age,
          },
        }),
      },
    },
  })

  const router = {
    get: os
      .input(z.any())
      .meta(openapi({
        method: 'GET',
        path: '/items/{id}',
        queryStyles: {
          keyword: 'primitive',
          tags: 'array',
          meta: 'json',
        },
      }))
      .handler(({ input, lastEventId }) => ({ input, lastEventId })),
    post: os
      .input(z.any())
      .meta(openapi({
        method: 'POST',
        path: '/items',
      }))
      .handler(({ input }) => input),
    upload: os
      .input(z.any())
      .meta(openapi({
        method: 'POST',
        path: '/upload',
      }))
      .handler(({ input }) => input),
    detailed: os
      .$context<{ userId: string }>()
      .input(z.any())
      .meta(openapi({
        method: 'POST',
        path: '/articles/{id}/{tags}',
        inputStructure: 'detailed',
        outputStructure: 'detailed',
        successStatus: 201,
        paramsStyles: {
          tags: 'comma-delimited-array',
        },
        queryStyles: {
          meta: 'json',
        },
      }))
      .handler(({ input, context, signal }) => ({
        status: 202,
        headers: {
          'x-user-id': context.userId,
          'x-aborted': String(signal?.aborted),
        },
        body: input,
      })),
    error: os
      .input(z.any())
      .meta(openapi({
        method: 'GET',
        path: '/errors/{id}',
      }))
      .handler(() => {
        throw new ORPCError('NOT_FOUND', {
          message: 'Missing item',
          data: { id: 'missing-item' },
        })
      }),
    definedError: os
      .input(z.any())
      .errors({
        FORBIDDEN: {
          data: z.object({ reason: z.string() }),
        },
      })
      .meta(openapi({
        method: 'GET',
        path: '/defined-errors',
      }))
      .handler(({ errors }) => {
        throw errors.FORBIDDEN({
          message: 'Access denied',
          data: { reason: 'no-permission' },
        })
      }),
    customSerializer: os.input(z.any()).handler(({ input }) => ({ client: input, server: new Person('server', 12) })),
  }

  const client = createClientServer(router, {
    context: { userId: 'u_123' },
  })

  it('supports compact GET input with path params, styled query, and lastEventId', async () => {
    await expect(client.get({
      id: '42',
      keyword: 1,
      tags: ['red', 'blue'],
      meta: { enabled: true },
      filter: { published: true },
    }, {
      lastEventId: '__EVENT_123__',
    })).resolves.toEqual({
      input: {
        id: '42',
        keyword: '1',
        tags: ['red', 'blue'],
        meta: { enabled: true },
        filter: { published: 'true' },
      },
      lastEventId: '__EVENT_123__',
    })
  })

  it('supports compact POST JSON bodies', async () => {
    await expect(client.post({
      count: 1n,
      when: date,
      nested: {
        flag: true,
      },
    })).resolves.toEqual({
      count: '1',
      when: date.toISOString(),
      nested: {
        flag: true,
      },
    })
  })

  it('supports compact POST multipart bodies', async () => {
    const result = await client.upload({
      title: 'hello',
      nested: {
        when: date,
      },
      file: blob,
    })

    expect(result.title).toBe('hello')
    expect(result.nested).toEqual({ when: date.toISOString() })
    expect(result.file).toBeInstanceOf(File)
    expect(result.file.type).toBe('text/plain')
    await expect(result.file.text()).resolves.toBe('hello')
  })

  it('supports custom serializer', async () => {
    const customClient = createClientServer(router, {
      serializer: customSerializer,
    })
    const person = new Person('Alice', 30)

    await expect(customClient.customSerializer(person)).resolves.toEqual({
      client: {
        __person__: {
          age: 30,
          name: 'Alice',
        },
      },
      server: {
        __person__: {
          age: 12,
          name: 'server',
        },
      },
    })
  })

  it('supports AsyncIteratorObject and transfers events in parallel', async () => {
    const order2 = promiseWithResolvers<void>()
    const order3 = promiseWithResolvers<void>()
    const completion = promiseWithResolvers<void>()

    const stream = (async function* () {
      yield 'order 1'
      await order2.promise
      yield { order: 2 }
      await order3.promise
      yield { when: date }
      await completion.promise
      return { completeAt: date }
    }())

    // The source holds everything after its first event until the test releases it, so a transport
    // that buffered the stream would hang here instead of resolving.
    const result = await client.post(stream) as AsyncIteratorObject<unknown>
    await expect(result.next()).resolves.toEqual({ value: 'order 1', done: false })

    order2.resolve()
    await expect(result.next()).resolves.toEqual({ value: { order: 2 }, done: false })

    order3.resolve()
    await expect(result.next()).resolves.toEqual({
      value: { when: date.toISOString() },
      done: false,
    })

    completion.resolve()
    await expect(result.next()).resolves.toEqual({
      value: { completeAt: date.toISOString() },
      done: true,
    })
  })

  it('supports octet stream and transfers octets in parallel', async () => {
    const order2 = promiseWithResolvers<void>()
    const order3 = promiseWithResolvers<void>()

    const stream = new ReadableStream<string>({
      async start(controller) {
        controller.enqueue('order 1')
        await order2.promise
        controller.enqueue('order 2')
        await order3.promise
        controller.enqueue('order 3')
        controller.close()
      },
    }).pipeThrough(new TextEncoderStream())

    // The source holds everything after its first chunk until the test releases it, so a transport
    // that buffered the stream would hang here instead of resolving.
    const result = await client.post(stream) as ReadableStream<Uint8Array>

    const reader = result.getReader()

    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(first.value).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(first.value)).toBe('order 1')

    order2.resolve()
    const second = await reader.read()
    expect(second.done).toBe(false)
    expect(second.value).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(second.value)).toBe('order 2')

    order3.resolve()
    const third = await reader.read()
    expect(third.done).toBe(false)
    expect(third.value).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(third.value)).toBe('order 3')

    await expect(reader.read()).resolves.toEqual({ value: undefined, done: true })
  })

  it('supports detailed input and detailed output', async () => {
    const result = await client.detailed({
      params: {
        id: '24',
        tags: ['alpha', 'beta'],
      },
      query: {
        meta: { draft: true },
        plain: { page: 2 },
      },
      headers: {
        'x-trace-id': 'trace-1',
      },
      body: {
        title: 'Hello',
        published: true,
      },
    })

    expect(result.status).toBe(202)
    expect(result.headers['x-user-id']).toBe('u_123')
    expect(result.headers['x-aborted']).toBe('false')
    expect(result.body).toEqual({
      params: {
        id: '24',
        tags: ['alpha', 'beta'],
      },
      query: {
        meta: { draft: true },
        plain: { page: '2' },
      },
      headers: expect.objectContaining({
        'x-trace-id': 'trace-1',
      }),
      body: {
        title: 'Hello',
        published: true,
      },
    })
  })

  it('propagates ORPC errors through OpenAPI responses', async () => {
    await expect(client.error({
      id: '42',
    })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Missing item',
      data: { id: 'missing-item' },
    })
  })

  it('propagates typesafe errors with the defined flag', async () => {
    await expect(client.definedError({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Access denied',
      data: { reason: 'no-permission' },
      defined: true,
    })
  })
})
