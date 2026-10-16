import type { AnyRouter } from '@orpc/server'
import type { BatchResponseCompressionHandlerPluginOptions } from './batch-response-compression-handler-plugin'
import { Buffer } from 'node:buffer'
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { BATCH_CONTENT_TYPE, BatchHandlerPlugin, ResponseCompressionHandlerPlugin } from '@orpc/server/plugins'
import { promiseWithResolvers } from '@orpc/shared'
import { BatchResponseCompressionHandlerPlugin } from './batch-response-compression-handler-plugin'

// Long enough that a compressed body is unmistakably smaller than the identity one
const largeValue = 'batched-payload-'.repeat(64)

type Encoding = 'gzip' | 'deflate' | 'deflate-raw'

/**
 * A batch request for one subrequest per url, which is all any of these tests needs to name.
 */
function createBatchRequest(
  mode: 'buffered' | 'streaming',
  urls: string[],
  headers: Record<string, string> = { 'accept-encoding': 'gzip' },
) {
  return new Request('https://example.com/__batch__', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json', 'orpc-batch': mode },
    body: JSON.stringify(urls.map((url, id) => ({
      kind: 'request',
      id,
      json: { method: 'POST', url, headers: {}, body: undefined },
      binary: undefined,
    }))),
  })
}

function decompress(response: Response, encoding: Encoding): Promise<string> {
  return new Response(response.body!.pipeThrough(new DecompressionStream(encoding))).text()
}

