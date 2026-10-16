import { AsyncIteratorClass, os } from '@orpc/server'
import { sleep } from 'bun'
import { describe, expect, it, vi } from 'bun:test'
import { z } from 'zod'
import { createBunFetchClientServerTest } from './__shared__/client-server.bun-fetch'
import { createBunWebSocketClientServerTest } from './__shared__/client-server.bun-websocket'
import { createCompressionBunFetchClientServerTest } from './__shared__/client-server.compression-bun-fetch'
import { createCompressionBunWebSocketClientServerTest } from './__shared__/client-server.compression-bun-websocket'

describe.each([
  ['bun-fetch', createBunFetchClientServerTest],
  ['bun-websocket', createBunWebSocketClientServerTest],
  ['compression-bun-fetch', createCompressionBunFetchClientServerTest],
  ['compression-bun-websocket', createCompressionBunWebSocketClientServerTest],
] as const)('cancel and abort: %s', async (adapter, createClientServer) => {
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

    const promise = client.ping(null, { signal: controller.signal })

    await sleep(100)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0].signal.aborted).toBe(false)

    controller.abort()
    await expect(promise).rejects.toThrowError('abort')
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
    expect(handler.mock.calls[0]![0].signal.aborted).toEqual(true)

    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true })
  })

  // TODO: https://github.com/oven-sh/bun/issues/33227 is fixed for async iterator (SSE) responses in Bun 1.4,
  // but cancelling an octet stream response still does not abort the request on the server
  it.skipIf(adapter === 'bun-fetch' || adapter === 'compression-bun-fetch')('server should cancel octet stream response and abort request when client cancels', async () => {
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
    expect(handler.mock.calls[0]![0].signal.aborted).toEqual(true)

    await expect(reader.read()).resolves.toEqual({ value: undefined, done: true })
  })
})
