import type { StandardLinkOptions, StandardLinkPlugin, StandardLinkTransportInterceptor } from '../adapters/standard'
import type { ClientContext } from '../types'
import { toArray } from '@orpc/shared'
import { flattenStandardHeader } from '@standard-server/core'
import { toFetchHeaders, toStandardBody } from '@standard-server/fetch'

/**
 * Each coding adds a decompressor to the chain, so an unbounded list lets a tiny
 * response cost unbounded CPU and memory. Same limit as undici and curl.
 */
const MAX_CONTENT_ENCODINGS = 5

export interface ResponseCompressionLinkPluginOptions<_T extends ClientContext> {
  /**
   * Compression schemes to advertise via Accept-Encoding, in preference order.
   * Only schemes that can be decompressed by this plugin should be listed.
   *
   * @default ['gzip', 'deflate']
   */
  encodings?: readonly ('gzip' | 'deflate' | 'deflate-raw')[]
}

/**
 * Advertises Accept-Encoding on requests and decompresses response bodies
 * based on the Content-Encoding header. Works at the standard link level,
 * so it supports all adapters.
 *
 * @see {@link https://orpc.dev/docs/plugins/response-compression | Response Compression Plugin}
 */
export class ResponseCompressionLinkPlugin<T extends ClientContext> implements StandardLinkPlugin<T> {
  name = '~response-compression'

  /**
   * Decompression should wrap the final batch response instead of sub-responses.
   */
  after = ['~batch']

  private readonly encodings: Exclude<ResponseCompressionLinkPluginOptions<T>['encodings'], undefined>

  constructor(options: ResponseCompressionLinkPluginOptions<T> = {}) {
    this.encodings = options.encodings ?? ['gzip', 'deflate']
  }

  init(options: StandardLinkOptions<T>): StandardLinkOptions<T> {
    const acceptEncodingHeader = this.encodings.join(', ')

    const transportInterceptor: StandardLinkTransportInterceptor<T> = async ({ next, ...interceptorOptions }) => {
      const response = await next({
        ...interceptorOptions,
        request: {
          ...interceptorOptions.request,
          headers: {
            ...interceptorOptions.request.headers,
            'accept-encoding': acceptEncodingHeader,
          },
        },
      })

      const encodings = parseContentEncodings(
        flattenStandardHeader(response.headers['content-encoding']),
      )

      if (encodings.length === 0 || !encodings.every(isSupportedEncoding)) {
        return response
      }

      const decompressedHeaders = {
        ...response.headers,
        'content-length': undefined,
        'content-encoding': undefined,
      }

      return {
        ...response,
        headers: decompressedHeaders,
        async resolveBody(hint) {
          const stream = await response.resolveBody('octet-stream')

          // adapter might not support hint (e.g. peer adapter)
          if (!(stream instanceof ReadableStream)) {
            return stream
          }

          if (encodings.length > MAX_CONTENT_ENCODINGS) {
            throw new TypeError('Too many content encodings.')
          }

          let decompressedStream = stream
          for (let i = encodings.length - 1; i >= 0; i--) {
            decompressedStream = decompressedStream.pipeThrough(
              new DecompressionStream(encodings[i]!),
            )
          }

          const fetchResponse = new Response(decompressedStream, {
            headers: toFetchHeaders(decompressedHeaders),
          })

          return toStandardBody(fetchResponse, { hint })
        },
      }
    }

    return {
      ...options,
      transportInterceptors: [
        ...toArray(options.transportInterceptors),
        transportInterceptor,
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
