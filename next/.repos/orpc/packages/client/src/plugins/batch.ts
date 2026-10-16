import type { InterceptorOptions, Promisable, Value } from '@orpc/shared'
import type { StandardHeaders, StandardLazyResponse, StandardRequest, StandardUrl } from '@standard-server/core'
import type { ClientPeerSendMessage, ServerPeerSendMessage } from '@standard-server/peer'
import type { StandardLinkOptions, StandardLinkPlugin, StandardLinkTransportInterceptor, StandardLinkTransportInterceptorOptions } from '../adapters/standard'
import type { ClientContext } from '../types'
import { captureAsyncContext, defer, isAsyncIteratorObject, loadBytes, once, promiseWithResolvers, safeEncodeURIComponent, splitInHalf, stringifyJSON, toArray, value } from '@orpc/shared'
import { parseStandardUrl } from '@standard-server/core'
import { ClientPeer, decodePeerMessage, isServerPeerSendMessage } from '@standard-server/peer'

export type BatchLinkPluginMode = 'streaming' | 'buffered'

export interface BatchLinkPluginGroup<T extends ClientContext> {
  /**
   * Determines whether a request should be included in this batch group.
   * Requests will be evaluated against each group's condition in order,
   * and included in the first group whose condition returns true.
   * If no group's condition returns true, the request will not be batched.
   */
  condition: Value<boolean, [options: StandardLinkTransportInterceptorOptions<T>]>

  /**
   * The client context applied to requests in this batch group for the remainder of the link chain.
   */
  context: Value<T, [items: [StandardLinkTransportInterceptorOptions<T>, ...StandardLinkTransportInterceptorOptions<T>[]]]>

  /**
   * The path segments applied to requests in this batch group for the remainder of the link chain.
   *
   * @default []
   */
  path?: Value<string[], [items: [StandardLinkTransportInterceptorOptions<T>, ...StandardLinkTransportInterceptorOptions<T>[]]]>
}

export interface BatchLinkPluginOptions<T extends ClientContext> {
  groups: [BatchLinkPluginGroup<T>, ...BatchLinkPluginGroup<T>[]]

  /**
   * Filters requests to batch.
   *
   * @default () => true
   */
  filter?: Value<boolean, [options: StandardLinkTransportInterceptorOptions<T>]>

  /**
   * Only requests with the same scope are batched together.
   * On the server, return a value unique to the incoming request so different users never share a batch.
   *
   * @default () => undefined
   */
  scope?: (options: StandardLinkTransportInterceptorOptions<T>) => unknown

  /**
   * The maximum number of requests in the batch.
   *
   * @default 10
   */
  maxSize?: Value<Promisable<number>, [subOptionsList: [StandardLinkTransportInterceptorOptions<T>, ...StandardLinkTransportInterceptorOptions<T>[]]]>

  /**
   * How long (in ms) to wait for more requests before sending the batch,
   * counted from the first queued request.
   * With `0`, only requests made in the same event loop tick are batched.
   *
   * @default 0
   */
  wait?: number

  /**
   * The batch response mode.
   * A `buffered` batch still streams once a procedure in it returns a stream.
   *
   * @default 'streaming'
   */
  mode?: Value<BatchLinkPluginMode, [subOptionsList: [StandardLinkTransportInterceptorOptions<T>, ...StandardLinkTransportInterceptorOptions<T>[]]]>

  /**
   * URL for the batch request.
   *
   * @default URL of the first subrequest in the batch + '/__batch__'
   */
  url?: Value<Promisable<StandardUrl>, [subOptionsList: [StandardLinkTransportInterceptorOptions<T>, ...StandardLinkTransportInterceptorOptions<T>[]]]>

  /**
   * The maximum length of the URL that runtime supports,
   * if exceeded, the batch will be split into smaller batches and sent sequentially.
   *
   * This only applies to GET batch requests where the batch data is sent via URL query parameter.
   *
   * @default 2083
   */
  maxUrlLength?: Value<Promisable<number>, [subOptionsList: [StandardLinkTransportInterceptorOptions<T>, ...StandardLinkTransportInterceptorOptions<T>[]]]>

