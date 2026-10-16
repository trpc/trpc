import type { StandardHandlerOptions, StandardHandlerPlugin, StandardHandlerRoutingInterceptor } from '../adapters/standard'
import type { Context } from '../context'
import { ORPCError } from '@orpc/client'
import { toArray } from '@orpc/shared'
import { flattenStandardHeader } from '@standard-server/core'
import { toFetchHeaders, toStandardBody } from '@standard-server/fetch'

/**
 * Each coding adds a decompressor to the chain, so an unbounded list lets a tiny
 * request cost unbounded CPU and memory. Same limit as undici and curl.
 */
const MAX_CONTENT_ENCODINGS = 5

/**
 * Decompresses incoming request bodies based on the Content-Encoding header,
 * supporting gzip, deflate, and deflate-raw.
 *
 * @see {@link https://orpc.dev/docs/plugins/request-compression | Request Compression Plugin}
 */
export class RequestCompressionHandlerPlugin<T extends Context> implements StandardHandlerPlugin <T> {
  name = '~request-compression'

  /**
   * Should decompress the original batch request body instead of sub-requests.
   */
  after = ['~batch']

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    const routingInterceptor: StandardHandlerRoutingInterceptor<T> = async ({ next, ...interceptorOptions }) => {
      const encodings = parseContentEncodings(
        flattenStandardHeader(interceptorOptions.request.headers['content-encoding']),
      )

      if (encodings.length === 0 || !encodings.every(isSupportedEncoding)) {
        return next()
      }

      const decompressedHeaders = {
        ...interceptorOptions.request.headers,
        'content-length': undefined,
        'content-encoding': undefined,
      }

      return next({
        ...interceptorOptions,
        request: {
          ...interceptorOptions.request,
          headers: decompressedHeaders,
          async resolveBody(hint) {
            const stream = await interceptorOptions.request.resolveBody('octet-stream')

            // adapter might not support hint (e.g peer adapter)
            if (!(stream instanceof ReadableStream)) {
              return stream
            }

            if (encodings.length > MAX_CONTENT_ENCODINGS) {
              throw new ORPCError('UNSUPPORTED_MEDIA_TYPE', { message: 'Too many content encodings.' })
            }

            let decompressedStream = stream
            for (let i = encodings.length - 1; i >= 0; i--) {
              decompressedStream = decompressedStream.pipeThrough(
                new DecompressionStream(encodings[i]!),
              )
            }

            const response = new Response(decompressedStream, {
              headers: toFetchHeaders(decompressedHeaders),
            })

            return toStandardBody(response, { hint })
          },
        },
      })
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

const SUPPORTED_ENCODINGS = ['gzip', 'deflate', 'deflate-raw'] as const
type SupportedEncoding = (typeof SUPPORTED_ENCODINGS)[number]
function isSupportedEncoding(encoding: string): encoding is SupportedEncoding {
  return (SUPPORTED_ENCODINGS as readonly string[]).includes(encoding)
}

/**
 * Parse Content-Encoding into ordered codings (order applied).
 *
 * @see https://www.rfc-editor.org/rfc/rfc9110.html#name-content-encoding
 */
function parseContentEncodings(header: string | undefined): string[] {
  if (header === undefined) {
    return []
  }

  return header
    .split(',')
    .map(part => part.trim().toLowerCase())
}
