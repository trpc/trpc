import type { BatchLinkPluginMode } from '@orpc/client/plugins'
import type { Promisable, Value } from '@orpc/shared'
import type { StandardHeaders, StandardLazyRequest, StandardResponse } from '@standard-server/core'
import type { ClientPeerSendMessage, ServerPeerSendMessage } from '@standard-server/peer'
import type { StandardHandlerOptions, StandardHandlerPlugin, StandardHandlerRoutingInterceptor, StandardHandlerRoutingInterceptorOptions } from '../adapters/standard'
import type { Context } from '../context'
import { ORPCError } from '@orpc/client'
import { isAsyncIteratorObject, promiseWithResolvers, toArray, value } from '@orpc/shared'
import { flattenStandardHeader, parseStandardUrl } from '@standard-server/core'
import { encodePeerMessage, isClientPeerSendMessage, ServerPeer } from '@standard-server/peer'

/**
 * Content type for batch responses that use the length-prefixed binary framing
 * (streaming mode, and buffered mode when any sub-response contains binary or is a stream).
 *
 * Decoding is driven by the `standard-server` body hint, not this header,
 * so it only serves to describe the payload to logs, proxies, and dev tools.
 */
export const BATCH_CONTENT_TYPE = 'application/vnd.orpc.batch'

const textEncoder = new TextEncoder()

function encodeLengthPrefix(length: number): Uint8Array<ArrayBuffer> {
  const prefix = new Uint8Array(4)
  new DataView(prefix.buffer).setUint32(0, length, false)
  return prefix
}

/**
 * Encodes a message as a length-prefixed frame: its 4-byte big-endian length, then its bytes.
 */
async function encodeFrame(message: ServerPeerSendMessage): Promise<Uint8Array<ArrayBuffer>[]> {
  const encoded = await encodePeerMessage(message)
  const bytes = typeof encoded === 'string' ? textEncoder.encode(encoded) : encoded

  return [encodeLengthPrefix(bytes.byteLength), bytes]
}

export interface BatchHandlerPluginOptions<T extends Context> {
  /**
   * The max size of the batch allowed.
   *
   * @default 10
   */
  maxSize?: Value<Promisable<number>, [options: StandardHandlerRoutingInterceptorOptions<T>]>

  /**
   * Map each subrequest in the batch before it is processed.
   *
   * @default merges the batch request headers into the subrequest, giving them priority over
   * the subrequest headers, and removes the `orpc-batch` header to prevent nested batching
   */
  mapSubrequest?: (subrequest: StandardLazyRequest, batchOptions: StandardHandlerRoutingInterceptorOptions<T>) => StandardLazyRequest

  /**
   * Success batch response status code.
   *
   * @default 207
   */
  successStatus?: Value<Promisable<number>, [batchOptions: StandardHandlerRoutingInterceptorOptions<T>]>

  /**
   * Success batch response headers.
   *
   * @default {}
   */
  headers?: Value<Promisable<StandardHeaders>, [batchOptions: StandardHandlerRoutingInterceptorOptions<T>]>

  /**
   * Keep-alive settings for streaming batch responses.
   *
   * When enabled, a zero-length length-prefixed frame is sent periodically while the
   * stream is idle (no message sent for `interval` ms). Clients ignore these frames.
   * Only applies to streaming responses: streaming mode, or a buffered batch with a stream sub-response.
   *
   * @default { enabled: true, interval: 15000 }
   */
  keepAlive?: undefined | {
    /**
     * If true, a keep-alive frame is sent periodically while the stream is idle.
     *
     * @default true
     */
    enabled: boolean
    /**
     * Interval (in milliseconds) between keep-alive frames after the last message.
     *
     * @default 15000
     */
    interval?: number
  }
}

/**
 * Handles batch requests sent by the client Batch Link Plugin, splitting each
 * batch into sub-requests and streaming their responses back together.
 *
 * @remarks
 * In buffered mode, the batch still streams once a sub-response is a stream
 * (an event iterator or a `ReadableStream`), since it may never end.
 *
 * **Note**: HTTP/2 and later already multiplex requests over a single connection, which often makes this plugin unnecessary.
 *
 * @see {@link https://orpc.dev/docs/plugins/batch | Batch Plugin}
 */