  /**
   * Headers used for the batch request.
   *
   * @default Common headers among all subrequests in the batch.
   */
  headers?: Value<Promisable<StandardHeaders>, [subOptionsList: [StandardLinkTransportInterceptorOptions<T>, ...StandardLinkTransportInterceptorOptions<T>[]]]>

  /**
   * Map each subrequest in the batch before it is sent.
   *
   * @default Removes headers that are duplicated with the batch headers
   */
  mapSubrequest?: (subOptions: StandardLinkTransportInterceptorOptions<T>, partialBatchRequest: Pick<StandardRequest, 'url' | 'headers'>) => StandardRequest

  /**
   * Maps each subresponse before returning the final response.
   *
   * @default Low-priority merges headers from the batch response into each subresponse.
   */
  mapSubresponse?: (subResponse: StandardLazyResponse, batchResponse: StandardLazyResponse, subOptions: StandardLinkTransportInterceptorOptions<T>) => StandardLazyResponse
}

/**
 * Combines multiple client requests into a single batch request
 * and splits the batch response back into individual responses.
 *
 * @remarks
 * **Note**: HTTP/2 and later already multiplex requests over a single connection, so this plugin is often less useful than it once was.
 *
 * @see {@link https://orpc.dev/docs/plugins/batch | Batch Plugin}
 */
export class BatchLinkPlugin<T extends ClientContext> implements StandardLinkPlugin<T> {
  name = '~batch'

  private readonly groups: BatchLinkPluginOptions<T>['groups']
  private readonly filter: Exclude<BatchLinkPluginOptions<T>['filter'], undefined>
  private readonly scope: Exclude<BatchLinkPluginOptions<T>['scope'], undefined>
  private readonly maxSize: Exclude<BatchLinkPluginOptions<T>['maxSize'], undefined>
  private readonly wait: Exclude<BatchLinkPluginOptions<T>['wait'], undefined>
  private readonly mode: Exclude<BatchLinkPluginOptions<T>['mode'], undefined>
  private readonly batchUrl: Exclude<BatchLinkPluginOptions<T>['url'], undefined>
  private readonly maxUrlLength: Exclude<BatchLinkPluginOptions<T>['maxUrlLength'], undefined>
  private readonly batchHeaders: Exclude<BatchLinkPluginOptions<T>['headers'], undefined>
  private readonly mapSubrequest: Exclude<BatchLinkPluginOptions<T>['mapSubrequest'], undefined>
  private readonly mapSubresponse: Exclude<BatchLinkPluginOptions<T>['mapSubresponse'], undefined>

  private readonly queue: Map<unknown, Map<BatchLinkPluginGroup<T>, BatchLinkPluginItem<T>[]>> = new Map()

  constructor(options: NoInfer<BatchLinkPluginOptions<T>>) {
    this.groups = options.groups
    this.filter = options.filter ?? (() => true)
    this.scope = options.scope ?? (() => undefined)
    this.maxSize = options.maxSize ?? 10
    this.wait = options.wait ?? 0
    this.mode = options.mode ?? 'streaming'
    this.batchUrl = options.url ?? ((options) => {
      const [pathname] = parseStandardUrl(options[0].request.url)
      return `${pathname}/__batch__`
    })
    this.maxUrlLength = options.maxUrlLength ?? 2083
    this.batchHeaders = options.headers ?? (async (options) => {
      const headersList = options.map(o => o.request.headers)
      const commonHeaders: StandardHeaders = {}
      for (const headers of headersList) {
        for (const key of Object.keys(headers)) {
          const value = headers[key]
          if (headersList.every(h => h[key] === value)) {
            commonHeaders[key] = value
          }
        }
      }

      return commonHeaders
    })
    this.mapSubrequest = options.mapSubrequest ?? (({ request }, { headers }) => {
      const subHeaders = { ...request.headers }
      for (const key of Object.keys(headers)) {
        const value = headers[key]
        if (subHeaders[key] === value) {
          subHeaders[key] = undefined
        }
      }

      return {
        ...request,
        headers: subHeaders,
      }
    })
    this.mapSubresponse = options.mapSubresponse ?? ((subResponse, batchResponse) => {
      return {
        ...subResponse,
        headers: {
          ...batchResponse.headers, // low-priority
          ...subResponse.headers,
        },
      }
    })
  }

