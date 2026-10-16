import { invariant, isNotFound, isRedirect } from '@tanstack/router-core'
import {
  createRawStreamRPCPlugin,
  defaultSerovalDeserializerPlugins as routerDefaultSerovalPlugins,
} from '@tanstack/router-core/ssr/server'
import {
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  TSS_FORMDATA_CONTEXT,
  X_TSS_RAW_RESPONSE,
  X_TSS_SERIALIZED,
  getSerovalPlugins,
  safeObjectMerge,
} from '@tanstack/start-client-core'
import {
  MAX_FRAMED_STREAMS,
  MAX_FRAME_PAYLOAD_SIZE,
} from '@tanstack/start-client-core/client-rpc'
import { fromJSON, toCrossJSONAsync, toCrossJSONStream } from 'seroval'
import { getResponse } from './request-response'
import { getServerFnById } from './getServerFnById'
import { createMultiplexedStream } from './frame-protocol'
import type {
  LateStreamRegistration,
  MultiplexedStreamOptions,
  MultiplexedStreamRecord,
} from './frame-protocol'
import type { Plugin as SerovalPlugin } from 'seroval'

// Cache serovalPlugins at module level to avoid repeated calls
let serovalPlugins: Array<SerovalPlugin<any, any>> | undefined = undefined

// Known FormData 'Content-Type' header values - module-level constant
const FORM_DATA_CONTENT_TYPES = [
  'multipart/form-data',
  'application/x-www-form-urlencoded',
]

// Maximum payload size for GET requests (1MB)
const MAX_PAYLOAD_SIZE = 1_000_000
const MAX_PENDING_SERIALIZATION_RECORDS = 1024
const MAX_PENDING_SERIALIZATION_BYTES = 32 * 1024 * 1024
const textEncoder = new TextEncoder()

function encodeSerializationRecord(value: unknown) {
  return textEncoder.encode(JSON.stringify(value))
}

function exceedsPendingSerializationLimit(
  record: Uint8Array,
  recordCount: number,
  pendingBytes: number,
) {
  return (
    recordCount >= MAX_PENDING_SERIALIZATION_RECORDS ||
    pendingBytes + record.byteLength > MAX_PENDING_SERIALIZATION_BYTES
  )
}

function runSerializationCleanup(dispose: () => void) {
  try {
    dispose()
  } catch {}
}

function cancelRawStream(stream: ReadableStream<Uint8Array>, reason?: unknown) {
  void stream.cancel(reason).catch(() => {})
}