export class BatchHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  name = '~batch'

  /**
   * Run batch interceptors inside the tracing interceptors
   * so each subrequest gets its own span instead of sharing one batch-level span.
   */
  after = ['~tracing']

  private readonly maxSize: Exclude<BatchHandlerPluginOptions<T>['maxSize'], undefined>
  private readonly mapSubrequest: Exclude<BatchHandlerPluginOptions<T>['mapSubrequest'], undefined>
  private readonly successStatus: Exclude<BatchHandlerPluginOptions<T>['successStatus'], undefined>
  private readonly headers: Exclude<BatchHandlerPluginOptions<T>['headers'], undefined>
  private readonly keepAliveEnabled: boolean
  private readonly keepAliveInterval: number

  constructor(options: BatchHandlerPluginOptions<T> = {}) {
    this.maxSize = options.maxSize ?? 10

    this.mapSubrequest = options.mapSubrequest ?? ((subRequest, { request: batchRequest }) => ({
      ...subRequest,
      headers: {
        ...subRequest.headers,
        /**
         * The batch request headers win over the subrequest ones. They are the only ones the
         * transport actually saw, so headers the browser injects on its own, such as `cookie`
         * or `origin`, cannot be overridden by a subrequest, which is just request payload.
         */
        ...batchRequest.headers,
        'orpc-batch': undefined, // useful in case batch plugin is used multiple times
      },
    }))

    this.successStatus = options.successStatus ?? 207
    this.headers = options.headers ?? {}
    this.keepAliveEnabled = options.keepAlive?.enabled ?? true
    this.keepAliveInterval = options.keepAlive?.interval ?? 15_000
  }

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    const routingInterceptor: StandardHandlerRoutingInterceptor<T> = async (interceptorOptions) => {
      const batchHeader = flattenStandardHeader(interceptorOptions.request.headers['orpc-batch'])

      if (batchHeader === undefined) {
        return interceptorOptions.next()
      }

      const mode: BatchLinkPluginMode = batchHeader === 'buffered' ? 'buffered' : 'streaming'

      let messages: ClientPeerSendMessage[]

      try {
        if (interceptorOptions.request.method === 'GET') {
          const [, search] = parseStandardUrl(interceptorOptions.request.url)
          const params = new URLSearchParams(search)
          const data = params.getAll('data').at(-1)

          if (!data) {
            return {
              matched: true,
              response: { status: 400, headers: {}, body: 'Missing data parameter for batch request' },
            }
          }

          const mightBeMessages = JSON.parse(data)

          if (!Array.isArray(mightBeMessages) || mightBeMessages.some(m => !isClientPeerSendMessage(m))) {
            return {
              matched: true,
              response: { status: 400, headers: {}, body: 'Invalid batch request data parameter' },
            }
          }

          messages = mightBeMessages
        }
        else {
          const mightBeMessages = await interceptorOptions.request.resolveBody()

          if (!Array.isArray(mightBeMessages) || mightBeMessages.some(m => !isClientPeerSendMessage(m))) {
            return {
              matched: true,
              response: { status: 400, headers: {}, body: 'Invalid batch request body' },
            }
          }

          messages = mightBeMessages
        }
      }
      catch (error) {
        return {
          matched: true,
          response: {
            status: 400,
            headers: {},
            body: error instanceof ORPCError ? error.message : 'Invalid batch request',
          },
        }
      }

      const outerMethod = interceptorOptions.request.method
      if (
        (outerMethod === 'GET' || outerMethod === 'QUERY')
        && messages.some(message => message.kind === 'request' && message.json.method !== outerMethod)
      ) {
        return {
          matched: true,
          response: { status: 400, headers: {}, body: `${outerMethod} batch requests only accept ${outerMethod} sub-requests` },
        }
      }

      const maxSize = await value(this.maxSize, interceptorOptions)

      if (messages.length > maxSize) {
        return {
          matched: true,
          response: { status: 413, headers: {}, body: 'Batch request size exceeds the maximum allowed size' },
        }
      }

      const status = await value(this.successStatus, interceptorOptions)
      const headers = await value(this.headers, interceptorOptions)

      // Response messages are held here until the batch response starts streaming
      const bufferedMessages: ServerPeerSendMessage[] = []
      let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
      let keepAliveTimer: ReturnType<typeof setInterval> | undefined

      const clearKeepAlive = () => {
        if (keepAliveTimer !== undefined) {
          clearInterval(keepAliveTimer)
          keepAliveTimer = undefined
        }
      }

      const scheduleKeepAlive = () => {
        if (!this.keepAliveEnabled) {
          return
        }

        clearKeepAlive()
        keepAliveTimer = setInterval(() => {
          try {
            // Zero-length length-prefixed frame = keep-alive (ignored by clients)
            streamController!.enqueue(encodeLengthPrefix(0))
          }
          catch {
            // Stream may already be closed or errored.
            clearKeepAlive()
          }
        }, this.keepAliveInterval)
      }

      const enqueueMessage = async (message: ServerPeerSendMessage): Promise<void> => {
        for (const chunk of await encodeFrame(message)) {
          streamController!.enqueue(chunk)
        }
        scheduleKeepAlive() // reset idle timer
      }

      const peer = new ServerPeer(async (message) => {
        if (mode === 'streaming') {
          startStreaming()
        }

        if (streamController === undefined) {
          bufferedMessages.push(message)
        }
        else {
          await enqueueMessage(message)
        }
      })

      const streaming = promiseWithResolvers<{ body: ReadableStream<Uint8Array<ArrayBuffer>>, flushed: Promise<unknown> }>()

      /**
       * Opens the binary length-prefixed stream that every later message is written to,
       * starting with the messages buffered so far, which `flushed` waits for.
       *
       * A function declaration, since it and the peer above refer to each other.
       */
      function startStreaming() {
        if (streamController !== undefined) {
          return
        }

        const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
          start(controller) {
            streamController = controller
            scheduleKeepAlive()
          },
          async cancel(reason) {
            clearKeepAlive()
            await peer.close(reason)
          },
        })

        streaming.resolve({ body, flushed: Promise.all(bufferedMessages.splice(0).map(enqueueMessage)) })
      }

      const handleIndividualRequest = async (request: StandardLazyRequest): Promise<StandardResponse> => {
        try {
          request = this.mapSubrequest(request, interceptorOptions)
          const { matched, response } = await interceptorOptions.next({ ...interceptorOptions, request })

          if (!matched) {
            return { status: 404, headers: {}, body: 'No procedure matched' }
          }

          /**
           * A stream is meant to be read as it arrives and might never end, so buffering it would
           * hold back the whole batch. Start streaming before the peer sends its first message,
           * so none of that subresponse is buffered.
           */
          if (response.body instanceof ReadableStream || isAsyncIteratorObject(response.body)) {
            startStreaming()
          }

          return response
        }
        catch (err) {
          /**
           * Errors should not occur at the routing interceptor level.
           * Reject the promise so it can be handled by the unhandledRejection handler
           * for global logging or error handling.
           */
          Promise.reject(err)

          return { status: 500, headers: {}, body: 'Internal server error' }
        }
      }

      const runSubrequests = async (): Promise<void> => {
        const promise = Promise.all(messages.map(msg => peer.message(msg, handleIndividualRequest)))
        const signal = interceptorOptions.request.signal
        const closePeer = () => peer.close(signal?.reason)

        if (signal?.aborted) {
          closePeer()
        }

        signal?.addEventListener('abort', closePeer)

        try {
          await promise
        }
        finally {
          signal?.removeEventListener('abort', closePeer)
        }
      }

      const subrequests = runSubrequests()

      // Undefined when every subresponse finished before any turned out to be a stream
      const started = await Promise.race([streaming.promise, subrequests.then(() => undefined)])

      if (started === undefined) {
        await peer.close()

        if (bufferedMessages.some(msg => msg.binary !== undefined)) {
          const chunks = (await Promise.all(bufferedMessages.map(encodeFrame))).flat()

          return {
            matched: true,
            response: {
              status,
              headers,
              body: new Blob(chunks, { type: BATCH_CONTENT_TYPE }),
            },
          }
        }

        return {
          matched: true,
          response: { status, headers, body: bufferedMessages },
        }
      }

      // DO NOT await here to block streaming response
      Promise.all([started.flushed, subrequests])
        .then(async () => {
          clearKeepAlive()
          streamController!.close()
          await peer.close()
        })
        .catch(async (error) => {
          clearKeepAlive()
          streamController!.error(error)
          await peer.close(error)
        })

      return {
        matched: true,
        response: {
          status,
          headers: { ...headers, 'content-type': BATCH_CONTENT_TYPE },
          body: started.body,
        },
      }
    }

    return {
      ...options,
      routingInterceptors: [routingInterceptor, ...toArray(options.routingInterceptors)],
    }
  }
}