  init(options: StandardLinkOptions<T>): StandardLinkOptions<T> {
    const transportInterceptor: StandardLinkTransportInterceptor<T> = async (interceptorOptions) => {
      const { body, signal } = interceptorOptions.request

      if (
        body instanceof Blob
        || body instanceof FormData
        || body instanceof ReadableStream
        || isAsyncIteratorObject(body)
        || signal?.aborted
        || !value(this.filter, interceptorOptions)
      ) {
        return interceptorOptions.next()
      }

      const group = this.groups.find(group => value(group.condition, interceptorOptions))

      if (!group) {
        return interceptorOptions.next()
      }

      const scope = this.scope(interceptorOptions)

      return new Promise((resolve, reject) => {
        // Schedule only for the first queued request, so later ones cannot extend or split the wait.
        if (!this.queue.size) {
          defer(() => this.processPendingBatches(), this.wait)
        }

        let groups = this.queue.get(scope)
        if (!groups) {
          groups = new Map()
          this.queue.set(scope, groups)
        }

        let queue = groups.get(group)
        if (!queue) {
          queue = []
          groups.set(group, queue)
        }

        queue.push([interceptorOptions, resolve, reject, captureAsyncContext()])
      })
    }

    return {
      ...options,
      transportInterceptors: [...toArray(options.transportInterceptors), transportInterceptor],
    }
  }

  private processPendingBatches(): void {
    const pending = [...this.queue.values()]
    this.queue.clear()

    for (const groups of pending) {
      for (const [group, items] of groups) {
        const getItems = items.filter(([options]) => options.request.method === 'GET')
        const queryItems = items.filter(([options]) => options.request.method === 'QUERY')
        const unsafeItems = items.filter(([options]) => options.request.method !== 'GET' && options.request.method !== 'QUERY')

        this.executeBatchInOwnContext('GET', group, getItems)
        this.executeBatchInOwnContext('QUERY', group, queryItems)
        this.executeBatchInOwnContext('POST', group, unsafeItems)
      }
    }
  }

  /**
   * Runs the batch in the async context of its first request instead of the timer's,
   * so the transport and batch options see that caller's request state.
   * `executeBatch` always runs in the context of its first request.
   */
  private async executeBatchInOwnContext(
    method: 'GET' | 'QUERY' | 'POST',
    group: BatchLinkPluginGroup<T>,
    groupItems: BatchLinkPluginItem<T>[],
  ): Promise<void> {
    await groupItems[0]?.[3](() => this.executeBatch(method, group, groupItems))
  }

