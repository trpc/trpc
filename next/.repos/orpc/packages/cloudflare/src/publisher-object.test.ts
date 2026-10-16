import { sleep } from '@standard-server/shared'
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface OpenSocket {
  socket: WebSocket
  messages: string[]
  replayedEvents: string | null
}

function toText(data: unknown): string {
  if (typeof data === 'string') {
    return data
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data)
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data)
  }

  throw new TypeError(`Unexpected websocket message payload: ${String(data)}`)
}

async function openSocket(stub: DurableObjectStub, lastEventId?: string): Promise<OpenSocket> {
  const headers = new Headers({ upgrade: 'websocket' })
  if (lastEventId !== undefined) {
    headers.set('last-event-id', lastEventId)
  }

  const response = await stub.fetch('https://example.com/subscribe', { headers })

  expect(response.status).toBe(101)
  expect(response.webSocket).toBeDefined()

  const socket = response.webSocket!
  const messages: string[] = []

  socket.addEventListener('message', (event) => {
    messages.push(toText(event.data))
  })

  socket.accept()

  return { socket, messages, replayedEvents: response.headers.get('orpc-replayed-events') }
}

async function publish(stub: DurableObjectStub, payload: object | string): Promise<Response> {
  return stub.fetch('https://example.com/publish', {
    method: 'POST',
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
}

async function readMessages<T>(socket: OpenSocket, count: number): Promise<T[]> {
  await vi.waitFor(() => {
    expect(socket.messages).toHaveLength(count)
  })

  return socket.messages.map(message => JSON.parse(message) as T)
}

async function getAlarm(stub: DurableObjectStub): Promise<number | null> {
  return runInDurableObject(stub, async (_, state) => state.storage.getAlarm())
}

async function closeSocket(socket: OpenSocket): Promise<void> {
  socket.socket.close(1000, 'done')
  await sleep(0)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('durable publisher object', () => {
  it('sends live messages and does not resume when resume is off', async () => {
    const stub = env.PUBLISHER_DON.getByName(crypto.randomUUID())

    const firstSubscriber = await openSocket(stub)
    const secondSubscriber = await openSocket(stub)

    const payload = {
      data: { text: 'live event' },
      meta: { id: 'client-id' },
    }

    const response = await publish(stub, payload)

    expect(response.status).toBe(204)
    expect((await readMessages(firstSubscriber, 1))[0]).toEqual(payload)
    expect((await readMessages(secondSubscriber, 1))[0]).toEqual(payload)

    await closeSocket(firstSubscriber)
    await closeSocket(secondSubscriber)

    const resumedSubscriber = await openSocket(stub, '0')

    await sleep(100)
    expect(resumedSubscriber.messages).toHaveLength(0)
    await closeSocket(resumedSubscriber)
  })

  it('skips websockets that are already closing', async () => {
    const stub = env.PUBLISHER_DON.getByName(crypto.randomUUID())
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // a closing websocket stays listed until its peer completes the handshake,
    // and this peer is never accepted, so it stays listed for the whole test
    await runInDurableObject(stub, async (_, state) => {
      const { '1': server } = new WebSocketPair()
      state.acceptWebSocket(server)
      server.close(1000, 'closed by the durable object')
      expect(state.getWebSockets()).toHaveLength(1)
    })

    const subscriber = await openSocket(stub)

    // the closing socket is still listed alongside the healthy one when publishing
    await runInDurableObject(stub, async (_, state) => {
      const readyStates = state.getWebSockets().map(websocket => websocket.readyState)
      expect(readyStates.sort()).toEqual([WebSocket.OPEN, WebSocket.CLOSING])
    })

    expect((await publish(stub, { data: { text: 'live event' } })).status).toBe(204)
    expect((await readMessages(subscriber, 1))[0]).toEqual({ data: { text: 'live event' } })
    expect(consoleError).not.toHaveBeenCalled()

    await closeSocket(subscriber)
  })

  it('resumes missed messages and gives them new ids', async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())

    const liveSubscriber = await openSocket(stub)

    expect((await publish(stub, { data: { text: 'first' } })).status).toBe(204)
    expect((await publish(stub, {
      data: { text: 'second' },
      meta: { id: 'client-id', comments: ['keep me'] },
    })).status).toBe(204)
    expect((await publish(stub, { data: { text: 'third' } })).status).toBe(204)

    const liveMessages = await readMessages<{ meta: { id: string } }>(liveSubscriber, 3)
    const firstId = BigInt(liveMessages[0]!.meta.id)

    expect(liveMessages).toEqual([
      { data: { text: 'first' }, meta: { id: String(firstId) } },
      { data: { text: 'second' }, meta: { id: String(firstId + 1n), comments: ['keep me'] } },
      { data: { text: 'third' }, meta: { id: String(firstId + 2n) } },
    ])
    expect(liveSubscriber.replayedEvents).toBe('0')

    const resumeSubscriber = await openSocket(stub, liveMessages[1]!.meta.id)
    const resumedMessages = await readMessages(resumeSubscriber, 1)

    expect(resumedMessages).toEqual([liveMessages[2]])
    expect(resumeSubscriber.replayedEvents).toBe('1')

    const tailSubscriber = await openSocket(stub, liveMessages[2]!.meta.id)

    await sleep(2)
    expect(tailSubscriber.messages).toHaveLength(0)
    expect(tailSubscriber.replayedEvents).toBe('0')

    // an id it did not issue replays nothing, rather than events the subscriber may already have
    const foreignSubscriber = await openSocket(stub, 'not-an-id')
    expect(foreignSubscriber.replayedEvents).toBe('0')

    await closeSocket(liveSubscriber)
    await closeSocket(resumeSubscriber)
    await closeSocket(tailSubscriber)
    await closeSocket(foreignSubscriber)
  })

  it('resumes messages in numeric id order', async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())

    // create the events table, then restart its ids so they cross a digit boundary
    await closeSocket(await openSocket(stub, '0'))
    await runInDurableObject(stub, async (_, state) => {
      state.storage.sql.exec(`UPDATE sqlite_sequence SET seq = 0 WHERE name = 'prefix:events'`)
    })

    for (let order = 1; order <= 11; order++) {
      expect((await publish(stub, { data: { order } })).status).toBe(204)
    }

    // sorting ids as text would replay '10' and '11' before '8' and '9'
    const subscriber = await openSocket(stub, '7')
    const messages = await readMessages(subscriber, 4)

    expect(messages).toEqual([
      { data: { order: 8 }, meta: { id: '8' } },
      { data: { order: 9 }, meta: { id: '9' } },
      { data: { order: 10 }, meta: { id: '10' } },
      { data: { order: 11 }, meta: { id: '11' } },
    ])

    await closeSocket(subscriber)
  })

  it('keeps resume before new live messages', { repeats: 5 }, async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())

    expect((await publish(stub, { data: { order: 1 } })).status).toBe(204)
    expect((await publish(stub, { data: { order: 2 } })).status).toBe(204)

    const [subscriber] = await Promise.all([
      openSocket(stub, '0'),
      Promise.resolve()
        .then(() => publish(stub, { data: { order: 3 } }))
        .then(() => publish(stub, { data: { order: 4 } })),
    ])

    const messages = await readMessages<{ data: { order: number } }>(subscriber, 4)

    expect(messages.map(message => message.data.order)).toEqual([1, 2, 3, 4])

    await closeSocket(subscriber)
  })

  it('drops old resume messages on subscribe', { timeout: 20_000 }, async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())

    expect((await publish(stub, { data: { text: 'event 1' } })).status).toBe(204)
    await evictDurableObject(stub)

    // Not yet expired (< 3s old): subscribing runs cleanup, but nothing is removed.
    await sleep(1_000)
    const subscriber1 = await openSocket(stub, '0')
    await runInDurableObject(stub, async (_, state) => {
      const rows = state.storage.sql.exec('SELECT payload FROM "prefix:events"').toArray()
      expect(rows).toHaveLength(1)
    })

    // Now expired, but the last cleanup ran too recently, so this subscribe
    // is throttled and skips cleanup: the expired row is still there.
    await sleep(2_500)
    const subscriber2 = await openSocket(stub, '0')
    await runInDurableObject(stub, async (_, state) => {
      const rows = state.storage.sql.exec('SELECT payload FROM "prefix:events"').toArray()
      expect(rows).toHaveLength(1)
    })

    // Expired, and enough time has passed since the last cleanup that
    // throttling no longer applies: cleanup runs and removes the row.
    await sleep(1_500) // 3000ms since last cleanup + 1000ms lag
    const subscriber3 = await openSocket(stub, '0')
    await runInDurableObject(stub, async (_, state) => {
      const rows = state.storage.sql.exec('SELECT payload FROM "prefix:events"').toArray()
      expect(rows).toHaveLength(0)
    })

    expect((await publish(stub, { data: { text: 'event 2' } })).status).toBe(204)
    await runInDurableObject(stub, async (_, state) => {
      state.storage.sql.exec('UPDATE "prefix:events" SET stored_at = unixepoch() - 4')
    })

    // with no cleanup history and runs cleanup again, removing the expired row.
    await evictDurableObject(stub)
    const subscriber4 = await openSocket(stub, '0')
    await runInDurableObject(stub, async (_, state) => {
      const rows = state.storage.sql.exec('SELECT payload FROM "prefix:events"').toArray()
      expect(rows).toHaveLength(0)
    })

    await closeSocket(subscriber1)
    await closeSocket(subscriber2)
    await closeSocket(subscriber3)
    await closeSocket(subscriber4)
  })

  it('drops old resume messages on publish', { timeout: 20_000 }, async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())

    expect((await publish(stub, { data: { text: 'event 1' } })).status).toBe(204)
    await evictDurableObject(stub)

    // Not yet expired (< 3s old): publish runs cleanup, but nothing is removed.
    await sleep(1_000)
    expect((await publish(stub, { data: { text: 'event 2' } })).status).toBe(204)
    await runInDurableObject(stub, async (_, state) => {
      const rows = state.storage.sql.exec('SELECT payload FROM "prefix:events"').toArray()
      expect(rows).toHaveLength(2)
    })

    // Now expired, but the last cleanup ran too recently, so this publish
    // is throttled and skips cleanup: the expired row is still there.
    await sleep(2_500)
    expect((await publish(stub, { data: { text: 'event 3' } })).status).toBe(204)
    await runInDurableObject(stub, async (_, state) => {
      const rows = state.storage.sql.exec('SELECT payload FROM "prefix:events"').toArray()
      expect(rows).toHaveLength(3)
    })

    // Expired, and enough time has passed since the last cleanup that
    // throttling no longer applies: cleanup runs and removes the row.
    await sleep(1_500) // 3000ms since last cleanup + 1000ms lag
    expect((await publish(stub, { data: { text: 'event 4' } })).status).toBe(204)
    await runInDurableObject(stub, async (_, state) => {
      const rows = state.storage.sql.exec('SELECT payload FROM "prefix:events"').toArray()
      expect(rows).toHaveLength(2) // event 1, event 2 are dropped
    })

    expect((await publish(stub, { data: { text: 'event 5' } })).status).toBe(204)
    await runInDurableObject(stub, async (_, state) => {
      state.storage.sql.exec('UPDATE "prefix:events" SET stored_at = unixepoch() - 4')
    })

    // with no cleanup history and runs cleanup again, removing the expired row.
    await evictDurableObject(stub)
    expect((await publish(stub, { data: { text: 'event 6' } })).status).toBe(204)
    await runInDurableObject(stub, async (_, state) => {
      const rows = state.storage.sql.exec('SELECT payload FROM "prefix:events"').toArray()
      expect(rows).toHaveLength(1)
    })
  })

  it('returns 400 for bad resume data and still works after', async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())

    const subscriber = await openSocket(stub)

    const invalidResponse = await publish(stub, 'not-json')

    expect(invalidResponse.status).toBe(400)
    expect(await invalidResponse.text()).toContain('SyntaxError')

    expect((await publish(stub, { data: { text: 'after-error' } })).status).toBe(204)
    expect((await readMessages(subscriber, 1))[0]).toEqual({
      data: { text: 'after-error' },
      meta: { id: expect.any(String) },
    })

    await closeSocket(subscriber)
  })

  it('rejects subscribe without accepting a websocket when reading stored events fails', async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())
    expect((await publish(stub, { data: { text: 'stored resume' } })).status).toBe(204)

    await runInDurableObject(stub, async (_, state) => {
      state.storage.sql.exec(`UPDATE "prefix:events" SET payload = 'not json'`)
    })

    await expect(openSocket(stub, '0')).rejects.toThrow('is not valid JSON')

    // an accepted websocket would linger in the durable object with nobody
    // on the other end, making it look active forever
    const websockets = await runInDurableObject(stub, async (_, state) => state.getWebSockets().length)
    expect(websockets).toBe(0)
  })

  it('keeps a cleanup alarm that is already far enough out', async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())
    const existingAlarm = Date.now() + 60_000

    await runInDurableObject(stub, async (_, state) => {
      await state.storage.setAlarm(existingAlarm)
    })

    expect((await publish(stub, { data: { text: 'keep existing alarm' } })).status).toBe(204)

    await vi.waitFor(async () => {
      expect(await getAlarm(stub)).toBe(existingAlarm)
    })
  })

  it('moves a cleanup alarm when it would fire too soon', async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())
    const existingAlarm = Date.now() + 1_000

    await runInDurableObject(stub, async (_, state) => {
      await state.storage.setAlarm(existingAlarm)
    })

    expect((await publish(stub, { data: { text: 'reschedule alarm' } })).status).toBe(204)

    await vi.waitFor(async () => {
      expect(await getAlarm(stub)).toBeGreaterThan(existingAlarm + 20_000)
    })
  })

  it.each([
    ['the id reaches the max value', (sql: SqlStorage) => {
      sql.exec(
        'INSERT INTO "prefix:events" (id, payload) VALUES (?, ?)',
        '9223372036854775807',
        JSON.stringify({ data: { text: 'before-overflow' } }),
      )
    }],
    ['the table disappears under a running object', (sql: SqlStorage) => {
      sql.exec('DROP TABLE "prefix:events"')
    }],
  ])('recreates the events table when %s', async (_name, breakTable) => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect((await publish(stub, { data: { text: 'initial' } })).status).toBe(204)
    await runInDurableObject(stub, async (_, state) => breakTable(state.storage.sql))

    expect((await publish(stub, { data: { text: 'recovered' } })).status).toBe(204)

    const resumeSubscriber = await openSocket(stub, '0')
    expect(await readMessages(resumeSubscriber, 1)).toEqual([{
      data: { text: 'recovered' },
      meta: { id: expect.any(String) },
    }])
    expect(resumeSubscriber.replayedEvents).toBe('1')

    await closeSocket(resumeSubscriber)
  })

  it('rejects payloads it cannot store without dropping stored events', async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())

    expect((await publish(stub, { data: { text: 'kept' } })).status).toBe(204)

    for (const payload of [
      'null',
      '[]',
      '"text"',
      '42',
      '{"data":1,"meta":"text"}',
      '{"data":1,"meta":[]}',
      '{"data":1,"meta":null}',
      JSON.stringify({ data: 'a'.repeat(3_000_000) }), // over the SQLite row size limit
    ]) {
      expect((await publish(stub, payload)).status).toBe(400)
    }

    expect((await publish(stub, { data: { text: 'after' } })).status).toBe(204)

    const resumeSubscriber = await openSocket(stub, '0')
    expect((await readMessages<{ data: { text: string } }>(resumeSubscriber, 2)).map(message => message.data.text)).toEqual(['kept', 'after'])

    await closeSocket(resumeSubscriber)
  })

  it('keeps stored events when an insert fails for a reason other than the table', async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())

    expect((await publish(stub, { data: { text: 'kept' } })).status).toBe(204)

    await runInDurableObject(stub, async (_, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER "prefix:reject" BEFORE INSERT ON "prefix:events"
        BEGIN SELECT RAISE(ABORT, 'rejected by trigger'); END
      `)
    })

    expect((await publish(stub, { data: { text: 'rejected' } })).status).toBe(400)

    const resumeSubscriber = await openSocket(stub, '0')
    expect((await readMessages<{ data: { text: string } }>(resumeSubscriber, 1)).map(message => message.data.text)).toEqual(['kept'])

    await closeSocket(resumeSubscriber)
  })

  it('does not clean up while a socket is still open', async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())
    const subscriber = await openSocket(stub, '0')

    await runDurableObjectAlarm(stub)
    expect(await getAlarm(stub)).not.toBeNull()

    expect((await publish(stub, { data: { text: 'after-alarm' } })).status).toBe(204)
    expect((await readMessages(subscriber, 1))[0]).toEqual({
      data: { text: 'after-alarm' },
      meta: { id: expect.any(String) },
    })

    await runDurableObjectAlarm(stub)
    expect(await getAlarm(stub)).not.toBeNull()

    await closeSocket(subscriber)
  })

  it('cleans up old resume data after idle time', async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())

    expect((await publish(stub, { data: { text: 'fresh resume event' } })).status).toBe(204)

    await runDurableObjectAlarm(stub)
    expect(await getAlarm(stub)).not.toBeNull()

    const beforeExpirySubscriber = await openSocket(stub, '0')

    expect((await readMessages(beforeExpirySubscriber, 1))[0]).toEqual({
      data: { text: 'fresh resume event' },
      meta: { id: expect.any(String) },
    })

    await closeSocket(beforeExpirySubscriber)

    await runInDurableObject(stub, async (_, state) => {
      state.storage.sql.exec('UPDATE "prefix:events" SET stored_at = unixepoch() - 10')
    })
    await evictDurableObject(stub)

    await runDurableObjectAlarm(stub)
    expect(await getAlarm(stub)).toBeNull()

    const afterCleanupSubscriber = await openSocket(stub, '0')

    await sleep(100)
    expect(afterCleanupSubscriber.messages).toHaveLength(0)
    await closeSocket(afterCleanupSubscriber)

    const newLiveSubscriber = await openSocket(stub)

    expect((await publish(stub, { data: { text: 'after cleanup' } })).status).toBe(204)
    expect((await readMessages(newLiveSubscriber, 1))[0]).toEqual({
      data: { text: 'after cleanup' },
      meta: { id: expect.any(String) },
    })

    await closeSocket(newLiveSubscriber)
  })

  it('resumes events stored after idle cleanup for an id issued before it', async () => {
    const stub = env.PUBLISHER_RESUME3S_DON.getByName(crypto.randomUUID())

    const subscriber = await openSocket(stub)
    for (const text of ['first', 'second', 'third']) {
      expect((await publish(stub, { data: { text } })).status).toBe(204)
    }
    const seen = await readMessages<{ meta: { id: string } }>(subscriber, 3)
    await closeSocket(subscriber)

    await runInDurableObject(stub, async (_, state) => {
      state.storage.sql.exec('UPDATE "prefix:events" SET stored_at = unixepoch() - 10')
    })
    await evictDurableObject(stub)
    await runDurableObjectAlarm(stub)
    expect(await getAlarm(stub)).toBeNull()

    for (const text of ['after cleanup 1', 'after cleanup 2']) {
      expect((await publish(stub, { data: { text } })).status).toBe(204)
    }

    const resumeSubscriber = await openSocket(stub, seen[2]!.meta.id)
    const resumed = await readMessages<{ data: { text: string }, meta: { id: string } }>(resumeSubscriber, 2)

    expect(resumeSubscriber.replayedEvents).toBe('2')
    expect(resumed.map(message => message.data.text)).toEqual(['after cleanup 1', 'after cleanup 2'])

    await closeSocket(resumeSubscriber)
  })
})
