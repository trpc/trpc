import type { Context } from '@orpc/server'
import type { StandardHandlerOptions, StandardHandlerPlugin, StandardHandlerRoutingInterceptor } from '@orpc/server/standard'
import type { StandardBodyHint, StandardHeaders } from '@standard-server/core'
import { Duplex } from 'node:stream'
import { constants, createDeflate, createDeflateRaw, createGzip } from 'node:zlib'
import { negotiateResponseCompressionEncoding, toCompressedHeaders } from '@orpc/server/plugins'
import { stringifyJSON, toArray } from '@orpc/shared'
import { flattenStandardHeader } from '@standard-server/core'

export interface BatchResponseCompressionHandlerPluginOptions {
  /**
   * The compression schemes to use for batch responses.
   * Schemes are prioritized by their order in this array and
   * only applied if the client supports them (via Accept-Encoding).
   *
   * @default ['gzip', 'deflate']
   */
  encodings?: readonly ('gzip' | 'deflate' | 'deflate-raw')[]

  /**
   * The minimum response size in bytes required to trigger compression.
   * Responses smaller than this threshold will not be compressed to avoid overhead.
   * A streaming batch response has no size until it ends, so it is always compressed.
   *
   * @default 1024 (1KB)
   */
  threshold?: number
}

/**
 * Compresses every successful [batch](https://orpc.dev/docs/plugins/batch) response, which the
 * runtime-agnostic {@link https://orpc.dev/docs/plugins/response-compression | Response Compression Plugin}
 * leaves untouched when framed: a batch frames subresponses of mixed content types, so its envelope
 * has none of its own and nothing says whether the contents compress. Registering this plugin
 * states that they do.
 *
 * @remarks
 * Each message is flushed as soon as it is produced, so a streaming batch stays streaming.
 * This is why the plugin lives in the Node.js package: `zlib` can flush mid-stream, while the
 * web `CompressionStream` cannot, and would hold every early message until the batch ends.
 *
 * @see {@link https://orpc.dev/docs/plugins/batch-response-compression | Batch Response Compression Plugin}
 */
export class BatchResponseCompressionHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  name = '~batch-response-compression'

  /**
   * Compression should be done after batching, to compress the assembled batch response
   * rather than each subresponse inside it.
   */
  after = ['~batch']

  private readonly encodings: Exclude<BatchResponseCompressionHandlerPluginOptions['encodings'], undefined>
  private readonly threshold: Exclude<BatchResponseCompressionHandlerPluginOptions['threshold'], undefined>

  constructor(options: BatchResponseCompressionHandlerPluginOptions = {}) {
    this.encodings = options.encodings ?? ['gzip', 'deflate']
    this.threshold = options.threshold ?? 1024
  }

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    const routingInterceptor: StandardHandlerRoutingInterceptor<T> = async ({ next, ...interceptorOptions }) => {
      const result = await next()

      if (!result.matched) {
        return result
      }

      /**
       * The batch plugin only engages on a request carrying this header, so a response framed like
       * a batch without it belongs to a procedure serving that content type itself, whose own file
       * semantics must survive untouched.
       */
      if (flattenStandardHeader(interceptorOptions.request.headers['orpc-batch']) === undefined) {
        return result
      }

      const response = result.response
      const headers = response.headers
      const body = response.body

      /**
       * A batch that failed as a whole answers with a plain message instead of subresponses,
       * so only a successful envelope is a batch payload worth compressing.
       */
      if (response.status >= 400) {
        return result
      }

      const encoding = negotiateResponseCompressionEncoding(response, interceptorOptions.request.headers, this.encodings)

      if (encoding === undefined) {
        return result
      }

      let stream: ReadableStream<Uint8Array<ArrayBuffer>>
      /**
       * A framed body is opaque bytes, while a json one still has to be parsed as json,
       * so each keeps the hint that tells the client how to read it.
       */
      let bodyHeaders: StandardHeaders

      /**
       * A buffered batch with no binary subresponse stays a plain array of messages, serialized
       * as json by the adapter. The header and status above already say this is a batch envelope,
       * so the array itself is the only thing left to recognise.
       */
      if (Array.isArray(body)) {
        const json = new Blob([stringifyJSON(body)])

        if (json.size < this.threshold) {
          return result
        }

        stream = json.stream()
        bodyHeaders = {
          // Serialized here rather than by the adapter, which no longer sees the array
          'content-type': 'application/json',
          'standard-server': [],
        }
      }
      // Every other batch body is the length-prefixed framing, buffered into a blob or streamed
      else if (body instanceof Blob) {
        if (Number.isFinite(body.size) && body.size < this.threshold) {
          return result
        }

        stream = body.stream()
        bodyHeaders = {
          /**
           * The blob is gone once it becomes a stream, so the type it carried is stated here. The
           * batch plugin puts it there rather than in the headers, because it builds the body
           * itself instead of leaving it to the adapter.
           */
          'content-type': body.type,
          'standard-server': 'octet-stream' satisfies StandardBodyHint,
        }
      }
      else if (body instanceof ReadableStream) {
        stream = body
        bodyHeaders = { 'standard-server': 'octet-stream' satisfies StandardBodyHint }
      }
      else {
        return result
      }

      return {
        ...result,
        response: {
          ...response,
          body: stream.pipeThrough(createFlushingCompressionStream(encoding)),
          headers: {
            ...toCompressedHeaders(headers, encoding),
            ...bodyHeaders,
          },
        },
      }
    }

    return {
      ...options,
      routingInterceptors: [
        routingInterceptor,
        ...toArray(options.routingInterceptors),
      ],
    }
  }
}

interface CompressionStreamPair {
  readable: ReadableStream<Uint8Array<ArrayBuffer>>
  writable: WritableStream<Uint8Array<ArrayBuffer>>
}

/**
 * A compressor that ends every write with a sync flush, so each batch message reaches the client
 * as soon as the batch produces it instead of waiting in the compressor for the batch to end.
 * The few bytes each flush costs are what keep a streaming batch streaming.
 */
function createFlushingCompressionStream(
  encoding: Exclude<BatchResponseCompressionHandlerPluginOptions['encodings'], undefined>[number],
): CompressionStreamPair {
  const zlibOptions = { flush: constants.Z_SYNC_FLUSH }

  const compressor = encoding === 'gzip'
    ? createGzip(zlibOptions)
    : encoding === 'deflate'
      ? createDeflate(zlibOptions)
      : createDeflateRaw(zlibOptions)

  return Duplex.toWeb(compressor) as CompressionStreamPair
}