export const handleServerAction = async ({
  request,
  context,
  serverFnId,
}: {
  request: Request
  context: any
  serverFnId: string
}) => {
  const methodUpper = request.method.toUpperCase()
  const url = new URL(request.url)

  const action = await getServerFnById(serverFnId, { origin: 'client' })

  // Early method check: reject mismatched HTTP methods before parsing
  // the request payload (FormData, JSON, query string, etc.)
  if (action.method && methodUpper !== action.method) {
    return new Response(
      `expected ${action.method} method. Got ${methodUpper}`,
      {
        status: 405,
        headers: {
          Allow: action.method,
        },
      },
    )
  }

  const isServerFn = request.headers.get('x-tsr-serverFn') === 'true'
  // Initialize serovalPlugins lazily (cached at module level)
  serovalPlugins ??= getSerovalPlugins(routerDefaultSerovalPlugins)
  const contentType = request.headers.get('Content-Type')

  try {
    let res: any
    if (
      FORM_DATA_CONTENT_TYPES.some(
        (type) => contentType && contentType.includes(type),
      )
    ) {
      // We don't support GET requests with FormData payloads... that seems impossible
      if (methodUpper === 'GET') {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            'Invariant failed: GET requests with FormData payloads are not supported',
          )
        }

        invariant()
      }
      const formData = await request.formData()
      const serializedContext = formData.get(TSS_FORMDATA_CONTEXT)
      formData.delete(TSS_FORMDATA_CONTEXT)

      const params = {
        context,
        data: formData,
        method: methodUpper,
      }
      if (typeof serializedContext === 'string') {
        try {
          const parsedContext = JSON.parse(serializedContext)
          const deserializedContext = fromJSON(parsedContext, {
            plugins: serovalPlugins,
          })
          if (typeof deserializedContext === 'object' && deserializedContext) {
            params.context = safeObjectMerge(
              deserializedContext as Record<string, unknown>,
              context,
            )
          }
        } catch (e) {
          // Log warning for debugging but don't expose to client
          if (process.env.NODE_ENV === 'development') {
            console.warn('Failed to parse FormData context:', e)
          }
        }
      }

      res = await action(params)
    } else if (methodUpper === 'GET') {
      // Get payload directly from searchParams
      const payloadParam = url.searchParams.get('payload')
      // Reject oversized payloads to prevent DoS
      if (payloadParam && payloadParam.length > MAX_PAYLOAD_SIZE) {
        throw new Error('Payload too large')
      }
      const payload: any = payloadParam
        ? fromJSON(JSON.parse(payloadParam), { plugins: serovalPlugins })
        : undefined
      res = await action({
        data: payload?.data,
        context: safeObjectMerge(payload?.context, context),
        method: methodUpper,
      })
    } else {
      const payload: any = contentType?.includes('application/json')
        ? fromJSON(await request.json(), { plugins: serovalPlugins })
        : undefined
      res = await action({
        data: payload?.data,
        context: safeObjectMerge(payload?.context, context),
        method: methodUpper,
      })
    }

    const unwrapped = res.error !== undefined ? res.error : res.result

    if (isNotFound(res)) {
      res = isNotFoundResponse(res)
    }

    if (
      !isServerFn &&
      (unwrapped instanceof Response ||
        unwrapped === null ||
        typeof unwrapped !== 'object')
    ) {
      return unwrapped
    }

    if (unwrapped instanceof Response) {
      if (isRedirect(unwrapped)) {
        return unwrapped
      }
      unwrapped.headers.set(X_TSS_RAW_RESPONSE, 'true')
      return unwrapped
    }

    return serializeResult(res, request.signal, serovalPlugins)
  } catch (error: any) {
    if (error instanceof Response) {
      return error
    }

    // Currently this server-side context has no idea how to
    // build final URLs, so we need to defer that to the client.
    // The client will check for __redirect and __notFound keys,
    // and if they exist, it will handle them appropriately.

    if (isNotFound(error)) {
      return isNotFoundResponse(error)
    }

    console.error('Server Fn Error!', error)

    const serializedError = JSON.stringify(
      await toCrossJSONAsync(error, {
        refs: new Map(),
        plugins: serovalPlugins,
      }),
    )
    const response = getResponse()
    const headers = {
      'Content-Type': 'application/json',
      [X_TSS_SERIALIZED]: 'true',
    }
    try {
      return new Response(serializedError, {
        status: response.status ?? 500,
        statusText: response.statusText,
        headers,
      })
    } catch {
      return new Response(serializedError, {
        status: 500,
        statusText: '',
        headers,
      })
    }
  }
}

/**
 * Serializes a server-function result. A result that Seroval completes
 * synchronously without RawStreams becomes plain JSON; everything else is a
 * framed response whose records and raw streams are multiplexed in order.
 */