  private async executeBatch(
    method: 'GET' | 'QUERY' | 'POST',
    group: BatchLinkPluginGroup<T>,
    groupItems: BatchLinkPluginItem<T>[],
  ): Promise<void> {
    try {
      if (groupItems.length === 1) {
        const [options, resolve, reject] = groupItems[0]!
        options.next().then(resolve).catch(reject)
        return
      }

      const subOptionsList = groupItems.map(([options]) => options) as [
        InterceptorOptions<StandardLinkTransportInterceptorOptions<T>, Promise<StandardLazyResponse>>,
        ...InterceptorOptions<StandardLinkTransportInterceptorOptions<T>, Promise<StandardLazyResponse>>[],
      ]

      const maxSize = await value(this.maxSize, subOptionsList)
      if (groupItems.length > maxSize) {
        const [first, second] = splitInHalf(groupItems)

        await Promise.all([
          this.executeBatch(method, group, first),
          this.executeBatchInOwnContext(method, group, second),
        ])

        return
      }

      const url = await value(this.batchUrl, subOptionsList)
      const headers = await value(this.batchHeaders, subOptionsList)
      const mode = value(this.mode, subOptionsList)
      let suppressErrorFromCurrentBatch = false

      const controller = new AbortController()
      const pendingMessages: ClientPeerSendMessage[] = []
      const subrequests = groupItems.map(([subOptions]) => this.mapSubrequest(subOptions, { url, headers }))
      let batchResponse: StandardLazyResponse
      let markRequestSent: (() => void) | undefined
      const openRequestIds = new Set<string>()
      const cancelledRunningRequestIds = new Set<string>()
      let isBatchSent = false

      const abortIfOnlyCancelledRemain = () => {
        if (openRequestIds.size === 0 && cancelledRunningRequestIds.size > 0) {
          controller.abort()
        }
      }

      const peer = new ClientPeer(async (message) => {
        pendingMessages.push(message)

        if (message.kind === 'request') {
          openRequestIds.add(message.id)
          markRequestSent?.()
        }
        else if (message.kind === 'cancel' && openRequestIds.delete(message.id) && isBatchSent) {
          cancelledRunningRequestIds.add(message.id)
          abortIfOnlyCancelledRemain()
        }
      })

      /**
       * Subrequests go to the peer one at a time, so a request message always belongs to the current one.
       * A subrequest aborted before the peer starts sending its request message sends nothing, not even a
       * cancel, so settling also ends the wait for it.
       */
      for (const [index, [subOptions, resolve, reject]] of groupItems.entries()) {
        const sent = promiseWithResolvers<void>()
        markRequestSent = sent.resolve

        peer
          .request(subrequests[index]!)
          .then(subResponse => resolve(this.mapSubresponse(subResponse, batchResponse, subOptions)))
          .catch((error) => {
            if (!suppressErrorFromCurrentBatch) {
              reject(error)
            }
          })
          .then(sent.resolve)

        await sent.promise
      }

      if (openRequestIds.size === 0) {
        return
      }

      isBatchSent = true

      /**
       * Leave out subrequests aborted before the batch is sent: the server counts their request and cancel
       * against its batch size limit and would still run calls the client already rejected.
       */
      const outgoingMessages = pendingMessages.filter(message => openRequestIds.has(message.id))

      try {
        const request: StandardRequest = {
          url,
          method,
          headers: { ...headers, 'orpc-batch': mode },
          signal: controller.signal,
        }

        if (method === 'GET') {
          const [pathname, search, hash] = parseStandardUrl(url)
          const dataParam = `data=${safeEncodeURIComponent(stringifyJSON(outgoingMessages))}`
          const newUrl: StandardUrl = search
            ? `${pathname}${search}&${dataParam}${hash ?? ''}`
            : `${pathname}?${dataParam}${hash ?? ''}`

          const maxUrlLength = await value(this.maxUrlLength, subOptionsList)
          if (newUrl.length > maxUrlLength) {
            const [first, second] = splitInHalf(groupItems)
            suppressErrorFromCurrentBatch = true

            await Promise.all([
              this.executeBatch(method, group, first),
              this.executeBatchInOwnContext(method, group, second),
              peer.close(),
            ])

            return
          }

          request.url = newUrl
        }
        else {
          request.body = outgoingMessages
        }

        batchResponse = await groupItems[0]![0]!.next({
          ...subOptionsList[0],
          context: value(group.context, subOptionsList) as T,
          path: value(group.path, subOptionsList) ?? [],
          request,
          signal: controller.signal,
        })

        /**
         * An error response is not a batch response, so forward it as-is to every subrequest
         * instead of failing to parse it.
         */
        if (batchResponse.status >= 400) {
          const resolveBody = once(() => batchResponse.resolveBody())
          const errorResponse: StandardLazyResponse = { ...batchResponse, resolveBody }

          groupItems.forEach(([subOptions, resolve]) => {
            resolve(this.mapSubresponse(errorResponse, batchResponse, subOptions))
          })

          suppressErrorFromCurrentBatch = true
          await peer.close()

          return
        }

        const body = await batchResponse.resolveBody()

        if (Array.isArray(body) && body.every(v => isServerPeerSendMessage(v))) {
          for (const message of body) {
            await peer.message(message)
          }
        }
        else if (body instanceof Blob) {
          await decodeLengthPrefixedBlob(body, peer)
        }
        else if (body instanceof ReadableStream) {
          await decodeLengthPrefixedStream(body, async (message) => {
            await peer.message(message)

            if (isLastServerMessage(message)) {
              openRequestIds.delete(message.id)
              cancelledRunningRequestIds.delete(message.id)
              abortIfOnlyCancelledRemain()
            }
          })
        }
        else {
          throw new TypeError('Invalid batch response format.')
        }

        await peer.close(new TypeError('Batch response is incomplete.'))
      }
      catch (error) {
        await peer.close(error)
      }
    }
    catch (error) {
      groupItems.forEach(([, , reject]) => reject(error))
    }
  }
}

