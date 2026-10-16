import type { StandardLazyResponse, StandardRequest } from '@standard-server/core'
import type { StandardLinkCodec, StandardLinkTransport } from '../adapters/standard'
import { AsyncLocalStorage } from 'node:async_hooks'
import { promiseWithResolvers, sleep } from '@orpc/shared'
import { encodePeerMessage } from '@standard-server/peer'
import { StandardLink } from '../adapters/standard'
import { BatchLinkPlugin } from './batch'

interface TestContext {
  tag?: string
}

function makeCodec(): StandardLinkCodec<TestContext> {
  return {
    encodeInput: vi.fn(async (input, path, { signal }) => {
      return {
        method: 'POST',
        url: `/${path.join('/')}` as `/${string}`,
        headers: { 'content-type': 'application/json' },
        body: input,
        signal,
      } satisfies StandardRequest
    }),
    decodeResponse: vi.fn(async (response) => {
      const body = await response.resolveBody()
      return { kind: 'output' as const, output: body }
    }),
  }
}

function extractBatchMessagesFromRequest(request: StandardRequest): any[] {
  if (Array.isArray(request.body)) {
    return request.body
  }

  // GET batch requests encode the message list in the `data` query param.
  const match = request.url.match(/[?&]data=([^&#]*)/)
  return match ? JSON.parse(decodeURIComponent(match[1]!)) : []
}

function makeBufferedBatchResponseFromRequest(request: StandardRequest, resultFn?: (id: unknown, index: number) => unknown): StandardLazyResponse {
  const messages = extractBatchMessagesFromRequest(request)

  return {
    status: 207,
    headers: {},
    resolveBody: async () => messages.map((msg: any, i: number) => ({
      kind: 'response',
      id: msg.id,
      json: { status: 200, headers: { 'x-index': `${i}` }, body: resultFn ? resultFn(msg.id, i) : `result-${i}` },
      binary: undefined,
    })),
  }
}

function makeTransport(): StandardLinkTransport<TestContext> {
  return {
    send: vi.fn<StandardLinkTransport<TestContext>['send']>(async (request) => {
      if (request.headers['orpc-batch']) {
        return makeBufferedBatchResponseFromRequest(request)
      }

      return {
        status: 200,
        headers: {},
        resolveBody: async () => 'not-batched',
      }
    }),
  }
}

async function toLengthPrefixedBytes(messages: any[]): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = []

  for (const message of messages) {
    const encoded = await encodePeerMessage(message)
    const bytes = typeof encoded === 'string' ? new TextEncoder().encode(encoded) : encoded
    const header = new ArrayBuffer(4)
    new DataView(header).setUint32(0, bytes.byteLength, false)

    chunks.push(new Uint8Array(header), bytes)
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(total)
  let offset = 0

  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }

  return output
}

/**
 * Sends calls `a` and `b` as one streaming batch whose response messages the test pushes one by one.
 */
async function startStreamingBatch() {
  const batch = promiseWithResolvers<{ ids: string[], signal: AbortSignal, push: (message: any) => Promise<void> }>()

  const link = new StandardLink(makeCodec(), {
    send: async (request) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          batch.resolve({
            ids: extractBatchMessagesFromRequest(request).map(message => message.id),
            signal: request.signal!,
            push: async message => controller.enqueue(await toLengthPrefixedBytes([message])),
          })
        },
      })

      return { status: 207, headers: {}, resolveBody: async () => stream }
    },
  }, {
    plugins: [new BatchLinkPlugin({ groups: [{ condition: () => true, context: {} }], mode: 'streaming' })],
  })

  const outputA = link.call(['a'], {}, { context: {} })
  const outputB = link.call(['b'], {}, { context: {} })
  const { ids: [idA, idB], signal, push } = await batch.promise

  return { outputA, outputB, idA, idB, signal, push }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('batchLinkPlugin', () => {
  const defaultGroup = {
    condition: () => true,
    context: () => ({}),
  }

  describe('request filtering and pass-through', () => {
    it('passes through requests when filter returns false', async () => {
      const codec = makeCodec()
      const transport = makeTransport()
      const filter = vi.fn(() => false)
      const condition = vi.fn(() => true)

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [{ condition, context: () => ({}) }],
          filter,
        })],
      })

      await Promise.all([
        expect(link.call(['ping'], {}, { context: {} })).resolves.toBe('not-batched'),
        expect(link.call(['ping'], {}, { context: {} })).resolves.toBe('not-batched'),
      ])

      expect(filter).toHaveBeenCalledTimes(2)
      expect(condition).not.toHaveBeenCalled()
      expect(transport.send).toHaveBeenCalledTimes(2)
      expect(vi.mocked(transport.send).mock.calls[0]![0].headers['orpc-batch']).toBeUndefined()
      expect(vi.mocked(transport.send).mock.calls[1]![0].headers['orpc-batch']).toBeUndefined()
    })

    it('passes through requests when no group matches', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [{ condition: () => false, context: () => ({}) }],
        })],
      })

      await Promise.all([
        expect(link.call(['ping'], {}, { context: {} })).resolves.toBe('not-batched'),
        expect(link.call(['ping'], {}, { context: {} })).resolves.toBe('not-batched'),
      ])

      expect(transport.send).toHaveBeenCalledTimes(2)
    })

    it('passes through a single request without batching', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
        })],
      })

      await expect(link.call(['ping'], {}, { context: {} })).resolves.toBe('not-batched')
      expect(transport.send).toHaveBeenCalledTimes(1)
    })

    it('skips batching for requests with Blob body', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(codec.encodeInput).mockResolvedValueOnce({
        method: 'POST',
        url: '/upload',
        headers: {},
        body: new Blob(['data']),
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
        })],
      })

      await Promise.all([
        expect(link.call(['upload'], {}, { context: {} })).resolves.toBe('not-batched'),
        expect(link.call(['upload'], {}, { context: {} })).resolves.toBe('not-batched'),
      ])

      expect(transport.send).toHaveBeenCalledTimes(2)
    })

    it('skips batching for requests with FormData body', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(codec.encodeInput).mockResolvedValueOnce({
        method: 'POST',
        url: '/upload',
        headers: {},
        body: new FormData(),
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
        })],
      })

      await Promise.all([
        expect(link.call(['upload'], {}, { context: {} })).resolves.toBe('not-batched'),
        expect(link.call(['ping'], {}, { context: {} })).resolves.toBe('result-0'),
        expect(link.call(['ping'], {}, { context: {} })).resolves.toBe('result-1'),
      ])

      expect(transport.send).toHaveBeenCalledTimes(2)
    })

    it('skips batching for requests with ReadableStream body', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(codec.encodeInput).mockResolvedValueOnce({
        method: 'POST',
        url: '/stream-upload',
        headers: {},
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]))
            controller.close()
          },
        }),
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
        })],
      })

      await Promise.all([
        expect(link.call(['upload-stream'], {}, { context: {} })).resolves.toBe('not-batched'),
        expect(link.call(['upload-stream'], {}, { context: {} })).resolves.toBe('not-batched'),
      ])

      expect(transport.send).toHaveBeenCalledTimes(2)
    })

    it('skips batching for requests with AsyncIteratorObject body', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      async function* makeBody() {
        yield 'chunk'
      }

      vi.mocked(codec.encodeInput).mockResolvedValueOnce({
        method: 'POST',
        url: '/iterator-upload',
        headers: {},
        body: makeBody(),
      })

      vi.mocked(transport.send).mockResolvedValueOnce({
        status: 200,
        headers: {},
        resolveBody: async () => 'iterator-response',
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
        })],
      })

      const result = await link.call(['upload-iterator'], {}, { context: {} })
      expect(result).toBe('iterator-response')
      expect(transport.send).toHaveBeenCalledTimes(1)
      const sentRequest = vi.mocked(transport.send).mock.calls[0]![0]
      expect(sentRequest.headers['orpc-batch']).toBeUndefined()
    })

    it('skips batching when requests are already aborted', async () => {
      const codec = makeCodec()
      const transport = makeTransport()
      const requestController = new AbortController()
      requestController.abort()

      vi.mocked(codec.encodeInput).mockResolvedValueOnce({
        method: 'POST',
        url: '/encoded-aborted',
        headers: {},
        body: undefined,
        signal: requestController.signal,
      })

      vi.mocked(transport.send).mockResolvedValueOnce({
        status: 200,
        headers: {},
        resolveBody: async () => 'encoded-aborted-response',
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
        })],
      })

      await Promise.all([
        link.call(['ping'], {}, { context: {} }),
        link.call(['ping'], {}, { context: {} }),
      ])

      expect(transport.send).toHaveBeenCalledTimes(2) // no batching happen
    })
  })

  describe('batching and grouping behavior', () => {
    it('batches multiple concurrent requests', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mode: 'buffered',
        })],
      })

      await Promise.all([
        expect(link.call(['ping'], { n: 1 }, { context: {} })).resolves.toBe('result-0'),
        expect(link.call(['ping'], { n: 2 }, { context: {} })).resolves.toBe('result-1'),
      ])

      expect(transport.send).toHaveBeenCalledTimes(1)
      const sentRequest = vi.mocked(transport.send).mock.calls[0]![0]
      expect(sentRequest.headers['orpc-batch']).toBe('buffered')
    })

    it('splits batches when exceeding maxSize', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mode: 'buffered',
          maxSize: 2,
        })],
      })

      // 4 concurrent requests with maxSize 2 should split into 2 batches of 2
      await Promise.all([
        link.call(['a'], {}, { context: {} }),
        link.call(['b'], {}, { context: {} }),
        link.call(['c'], {}, { context: {} }),
        link.call(['d'], {}, { context: {} }),
      ])

      expect(transport.send).toHaveBeenCalledTimes(2)
    })

    it('deduplicates common headers in batch requests', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      let callIndex = 0
      vi.mocked(codec.encodeInput).mockImplementation(async () => {
        callIndex++
        return {
          method: 'POST',
          url: `/test-${callIndex}` as `/${string}`,
          headers: {
            'authorization': 'Bearer token123',
            'x-unique': `value-${callIndex}`,
          },
          body: undefined,
        }
      })

      vi.mocked(transport.send).mockImplementation(async (request) => {
        return makeBufferedBatchResponseFromRequest(request)
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
        })],
      })

      await Promise.all([
        link.call(['a'], {}, { context: {} }),
        link.call(['b'], {}, { context: {} }),
      ])

      expect(transport.send).toHaveBeenCalledTimes(1)

      const sentRequest = vi.mocked(transport.send).mock.calls[0]![0]
      expect(sentRequest.headers.authorization).toBe('Bearer token123')
      expect(sentRequest.headers['x-unique']).toBeUndefined()
    })

    it('low-priority merge batch response headers into subresponse', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async (request) => {
        const response = makeBufferedBatchResponseFromRequest(request)
        return {
          ...response,
          headers: {
            ...response.headers,
            'x-from-batch-response': 'true',
            'x-index': 'low-priority',
          },
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
        })],
      })

      await Promise.all([
        link.call(['a'], {}, { context: {} }),
        link.call(['b'], {}, { context: {} }),
      ])

      expect(codec.decodeResponse).toHaveBeenCalledTimes(2)
      const subResponse1 = vi.mocked(codec.decodeResponse).mock.calls[0]![0]
      const subResponse2 = vi.mocked(codec.decodeResponse).mock.calls[1]![0]

      expect(subResponse1.headers['x-from-batch-response']).toEqual('true')
      expect(subResponse1.headers['x-index']).toEqual('0')

      expect(subResponse2.headers['x-from-batch-response']).toEqual('true')
      expect(subResponse2.headers['x-index']).toEqual('1')
    })

    it('uses custom mapSubresponse and forwards its response to the caller', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async (request) => {
        const response = makeBufferedBatchResponseFromRequest(request)
        return {
          ...response,
          headers: { ...response.headers, 'x-from-batch-response': 'true' },
        }
      })

      const mapSubresponse = vi.fn((subResponse: StandardLazyResponse, batchResponse: StandardLazyResponse): StandardLazyResponse => ({
        ...subResponse,
        headers: {
          ...subResponse.headers,
          'x-mapped': 'true',
          'x-batch-status': `${batchResponse.status}`,
        },
        resolveBody: async () => `mapped-${await subResponse.resolveBody()}`,
      }))

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mapSubresponse,
        })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).resolves.toBe('mapped-result-0'),
        expect(link.call(['b'], {}, { context: {} })).resolves.toBe('mapped-result-1'),
      ])

      expect(mapSubresponse).toHaveBeenCalledTimes(2)

      const subResponse1 = vi.mocked(codec.decodeResponse).mock.calls[0]![0]
      expect(subResponse1.headers['x-mapped']).toEqual('true')
      expect(subResponse1.headers['x-batch-status']).toEqual('207')
      // the default merge of batch response headers is not applied anymore
      expect(subResponse1.headers['x-from-batch-response']).toBeUndefined()
    })

    it('separates GET, QUERY, and unsafe requests into distinct batches', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      let callIndex = 0
      vi.mocked(codec.encodeInput).mockImplementation(async () => {
        callIndex++
        const method = callIndex <= 2 ? 'GET' : callIndex <= 4 ? 'QUERY' : 'PUT'
        return {
          method,
          url: `/test-${callIndex}` as `/${string}`,
          headers: {},
          body: undefined,
        }
      })

      vi.mocked(transport.send).mockImplementation(async (request) => {
        if (request.headers['orpc-batch']) {
          return makeBufferedBatchResponseFromRequest(request)
        }
        return { status: 200, headers: {}, resolveBody: async () => 'direct' }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mode: 'buffered',
        })],
      })

      await Promise.all([
        link.call(['get1'], {}, { context: {} }),
        link.call(['get2'], {}, { context: {} }),
        link.call(['query1'], {}, { context: {} }),
        link.call(['query2'], {}, { context: {} }),
        link.call(['put1'], {}, { context: {} }),
        link.call(['put2'], {}, { context: {} }),
      ])

      expect(transport.send).toHaveBeenCalledTimes(3)

      const sentGetRequest = vi.mocked(transport.send).mock.calls.find(([request]) => request.method === 'GET')![0]
      expect(extractBatchMessagesFromRequest(sentGetRequest).map(message => message.json.method)).toEqual(['GET', 'GET'])
      expect(sentGetRequest.headers['orpc-batch']).toBe('buffered')

      const sentQueryRequest = vi.mocked(transport.send).mock.calls.find(([request]) => request.method === 'QUERY')![0]
      expect(extractBatchMessagesFromRequest(sentQueryRequest).map(message => message.json.method)).toEqual(['QUERY', 'QUERY'])

      const sentPostRequest = vi.mocked(transport.send).mock.calls.find(([request]) => request.method === 'POST')![0]
      expect(extractBatchMessagesFromRequest(sentPostRequest).map(message => message.json.method)).toEqual(['PUT', 'PUT'])
      expect(sentPostRequest.headers['orpc-batch']).toBe('buffered')
    })

    it('aborts grouped batch request when all sub-requests are aborted', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async (request) => {
        await sleep(50)
        request.signal?.throwIfAborted()

        return {
          status: 207,
          headers: {},
          resolveBody: async () => [],
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'streaming' })],
      })

      const controller1 = new AbortController()
      const controller2 = new AbortController()

      const promise = Promise.all([
        expect(link.call(['a'], {}, { context: {}, signal: controller1.signal })).rejects.toThrow('aborted'),
        expect(link.call(['b'], {}, { context: {}, signal: controller2.signal })).rejects.toThrow('aborted'),
      ])

      await sleep(10)
      expect(vi.mocked(transport.send)).toHaveBeenCalledTimes(1)

      controller1.abort()
      await sleep(10)
      expect(vi.mocked(transport.send).mock.calls[0]![0].signal?.aborted).toBe(false)

      controller2.abort()
      await sleep(10)
      expect(vi.mocked(transport.send).mock.calls[0]![0].signal?.aborted).toBe(true)

      await promise
    })

    it('batches requests made within `wait`, counted from the first queued request', async () => {
      vi.useFakeTimers()

      const codec = makeCodec()
      const transport = makeTransport()

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered', wait: 100 })],
      })

      const promise1 = link.call(['a'], {}, { context: {} })
      await vi.advanceTimersByTimeAsync(60)
      const promise2 = link.call(['b'], {}, { context: {} })

      await vi.advanceTimersByTimeAsync(39)
      expect(transport.send).toHaveBeenCalledTimes(0)

      await vi.advanceTimersByTimeAsync(1)
      await expect(promise1).resolves.toBe('result-0')
      await expect(promise2).resolves.toBe('result-1')
      expect(transport.send).toHaveBeenCalledTimes(1)

      // Requests made after the batch is sent start a new wait
      const promise3 = link.call(['c'], {}, { context: {} })
      const promise4 = link.call(['d'], {}, { context: {} })

      await vi.advanceTimersByTimeAsync(99)
      expect(transport.send).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      await expect(promise3).resolves.toBe('result-0')
      await expect(promise4).resolves.toBe('result-1')
      expect(transport.send).toHaveBeenCalledTimes(2)
    })

    it('rejects requests aborted while queued without stalling the rest of the batch', async () => {
      vi.useFakeTimers()

      const codec = makeCodec()
      const transport = makeTransport()

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered', wait: 100 })],
      })

      const controller = new AbortController()
      const abortedPromise = expect(link.call(['a'], {}, { context: {}, signal: controller.signal })).rejects.toThrow('TEST_ABORT')
      const promise2 = link.call(['b'], {}, { context: {} })
      const promise3 = link.call(['c'], {}, { context: {} })

      await vi.advanceTimersByTimeAsync(50)
      controller.abort(new Error('TEST_ABORT'))
      await vi.advanceTimersByTimeAsync(50)

      await abortedPromise
      await expect(promise2).resolves.toBe('result-0')
      await expect(promise3).resolves.toBe('result-1')
      expect(transport.send).toHaveBeenCalledTimes(1)
      expect(extractBatchMessagesFromRequest(vi.mocked(transport.send).mock.calls[0]![0])).toHaveLength(2)
    })

    it('rejects requests aborted while batch options resolve without stalling the rest of the batch', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mode: 'buffered',
          url: async () => {
            await sleep(50)
            return '/__batch__' as const
          },
        })],
      })

      const controller = new AbortController()
      const abortedPromise = expect(link.call(['a'], {}, { context: {}, signal: controller.signal })).rejects.toThrow('TEST_ABORT')
      const promise2 = link.call(['b'], {}, { context: {} })
      const promise3 = link.call(['c'], {}, { context: {} })

      await sleep(10)
      controller.abort(new Error('TEST_ABORT'))

      await abortedPromise
      await expect(promise2).resolves.toBe('result-0')
      await expect(promise3).resolves.toBe('result-1')
      expect(transport.send).toHaveBeenCalledTimes(1)
      expect(extractBatchMessagesFromRequest(vi.mocked(transport.send).mock.calls[0]![0])).toHaveLength(2)
    })

    it('rejects requests aborted before the peer sends them without stalling the rest of the batch', async () => {
      const codec = makeCodec()
      const transport = makeTransport()
      const controller = new AbortController()

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mode: 'buffered',
          mapSubrequest: ({ request }) => {
            if (request.url === '/a') {
              // Runs after the peer starts sending this subrequest, before its request message
              queueMicrotask(() => controller.abort(new Error('TEST_ABORT')))
            }

            return request
          },
        })],
      })

      const abortedPromise = expect(link.call(['a'], {}, { context: {}, signal: controller.signal })).rejects.toThrow('TEST_ABORT')
      const promise2 = link.call(['b'], {}, { context: {} })
      const promise3 = link.call(['c'], {}, { context: {} })

      await abortedPromise
      await expect(promise2).resolves.toBe('result-0')
      await expect(promise3).resolves.toBe('result-1')
      expect(transport.send).toHaveBeenCalledTimes(1)

      // The never-sent subrequest adds no message, not even a cancel
      expect(extractBatchMessagesFromRequest(vi.mocked(transport.send).mock.calls[0]![0]).map(m => m.kind)).toEqual(['request', 'request'])
    })

    it('sends no batch request when every subrequest is aborted before the peer sends it', async () => {
      const codec = makeCodec()
      const transport = makeTransport()
      const controller = new AbortController()

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mode: 'buffered',
          mapSubrequest: ({ request }) => {
            queueMicrotask(() => controller.abort(new Error('TEST_ABORT')))
            return request
          },
        })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {}, signal: controller.signal })).rejects.toThrow('TEST_ABORT'),
        expect(link.call(['b'], {}, { context: {}, signal: controller.signal })).rejects.toThrow('TEST_ABORT'),
      ])

      expect(transport.send).not.toHaveBeenCalled()
    })

    it.each(['POST', 'GET'] as const)('leaves a subrequest aborted after its request message but before the batch out of the %s batch', async (method) => {
      const codec = makeCodec()
      const transport = makeTransport()
      const controller = new AbortController()

      vi.mocked(codec.encodeInput).mockImplementation(async (_input, path, { signal }) => ({
        method,
        url: `/${path.join('/')}` as `/${string}`,
        headers: {},
        body: undefined,
        signal,
      }))

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mode: 'buffered',
          mapSubrequest: ({ request }) => {
            if (request.url !== '/b') {
              return request
            }

            // Read when the peer starts sending b, after a's request message
            return {
              ...request,
              get body() {
                controller.abort(new Error('TEST_ABORT'))
                return request.body
              },
            }
          },
        })],
      })

      const abortedPromise = expect(link.call(['a'], {}, { context: {}, signal: controller.signal })).rejects.toThrow('TEST_ABORT')
      const promise2 = link.call(['b'], {}, { context: {} })

      await abortedPromise
      await expect(promise2).resolves.toBe('result-0')

      const batchRequest = vi.mocked(transport.send).mock.calls[0]![0]
      expect(batchRequest.method).toBe(method)
      expect(batchRequest.signal?.aborted).toBe(false)
      expect(extractBatchMessagesFromRequest(batchRequest).map(m => [m.kind, m.json?.url])).toEqual([['request', '/b']])
    })

    it('keeps the sent batch messages unchanged when a subrequest is aborted after the batch is handed to the transport', async () => {
      const codec = makeCodec()
      const transport = makeTransport()
      const controller = new AbortController()

      vi.mocked(transport.send).mockImplementationOnce(async (request) => {
        controller.abort(new Error('TEST_ABORT'))
        return makeBufferedBatchResponseFromRequest(request)
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {}, signal: controller.signal })).rejects.toThrow('TEST_ABORT'),
        expect(link.call(['b'], {}, { context: {} })).resolves.toBe('result-1'),
      ])

      expect(extractBatchMessagesFromRequest(vi.mocked(transport.send).mock.calls[0]![0]).map(m => m.kind)).toEqual(['request', 'request'])
    })

    it('aborts the batch request once every subrequest is aborted, including ones aborted before sending', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async (request) => {
        await sleep(50)
        request.signal?.throwIfAborted()

        return {
          status: 207,
          headers: {},
          resolveBody: async () => [],
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'streaming', wait: 20 })],
      })

      const controller1 = new AbortController()
      const controller2 = new AbortController()
      const controller3 = new AbortController()

      const promise = Promise.all([
        expect(link.call(['a'], {}, { context: {}, signal: controller1.signal })).rejects.toThrow('aborted'),
        expect(link.call(['b'], {}, { context: {}, signal: controller2.signal })).rejects.toThrow('aborted'),
        expect(link.call(['c'], {}, { context: {}, signal: controller3.signal })).rejects.toThrow('aborted'),
      ])

      await sleep(10)
      controller1.abort() // aborted while queued, so it is never sent
      await sleep(20)
      expect(transport.send).toHaveBeenCalledTimes(1)

      controller2.abort()
      controller3.abort()
      await sleep(10)
      expect(vi.mocked(transport.send).mock.calls[0]![0].signal?.aborted).toBe(true)

      await promise
    })

    it('aborts the batch request when a cancelled stream is all the server is still running', async () => {
      const { outputA, outputB, idA, idB, signal, push } = await startStreamingBatch()

      await push({ kind: 'response', id: idA, json: { body: 'a' } })
      await push({ kind: 'response', id: idB, json: { headers: { 'standard-server': 'event-stream' } } })
      await expect(outputA).resolves.toBe('a')
      const iteratorB = await outputB as AsyncIteratorObject<unknown>

      await iteratorB.return?.()
      expect(signal.aborted).toBe(true)
    })

    it('keeps the batch request open after a cancel until every other stream finishes', async () => {
      const { outputA, outputB, idA, idB, signal, push } = await startStreamingBatch()

      await push({ kind: 'response', id: idA, json: { headers: { 'standard-server': 'event-stream' } } })
      await push({ kind: 'response', id: idB, json: { headers: { 'content-type': 'application/octet-stream' } } })
      const iteratorA = await outputA as AsyncIteratorObject<unknown>
      const streamB = await outputB as ReadableStream<Uint8Array>

      await streamB.cancel()
      await push({ kind: 'event-stream', id: idA, json: { data: 'a1' } })
      await expect(iteratorA.next()).resolves.toEqual({ value: 'a1', done: false })
      expect(signal.aborted).toBe(false)

      await push({ kind: 'event-stream', id: idA, json: { event: 'close' } })
      await expect(iteratorA.next()).resolves.toEqual({ value: undefined, done: true })
      await sleep(0)
      expect(signal.aborted).toBe(true)
    })

    it('keeps the batch request open when a subrequest is cancelled only after the server finished it', async () => {
      const { outputA, outputB, idA, idB, signal, push } = await startStreamingBatch()

      await push({ kind: 'response', id: idA, json: { headers: { 'standard-server': 'event-stream' } } })
      await push({ kind: 'response', id: idB, json: { headers: { 'standard-server': 'event-stream' } } })
      const iteratorA = await outputA as AsyncIteratorObject<unknown>
      const iteratorB = await outputB as AsyncIteratorObject<unknown>

      // B's event arriving proves A's close was received, though A never reads it
      await push({ kind: 'event-stream', id: idA, json: { event: 'close' } })
      await push({ kind: 'event-stream', id: idB, json: { data: 'b1' } })
      await expect(iteratorB.next()).resolves.toEqual({ value: 'b1', done: false })

      await iteratorA.return?.()
      await push({ kind: 'event-stream', id: idB, json: { event: 'close' } })
      await expect(iteratorB.next()).resolves.toEqual({ value: undefined, done: true })
      await sleep(0)
      expect(signal.aborted).toBe(false)
    })

    it('keeps the batch request open when a cancelled stream also finishes on the server before the others', async () => {
      const { outputA, outputB, idA, idB, signal, push } = await startStreamingBatch()

      await push({ kind: 'response', id: idA, json: { headers: { 'standard-server': 'event-stream' } } })
      await push({ kind: 'response', id: idB, json: { headers: { 'standard-server': 'event-stream' } } })
      const iteratorA = await outputA as AsyncIteratorObject<unknown>
      const iteratorB = await outputB as AsyncIteratorObject<unknown>

      await iteratorA.return?.()
      await push({ kind: 'event-stream', id: idA, json: { event: 'close' } })
      await push({ kind: 'event-stream', id: idB, json: { event: 'close' } })
      await expect(iteratorB.next()).resolves.toEqual({ value: undefined, done: true })
      await sleep(0)
      expect(signal.aborted).toBe(false)
    })

    it('treats a server cancel as the end of a subrequest, but not a stream/cancel', async () => {
      const { outputA, outputB, idA, idB, signal, push } = await startStreamingBatch()

      await push({ kind: 'response', id: idA, json: { headers: { 'standard-server': 'event-stream' } } })
      await push({ kind: 'response', id: idB, json: { headers: { 'standard-server': 'event-stream' } } })
      const iteratorA = await outputA as AsyncIteratorObject<unknown>
      const iteratorB = await outputB as AsyncIteratorObject<unknown>

      await iteratorB.return?.()
      await push({ kind: 'stream/cancel', id: idA })
      await push({ kind: 'event-stream', id: idA, json: { data: 'a1' } })
      await expect(iteratorA.next()).resolves.toEqual({ value: 'a1', done: false })
      expect(signal.aborted).toBe(false)

      await push({ kind: 'cancel', id: idA })
      await expect(iteratorA.next()).rejects.toThrow('Server canceled the request')
      await sleep(0)
      expect(signal.aborted).toBe(true)
    })
  })

  describe('batch response decoding', () => {
    it('decodes length-prefixed blob batch responses', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async (request) => {
        if (!request.headers['orpc-batch']) {
          return { status: 200, headers: {}, resolveBody: async () => 'direct' }
        }

        const rawMessages = Array.isArray(request.body) ? request.body : []
        const responseMessages = rawMessages.map((msg: any, i: number) => ({
          kind: 'response',
          id: msg.id,
          json: { status: 200, headers: {}, body: `blob-${i}` },
        }))

        const bytes = await toLengthPrefixedBytes(responseMessages)

        return {
          status: 207,
          headers: {},
          resolveBody: async () => new Blob([bytes], { type: 'application/octet-stream' }),
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).resolves.toBe('blob-0'),
        expect(link.call(['b'], {}, { context: {} })).resolves.toBe('blob-1'),
      ])
    })

    it('decodes length-prefixed stream batch responses', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async (request) => {
        if (!request.headers['orpc-batch']) {
          return { status: 200, headers: {}, resolveBody: async () => 'direct' }
        }

        const rawMessages = Array.isArray(request.body) ? request.body : []
        const responseMessages = rawMessages.map((msg: any, i: number) => ({
          kind: 'response',
          id: msg.id,
          json: { status: 200, headers: {}, body: `stream-${i}` },
        }))

        const bytes = await toLengthPrefixedBytes(responseMessages)
        const splitAt = Math.max(1, Math.floor(bytes.length / 2))

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.subarray(0, splitAt))
            controller.enqueue(bytes.subarray(splitAt))
            controller.close()
          },
        })

        return {
          status: 207,
          headers: {},
          resolveBody: async () => stream,
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'streaming' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).resolves.toBe('stream-0'),
        expect(link.call(['b'], {}, { context: {} })).resolves.toBe('stream-1'),
      ])
    })

    it('ignores zero-length keep-alive frames in stream batch responses', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async (request) => {
        if (!request.headers['orpc-batch']) {
          return { status: 200, headers: {}, resolveBody: async () => 'direct' }
        }

        const rawMessages = Array.isArray(request.body) ? request.body : []
        const responseMessages = rawMessages.map((msg: any, i: number) => ({
          kind: 'response',
          id: msg.id,
          json: { status: 200, headers: {}, body: `keepalive-${i}` },
        }))

        const bytes = await toLengthPrefixedBytes(responseMessages)
        const keepAlive = new Uint8Array([0, 0, 0, 0])

        // Keep-alive frames only appear between complete length-prefixed messages
        // (never between a length header and its payload).
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(keepAlive)
            controller.enqueue(bytes)
            controller.enqueue(keepAlive)
            controller.close()
          },
        })

        return {
          status: 207,
          headers: {},
          resolveBody: async () => stream,
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'streaming' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).resolves.toBe('keepalive-0'),
        expect(link.call(['b'], {}, { context: {} })).resolves.toBe('keepalive-1'),
      ])
    })

    it('decodes streamed responses when length header and payload arrive in separate chunks', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async (request) => {
        if (!request.headers['orpc-batch']) {
          return { status: 200, headers: {}, resolveBody: async () => 'direct' }
        }

        const rawMessages = Array.isArray(request.body) ? request.body : []
        const responseMessages = rawMessages.map((msg: any, i: number) => ({
          kind: 'response',
          id: msg.id,
          json: { status: 200, headers: {}, body: `split-${i}` },
        }))

        const bytes = await toLengthPrefixedBytes(responseMessages)

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            // Send only length header first, then payload bytes.
            controller.enqueue(bytes.subarray(0, 4))
            controller.enqueue(bytes.subarray(4))
            controller.close()
          },
        })

        return {
          status: 207,
          headers: {},
          resolveBody: async () => stream,
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'streaming' })],
      })

      await Promise.all([
        expect(link.call(['x'], {}, { context: {} })).resolves.toBe('split-0'),
        expect(link.call(['y'], {}, { context: {} })).resolves.toBe('split-1'),
      ])
    })

    it('rejects on malformed array batch responses with invalid messages', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async () => {
        return {
          status: 207,
          headers: {},
          resolveBody: async () => ['INVALID', 'INVALID'],
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).rejects.toThrow('Invalid batch response format'),
        expect(link.call(['b'], {}, { context: {} })).rejects.toThrow('Invalid batch response format'),
      ])
    })

    it('rejects on malformed blob batch responses with incomplete headers', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async () => {
        return {
          status: 207,
          headers: {},
          resolveBody: async () => new Blob([new Uint8Array([1, 2, 3])]),
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).rejects.toThrow('Invalid batch response: incomplete length header.'),
        expect(link.call(['b'], {}, { context: {} })).rejects.toThrow('Invalid batch response: incomplete length header.'),
      ])
    })

    it('rejects on malformed blob batch responses with incomplete messages', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async () => {
        return {
          status: 207,
          headers: {},
          resolveBody: async () => new Blob(['MALFORMED']),
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).rejects.toThrow('Invalid batch response: incomplete message.'),
        expect(link.call(['b'], {}, { context: {} })).rejects.toThrow('Invalid batch response: incomplete message.'),
      ])
    })

    it('rejects on malformed blob batch responses with invalid messages', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async () => {
        const bytes = await toLengthPrefixedBytes(['INVALID', 'INVALID'])

        return {
          status: 207,
          headers: {},
          resolveBody: async () => new Blob([bytes], { type: 'application/octet-stream' }),
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).rejects.toThrow('Invalid batch response: invalid message.'),
        expect(link.call(['b'], {}, { context: {} })).rejects.toThrow('Invalid batch response: invalid message.'),
      ])
    })

    it('rejects on malformed streamed batch responses with incomplete headers', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async () => {
        return {
          status: 207,
          headers: {},
          resolveBody: async () => new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]))
              controller.close()
            },
          }),
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).rejects.toThrow('Batch response is incomplete.'),
        expect(link.call(['b'], {}, { context: {} })).rejects.toThrow('Batch response is incomplete.'),
      ])
    })

    it('rejects on malformed streamed batch responses with incomplete messages', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async () => {
        return {
          status: 207,
          headers: {},
          resolveBody: async () => new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('MALFORMED'))
              controller.close()
            },
          }),
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).rejects.toThrow('Batch response is incomplete.'),
        expect(link.call(['b'], {}, { context: {} })).rejects.toThrow('Batch response is incomplete.'),
      ])
    })

    it('rejects on malformed streamed batch responses with invalid messages', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async () => {
        const bytes = await toLengthPrefixedBytes(['INVALID', 'INVALID'])

        return {
          status: 207,
          headers: {},
          resolveBody: async () => new ReadableStream({
            start(controller) {
              controller.enqueue(bytes)
              controller.close()
            },
          }),
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).rejects.toThrow('Invalid batch response: invalid message.'),
        expect(link.call(['b'], {}, { context: {} })).rejects.toThrow('Invalid batch response: invalid message.'),
      ])
    })
  })

  describe('error batch responses', () => {
    it.each(['buffered', 'streaming'] as const)('forwards %s batch responses with status >= 400 to every subrequest', async (mode) => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async () => {
        return {
          status: 502,
          headers: { 'x-error': 'gateway' },
          resolveBody: async () => 'Bad Gateway',
        }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).resolves.toBe('Bad Gateway'),
        expect(link.call(['b'], {}, { context: {} })).resolves.toBe('Bad Gateway'),
      ])

      expect(codec.decodeResponse).toHaveBeenCalledTimes(2)
      expect(vi.mocked(codec.decodeResponse).mock.calls[0]![0]).toMatchObject({
        status: 502,
        headers: { 'x-error': 'gateway' },
      })
      expect(vi.mocked(codec.decodeResponse).mock.calls[1]![0]).toMatchObject({
        status: 502,
        headers: { 'x-error': 'gateway' },
      })
    })

    it('resolves the error response body only once for all subrequests', async () => {
      const codec = makeCodec()
      const transport = makeTransport()
      const resolveBody = vi.fn(async () => 'Bad Gateway')

      vi.mocked(transport.send).mockImplementation(async () => {
        return { status: 502, headers: {}, resolveBody }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).resolves.toBe('Bad Gateway'),
        expect(link.call(['b'], {}, { context: {} })).resolves.toBe('Bad Gateway'),
      ])

      expect(transport.send).toHaveBeenCalledTimes(1)
      expect(resolveBody).toHaveBeenCalledTimes(1)
    })

    it('still parses batch responses with status < 400', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], mode: 'buffered' })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).resolves.toBe('result-0'),
        expect(link.call(['b'], {}, { context: {} })).resolves.toBe('result-1'),
      ])
    })
  })

  describe('batch option failures', () => {
    it.each(['maxSize', 'url', 'headers', 'mode', 'mapSubrequest'] as const)('rejects every subrequest when %s throws', async (option) => {
      const error = new Error('option failed')
      const codec = makeCodec()
      const transport = makeTransport()

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], [option]: () => { throw error } })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).rejects.toBe(error),
        expect(link.call(['b'], {}, { context: {} })).rejects.toBe(error),
      ])

      expect(transport.send).not.toHaveBeenCalled()
    })

    it('rejects every subrequest when an option throws for a batch split by maxUrlLength', async () => {
      const error = new Error('option failed')
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(codec.encodeInput).mockImplementation(async (_input, path) => ({
        method: 'GET',
        url: `/${path.join('/')}` as `/${string}`,
        headers: {},
        body: undefined,
      }))

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          maxUrlLength: 1,
          url: vi.fn().mockReturnValueOnce('/__batch__').mockImplementation(() => { throw error }),
        })],
      })

      await Promise.all(['a', 'b', 'c', 'd'].map(path =>
        expect(link.call([path], {}, { context: {} })).rejects.toBe(error),
      ))

      expect(transport.send).not.toHaveBeenCalled()
    })

    it('rejects the remaining subrequests when mapSubresponse throws for an error batch response', async () => {
      const error = new Error('option failed')
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockImplementation(async () => {
        return { status: 502, headers: {}, resolveBody: async () => 'Bad Gateway' }
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mapSubresponse: vi.fn().mockImplementationOnce(subResponse => subResponse).mockImplementation(() => { throw error }),
        })],
      })

      await Promise.all([
        expect(link.call(['a'], {}, { context: {} })).resolves.toBe('Bad Gateway'),
        expect(link.call(['b'], {}, { context: {} })).rejects.toBe(error),
        expect(link.call(['c'], {}, { context: {} })).rejects.toBe(error),
      ])
    })
  })

  describe('method GET batch URL handling', () => {
    it('splits GET batches when URL exceeds maxUrlLength', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(codec.encodeInput).mockImplementation(async (_input, path) => ({
        method: 'GET',
        url: `/${path.join('/')}` as `/${string}`,
        headers: {},
        body: undefined,
      }))

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mode: 'buffered',
          maxUrlLength: 1,
        })],
      })

      await Promise.all([
        expect(link.call(['get-a'], {}, { context: {} })).resolves.toBe('not-batched'),
        expect(link.call(['get-b'], {}, { context: {} })).resolves.toBe('not-batched'),
      ])
    })

    it('appends batch data to existing query params and preserves hash', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(codec.encodeInput).mockImplementation(async (_input, path) => ({
        method: 'GET',
        url: `/${path.join('/')}` as `/${string}`,
        headers: {},
        body: undefined,
      }))

      vi.mocked(transport.send).mockImplementation(async (request) => {
        return makeBufferedBatchResponseFromRequest(request)
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mode: 'buffered',
          url: () => '/custom/__batch__?existing=1#anchor',
        })],
      })

      await Promise.all([
        expect(link.call(['q1'], {}, { context: {} })).resolves.toBe('result-0'),
        expect(link.call(['q2'], {}, { context: {} })).resolves.toBe('result-1'),
      ])

      expect(transport.send).toHaveBeenCalledTimes(1)
      const sentRequest = vi.mocked(transport.send).mock.calls[0]![0]
      expect(sentRequest.url).toContain('/custom/__batch__?existing=1&data=')
      expect(sentRequest.url).toContain('#anchor')
    })

    it('appends batch data to existing query params without hash', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(codec.encodeInput).mockImplementation(async (_input, path) => ({
        method: 'GET',
        url: `/${path.join('/')}` as `/${string}`,
        headers: {},
        body: undefined,
      }))

      vi.mocked(transport.send).mockImplementation(async (request) => {
        return makeBufferedBatchResponseFromRequest(request)
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          mode: 'buffered',
          url: () => '/custom-no-hash/__batch__?existing=1',
        })],
      })

      await Promise.all([
        expect(link.call(['q3'], {}, { context: {} })).resolves.toBe('result-0'),
        expect(link.call(['q4'], {}, { context: {} })).resolves.toBe('result-1'),
      ])

      expect(transport.send).toHaveBeenCalledTimes(1)
      const sentRequest = vi.mocked(transport.send).mock.calls[0]![0]
      expect(sentRequest.url).toContain('/custom-no-hash/__batch__?existing=1&data=')
      expect(sentRequest.url).not.toContain('#')
    })
  })

  describe('async context', () => {
    const storage = new AsyncLocalStorage<string>()

    function makeUserCodec(method: 'GET' | 'POST' = 'GET'): StandardLinkCodec<TestContext> {
      const codec = makeCodec()
      vi.mocked(codec.encodeInput).mockImplementation(async (_input, path) => ({
        method: path[0] === 'post' ? 'POST' : method,
        url: `/${path.join('/')}` as `/${string}`,
        headers: {},
        body: undefined,
      }))
      return codec
    }

    function makeUserTransport(): StandardLinkTransport<TestContext> {
      return {
        send: vi.fn(async (request) => {
          const user = storage.getStore()

          if (request.headers['orpc-batch']) {
            return makeBufferedBatchResponseFromRequest(request, () => user)
          }

          return { status: 200, headers: {}, resolveBody: async () => user }
        }),
      }
    }

    it('sends a request sent alone in its caller\'s async context', async () => {
      const transport = makeUserTransport()
      const link = new StandardLink(makeUserCodec(), transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup] })],
      })

      await expect(Promise.all([
        storage.run('alice', () => link.call(['get'], {}, { context: {} })),
        storage.run('bob', () => link.call(['post'], {}, { context: {} })),
      ])).resolves.toEqual(['alice', 'bob'])

      expect(transport.send).toHaveBeenCalledTimes(2)
    })

    it.each([
      ['maxSize', { maxSize: 1 }],
      ['maxUrlLength', { maxUrlLength: 1 }],
    ] as const)('sends each part of a batch split by %s in the async context of its first request', async (_, options) => {
      const transport = makeUserTransport()
      const link = new StandardLink(makeUserCodec(), transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup], ...options })],
      })

      const users = ['alice', 'bob', 'carol', 'dave']
      await expect(Promise.all(users.map(user =>
        storage.run(user, () => link.call(['get'], {}, { context: {} })),
      ))).resolves.toEqual(users)

      expect(transport.send).toHaveBeenCalledTimes(4)
    })

    it('batches only requests with the same scope', async () => {
      const transport = makeUserTransport()
      const link = new StandardLink(makeUserCodec(), transport, {
        plugins: [new BatchLinkPlugin({
          groups: [defaultGroup],
          scope: () => storage.getStore(),
          headers: () => ({ 'x-user': storage.getStore() }),
        })],
      })

      await expect(Promise.all(['alice', 'bob', 'alice', 'bob'].map(user =>
        storage.run(user, () => link.call(['get'], {}, { context: {} })),
      ))).resolves.toEqual(['alice', 'bob', 'alice', 'bob'])

      expect(transport.send).toHaveBeenCalledTimes(2)
      expect(vi.mocked(transport.send).mock.calls.map(([request]) => request.headers)).toEqual([
        { 'x-user': 'alice', 'orpc-batch': 'streaming' },
        { 'x-user': 'bob', 'orpc-batch': 'streaming' },
      ])
    })

    it('sends a batch in the async context of its first request when no scope is set', async () => {
      const transport = makeUserTransport()
      const link = new StandardLink(makeUserCodec(), transport, {
        plugins: [new BatchLinkPlugin({ groups: [defaultGroup] })],
      })

      await expect(Promise.all([
        storage.run('alice', () => link.call(['get'], {}, { context: {} })),
        storage.run('bob', () => link.call(['get'], {}, { context: {} })),
      ])).resolves.toEqual(['alice', 'alice'])

      expect(transport.send).toHaveBeenCalledTimes(1)
    })
  })
})
