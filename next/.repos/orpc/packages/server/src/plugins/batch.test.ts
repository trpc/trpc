import type { AnyRouter } from '../router'
import { ORPCError } from '@orpc/client'
import { promiseWithResolvers, sleep } from '@orpc/shared'
import { decodePeerMessage } from '@standard-server/peer'
import { RPCHandler } from '../adapters/fetch/rpc-handler'
import { os } from '../builder'
import { BatchHandlerPlugin } from './batch'
import { RequestCompressionHandlerPlugin } from './request-compression'
import { RequestLimitHandlerPlugin } from './request-limit'

beforeEach(() => {
  vi.clearAllMocks()
})

function makePeerRequestMessage(id: number | string, url: string, method = 'POST', body?: unknown) {
  return {
    kind: 'request',
    id,
    json: { method, url, headers: {}, body },
    binary: undefined,
  }
}

function createBatchRequest(options: {
  mode: 'buffered' | 'streaming'
  messages?: unknown
  method?: 'POST' | 'GET' | 'QUERY'
  data?: string
  signal?: AbortSignal
}) {
  if (options.method === 'GET') {
    const search = options.data === undefined ? '' : `?data=${options.data}`

    return new Request(`https://example.com/__batch__${search}`, {
      method: 'GET',
      headers: { 'orpc-batch': options.mode },
      signal: options.signal,
    })
  }

  return new Request('https://example.com/__batch__', {
    method: options.method ?? 'POST',
    headers: { 'orpc-batch': options.mode, 'content-type': 'application/json' },
    body: JSON.stringify(options.messages),
    signal: options.signal,
  })
}

function readLengthPrefixedChunk(buffer: Uint8Array) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, 4)
  const messageLength = view.getUint32(0, false)

  return {
    messageLength,
    payload: buffer.slice(4, 4 + messageLength),
  }
}

/**
 * Decodes every message of a length-prefixed batch body, skipping keep-alive frames.
 * Needs string message ids, which `decodePeerMessage` requires.
 */
async function readAllMessages(response: Response) {
  let buffer = new Uint8Array(await response.arrayBuffer())
  const messages: any[] = []

  while (buffer.length > 0) {
    const { messageLength, payload } = readLengthPrefixedChunk(buffer)
    buffer = buffer.slice(4 + messageLength)

    if (messageLength > 0) {
      const result = decodePeerMessage(payload)
      expect(result.matched).toBe(true)
      messages.push(result.matched ? result.message : undefined)
    }
  }

  return messages
}

/**
 * Reads past one message, which is enqueued as two chunks: its length prefix, then its payload.
 */
async function skipMessage(reader: ReadableStreamDefaultReader<Uint8Array>) {
  await reader.read()
  await reader.read()
}

/**
 * A router with a `ping` procedure that answers right away and a `slow` one that waits for `gate`.
 */
function createSlowRouter(gate: Promise<unknown>) {
  return {
    ping: os.handler(() => 'pong'),
    slow: os.handler(async () => {
      await gate
      return 'slow'
    }),
  }
}

