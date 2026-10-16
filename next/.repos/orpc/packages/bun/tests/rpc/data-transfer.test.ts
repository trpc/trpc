import { os } from '@orpc/server'
import { promiseWithResolvers } from '@orpc/shared'
import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import { builtInRPCSupportDataTypes } from './__shared__/built-in-support-data-types'
import { Person } from './__shared__/client-server'
import { createBunFetchClientServerTest } from './__shared__/client-server.bun-fetch'
import { createBunWebSocketClientServerTest } from './__shared__/client-server.bun-websocket'
import { createCompressionBunFetchClientServerTest } from './__shared__/client-server.compression-bun-fetch'
import { createCompressionBunWebSocketClientServerTest } from './__shared__/client-server.compression-bun-websocket'

describe.each([
  ['bun-fetch', createBunFetchClientServerTest],
  ['bun-websocket', createBunWebSocketClientServerTest],
  ['compression-bun-fetch', createCompressionBunFetchClientServerTest],
  ['compression-bun-websocket', createCompressionBunWebSocketClientServerTest],
] as const)('data transfer: %s', async (adapter, createClientServer) => {
  const router = {
    ping: os.input(z.any()).handler((_, input) => input),
    lastEventId: os.input(z.any()).handler(({ lastEventId }) => lastEventId),
  }
  const client = createClientServer(router)

  // TODO: related to https://github.com/oven-sh/bun/issues/32801 - Bun's blob()/formData() do not
  // derive the type from the Content-Type header, so the blob type is lost after (de)compression
  const supportedDataTypes = adapter.includes('compression')
    ? builtInRPCSupportDataTypes.filter(({ name }) => name !== 'blob')
    : builtInRPCSupportDataTypes

  it.each(supportedDataTypes)('should support $name', async ({ value, expected }) => {
    const actual = await client.ping(value)

    if (typeof expected === 'function') {
      expect(expected(actual)).toBe(true)
    }
    else {
      expect(actual).toEqual(expected)
    }
  })

  it('support custom serializer', async () => {
    const person = new Person('Alice', 30)

    await expect(client.ping(person)).resolves.toEqual(person)
  })

  it('support lastEventId', () => {
    const lastEventId = '__TEST_123456789__'

    return expect(client.lastEventId(null, { lastEventId })).resolves.toEqual(lastEventId)
  })

  // TODO: There an issues with Bun Websocket Server, when multiple messages sent simultaneously
  // We might need to report this issue
  it.skipIf(adapter === 'bun-websocket' || adapter === 'compression-bun-websocket')('support octet stream and transfer octet in parallel', async () => {
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

  // TODO: There an issues with Bun Websocket Server, when multiple messages sent simultaneously
  // We might need to report this issue
  it.skipIf(adapter === 'bun-websocket' || adapter === 'compression-bun-websocket')('support AsyncIteratorObject and transfer AsyncIteratorObject in parallel', async () => {
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