describe('batchResponseCompressionHandlerPlugin', () => {
  const router = {
    ping: os.handler(() => largeValue),
    blob: os.handler(() => new Blob([largeValue], { type: 'application/octet-stream' })),
  }

  function createHandler(
    options: BatchResponseCompressionHandlerPluginOptions = {},
    handlerRouter: AnyRouter = router as AnyRouter,
  ) {
    return new RPCHandler(handlerRouter, {
      plugins: [
        new BatchHandlerPlugin(),
        new BatchResponseCompressionHandlerPlugin(options),
      ],
    })
  }

  it('compresses streaming batch responses', async () => {
    const { matched, response } = await createHandler().handle(createBatchRequest('streaming', ['/ping', '/ping']))

    expect(matched).toBe(true)
    expect(response!.status).toBe(207)
    expect(response!.headers.get('content-encoding')).toBe('gzip')
    expect(response!.headers.get('content-type')).toBe(BATCH_CONTENT_TYPE)
    // A shared cache must key on the encoding, or it hands this body to a client that cannot decode it
    expect(response!.headers.get('vary')).toBe('accept-encoding')
    // Without the hint a proxy-added content-length would make the client buffer the whole batch
    expect(response!.headers.get('standard-server')).toBe('octet-stream')
    expect(response!.headers.get('content-length')).toBe(null)

    await expect(decompress(response!, 'gzip')).resolves.toContain(largeValue)
  })

  /**
   * The reason this plugin exists: `CompressionStream` cannot flush, so every message of a
   * streaming batch would sit in the compressor until the slowest subrequest resolved.
   */
  it('delivers each message as soon as it is produced, without waiting for the whole batch', async () => {
    const slow = promiseWithResolvers<string>()

    const handler = createHandler({}, {
      fast: os.handler(() => largeValue),
      slow: os.handler(() => slow.promise),
    })

    const { response } = await handler.handle(createBatchRequest('streaming', ['/fast', '/slow']))
    const reader = response!.body!.pipeThrough(new DecompressionStream('gzip')).getReader()
    const decoder = new TextDecoder()
    let received = ''

    const readUntil = async (text: string) => {
      while (!received.includes(text)) {
        const { done, value } = await reader.read()
        // A buffering compressor ends the stream (or stalls) before the fast message arrives
        expect(done).toBe(false)
        received += decoder.decode(value, { stream: true })
      }
    }

    await readUntil(largeValue)
    slow.resolve('slow-result')
    await readUntil('slow-result')
  })

  /**
   * Keep-alive frames hold the connection open while the remaining subrequests are pending, so a
   * compressor that buffered them would let the very connection they protect time out.
   */
  it('keeps sending keep-alive frames while the batch is idle', async () => {
    const pending = promiseWithResolvers<string>()

    const handler = new RPCHandler({ ping: os.handler(() => 'pong'), pending: os.handler(() => pending.promise) }, {
      plugins: [
        new BatchHandlerPlugin({ keepAlive: { enabled: true, interval: 20 } }),
        new BatchResponseCompressionHandlerPlugin(),
      ],
    })

    const { response } = await handler.handle(createBatchRequest('streaming', ['/ping', '/pending']))
    const reader = response!.body!.pipeThrough(new DecompressionStream('gzip')).getReader()
    let received = Buffer.alloc(0)

    const readAtLeast = async (length: number) => {
      while (received.byteLength < length) {
        const { done, value } = await reader.read()
        expect(done).toBe(false)
        received = Buffer.concat([received, value!])
      }
    }

    // The ping response frame, then two zero-length length-prefixed frames, four bytes each
    await readAtLeast(4)
    const messageEnd = 4 + received.readUInt32BE(0)
    await readAtLeast(messageEnd + 8)
    expect(received.subarray(messageEnd, messageEnd + 8)).toEqual(Buffer.alloc(8))

    pending.resolve('done')
    await reader.cancel()
  })

  it('compresses buffered batch responses that carry binary subresponses', async () => {
    const { response } = await createHandler().handle(createBatchRequest('buffered', ['/blob', '/ping']))

    expect(response!.status).toBe(207)
    expect(response!.headers.get('content-encoding')).toBe('gzip')
    expect(response!.headers.get('content-type')).toBe(BATCH_CONTENT_TYPE)
    expect(response!.headers.get('content-length')).toBe(null)
    // The blob is gone, so the client must be told the body is a stream rather than a file
    expect(response!.headers.get('standard-server')).toBe('octet-stream')
    expect(response!.headers.get('content-disposition')).toBe(null)

    await expect(decompress(response!, 'gzip')).resolves.toContain(largeValue)
  })

  /**
   * A json-only buffered batch is a plain array of messages rather than a framed body, and it is
   * still a batch response, so this plugin compresses it as json instead of leaving it behind.
   */
  it('compresses json-only buffered batch responses', async () => {
    const { response } = await createHandler().handle(createBatchRequest('buffered', ['/ping', '/ping']))

    expect(response!.status).toBe(207)
    expect(response!.headers.get('content-encoding')).toBe('gzip')
    // The client still has to parse json, so the body keeps the type and hint that says so
    expect(response!.headers.get('content-type')).toBe('application/json')
    expect(response!.headers.get('standard-server')).toBe(null)
    expect(response!.headers.get('content-length')).toBe(null)
    expect(response!.headers.get('vary')).toBe('accept-encoding')

    const decoded: unknown = JSON.parse(await decompress(response!, 'gzip'))
    expect(decoded).toHaveLength(2)
    expect(JSON.stringify(decoded)).toContain(largeValue)
  })

  // Each shape measures its own size, the binary one on the blob and the json one on its bytes
  it.each([
    ['with a binary subresponse', '/blob'],
    ['of json only', '/tiny'],
  ] as const)('leaves a buffered batch %s below the threshold alone', async (_case, url) => {
    const handler = createHandler({ threshold: 10 * 1024 }, {
      ...router,
      tiny: os.handler(() => 'ok'),
    })

    const { response } = await handler.handle(createBatchRequest('buffered', [url]))

    expect(response!.headers.get('content-encoding')).toBe(null)
  })

  /**
   * A batch that fails as a whole answers with a plain message rather than subresponses.
   */
  it('leaves a failed batch response alone', async () => {
    const { response } = await createHandler().handle(new Request('https://example.com/__batch__', {
      method: 'POST',
      headers: { 'accept-encoding': 'gzip', 'content-type': 'application/json', 'orpc-batch': 'streaming' },
      body: JSON.stringify({ not: 'an array of messages' }),
    }))

    expect(response!.status).toBe(400)
    expect(response!.headers.get('content-encoding')).toBe(null)
  })

  it('leaves responses that are not batch responses alone', async () => {
    const { response } = await createHandler().handle(new Request('https://example.com/ping', {
      method: 'POST',
      headers: { 'accept-encoding': 'gzip' },
    }))

    expect(response!.status).toBe(200)
    expect(response!.headers.get('content-encoding')).toBe(null)
    await expect(response!.text()).resolves.toContain(largeValue)
  })

  it('leaves a request that matched no procedure alone', async () => {
    const { matched, response } = await createHandler().handle(new Request('https://example.com/absent', {
      method: 'POST',
      headers: { 'accept-encoding': 'gzip' },
    }))

    expect(matched).toBe(false)
    expect(response).toBeUndefined()
  })

  it('leaves an invalid batch response alone', async () => {
    const handler = new RPCHandler(router, {
      plugins: [new BatchResponseCompressionHandlerPlugin({ threshold: 0 })],
      routingInterceptors: [async () => ({
        matched: true,
        response: { status: 200, headers: { 'content-type': BATCH_CONTENT_TYPE }, body: 'invalid' },
      })],
    })

    const { response } = await handler.handle(createBatchRequest('streaming', ['/ping']))

    expect(response!.headers.get('content-encoding')).toBe(null)
    await expect(response!.text()).resolves.toContain('invalid')
  })

  it('leaves non-batch responses alone even when they carry the batch content type', async () => {
    const handler = createHandler({}, {
      export: os.handler(() => new File([largeValue], 'export.batch', { type: BATCH_CONTENT_TYPE })),
    })

    const { response } = await handler.handle(new Request('https://example.com/export', {
      method: 'POST',
      headers: { 'accept-encoding': 'gzip' },
    }))

    expect(response!.headers.get('content-encoding')).toBe(null)
    expect(response!.headers.get('content-type')).toBe(BATCH_CONTENT_TYPE)
    expect(response!.headers.get('content-disposition')).toContain('export.batch')
    await expect(response!.text()).resolves.toBe(largeValue)
  })

  it('leaves a partial response alone', async () => {
    const contentRange = `bytes 0-${largeValue.length - 1}/${largeValue.length * 2}`

    const handler = new RPCHandler(router, {
      plugins: [new BatchResponseCompressionHandlerPlugin({ threshold: 0 })],
      routingInterceptors: [async () => ({
        matched: true,
        response: {
          status: 206,
          headers: { 'content-type': BATCH_CONTENT_TYPE, 'content-range': contentRange },
          body: new Blob([largeValue], { type: BATCH_CONTENT_TYPE }),
        },
      })],
    })

    const { response } = await handler.handle(createBatchRequest('streaming', ['/ping']))

    expect(response!.status).toBe(206)
    expect(response!.headers.get('content-encoding')).toBe(null)
    expect(response!.headers.get('content-range')).toBe(contentRange)
    await expect(response!.text()).resolves.toBe(largeValue)
  })

  describe('encoding negotiation', () => {
    it.each([
      ['gzip', 'gzip'],
      ['deflate', 'deflate'],
      ['deflate-raw', 'deflate-raw'],
      ['gzip;q=0, *', 'deflate'],
    ] as const)('given accept-encoding %s, compresses with %s', async (acceptEncoding, encoding) => {
      const handler = createHandler({ encodings: ['gzip', 'deflate', 'deflate-raw'] })

      const { response } = await handler.handle(createBatchRequest('streaming', ['/ping'], { 'accept-encoding': acceptEncoding }))

      expect(response!.headers.get('content-encoding')).toBe(encoding)
      await expect(decompress(response!, encoding)).resolves.toContain(largeValue)
    })

    it('prefers the first configured encoding the client accepts', async () => {
      const handler = createHandler({ encodings: ['deflate', 'gzip'] })

      const { response } = await handler.handle(createBatchRequest('streaming', ['/ping'], { 'accept-encoding': 'gzip, deflate' }))

      expect(response!.headers.get('content-encoding')).toBe('deflate')
    })

    it.each([
      ['the client accepts only an unsupported coding', { 'accept-encoding': 'br' }],
      ['the client rejects every configured coding', { 'accept-encoding': 'gzip;q=0, deflate;q=0' }],
      ['the client sends no accept-encoding', {}],
    ])('does not compress when %s', async (_case, headers) => {
      const { response } = await createHandler().handle(createBatchRequest('streaming', ['/ping'], headers))

      expect(response!.headers.get('content-encoding')).toBe(null)
      await expect(response!.text()).resolves.toContain(largeValue)
    })
  })

  it('appends to an existing vary header instead of replacing it', async () => {
    const handler = new RPCHandler(router, {
      plugins: [
        new BatchHandlerPlugin({ headers: { vary: 'origin' } }),
        new BatchResponseCompressionHandlerPlugin(),
      ],
    })

    const { response } = await handler.handle(createBatchRequest('streaming', ['/ping']))

    expect(response!.headers.get('vary')).toBe('origin, accept-encoding')
  })

  it('weakens a strong etag and drops accept-ranges on a compressed response', async () => {
    const handler = new RPCHandler(router, {
      plugins: [
        new BatchHandlerPlugin({ headers: { 'etag': '"abc"', 'accept-ranges': 'bytes' } }),
        new BatchResponseCompressionHandlerPlugin(),
      ],
    })

    const { response } = await handler.handle(createBatchRequest('streaming', ['/ping']))

    expect(response!.headers.get('content-encoding')).toBe('gzip')
    // A strong tag shared with the identity bytes would let If-Range splice them into compressed ones
    expect(response!.headers.get('etag')).toBe('W/"abc"')
    expect(response!.headers.has('accept-ranges')).toBe(false)
  })

  it('does not compress a body that is already encoded', async () => {
    const handler = new RPCHandler(router, {
      plugins: [
        new BatchHandlerPlugin(),
        // Runs first, so the batch response reaches the second one already compressed
        new BatchResponseCompressionHandlerPlugin(),
        new BatchResponseCompressionHandlerPlugin(),
      ],
    })

    const { response } = await handler.handle(createBatchRequest('streaming', ['/ping']))

    expect(response!.headers.get('content-encoding')).toBe('gzip')
    await expect(decompress(response!, 'gzip')).resolves.toContain(largeValue)
  })

  it('does not transform a body whose cache-control forbids it', async () => {
    const handler = new RPCHandler(router, {
      plugins: [
        new BatchHandlerPlugin({ headers: { 'cache-control': 'public, no-transform' } }),
        new BatchResponseCompressionHandlerPlugin(),
      ],
    })

    const { response } = await handler.handle(createBatchRequest('streaming', ['/ping']))

    expect(response!.headers.get('content-encoding')).toBe(null)
    await expect(response!.text()).resolves.toContain(largeValue)
  })

  it.each([
    ['batch compression first', () => [new BatchResponseCompressionHandlerPlugin(), new ResponseCompressionHandlerPlugin({ threshold: 0 })]],
    ['response compression first', () => [new ResponseCompressionHandlerPlugin({ threshold: 0 }), new BatchResponseCompressionHandlerPlugin()]],
  ] as const)('coexists with the response compression plugin, %s, without compressing twice', async (_case, createPlugins) => {
    const handler = new RPCHandler(router, {
      plugins: [new BatchHandlerPlugin(), ...createPlugins()],
    })

    const { response } = await handler.handle(createBatchRequest('streaming', ['/ping']))

    expect(response!.headers.get('content-encoding')).toBe('gzip')
    expect(response!.headers.get('vary')).toBe('accept-encoding')
    await expect(decompress(response!, 'gzip')).resolves.toContain(largeValue)
  })

  it('stops a batch cleanly when the client cancels mid-stream', async () => {
    const handler = createHandler({}, {
      fast: os.handler(() => largeValue),
      never: os.handler(({ signal }) => new Promise<string>((_, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason))
      })),
    })

    const { response } = await handler.handle(createBatchRequest('streaming', ['/fast', '/never']))

    const reader = response!.body!.getReader()
    const { value } = await reader.read()
    expect(value!.byteLength).toBeGreaterThan(0)

    await expect(reader.cancel()).resolves.toBeUndefined()
  })
})
