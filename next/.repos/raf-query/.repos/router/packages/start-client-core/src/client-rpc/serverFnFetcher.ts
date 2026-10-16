import {
  encode,
  invariant,
  isNotFound,
  parseRedirect,
} from '@tanstack/router-core'
import { createRawStreamDeserializePlugin } from '@tanstack/router-core/ssr/client'
import { fromCrossJSON, toJSONAsync } from 'seroval'
import { getDefaultSerovalPlugins } from '../getDefaultSerovalPlugins'
import {
  TSS_CONTENT_TYPE_FRAMED,
  TSS_FORMDATA_CONTEXT,
  TSS_FRAMED_PROTOCOL_VERSION,
  X_TSS_RAW_RESPONSE,
  X_TSS_SERIALIZED,
} from '../constants'
import { createFrameDecoder } from './frame-decoder'
import type { FunctionMiddlewareClientFnOptions } from '../createMiddleware'
import type { Plugin as SerovalPlugin } from 'seroval'

let serovalPlugins: Array<SerovalPlugin<any, any>> | undefined

/**
 * Current async post-processing context for deserialization.
 *
 * Some deserializers need to perform async work after synchronous deserialization
 * (e.g., decoding RSC payloads, fetching remote data). This context allows them
 * to register promises that must complete before the deserialized value is used.
 *
 * This uses a synchronous execution context pattern:
 * - Each call to `fromCrossJSON` is synchronous
 * - Within that synchronous execution, all `fromSerializable` calls happen
 * - We set the context before `fromCrossJSON`, then clear it afterward
 *
 * Even with concurrent server function calls, each individual deserialization
 * is atomic (synchronous), so promises are correctly scoped to their call.
 */
let currentPostProcessContext: Array<Promise<unknown>> | null = null

/**
 * Track an async post-processing promise in the current deserialization context.
 * Called by deserializers that need to perform async work after sync deserialization.
 *
 * If no context is active (e.g., on server), this is a no-op.
 *
 * @param promise - The async work promise to track
 */
export function trackPostProcessPromise(promise: Promise<unknown>): void {
  if (currentPostProcessContext) {
    currentPostProcessContext.push(promise)
  }
}

function deserialize(
  value: any,
  options: {
    refs?: Map<any, any>
    plugins: Array<SerovalPlugin<any, any>>
  },
  promises: Array<Promise<unknown>>,
) {
  currentPostProcessContext = promises
  try {
    return fromCrossJSON(value, options)
  } catch (error) {
    observePostProcessPromises(promises)
    throw error
  } finally {
    currentPostProcessContext = null
  }
}

/**
 * Helper to await all post-processing promises.
 * Uses Promise.allSettled to ensure all promises complete even if some reject.
 */
async function awaitPostProcessPromises(
  promises: Array<Promise<unknown>>,
): Promise<void> {
  if (promises.length > 0) {
    await Promise.allSettled(promises)
    promises.length = 0
  }
}

function observePostProcessPromises(promises: Array<Promise<unknown>>): void {
  for (const promise of promises) {
    void promise.catch(() => {})
  }
  promises.length = 0
}

/**
 * Checks if an object has at least one own enumerable property.
 * More efficient than Object.keys(obj).length > 0 as it short-circuits on first property.
 */
const hop = Object.prototype.hasOwnProperty
function hasOwnProperties(obj: object): boolean {
  for (const _ in obj) {
    if (hop.call(obj, _)) {
      return true
    }
  }
  return false
}
// caller =>
//   serverFnFetcher =>
//     client =>
//       server =>
//         fn =>
//       seroval =>
//     client middleware =>
//   serverFnFetcher =>
// caller

export async function serverFnFetcher(
  url: string,
  args: Array<any>,
  handler: (url: string, requestInit: RequestInit) => Promise<Response>,
) {
  if (!serovalPlugins) {
    serovalPlugins = getDefaultSerovalPlugins()
  }
  const first = args[0] as FunctionMiddlewareClientFnOptions<any, any, any> & {
    headers?: HeadersInit
  }

  // Use custom fetch if provided, otherwise fall back to the passed handler (global fetch)
  const fetchImpl = first.fetch ?? handler

  const isFormData = first.data instanceof FormData

  // Arrange the headers
  const headers = new Headers(first.headers)
  headers.set('x-tsr-serverFn', 'true')

  if (!isFormData) {
    headers.set(
      'accept',
      `${TSS_CONTENT_TYPE_FRAMED}, application/x-ndjson, application/json`,
    )
  }

  // If the method is GET, we need to move the payload to the query string
  if (first.method === 'GET') {
    if (isFormData) {
      throw new Error('FormData is not supported with GET requests')
    }
    const serializedPayload = await serializePayload(first)
    if (serializedPayload !== undefined) {
      const encodedPayload = encode({
        payload: serializedPayload,
      })
      if (url.includes('?')) {
        url += `&${encodedPayload}`
      } else {
        url += `?${encodedPayload}`
      }
    }
  }

  let body = undefined
  if (first.method === 'POST') {
    body = await getFetchBody(first)
    if (typeof body === 'string') {
      headers.set('content-type', 'application/json')
    }
  }

  return getResponse(() =>
    fetchImpl(url, {
      method: first.method,
      headers,
      signal: first.signal,
      body,
    }),
  )
}

