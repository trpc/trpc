import { openapi } from '@orpc/openapi'
import { os } from '@orpc/server'
import { AsyncIteratorClass, sleep } from '@standard-server/shared'
import { z } from 'zod'
import { createHonoFetchClientServerTest } from './__shared__/client-server.hono-fetch'
import { createNodeHttpClientServerTest } from './__shared__/client-server.node-http'

describe.each([
  ['hono-fetch', createHonoFetchClientServerTest],
  ['node-http', createNodeHttpClientServerTest],
])('cancel and abort: %s', async (_name, createClientServer) => {
  const handler = vi.fn()
  const router = {
    ping: os
      .input(z.any())
      .meta(openapi({
        method: 'POST',
        path: '/ping',
      }))
      .handler(handler),
  }
  const client = createClientServer(router)

  it('server signal should abort when client signal is aborted', async () => {
    handler.mockImplementationOnce(async ({ signal }) => {
      await sleep(200)

      return signal.aborted
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