describe('batchHandlerPlugin', () => {
  const handlerFn = vi.fn(() => 'pong')
  const router = {
    ping: os.handler(handlerFn),
  }

  const createHandler = (
    plugin = new BatchHandlerPlugin(),
    handlerRouter: AnyRouter = router,
  ) => new RPCHandler(handlerRouter, {
    plugins: [plugin],
  })

  it('passes through non-batch requests', async () => {
    const handler = createHandler()

    const { matched, response } = await handler.handle(new Request('https://example.com/ping', {
      method: 'POST',
    }))

    expect(matched).toBe(true)
    expect(response!.status).toBe(200)
    expect(handlerFn).toHaveBeenCalledTimes(1)
  })

  describe('buffered mode', () => {
    it('handles buffered batch POST requests', async () => {
      const handler = createHandler()
      const peerMessages = [
        makePeerRequestMessage(0, '/ping'),
        makePeerRequestMessage(1, '/ping'),
      ]

      const { matched, response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        messages: peerMessages,
      }))

      expect(matched).toBe(true)
      expect(response!.status).toBe(207)

      const body = await response!.json() as any
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(2)
      expect(handlerFn).toHaveBeenCalledTimes(2)
    })

    it('returns binary payload in buffered mode when sub-response contains binary', async () => {
      const binaryRouter = {
        file: os.handler(() => new Blob([new Uint8Array([1, 2, 3])], {
          type: 'application/octet-stream',
        })),
        ping: os.handler(() => 'pong'),
      }

      const handler = createHandler(new BatchHandlerPlugin(), binaryRouter)

      const peerMessages = [
        makePeerRequestMessage(0, '/file'),
        makePeerRequestMessage(1, '/ping'),
      ]

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        messages: peerMessages,
      }))

      expect(response!.status).toBe(207)
      expect(response!.headers.get('standard-server')).toEqual('file')
      expect(response!.headers.get('content-type')).toEqual('application/vnd.orpc.batch')

      const buffer = new Uint8Array(await response!.arrayBuffer())
      expect(buffer.length).toBeGreaterThan(4)

      const { messageLength, payload } = readLengthPrefixedChunk(buffer)
      expect(messageLength).toBe(payload.length)
    })

    it('handles unmatched sub-requests as 404', async () => {
      const handler = createHandler()

      const { matched, response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        messages: [makePeerRequestMessage(0, '/nonexistent')],
      }))

      expect(matched).toBe(true)
      expect(response!.status).toBe(207)

      const body = await response!.json() as any
      expect(body).toHaveLength(1)
      expect(body[0]).toMatchObject({ kind: 'response', id: 0 })
      expect(body[0].json.status).toBe(404)
    })

    it('returns 400 for invalid batch body', async () => {
      const handler = createHandler()

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        messages: 'not-an-array',
      }))

      expect(response!.status).toBe(400)
      expect(await response!.text()).toContain('Invalid batch request body')
      expect(handlerFn).toHaveBeenCalledTimes(0)
    })

    it('returns the ORPCError message a body plugin throws while resolving the batch body', async () => {
      const handler = new RPCHandler(router, {
        plugins: [new BatchHandlerPlugin(), new RequestCompressionHandlerPlugin()],
      })

      const { response } = await handler.handle(new Request('https://example.com/__batch__', {
        method: 'POST',
        headers: {
          'orpc-batch': 'buffered',
          'content-type': 'application/json',
          'content-encoding': 'gzip, gzip, gzip, gzip, gzip, gzip',
        },
        body: JSON.stringify([makePeerRequestMessage(0, '/ping')]),
      }))

      expect(response!.status).toBe(400)
      expect(await response!.text()).toContain('Too many content encodings.')
      expect(handlerFn).toHaveBeenCalledTimes(0)
    })

    it('returns the ORPCError message a body plugin raises while streaming the batch body', async () => {
      const handler = new RPCHandler(router, {
        plugins: [new BatchHandlerPlugin(), new RequestLimitHandlerPlugin({ maxBodySize: 10 })],
      })

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        messages: [makePeerRequestMessage(0, '/ping')],
      }))

      expect(response!.status).toBe(400)
      expect(await response!.text()).toContain(new ORPCError('PAYLOAD_TOO_LARGE').message)
      expect(handlerFn).toHaveBeenCalledTimes(0)
    })

    it('returns 413 when batch size exceeds maxSize', async () => {
      const handler = createHandler(new BatchHandlerPlugin({ maxSize: 1 }))
      const peerMessages = [
        makePeerRequestMessage(0, '/ping'),
        makePeerRequestMessage(1, '/ping'),
      ]

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        messages: peerMessages,
      }))

      expect(response!.status).toBe(413)
      expect(handlerFn).toHaveBeenCalledTimes(0)
    })

    it('returns 500 sub-response when mapSubrequest throws', async ({ onTestFinished }) => {
      const rejectSpy = vi.spyOn(Promise, 'reject')
        .mockImplementation(() => new Promise(() => {}) as Promise<never>)

      onTestFinished(() => {
        rejectSpy.mockRestore()
      })

      const handler = createHandler(new BatchHandlerPlugin({
        mapSubrequest: () => {
          throw new Error('boom')
        },
      }))

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        messages: [makePeerRequestMessage(0, '/ping')],
      }))

      expect(response!.status).toBe(207)

      const body = await response!.json() as any
      expect(body[0].json.status).toBe(500)
      expect(body[0].json.body).toBe('Internal server error')
      expect(rejectSpy).toHaveBeenCalledTimes(1)
    })

    describe('with a stream sub-response', () => {
      it.each([
        ['an event iterator', 'event-stream', (gate: Promise<void>) => (async function* () {
          yield 'first'
          await gate
        })()],
        ['a readable stream', 'octet-stream', (gate: Promise<void>) => new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(new TextEncoder().encode('first'))
            await gate
            controller.close()
          },
        })],
      ] as const)('streams the batch once a sub-response is %s', async (_, kind, createStream) => {
        const gate = promiseWithResolvers<void>()
        const handler = createHandler(new BatchHandlerPlugin(), {
          ping: os.handler(() => 'pong'),
          stream: os.handler(() => createStream(gate.promise)),
        })

        // The stream stays open until the gate is released, so a buffered batch would never answer
        const { response } = await handler.handle(createBatchRequest({
          mode: 'buffered',
          messages: [makePeerRequestMessage('0', '/ping'), makePeerRequestMessage('1', '/stream')],
        }))

        expect(response!.status).toBe(207)
        expect(response!.headers.get('standard-server')).toEqual('octet-stream')
        expect(response!.headers.get('content-type')).toEqual('application/vnd.orpc.batch')

        gate.resolve()
        const messages = await readAllMessages(response!)

        expect(messages.filter(m => m.id === '0')).toEqual([
          expect.objectContaining({ kind: 'response' }),
        ])
        expect(messages.filter(m => m.id === '1')).toEqual([
          expect.objectContaining({ kind: 'response' }),
          expect.objectContaining({ kind }),
          expect.objectContaining({ kind }),
        ])
      })

      it('writes out the sub-responses buffered before it, binary included', async () => {
        const gate = promiseWithResolvers<void>()
        const ping = vi.fn(() => 'pong')
        const file = vi.fn(() => new Blob(['__FILE__'], { type: 'application/octet-stream' }))

        const handler = createHandler(new BatchHandlerPlugin(), {
          ping: os.handler(ping),
          file: os.handler(file),
          events: os.handler(async () => {
            await gate.promise

            return (async function* () {
              yield 'event'
            })()
          }),
        })

        const result = handler.handle(createBatchRequest({
          mode: 'buffered',
          messages: [
            makePeerRequestMessage('0', '/ping'),
            makePeerRequestMessage('1', '/file'),
            makePeerRequestMessage('2', '/events'),
          ],
        }))

        await vi.waitFor(() => {
          expect(ping).toHaveBeenCalledTimes(1)
          expect(file).toHaveBeenCalledTimes(1)
        })
        await sleep(10) // let both responses reach the buffer

        gate.resolve()
        const { response } = await result
        expect(response!.headers.get('standard-server')).toEqual('octet-stream')

        // Only messages of the same sub-request keep their order
        const messages = await readAllMessages(response!)
        const fileMessages = messages.filter(m => m.id === '1')

        expect(messages.filter(m => m.id === '0')).toEqual([
          expect.objectContaining({ kind: 'response' }),
        ])
        expect(fileMessages).toEqual([
          expect.objectContaining({ kind: 'response' }),
        ])
        expect(new TextDecoder().decode(fileMessages[0].binary)).toBe('__FILE__')
        expect(messages.filter(m => m.id === '2')).toEqual([
          expect.objectContaining({ kind: 'response' }),
          expect.objectContaining({ kind: 'event-stream' }),
          expect.objectContaining({ kind: 'event-stream', json: expect.objectContaining({ event: 'close' }) }),
        ])
      })
    })
  })

  describe('streaming mode', () => {
    it('handles streaming batch POST requests returning readable stream', async () => {
      const handler = createHandler()
      const peerMessages = [makePeerRequestMessage(0, '/ping')]

      const { matched, response } = await handler.handle(createBatchRequest({
        mode: 'streaming',
        messages: peerMessages,
      }))

      expect(matched).toBe(true)
      expect(response!.status).toBe(207)
      expect(response!.headers.get('standard-server')).toEqual('octet-stream')
      expect(response!.headers.get('content-type')).toEqual('application/vnd.orpc.batch')
      expect(handlerFn).toHaveBeenCalledTimes(1)

      // Verify the binary format: 4-byte length prefix + encoded peer message.
      const buffer = new Uint8Array(await response!.arrayBuffer())
      expect(buffer.length).toBeGreaterThan(4)

      const { messageLength } = readLengthPrefixedChunk(buffer)
      expect(buffer.length).toBe(4 + messageLength)
    })

    it('encodes streaming batch response as binary when sub-response is a blob', async () => {
      const binaryRouter = {
        file: os.handler(() => new Blob(['__TEST__'], {
          type: 'application/octet-stream',
        })),
      }

      const handler = createHandler(new BatchHandlerPlugin(), binaryRouter)

      const { response } = await handler.handle(createBatchRequest({
        mode: 'streaming',
        messages: [makePeerRequestMessage(0, '/file')],
      }))

      expect(response!.status).toBe(207)

      const buffer = new Uint8Array(await response!.arrayBuffer())
      expect(buffer.length).toBeGreaterThan(4)

      const { messageLength, payload } = readLengthPrefixedChunk(buffer)
      expect(messageLength).toBe(payload.length)
      expect(new TextDecoder().decode(payload)).toContain('__TEST__')
    })

    describe('holding the response', () => {
      function createGatedHandler() {
        const gate = promiseWithResolvers<void>()

        const handler = createHandler(new BatchHandlerPlugin(), createSlowRouter(gate.promise))

        return { handler, gate }
      }

      it('holds the response until a sub-request sends its first message', async () => {
        const { handler, gate } = createGatedHandler()
        let settled = false
        const result = handler.handle(createBatchRequest({
          mode: 'streaming',
          messages: [makePeerRequestMessage('0', '/slow')],
        })).finally(() => {
          settled = true
        })

        await sleep(10)
        expect(settled).toBe(false)

        gate.resolve()
        await expect(result).resolves.toMatchObject({ matched: true })
      })

      it('starts streaming at the first message, without waiting for the slow sub-request', async () => {
        const { handler, gate } = createGatedHandler()

        // Awaited before the gate opens, so holding the response for the slow sub-request would time out
        const { response } = await handler.handle(createBatchRequest({
          mode: 'streaming',
          messages: [makePeerRequestMessage('0', '/slow'), makePeerRequestMessage('1', '/ping')],
        }))

        gate.resolve()
        const received = await readAllMessages(response!)

        expect(received.map(m => m.id)).toEqual(['1', '0'])
      })
    })
  })

  describe('batch request abort', () => {
    const started = vi.fn()
    const stopped = vi.fn()

    function waitForAbort(signal: AbortSignal) {
      return new Promise((resolve) => {
        if (signal.aborted) {
          resolve(undefined)
        }
        signal.addEventListener('abort', resolve)
      })
    }

    const handler = createHandler(new BatchHandlerPlugin(), {
      wait: os.handler(async ({ signal }) => {
        started()
        await waitForAbort(signal!)
        stopped(signal!.aborted)
      }),
      subscribe: os.handler(async function* ({ signal }) {
        started()
        try {
          yield 'ready'
          await waitForAbort(signal!)
        }
        finally {
          await new Promise(resolve => setTimeout(resolve)) // async cleanup
          stopped(signal!.aborted)
        }
      }),
    })

    const messages = [makePeerRequestMessage(0, '/wait'), makePeerRequestMessage(1, '/subscribe')]

    it.each([
      ['buffered', 'buffered', messages],
      ['streaming', 'streaming', messages],
      ['buffered (no stream sub-response)', 'buffered', [makePeerRequestMessage(0, '/wait'), makePeerRequestMessage(1, '/wait')]],
    ] as const)('aborts %s sub-requests when the batch request is aborted', async (_, mode, batchMessages) => {
      const controller = new AbortController()
      const result = handler.handle(createBatchRequest({ mode, messages: batchMessages, signal: controller.signal }))

      await vi.waitFor(() => expect(started).toHaveBeenCalledTimes(2))
      expect(stopped).not.toHaveBeenCalled()

      controller.abort()

      await vi.waitFor(() => expect(stopped.mock.calls).toEqual([[true], [true]]))
      await expect(result).resolves.toMatchObject({ matched: true })
    })

    /**
     * In buffered mode, the stream sub-response makes the batch a stream too.
     */
    it.each(['buffered', 'streaming'] as const)('aborts %s sub-requests when the response stream is cancelled', async (mode) => {
      const { response } = await handler.handle(createBatchRequest({ mode, messages }))

      await vi.waitFor(() => expect(started).toHaveBeenCalledTimes(2))
      await response!.body!.cancel()

      expect(stopped.mock.calls).toEqual([[true], [true]])
    })

    it.each(['buffered', 'streaming'] as const)('aborts %s sub-requests when the batch request is already aborted', async (mode) => {
      const { response } = await handler.handle(createBatchRequest({
        mode,
        messages: [makePeerRequestMessage(0, '/wait')],
        signal: AbortSignal.abort(),
      }))
      await response!.arrayBuffer()

      expect(stopped.mock.calls).toEqual([[true]])
    })
  })

  describe('get batches', () => {
    it('handles batch GET requests via query param', async () => {
      const handler = createHandler()
      const data = encodeURIComponent(JSON.stringify([
        makePeerRequestMessage(0, '/ping', 'GET'),
      ]))

      const { matched, response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        method: 'GET',
        data,
      }))

      expect(matched).toBe(true)
      expect(response!.status).toBe(207)
    })

    it('returns 400 for invalid GET data param', async () => {
      const handler = createHandler()

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        method: 'GET',
        data: 'invalid-json',
      }))

      expect(response!.status).toBe(400)
    })

    it('returns 400 when GET batch request misses data param', async () => {
      const handler = createHandler()

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        method: 'GET',
      }))

      expect(response!.status).toBe(400)
      expect(await response!.text()).toContain('Missing data parameter')
    })

    it('returns 400 for GET batch data that is valid JSON but not an array', async () => {
      const handler = createHandler()
      const data = encodeURIComponent(JSON.stringify({ not: 'an-array' }))

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        method: 'GET',
        data,
      }))

      expect(response!.status).toBe(400)
      expect(await response!.text()).toContain('Invalid batch request data parameter')
    })

    it('returns 400 when a GET batch contains a non-GET sub-request', async () => {
      const handler = createHandler()
      const data = encodeURIComponent(JSON.stringify([
        makePeerRequestMessage(0, '/ping', 'GET'),
        makePeerRequestMessage(1, '/ping', 'POST'),
      ]))

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        method: 'GET',
        data,
      }))

      expect(response!.status).toBe(400)
      expect(await response!.text()).toContain('GET batch requests only accept GET sub-requests')
      expect(handlerFn).toHaveBeenCalledTimes(0)
    })

    it('returns 400 when a GET batch sub-request omits the method (defaults to POST)', async () => {
      const handler = createHandler()
      const data = encodeURIComponent(JSON.stringify([
        { kind: 'request', id: 0, json: { url: '/ping', headers: {} } },
      ]))

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        method: 'GET',
        data,
      }))

      expect(response!.status).toBe(400)
      expect(await response!.text()).toContain('GET batch requests only accept GET sub-requests')
      expect(handlerFn).toHaveBeenCalledTimes(0)
    })
  })

  describe('query batches', () => {
    it('returns 400 before execution when a QUERY batch contains a non-request message', async () => {
      const handler = createHandler()

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        method: 'QUERY',
        messages: [
          { kind: 'response', id: 0, json: { method: 'POST', url: '/ping', headers: {} } },
        ],
      }))

      expect(response!.status).toBe(400)
      expect(handlerFn).toHaveBeenCalledTimes(0)
    })

    it('returns 400 before execution when a QUERY batch contains a non-QUERY sub-request', async () => {
      const handler = createHandler()

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        method: 'QUERY',
        messages: [
          makePeerRequestMessage(0, '/ping', 'QUERY'),
          makePeerRequestMessage(1, '/ping', 'POST'),
        ],
      }))

      expect(response!.status).toBe(400)
      expect(await response!.text()).toContain('QUERY batch requests only accept QUERY sub-requests')
      expect(handlerFn).toHaveBeenCalledTimes(0)
    })
  })

  describe('sub-request headers', () => {
    function createHeaderCapturingHandler() {
      const seenHeaders: Record<string, string | string[] | undefined>[] = []

      const handler = new RPCHandler(router, {
        plugins: [new BatchHandlerPlugin()],
        interceptors: [({ next, request }) => {
          seenHeaders.push(request.headers)
          return next()
        }],
      })

      return { handler, seenHeaders }
    }

    function createBatchRequestWithHeaders(headers: Record<string, string>, subRequestHeaders: Record<string, string>) {
      return new Request('https://example.com/__batch__', {
        method: 'POST',
        headers: { 'orpc-batch': 'buffered', 'content-type': 'application/json', ...headers },
        body: JSON.stringify([
          { kind: 'request', id: 0, json: { method: 'POST', url: '/ping', headers: subRequestHeaders }, binary: undefined },
        ]),
      })
    }

    it('merges batch request headers into sub-requests and lets the batch request win', async () => {
      const { handler, seenHeaders } = createHeaderCapturingHandler()

      await handler.handle(createBatchRequestWithHeaders(
        { 'x-from-batch': 'batch', 'x-overridden': 'batch' },
        { 'x-from-sub-request': 'sub-request', 'x-overridden': 'sub-request' },
      ))

      expect(seenHeaders[0]).toMatchObject({
        'x-from-batch': 'batch',
        'x-from-sub-request': 'sub-request',
        'x-overridden': 'batch',
      })
      expect(seenHeaders[0]!['orpc-batch']).toBeUndefined()
    })

    it('prevents a sub-request from spoofing a header the batch request already carries', async () => {
      const { handler, seenHeaders } = createHeaderCapturingHandler()

      await handler.handle(createBatchRequestWithHeaders(
        { authorization: 'Bearer real' },
        { authorization: 'Bearer spoofed' },
      ))

      expect(seenHeaders[0]!.authorization).toEqual('Bearer real')
    })
  })

  describe('configuration options', () => {
    it('supports custom successStatus', async () => {
      const handler = createHandler(new BatchHandlerPlugin({ successStatus: 200 }))
      const peerMessages = [makePeerRequestMessage(0, '/ping')]

      const { response } = await handler.handle(createBatchRequest({
        mode: 'buffered',
        messages: peerMessages,
      }))

      expect(response!.status).toBe(200)
    })
  })

  describe('keepAlive', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it.each(['buffered', 'streaming'] as const)('sends zero-length keep-alive frames while a %s batch stream is idle', async (mode) => {
      const gate = promiseWithResolvers<void>()

      const handler = createHandler(new BatchHandlerPlugin({
        keepAlive: { enabled: true, interval: 100 },
      }), {
        events: os.handler(async function* () {
          await gate.promise
        }),
      })

      const { response } = await handler.handle(createBatchRequest({
        mode,
        messages: [makePeerRequestMessage(0, '/events')],
      }))

      const reader = (response!.body as ReadableStream<Uint8Array>).getReader()

      await skipMessage(reader) // the response message

      for (let i = 0; i < 2; i++) {
        const keepAlive = reader.read()
        await vi.advanceTimersByTimeAsync(100)
        await expect(keepAlive).resolves.toEqual({ done: false, value: new Uint8Array([0, 0, 0, 0]) })
      }

      gate.resolve()
      while (!(await reader.read()).done) {
        // keep reading until closed
      }

      expect(vi.getTimerCount()).toBe(0)
    })

    it('does not schedule a keep-alive timer when disabled', async () => {
      const handler = createHandler(new BatchHandlerPlugin({
        keepAlive: { enabled: false },
      }))

      const { response } = await handler.handle(createBatchRequest({
        mode: 'streaming',
        messages: [makePeerRequestMessage(0, '/ping')],
      }))

      expect(response!.body).toBeInstanceOf(ReadableStream)
      expect(vi.getTimerCount()).toBe(0)

      // Drain so the stream can complete cleanly.
      await response!.arrayBuffer()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('stops keep-alive after the stream is cancelled', async () => {
      const slowRouter = createSlowRouter(new Promise<void>(() => {}))

      const handler = createHandler(new BatchHandlerPlugin({
        keepAlive: { enabled: true, interval: 50 },
      }), slowRouter)

      const { response } = await handler.handle(createBatchRequest({
        mode: 'streaming',
        messages: [makePeerRequestMessage(0, '/ping'), makePeerRequestMessage(1, '/slow')],
      }))

      expect(vi.getTimerCount()).toBeGreaterThan(0)

      const reader = (response!.body as ReadableStream<Uint8Array>).getReader()
      await skipMessage(reader) // the ping response

      const first = reader.read()
      await vi.advanceTimersByTimeAsync(50)
      await first

      await reader.cancel()

      expect(vi.getTimerCount()).toBe(0)
    })

    it('clears keep-alive timer when keep-alive enqueue fails', async ({ onTestFinished }) => {
      const slowRouter = createSlowRouter(new Promise<void>(() => {}))

      const originalEnqueue = ReadableStreamDefaultController.prototype.enqueue
      const enqueueSpy = vi.spyOn(ReadableStreamDefaultController.prototype, 'enqueue')
        .mockImplementation(function (this: ReadableStreamDefaultController<Uint8Array>, chunk: Uint8Array) {
          // Keep-alive frame is a zero-length length prefix: [0, 0, 0, 0]
          if (
            chunk instanceof Uint8Array
            && chunk.byteLength === 4
            && chunk[0] === 0
            && chunk[1] === 0
            && chunk[2] === 0
            && chunk[3] === 0
          ) {
            throw new Error('keep-alive enqueue failed')
          }

          return originalEnqueue.call(this, chunk)
        })

      onTestFinished(() => {
        enqueueSpy.mockRestore()
      })

      const handler = createHandler(new BatchHandlerPlugin({
        keepAlive: { enabled: true, interval: 50 },
      }), slowRouter)

      await handler.handle(createBatchRequest({
        mode: 'streaming',
        messages: [makePeerRequestMessage(0, '/ping'), makePeerRequestMessage(1, '/slow')],
      }))

      // One keep-alive setInterval is scheduled while the stream is idle.
      expect(vi.getTimerCount()).toBe(1)

      await vi.advanceTimersByTimeAsync(50)

      // catch path should clear the interval after enqueue throws
      expect(vi.getTimerCount()).toBe(0)
    })

    it('clears keep-alive timer when peer-message enqueue throws', async ({ onTestFinished }) => {
      const enqueueSpy = vi.spyOn(ReadableStreamDefaultController.prototype, 'enqueue')
        .mockThrow(new Error('enqueue failed'))

      onTestFinished(() => {
        enqueueSpy.mockRestore()
      })

      const handler = createHandler(new BatchHandlerPlugin({
        keepAlive: { enabled: false },
      }))

      const { response } = await handler.handle(createBatchRequest({
        mode: 'streaming',
        messages: [makePeerRequestMessage(0, '/ping')],
      }))

      const reader = (response!.body as ReadableStream<Uint8Array>).getReader()
      await expect(reader.read()).rejects.toThrow('enqueue failed')
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
