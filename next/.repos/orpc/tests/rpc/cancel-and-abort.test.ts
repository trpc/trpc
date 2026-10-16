import { os } from '@orpc/server'
import { AsyncIteratorClass, sleep } from '@standard-server/shared'
import { z } from 'zod'
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
])('cancel and abort: %s', async (_name, createClientServer) => {
  const handler = vi.fn()
  const router = {
    ping: os.input(z.any()).handler(handler),
  }
  const client = createClientServer(router)

  it('server signal should abort when client signal is aborted', async () => {
    handler.mockImplementationOnce(async ({ signal }) => {
      await sleep(200)
    })

    const controller = new AbortController()

    const promise = expect(client.ping(null, { signal: controller.signal })).rejects.toThrowError('abort')

    await sleep(100)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0].signal.aborted).toBe(false)

    controller.abort()
    await promise
    await sleep(100)
    expect(handler.mock.calls[0]![0].signal.aborted).toBe(true)
  })

  it('server should cancel AsyncIteratorObject response and abort request when client cancels', async () => {
    const cancel = vi.fn()
    handler.mockResolvedValueOnce(new AsyncIteratorClass(
      async () => {
        await sleep(200)
        return { value: 'data: hello\n\n', done: false }
      },
      cancel,
    ))

    const iterator = await client.ping() as AsyncIteratorClass<string>

    await expect(iterator.next()).resolves.toEqual({ value: 'data: hello\n\n', done: false })

    expect(cancel).toHaveBeenCalledTimes(0)
    await iterator.return?.()
    await sleep(100) // lag between client and server
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0].signal.aborted).toBe(true)

    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true })
  })

  it('server should cancel octet stream response and abort request when client cancels', async () => {
    const cancel = vi.fn()
    handler.mockResolvedValueOnce(new ReadableStream({
      async pull(controller) {
        await sleep(200)
        controller.enqueue(new TextEncoder().encode('hello'))
      },
      cancel,
    }))

    const result = await client.ping() as ReadableStream<Uint8Array>
    const reader = result.getReader()

    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(first.value).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(first.value)).toBe('hello')

    expect(cancel).toHaveBeenCalledTimes(0)
    await reader.cancel()
    await sleep(100) // lag between client and server
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0].signal.aborted).toBe(true)

    await expect(reader.read()).resolves.toEqual({ value: undefined, done: true })
  })
})