async function serializePayload(
  opts: FunctionMiddlewareClientFnOptions<any, any, any>,
): Promise<string | undefined> {
  let payload: any
  if (opts.data !== undefined) {
    payload = { data: opts.data }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (opts.context && hasOwnProperties(opts.context)) {
    ;(payload ??= {}).context = opts.context
  }

  return payload ? serialize(payload, opts.signal) : undefined
}

async function serialize(data: any, signal?: AbortSignal) {
  signal?.throwIfAborted()
  let value
  try {
    value = await toJSONAsync(data, {
      plugins: signal ? getDefaultSerovalPlugins(signal) : serovalPlugins!,
    })
  } finally {
    signal?.throwIfAborted()
  }
  return JSON.stringify(value)
}

async function getFetchBody(
  opts: FunctionMiddlewareClientFnOptions<any, any, any>,
): Promise<FormData | string | undefined> {
  if (opts.data instanceof FormData) {
    let serializedContext = undefined
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (opts.context && hasOwnProperties(opts.context)) {
      serializedContext = await serialize(opts.context, opts.signal)
    }
    if (serializedContext !== undefined) {
      opts.data.set(TSS_FORMDATA_CONTEXT, serializedContext)
    }
    return opts.data
  }
  return serializePayload(opts)
}

/**
 * Retrieves a response from a given function and manages potential errors
 * and special response types including redirects and not found errors.
 *
 * @param fn - The function to execute for obtaining the response.
 * @returns The processed response from the function.
 * @throws If the response is invalid or an error occurs during processing.
 */
async function getResponse(fn: () => Promise<Response>) {
  let response: Response
  try {
    response = await fn() // client => server => fn => server => client
  } catch (error) {
    if (error instanceof Response) {
      response = error
    } else {
      throw error
    }
  }

  if (response.headers.get(X_TSS_RAW_RESPONSE) === 'true') {
    return response
  }

  const contentType = response.headers.get('content-type')
  if (!contentType) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'Invariant failed: expected content-type header to be set',
      )
    }

    invariant()
  }
  const serializedByStart = !!response.headers.get(X_TSS_SERIALIZED)

  // If the response is serialized by the start server, we need to process it
  // differently than a normal response.
  if (serializedByStart) {
    let result

    // If it's a framed response (contains RawStream), use frame decoder
    if (contentType.includes(TSS_CONTENT_TYPE_FRAMED)) {
      // A server without a version parameter predates versioning.
      const version = /;\s*v=(\d+)/.exec(contentType)?.[1]
      if (version && +version !== TSS_FRAMED_PROTOCOL_VERSION) {
        throw new Error(`Unsupported framed protocol version ${version}`)
      }
      if (!response.body) {
        throw new Error('No response body for framed response')
      }

      const [chunks, getStream] = createFrameDecoder(response.body)

      // Create deserialize plugin that wires up the raw streams
      const rawStreamPlugin = createRawStreamDeserializePlugin(getStream)
      const plugins = [rawStreamPlugin, ...serovalPlugins!]

      result = await processFramedResponse(chunks, plugins)
    }
    // If it's a JSON response, it can be simpler
    else if (contentType.includes('application/json')) {
      const jsonPayload = await response.json()
      // Track async post-processing work for this deserialization
      const postProcessPromises: Array<Promise<unknown>> = []
      result = deserialize(
        jsonPayload,
        { plugins: serovalPlugins! },
        postProcessPromises,
      )
      // Await any async post-processing before returning
      await awaitPostProcessPromises(postProcessPromises)
    }

    if (!result) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error('Invariant failed: expected result to be resolved')
      }

      invariant()
    }
    if (result instanceof Error) {
      throw result
    }

    return result
  }

  // If it wasn't processed by the start serializer, check
  // if it's JSON
  if (contentType.includes('application/json')) {
    const jsonPayload = await response.json()
    const redirect = parseRedirect(jsonPayload)
    if (redirect) {
      throw redirect
    }
    if (isNotFound(jsonPayload)) {
      throw jsonPayload
    }
    return jsonPayload
  }

  // Otherwise, if it's not OK, throw the content
  if (!response.ok) {
    throw new Error(await response.text())
  }

  // Or return the response itself
  return response
}

/** Processes the complete JSON values emitted by the frame decoder. */
async function processFramedResponse(
  jsonStream: ReadableStream<string>,
  plugins: Array<SerovalPlugin<any, any>>,
) {
  const reader = jsonStream.getReader()
  const options = { refs: new Map(), plugins }

  // TODO: promises and streams that Seroval created from earlier records stay
  // pending after a transport failure. Rejecting them needs a Seroval API for
  // aborting a cross-JSON deserialization session; do not reach into
  // Seroval's refs to do it here.
  const fail = (error: unknown) => {
    void reader.cancel(error).catch(() => {})
  }

  let result: any
  const initialPostProcessPromises: Array<Promise<unknown>> = []
  try {
    const first = await reader.read()
    if (first.done) {
      throw new Error('Stream ended before first object')
    }

    result = deserialize(
      JSON.parse(first.value),
      options,
      initialPostProcessPromises,
    )
  } catch (error) {
    fail(error)
    reader.releaseLock()
    throw error
  }

  // Keep consuming patches before awaiting root post-processing: that work may
  // itself depend on raw frames which follow later JSON frames on the wire.
  void (async () => {
    const postProcessPromises: Array<Promise<unknown>> = []
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) {
          return
        }

        deserialize(JSON.parse(next.value), options, postProcessPromises)
        // Later patches publish their promise/stream values synchronously.
        // Observe auxiliary work without blocking frames those values need.
        observePostProcessPromises(postProcessPromises)
      }
    } catch (error) {
      fail(error)
      console.error('Stream processing error:', error)
    } finally {
      reader.releaseLock()
    }
  })()

  await awaitPostProcessPromises(initialPostProcessPromises)

  return result
}