type BatchLinkPluginItem<T extends ClientContext> = [
  options: InterceptorOptions<StandardLinkTransportInterceptorOptions<T>, Promise<StandardLazyResponse>>,
  resolve: (response: StandardLazyResponse) => void,
  reject: (e: unknown) => void,
  runInOwnContext: ReturnType<typeof captureAsyncContext>,
]

/**
 * Whether the server sends nothing more for the subrequest after this message.
 */
function isLastServerMessage(message: ServerPeerSendMessage): boolean {
  switch (message.kind) {
    case 'response':
      // A body-less response with a content type or body hint is followed by stream messages
      return message.json.body !== undefined
        || message.binary !== undefined
        || (message.json.headers?.['content-type'] === undefined && message.json.headers?.['standard-server'] === undefined)
    case 'event-stream':
      return message.json.event === 'close' || message.json.event === 'error'
    case 'octet-stream':
      return message.json.close === true
    case 'cancel':
      return true
    default:
      return false
  }
}

async function decodeLengthPrefixedBlob(blob: Blob, peer: ClientPeer): Promise<void> {
  const buffer = await loadBytes(blob)
  let offset = 0

  while (offset < buffer.length) {
    if (offset + 4 > buffer.length) {
      throw new TypeError('Invalid batch response: incomplete length header.')
    }

    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4)
    const length = view.getUint32(0, false)
    offset += 4

    if (offset + length > buffer.length) {
      throw new TypeError('Invalid batch response: incomplete message.')
    }

    const messageBytes = buffer.subarray(offset, offset + length)
    offset += length

    const result = decodePeerMessage(messageBytes)
    if (!result.matched || !isServerPeerSendMessage(result.message)) {
      throw new TypeError('Invalid batch response: invalid message.')
    }

    await peer.message(result.message)
  }
}

async function decodeLengthPrefixedStream(stream: ReadableStream<Uint8Array>, receive: (message: ServerPeerSendMessage) => Promise<void>): Promise<void> {
  const reader = stream.getReader()
  let buffer = new Uint8Array(0)

  try {
    while (true) {
      const { done, value: chunk } = await reader.read()

      if (chunk) {
        const newBuffer = new Uint8Array(buffer.length + chunk.length)
        newBuffer.set(buffer)
        newBuffer.set(chunk, buffer.length)
        buffer = newBuffer
      }

      while (buffer.length >= 4) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, 4)
        const length = view.getUint32(0, false)

        // Zero-length frame is a keep-alive ping; skip it.
        if (length === 0) {
          buffer = buffer.subarray(4)
          continue
        }

        if (buffer.length < 4 + length) {
          break
        }

        const messageBytes = buffer.subarray(4, 4 + length)
        buffer = buffer.subarray(4 + length)

        const result = decodePeerMessage(messageBytes)

        if (!result.matched || !isServerPeerSendMessage(result.message)) {
          throw new TypeError('Invalid batch response: invalid message.')
        }

        await receive(result.message)
      }

      if (done) {
        break
      }
    }
  }
  finally {
    reader.releaseLock()
  }
}
