import type { experimental_DurableLockObject as DurableLockObject } from './lock-object'
import { sleep } from '@orpc/shared'
import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

describe('durableLockObject', () => {
  function createStub() {
    return env.LOCK_DON.getByName(crypto.randomUUID())
  }

  async function connect(stub: DurableObjectStub) {
    const response = await stub.fetch('https://example.com/acquire', {
      headers: { upgrade: 'websocket' },
    })

    expect(response.status).toBe(101)

    const socket = response.webSocket!
    const granted = vi.fn()

    socket.addEventListener('message', () => granted())
    socket.accept()

    return {
      acquired: response.headers.has('orpc-lock-acquired'),
      granted,
      release: () => socket.close(1000),
    }
  }

  /**
   * Connects and leaves right away, resolving with whether the lock was held.
   */
  async function isHeld(stub: DurableObjectStub) {
    const probe = await connect(stub)
    probe.release()

    return !probe.acquired
  }

  async function waitForSockets(stub: DurableObjectStub, count: number) {
    await vi.waitFor(async () => {
      const open = await runInDurableObject(
        stub,
        (_, ctx) => ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN).length,
      )

      expect(open).toBe(count)
    }, { interval: 10 })
  }

  it('grants the first socket right away and hands over to parked sockets in order', async () => {
    const stub = createStub()

    const first = await connect(stub)
    expect(first.acquired).toBe(true)

    const second = await connect(stub)
    const third = await connect(stub)

    await sleep(50)
    expect(second.acquired).toBe(false)
    expect(third.acquired).toBe(false)
    expect(second.granted).not.toHaveBeenCalled()
    expect(third.granted).not.toHaveBeenCalled()

    first.release()
    await vi.waitFor(() => expect(second.granted).toHaveBeenCalled())
    expect(third.granted).not.toHaveBeenCalled()

    second.release()
    await vi.waitFor(() => expect(third.granted).toHaveBeenCalled())

    third.release()
    await vi.waitFor(async () => expect(await isHeld(stub)).toBe(false))
  })

  it('skips sockets that left before their turn', async () => {
    const stub = createStub()

    const holder = await connect(stub)
    expect(holder.acquired).toBe(true)

    const first = await connect(stub)
    const second = await connect(stub)
    first.release()
    await waitForSockets(stub, 2)

    holder.release()
    await vi.waitFor(() => expect(second.granted).toHaveBeenCalled())
  })

  it('skips sockets that are no longer open while handing over', async () => {
    const stub = createStub()
    const holder = await connect(stub)
    const stale = await connect(stub)
    const waiter = await connect(stub)

    expect(holder.acquired).toBe(true)

    // The runtime still lists a socket while it is closing, which only happens
    // inside the close event itself, so drive that state directly.
    await runInDurableObject(stub as unknown as DurableObjectStub<DurableLockObject>, (instance, ctx) => {
      const [, staleWs, holderWs] = ctx.getWebSockets() // newest first

      staleWs!.close()
      holderWs!.close()

      instance.webSocketClose(holderWs!)
    })

    await vi.waitFor(() => expect(waiter.granted).toHaveBeenCalled())
    expect(stale.granted).not.toHaveBeenCalled()
  })

  it('keeps the holder and the parked sockets across evictions', async () => {
    const stub = createStub()

    const holder = await connect(stub)
    expect(holder.acquired).toBe(true)
    const waiter = await connect(stub)

    await evictDurableObject(stub)

    expect(await isHeld(stub)).toBe(true)
    expect(waiter.granted).not.toHaveBeenCalled()

    holder.release()
    await vi.waitFor(() => expect(waiter.granted).toHaveBeenCalled())
  })
})
