import { os } from '@orpc/server'
import { promiseWithResolvers } from '@orpc/shared'
import { z } from 'zod'
import { builtInRPCSupportDataTypes } from './__shared__/built-in-support-data-types'
import { Person } from './__shared__/client-server'
import { createCompressionCrosswsClientServerTest } from './__shared__/client-server.compression-crossws'
import { createCompressionHonoFetchClientServerTest } from './__shared__/client-server.compression-hono-fetch'
import { createCompressionMessagePortClientServerTest } from './__shared__/client-server.compression-message-port'
import { createCompressionMessagePortTransferClientServerTest } from './__shared__/client-server.compression-message-port-transfer'
import { createCompressionNodeHttpClientServerTest } from './__shared__/client-server.compression-node-http'
import { createCompressionNodeWsClientServerTest } from './__shared__/client-server.compression-node-ws'
import { createCrosswsClientServerTest } from './__shared__/client-server.crossws'
import { createHonoFetchClientServerTest } from './__shared__/client-server.hono-fetch'
import { createMessagePortClientServerTest } from './__shared__/client-server.message-port'
import { createMessagePortTransferClientServerTest } from './__shared__/client-server.message-port-transfer'
import { createNodeHttpClientServerTest } from './__shared__/client-server.node-http'
import { createNodeWsClientServerTest } from './__shared__/client-server.node-ws'

describe.each([
  ['crossws', createCrosswsClientServerTest],
  ['hono-fetch', createHonoFetchClientServerTest],
  ['node-http', createNodeHttpClientServerTest],
  ['message-port', createMessagePortClientServerTest],
  ['message-port-transfer', createMessagePortTransferClientServerTest],
  ['node-ws', createNodeWsClientServerTest],
  ['compression-crossws', createCompressionCrosswsClientServerTest],
  ['compression-hono-fetch', createCompressionHonoFetchClientServerTest],
  ['compression-message-port-transfer', createCompressionMessagePortTransferClientServerTest],
  ['compression-message-port', createCompressionMessagePortClientServerTest],
  ['compression-node-http', createCompressionNodeHttpClientServerTest],
  ['compression-node-ws', createCompressionNodeWsClientServerTest],
] as const)('data transfer: %s', async (adapter, createClientServer) => {
  const router = {
    ping: os.input(z.any()).handler((_, input) => input),
    lastEventId: os.input(z.any()).handler(({ lastEventId }) => lastEventId),
  }
  const client = createClientServer(router)

  it.each(builtInRPCSupportDataTypes)('should support $name', async ({ value, expected }) => {
    await expect(client.ping(value)).resolves.toEqual(expected)
  })

  it('supports transferring nested File and Blob values', async () => {
    const value = {
      string: 'test',
      file: new File(['file content'], 'test.txt', { type: 'text/plain' }),
      nested: {
        number: 123,
        blob: new Blob(['blob content'], { type: 'text/plain' }),
      },
    }

    const output = await client.ping(value)

    expect(output.string).toBe(value.string)
    expect(output.nested.number).toBe(value.nested.number)

    expect(output.file).toBeInstanceOf(File)
    expect(output.file.name).toBe(value.file.name)
    expect(output.file.type).toBe(value.file.type)
    expect(await output.file.text()).toBe(await value.file.text())

    expect(output.nested.blob).toBeInstanceOf(Blob)
    expect(output.nested.blob.type).toBe(value.nested.blob.type)
    expect(await output.nested.blob.text()).toBe(await value.nested.blob.text())
  })

  it('support custom serializer', async () => {
    const person = new Person('Alice', 30)

    await expect(client.ping(person)).resolves.toEqual(person)
  })

  it('support lastEventId', () => {
    const lastEventId = '__TEST_123456789__'

    return expect(client.lastEventId(null, { lastEventId })).resolves.toEqual(lastEventId)
  })

  it('support octet stream and transfer octet in parallel', async () => {
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
    const result = await client.ping(stream) as ReadableStream<Uint8Array>

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

  it('support AsyncIteratorObject and transfer AsyncIteratorObject in parallel', async () => {
    const order2 = promiseWithResolvers<void>()
    const order3 = promiseWithResolvers<void>()
    const completion = promiseWithResolvers<void>()

    const stream = (async function* () {
      yield 'order 1'
      await order2.promise
      yield { order: 2 }
      await order3.promise
      yield new Person('Order 3', 3)
      await completion.promise
      return new Date('2024-01-01')
    }())

    // The source holds everything after its first event until the test releases it, so a transport
    // that buffered the stream would hang here instead of resolving.
    const result = await client.ping(stream) as AsyncIteratorObject<unknown>
    await expect(result.next()).resolves.toEqual({ value: 'order 1', done: false })

    order2.resolve()
    await expect(result.next()).resolves.toEqual({ value: { order: 2 }, done: false })

    order3.resolve()
    await expect(result.next()).resolves.toEqual({ value: new Person('Order 3', 3), done: false })

    completion.resolve()
    await expect(result.next()).resolves.toEqual({ value: new Date('2024-01-01'), done: true })
  })
})
