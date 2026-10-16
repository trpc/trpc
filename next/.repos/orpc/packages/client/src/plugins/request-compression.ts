import type { StandardBodyHint } from '@standard-server/core'
import type { StandardLinkOptions, StandardLinkPlugin, StandardLinkTransportInterceptor, StandardLinkTransportInterceptorOptions } from '../adapters/standard'
import type { ClientContext } from '../types'
import { isAsyncIteratorObject, isCompressibleContentType, stringifyJSON, toArray } from '@orpc/shared'
import { flattenStandardHeader, generateContentDisposition } from '@standard-server/core'

// Rough UTF-8 estimate. Mostly ASCII text stays close to 1 byte/char;
// occasional multi-byte characters increase the average.
const AVG_BYTES_PER_CHAR = 1.2

export interface RequestCompressionLinkPluginOptions<T extends ClientContext> {
  /**
   * The compression scheme to use for request compression.
   *
   * @default 'gzip'
   */
  encoding?: 'gzip' | 'deflate' | 'deflate-raw'

  /**
   * The minimum request size in bytes required to trigger compression.
   * Requests smaller than this threshold will not be compressed to avoid overhead.
   * If the request size cannot be determined, compression will still be applied.
   *
   * @default 1024 (1KB)
   */
  threshold?: number

  /**
   * Determines whether a request with the given Content-Type should be compressed.
   * Only consulted for binary transfers (streams, files, and file form-data parts).
   * Also receives the transport interceptor options for per-request decisions.
   *
   * @default isCompressibleContentType (covers common text-based formats)
   */
  isCompressibleContentType?: (contentType: string | null | undefined, options: StandardLinkTransportInterceptorOptions<T>) => boolean
}

/**
 * Compresses request bodies before sending them to the server,
 * reducing bandwidth usage for large payloads.
 *
 * @see {@link https://orpc.dev/docs/plugins/request-compression | Request Compression Plugin}
 */
export class RequestCompressionLinkPlugin<T extends ClientContext> implements StandardLinkPlugin<T> {
  name = '~request-compression'

  /**
   * Compression should be done after batching, to compress the final request
   */
  after = ['~batch']

  private readonly encoding: Exclude<RequestCompressionLinkPluginOptions<T>['encoding'], undefined>
  private readonly threshold: Exclude<RequestCompressionLinkPluginOptions<T>['threshold'], undefined>
  private readonly isCompressibleContentType: Exclude<RequestCompressionLinkPluginOptions<T>['isCompressibleContentType'], undefined>

  constructor(options: RequestCompressionLinkPluginOptions<T> = {}) {
    this.encoding = options.encoding ?? 'gzip'
    this.threshold = options.threshold ?? 1024
    this.isCompressibleContentType = options.isCompressibleContentType ?? isCompressibleContentType
  }

  init(options: StandardLinkOptions<T>): StandardLinkOptions<T> {
    const transportInterceptor: StandardLinkTransportInterceptor<T> = async ({ next, ...interceptorOptions }) => {
      const request = interceptorOptions.request

      const contentEncoding = flattenStandardHeader(request.headers['content-encoding'])?.trim()?.toLowerCase()
      if (contentEncoding !== undefined) { // already compressed, do not compress again
        return next()
      }

      if (request.body instanceof ReadableStream) {
        const contentLength = Number(flattenStandardHeader(request.headers['content-length']))

        if (
          (!Number.isFinite(contentLength) || contentLength >= this.threshold)
          && this.isCompressibleContentType(flattenStandardHeader(request.headers['content-type']), interceptorOptions)
        ) {
          const compressedStream = request.body.pipeThrough(new CompressionStream(this.encoding))

          return next({
            ...interceptorOptions,
            request: {
              ...interceptorOptions.request,
              body: compressedStream,
              headers: {
                ...request.headers,
                'standard-server': 'octet-stream' satisfies StandardBodyHint,
                'content-length': [],
                'content-encoding': this.encoding,
              },
            },
          })
        }
      }

      else if (request.body instanceof Blob) {
        if (
          (!Number.isFinite(request.body.size) || request.body.size >= this.threshold)
          && this.isCompressibleContentType(request.body.type, interceptorOptions)
        ) {
          const compressedStream = request.body.stream().pipeThrough(new CompressionStream(this.encoding))
          const contentDisposition = request.headers['content-disposition'] ?? generateContentDisposition(
            request.body instanceof File ? request.body.name : 'blob',
          )

          return next({
            ...interceptorOptions,
            request: {
              ...interceptorOptions.request,
              body: compressedStream,
              headers: {
                ...request.headers,
                'standard-server': 'file' satisfies StandardBodyHint,
                'content-type': request.body.type,
                'content-length': [],
                'content-disposition': contentDisposition,
                'content-encoding': this.encoding,
              },
            },
          })
        }
      }

      else if (request.body instanceof FormData) {
        const PART_OVERHEAD = 64 // approx bytes for boundary + Content-Disposition/Content-Type headers per part

        let contentLength = 0
        for (const [key, value] of request.body) {
          contentLength += PART_OVERHEAD + key.length

          if (value instanceof Blob) {
            if (!Number.isFinite(value.size)) { // Bun-s3 can use NaN for size
              if (!this.isCompressibleContentType(value.type, interceptorOptions)) {
                // Unknown non-compressible part size makes the estimate unreliable
                contentLength = -Infinity
                break
              }

              // Unknown size for compressible content - still apply compression
              contentLength = Infinity
            }
            else {
              contentLength += this.isCompressibleContentType(value.type, interceptorOptions)
                ? value.size
                : -value.size
            }
          }
          else {
            contentLength += value.length * AVG_BYTES_PER_CHAR
          }
        }

        if (contentLength >= this.threshold) {
          const res = new Response(request.body)
          const compressedStream = res.body!.pipeThrough(new CompressionStream(this.encoding))

          return next({
            ...interceptorOptions,
            request: {
              ...interceptorOptions.request,
              body: compressedStream,
              headers: {
                ...request.headers,
                'standard-server': [],
                'content-type': res.headers.get('content-type')!,
                'content-length': [],
                'content-encoding': this.encoding,
              },
            },
          })
        }
      }

      else if (request.body instanceof URLSearchParams) {
        const string = request.body.toString()
        if (string.length * AVG_BYTES_PER_CHAR >= this.threshold) {
          const compressedStream = new Blob([string]).stream().pipeThrough(new CompressionStream(this.encoding))
          return next({
            ...interceptorOptions,
            request: {
              ...interceptorOptions.request,
              body: compressedStream,
              headers: {
                ...request.headers,
                'standard-server': [],
                'content-type': 'application/x-www-form-urlencoded',
                'content-length': [],
                'content-encoding': this.encoding,
              },
            },
          })
        }
      }

      else if (request.body !== undefined && !isAsyncIteratorObject(request.body)) {
        const string = stringifyJSON(request.body)
        if (string.length * AVG_BYTES_PER_CHAR >= this.threshold) {
          const compressedStream = new Blob([string]).stream().pipeThrough(new CompressionStream(this.encoding))
          return next({
            ...interceptorOptions,
            request: {
              ...interceptorOptions.request,
              body: compressedStream,
              headers: {
                ...request.headers,
                'standard-server': [],
                'content-type': 'application/json',
                'content-length': [],
                'content-encoding': this.encoding,
              },
            },
          })
        }
      }

      return next()
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