function serializeResult(
  res: unknown,
  signal: AbortSignal,
  plugins: Array<SerovalPlugin<any, any>>,
): Response {
  const alsResponse = getResponse()
  const initialRecords: Array<Uint8Array> = []
  let initialBytes = 0
  const pendingRawStreams: Array<LateStreamRegistration> = []

  // Seroval replays synchronously discovered work before returning. Collect
  // that first pass so a complete result can skip framing entirely.
  let done = false as boolean
  let initialParsed = false
  let serializationFailure: [unknown] | undefined
  let disposeSerialization: (() => void) | undefined
  let onParse = (value: any, initial: boolean) => {
    if (serializationFailure) {
      return
    }
    initialParsed ||= initial
    const record = encodeSerializationRecord(value)
    if (
      exceedsPendingSerializationLimit(
        record,
        initialRecords.length,
        initialBytes,
      )
    ) {
      serializationFailure = [
        new Error(
          'Server function serialization exceeded its pending output limit',
        ),
      ]
      return
    }
    initialRecords.push(record)
    initialBytes += record.byteLength
  }
  let onDone = () => {
    if (initialParsed) {
      done = true
    }
  }
  let onError = (error: any) => {
    serializationFailure ??= [error]
  }
  const rawStreamPlugin = createRawStreamRPCPlugin(
    (id: number, stream: ReadableStream<Uint8Array>) => {
      if (serializationFailure) {
        cancelRawStream(stream, serializationFailure[0])
        return
      }
      if (id > MAX_FRAMED_STREAMS) {
        const error = new Error(
          `Too many raw streams in framed response (max ${MAX_FRAMED_STREAMS})`,
        )
        cancelRawStream(stream, error)
        onError(error)
        return
      }
      pendingRawStreams.push({ id, stream })
    },
  )

  const dispose = toCrossJSONStream(res, {
    refs: new Map(),
    plugins: [rawStreamPlugin, ...plugins],
    onParse(value, initial) {
      onParse(value, initial)
    },
    onDone() {
      onDone()
    },
    onError: (error) => {
      onError(error)
    },
  })
  if (serializationFailure) {
    runSerializationCleanup(dispose)
    for (const registration of pendingRawStreams) {
      cancelRawStream(registration.stream, serializationFailure[0])
    }
    throw serializationFailure[0]
  }
  if (!done) {
    disposeSerialization = dispose
  }

  if (done && pendingRawStreams.length === 0 && initialRecords.length === 1) {
    // TextEncoder always creates an ArrayBuffer-backed Uint8Array.
    return new Response(initialRecords[0]! as BodyInit, {
      status: alsResponse.status,
      statusText: alsResponse.statusText,
      headers: {
        'Content-Type': 'application/json',
        [X_TSS_SERIALIZED]: 'true',
      },
    })
  }

  if (done && initialRecords.length === 1) {
    const json = initialRecords[0]!
    if (json.byteLength > MAX_FRAME_PAYLOAD_SIZE) {
      const error = new Error(
        'Server function serialization exceeded its pending output limit',
      )
      for (const registration of pendingRawStreams) {
        cancelRawStream(registration.stream, error)
      }
      throw error
    }

    // Serialization is complete, so this one bounded record needs no writer
    // or pending-serialization lifecycle. The mux still controls raw demand.
    const rawStreams = pendingRawStreams.splice(0)
    initialRecords.length = 0
    return createFramedResponse(
      new ReadableStream<MultiplexedStreamRecord>({
        start(controller) {
          controller.enqueue({ json, rawStreams })
          controller.close()
        },
        cancel(reason) {
          for (const registration of rawStreams) {
            cancelRawStream(registration.stream, reason)
          }
        },
      }),
      { signal },
    )
  }

  // Couple every JSON patch to the RawStreams it introduces. The mux admits
  // each JSON reference before it starts that stream's chunks.
  const { readable, writable } = new TransformStream<MultiplexedStreamRecord>()
  const writer = writable.getWriter()
  const recordAbortController = new AbortController()
  let pendingBytes = 0
  const pendingRecords = new Set<MultiplexedStreamRecord>()

  const abortRecordStream = (error: unknown) => {
    if (serializationFailure) {
      return
    }
    serializationFailure = [error]
    const disposeCurrentSerialization = disposeSerialization
    disposeSerialization = undefined
    for (const registration of pendingRawStreams.splice(0)) {
      cancelRawStream(registration.stream, error)
    }
    for (const record of pendingRecords) {
      for (const registration of record.rawStreams) {
        cancelRawStream(registration.stream, error)
      }
    }
    pendingRecords.clear()
    recordAbortController.abort(error)
    void writer.abort(error).catch(() => {})
    if (disposeCurrentSerialization) {
      runSerializationCleanup(disposeCurrentSerialization)
    }
  }

  const writeRecord = (
    json: Uint8Array,
    rawStreams: Array<LateStreamRegistration>,
  ) => {
    if (serializationFailure) {
      for (const registration of rawStreams) {
        cancelRawStream(registration.stream, serializationFailure[0])
      }
      return false
    }

    if (
      json.byteLength > MAX_FRAME_PAYLOAD_SIZE ||
      exceedsPendingSerializationLimit(json, pendingRecords.size, pendingBytes)
    ) {
      const error = new Error(
        'Server function serialization exceeded its pending output limit',
      )
      for (const registration of rawStreams) {
        cancelRawStream(registration.stream, error)
      }
      onError(error)
      return false
    }

    pendingBytes += json.byteLength
    const record = { json, rawStreams }
    pendingRecords.add(record)
    void writer.write(record).then(
      () => {
        pendingRecords.delete(record)
        pendingBytes -= json.byteLength
      },
      (error) => {
        const stillOwned = pendingRecords.delete(record)
        pendingBytes -= json.byteLength
        if (stillOwned) {
          for (const registration of rawStreams) {
            cancelRawStream(registration.stream, error)
          }
        }
      },
    )
    return true
  }

  onParse = (value) => {
    if (serializationFailure) {
      return
    }
    writeRecord(encodeSerializationRecord(value), pendingRawStreams.splice(0))
  }
  onDone = () => {
    if (serializationFailure) {
      return
    }
    disposeSerialization = undefined
    void writer.close().catch(() => {})
  }
  onError = (error) => {
    abortRecordStream(error)
  }

  // Seroval buffers nested patches during its initial traversal. Their
  // RawStream callbacks may precede the root callback, so start every
  // synchronously discovered stream only after all initial records.
  const initialRawStreams = pendingRawStreams.splice(0)
  for (let index = 0; index < initialRecords.length; index++) {
    const isLast = index === initialRecords.length - 1
    if (!writeRecord(initialRecords[index]!, isLast ? initialRawStreams : [])) {
      // `writeRecord` recorded the failure. Nothing was handed to the client
      // yet, so fail the whole call.
      if (!isLast) {
        for (const registration of initialRawStreams) {
          cancelRawStream(registration.stream, serializationFailure![0])
        }
      }
      initialRecords.length = 0
      throw serializationFailure![0]
    }
  }
  initialRecords.length = 0
  if (done) {
    onDone()
  }

  void writer.closed.catch((error) => {
    abortRecordStream(error)
  })

  return createFramedResponse(readable, {
    signal: AbortSignal.any([recordAbortController.signal, signal]),
    onCancel: abortRecordStream,
  })

  function createFramedResponse(
    records: ReadableStream<MultiplexedStreamRecord>,
    options: MultiplexedStreamOptions,
  ) {
    const multiplexedStream = createMultiplexedStream(records, options)
    try {
      return new Response(multiplexedStream, {
        status: alsResponse.status,
        statusText: alsResponse.statusText,
        headers: {
          'Content-Type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
          [X_TSS_SERIALIZED]: 'true',
        },
      })
    } catch (error) {
      cancelRawStream(multiplexedStream, error)
      throw error
    }
  }
}

function isNotFoundResponse(error: any) {
  const { headers, ...rest } = error
  const response = new Response(JSON.stringify(rest), {
    status: 404,
    headers,
  })
  response.headers.set('Content-Type', 'application/json')
  return response
}
