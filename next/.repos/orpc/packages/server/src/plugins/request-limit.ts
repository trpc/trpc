import type { StandardHandlerOptions, StandardHandlerPlugin, StandardHandlerRoutingInterceptor } from '../adapters/standard'
import type { Context } from '../context'
import { ORPCError } from '@orpc/client'
import { toArray } from '@orpc/shared'
import { flattenStandardHeader } from '@standard-server/core'
import { toFetchHeaders, toStandardBody } from '@standard-server/fetch'

export interface RequestLimitHandlerPluginOptions {
  /**
   * The maximum allowed request body size in bytes.
   */
  maxBodySize: number
}

/**
 * Rejects requests whose body exceeds `maxBodySize`.
 *
 * When used with the request compression plugin, the limit applies to the
 * decompressed payload rather than the compressed wire size.
 *
 * @see {@link https://orpc.dev/docs/plugins/request-limit | Request Limit Plugin}
 */
export class RequestLimitHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  name = '~request-limit'

  /**
   * Should limit the original batch request body instead of sub-requests.
   */
  after = ['~batch']

  /**
   * Should limit the final body size instead of the compressed one.
   */
  before = ['~request-compression']

  private readonly maxBodySize: number

  constructor(options: RequestLimitHandlerPluginOptions) {
    this.maxBodySize = options.maxBodySize
  }

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    const maxBodySize = this.maxBodySize

    const routingInterceptor: StandardHandlerRoutingInterceptor<T> = async ({ next, ...interceptorOptions }) => {
      return next({
        ...interceptorOptions,
        request: {
          ...interceptorOptions.request,
          async resolveBody(hint) {
            const contentLength = Number(
              flattenStandardHeader(interceptorOptions.request.headers['content-length']),
            )

            if (Number.isFinite(contentLength) && contentLength > maxBodySize) {
              throw new ORPCError('PAYLOAD_TOO_LARGE')
            }

            const stream = await interceptorOptions.request.resolveBody('octet-stream')

            // adapter might not support hint (e.g. peer adapter)
            if (!(stream instanceof ReadableStream)) {
              return stream
            }

            let currentBodySize = 0
            const limitedStream = stream.pipeThrough(
              new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                  currentBodySize += chunk.byteLength

                  if (currentBodySize > maxBodySize) {
                    controller.error(new ORPCError('PAYLOAD_TOO_LARGE'))
                    return
                  }

                  controller.enqueue(chunk)
                },
              }),
            )

            const response = new Response(limitedStream, {
              headers: toFetchHeaders(interceptorOptions.request.headers),
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
