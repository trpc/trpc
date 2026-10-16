/**
 * Serializes RPC protocol messages for transports.
 *
 * `RpcSerialization` is the boundary between `RpcMessage` envelopes and the
 * bytes or strings carried by a transport. This module provides built-in
 * serializers for JSON, newline-delimited JSON, JSON-RPC 2.0, and SchemaBinary,
 * including framed formats that can decode multiple messages
 * from streaming chunks.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as SchemaBinary from "../encoding/SchemaBinary.ts"
import * as Layer from "../Layer.ts"
import * as Predicate from "../Predicate.ts"
import { hasProperty } from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import * as RpcMessage from "./RpcMessage.ts"

/**
 * Builds the codec used to fill the `unknown` holes of RPC protocol messages,
 * such as request payloads, stream chunks, exits, and defects.
 *
 * **Details**
 *
 * The envelope around the hole is framed by {@link Parser}, which never sees the
 * schema. JSON based serializations return `Schema.toCodecJson`, so the encoded
 * hole is JSON. Other serializations may encode the hole as bytes; both fit the
 * `unknown` hole, so `RpcSerialization` has no type parameter.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export type CodecFor = <S extends Schema.Top>(
  schema: S
) => Schema.Codec<S["Type"], unknown, S["DecodingServices"], S["EncodingServices"]>

const codecForJson = Schema.toCodecJson as CodecFor

// shared by every parser that decodes whole frames, so creating a parser does
// not pay for a native TextDecoder
let sharedTextDecoder: TextDecoder | undefined
const decodeText = (bytes: Uint8Array): string => (sharedTextDecoder ??= new TextDecoder()).decode(bytes)

/**
 * Service that describes how RPC protocol messages are encoded and decoded,
 * including the content type and whether the serialization format provides
 * message framing.
 *
 * **When to use**
 *
 * Use to provide the serialization boundary shared by RPC clients and servers
 * for a chosen wire format.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class RpcSerialization extends Context.Service<RpcSerialization, {
  makeUnsafe(): Parser
  readonly contentType: string
  readonly includesFraming: boolean
  readonly codecFor: CodecFor
}>()("effect/rpc/RpcSerialization") {}

/**
 * A stateful parser for an RPC serialization format, able to decode input
 * chunks into protocol messages and encode messages for transport.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export interface Parser {
  readonly decode: (data: Uint8Array | string) => ReadonlyArray<unknown>
  readonly encode: (response: unknown) => Uint8Array | string | undefined
}

/**
 * Error raised when a streaming parser retains more data than its configured
 * buffer limit.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class MaxBufferSizeExceeded extends Data.TaggedError("MaxBufferSizeExceeded")<{
  readonly maxBufferSize: number
}> {
  override get message() {
    return `RPC serialization buffer exceeded the maximum size of ${this.maxBufferSize}`
  }
}

/**
 * Options shared by streaming RPC serialization formats.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export interface StreamOptions {
  /**
   * Maximum number of bytes or string code units retained for an incomplete frame.
   * The default is 16 MiB. Use `"unbounded"` to disable the limit.
   */
  readonly maxBufferSize?: number | "unbounded" | undefined
}

const defaultMaxBufferSize = 16 * 1024 * 1024

const isBufferSizeExceeded = (
  bufferSize: number,
  maxBufferSize: number | "unbounded"
): maxBufferSize is number => maxBufferSize !== "unbounded" && bufferSize > maxBufferSize

/**
 * JSON RPC serialization for whole message payloads. It does not include
 * message framing, so it is intended for transports that frame responses
 * themselves.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const json: RpcSerialization["Service"] = RpcSerialization.of({
  contentType: "application/json",
  includesFraming: false,
  codecFor: codecForJson,
  makeUnsafe: () => ({
    decode: (bytes) => {
      const decoded = JSON.parse(typeof bytes === "string" ? bytes : decodeText(bytes))
      return Array.isArray(decoded) ? decoded : [decoded]
    },
    encode: (response) => JSON.stringify(response)
  })
})

/**
 * Serializes RPC protocol messages as newline-delimited JSON, framing each message
 * with a trailing newline.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const makeNdjson = (options?: StreamOptions): RpcSerialization["Service"] => {
  const maxBufferSize = options?.maxBufferSize ?? defaultMaxBufferSize
  return RpcSerialization.of({
    contentType: "application/ndjson",
    includesFraming: true,
    codecFor: codecForJson,
    makeUnsafe: () => {
      // lazily created: string transports never need byte decoding
      let decoder: TextDecoder | undefined
      let buffer = ""
      const failMaxBufferSize = (maxBufferSize: number): never => {
        buffer = ""
        throw new MaxBufferSizeExceeded({ maxBufferSize })
      }
      return ({
        decode: (bytes) => {
          buffer += typeof bytes === "string" ? bytes : (decoder ??= new TextDecoder()).decode(bytes, { stream: true })
          let position = 0
          let nlIndex = buffer.indexOf("\n", position)
          const items: Array<unknown> = []
          while (nlIndex !== -1) {
            if (isBufferSizeExceeded(nlIndex - position, maxBufferSize)) {
              failMaxBufferSize(maxBufferSize)
            }
            const line = buffer.slice(position, nlIndex)
            position = nlIndex + 1
            try {
              items.push(JSON.parse(line))
            } catch {
            }
            nlIndex = buffer.indexOf("\n", position)
          }
          buffer = buffer.slice(position)
          if (isBufferSizeExceeded(buffer.length, maxBufferSize)) {
            failMaxBufferSize(maxBufferSize)
          }
          return items
        },
        encode: (response) => {
          if (Array.isArray(response)) {
            if (response.length === 0) return undefined
            let data = ""
            for (let i = 0; i < response.length; i++) {
              data += JSON.stringify(response[i]) + "\n"
            }
            return data
          }
          return JSON.stringify(response) + "\n"
        }
      })
    }
  })
}

/**
 * Default newline-delimited JSON RPC serialization.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const ndjson: RpcSerialization["Service"] = makeNdjson()

/**
 * Creates a JSON-RPC 2.0 serialization for RPC protocol messages without
 * additional message framing.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const jsonRpc = (options?: {
  readonly contentType?: string | undefined
}): RpcSerialization["Service"] =>
  RpcSerialization.of({
    contentType: options?.contentType ?? "application/json",
    includesFraming: false,
    codecFor: codecForJson,
    makeUnsafe: () => {
      const batches = new Map<string | number, {
        readonly size: number
        readonly responses: Map<string | number, RpcMessage.FromServerEncoded>
      }>()
      return {
        decode: (bytes) => {
          const decoded: unknown = JSON.parse(
            typeof bytes === "string" ? bytes : decodeText(bytes)
          )
          return decodeJsonRpcRaw(decoded, batches)
        },
        encode: (response) => {
          const encoded = encodeJsonRpcResponse(response as any, batches)
          return encoded && JSON.stringify(encoded)
        }
      }
    }
  })

/**
 * Creates a newline-delimited JSON-RPC 2.0 serialization for RPC protocol
 * messages.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const ndJsonRpc = (options?: {
  readonly contentType?: string | undefined
  readonly maxBufferSize?: number | "unbounded" | undefined
}): RpcSerialization["Service"] =>
  RpcSerialization.of({
    contentType: options?.contentType ?? "application/json-rpc",
    includesFraming: true,
    codecFor: codecForJson,
    makeUnsafe: () => {
      const parser = makeNdjson({ maxBufferSize: options?.maxBufferSize }).makeUnsafe()
      const batches = new Map<string, {
        readonly size: number
        readonly responses: Map<string, RpcMessage.FromServerEncoded>
      }>()
      return ({
        decode: (bytes) => {
          const frames = parser.decode(bytes)
          if (frames.length === 0) return []
          const messages: Array<RpcMessage.FromClientEncoded | RpcMessage.FromServerEncoded> = []
          for (let i = 0; i < frames.length; i++) {
            messages.push(...decodeJsonRpcRaw(frames[i], batches))
          }
          return messages
        },
        encode: (response) => {
          const encoded = encodeJsonRpcResponse(response as any, batches)
          return encoded && parser.encode(encoded)
        }
      })
    }
  })

function decodeJsonRpcRaw(
  decoded: unknown,
  batches: Map<string | number, {
    readonly size: number
    readonly responses: Map<string | number, RpcMessage.FromServerEncoded>
  }>
) {
  if (Array.isArray(decoded)) {
    const batch = {
      size: 0,
      responses: new Map<string, RpcMessage.FromServerEncoded>()
    }
    const messages: Array<RpcMessage.FromClientEncoded | RpcMessage.FromServerEncoded> = []
    for (let i = 0; i < decoded.length; i++) {
      const item = decoded[i]
      if (!Predicate.isObject(item)) continue
      const message = decodeJsonRpcMessage(item as unknown as JsonRpcMessage)
      messages.push(message)
      if (message._tag === "Request" && !message.isNotification) {
        batch.size++
        batches.set(message.id, batch)
      }
    }
    return messages
  }
  return Predicate.isObject(decoded) ? [decodeJsonRpcMessage(decoded as unknown as JsonRpcMessage)] : []
}

function decodeJsonRpcMessage(decoded: JsonRpcMessage): RpcMessage.FromClientEncoded | RpcMessage.FromServerEncoded {
  if (Object.hasOwn(decoded, "method")) {
    const request = decoded as JsonRpcRequest
    if (
      Predicate.isNullish(request.id) && Predicate.isString(request.method) && request.method.startsWith("@effect/rpc/")
    ) {
      const tag = request.method.slice("@effect/rpc/".length) as
        | RpcMessage.FromServerEncoded["_tag"]
        | Exclude<RpcMessage.FromClientEncoded["_tag"], "Request">
      const requestId = (request as any).params?.requestId
      return requestId !== undefined ?
        {
          _tag: tag,
          requestId
        } as any :
        { _tag: tag } as any
    }
    return {
      _tag: "Request",
      id: request.id ?? "",
      tag: request.method,
      payload: request.params ?? null,
      headers: request.headers ?? [],
      ...(Predicate.hasProperty(request, "id") ? {} : { isNotification: true as const }),
      ...(request.spanId ?
        {
          traceId: request.traceId,
          spanId: request.spanId!,
          sampled: request.sampled!
        } :
        {})
    }
  }
  const response = decoded as JsonRpcResponse
  const hasError = Object.hasOwn(response, "error")
  if (hasError && response.error && response.error._tag === "Defect") {
    return {
      _tag: "Defect",
      defect: response.error.data
    }
  } else if (Object.hasOwn(response, "chunk") && response.chunk === true) {
    return {
      _tag: "Chunk",
      requestId: response.id ?? "",
      values: response.result as any
    }
  }
  return {
    _tag: "Exit",
    requestId: response.id ?? "",
    exit: hasError && response.error != null ?
      {
        _tag: "Failure",
        cause: response.error._tag === "Cause" ?
          response.error.data as any :
          [{
            _tag: "Fail",
            error: response.error
          }]
      } :
      {
        _tag: "Success",
        value: response.result
      }
  }
}

function encodeJsonRpcRaw(
  response: RpcMessage.FromServerEncoded | RpcMessage.FromClientEncoded,
  batches: Map<string | number, {
    readonly size: number
    readonly responses: Map<string | number, RpcMessage.FromServerEncoded>
  }>
) {
  if (!("requestId" in response)) {
    return encodeJsonRpcMessage(response)
  }
  const batch = batches.get(response.requestId)
  if (batch) {
    batches.delete(response.requestId)
    batch.responses.set(response.requestId, response as any)
    if (batch.size === batch.responses.size) {
      return Array.from(batch.responses.values(), encodeJsonRpcMessage)
    }
    return undefined
  }
  return encodeJsonRpcMessage(response)
}

function encodeJsonRpcResponse(
  response:
    | RpcMessage.FromServerEncoded
    | RpcMessage.FromClientEncoded
    | Array<RpcMessage.FromServerEncoded | RpcMessage.FromClientEncoded>,
  batches: Map<string | number, {
    readonly size: number
    readonly responses: Map<string | number, RpcMessage.FromServerEncoded>
  }>
) {
  if (Array.isArray(response) === false) {
    return encodeJsonRpcRaw(response, batches)
  }
  if (response.length === 0) {
    return undefined
  }
  const encoded: Array<JsonRpcMessage | Array<JsonRpcMessage>> = []
  for (let i = 0; i < response.length; i++) {
    const current = encodeJsonRpcRaw(response[i], batches)
    if (current !== undefined) {
      encoded.push(current)
    }
  }
  if (encoded.length === 0) {
    return undefined
  }
  if (encoded.length === 1) {
    return encoded[0]
  }
  const messages: Array<JsonRpcMessage> = []
  for (let i = 0; i < encoded.length; i++) {
    const current = encoded[i]
    if (Array.isArray(current)) {
      messages.push(...current)
    } else {
      messages.push(current)
    }
  }
  return messages
}

function encodeJsonRpcMessage(response: RpcMessage.FromServerEncoded | RpcMessage.FromClientEncoded): JsonRpcMessage {
  switch (response._tag) {
    case "Request":
      return {
        jsonrpc: "2.0",
        method: response.tag,
        params: response.payload,
        // a JSON-RPC notification is a request without an id
        ...(response.isNotification ? {} : { id: response.id }),
        ...(response.headers?.length > 0 ? { headers: response.headers } : {}),
        traceId: response.traceId,
        spanId: response.spanId,
        sampled: response.sampled
      }
    case "Ping":
    case "Pong":
    case "Interrupt":
    case "Ack":
    case "Eof":
      return {
        jsonrpc: "2.0",
        method: `@effect/rpc/${response._tag}`,
        params: "requestId" in response ? { requestId: response.requestId } : undefined
      }
    case "Chunk":
      return {
        jsonrpc: "2.0",
        chunk: true,
        id: response.requestId,
        result: response.values
      }
    case "Exit": {
      if (response.exit._tag === "Success") {
        return {
          jsonrpc: "2.0",
          id: response.requestId ?? undefined,
          result: response.exit.value
        } as any
      }
      const failure = response.exit.cause.find((failure) => failure._tag === "Fail")
      const error = failure?._tag === "Fail" ? failure.error : undefined
      return {
        jsonrpc: "2.0",
        id: response.requestId ?? undefined,
        error: response.exit._tag === "Failure" ?
          {
            _tag: "Cause",
            code: error && Predicate.hasProperty(error, "code") ? Number(error.code) : 0,
            message: error && hasProperty(error, "message")
              ? error.message
              : JSON.stringify(response.exit.cause),
            data: response.exit.cause
          } :
          undefined
      } as any
    }
    case "Defect":
      return {
        jsonrpc: "2.0",
        id: jsonRpcInternalError,
        error: {
          _tag: "Defect",
          code: 1,
          message: "A defect occurred",
          data: response.defect
        }
      }
    case "ClientProtocolError":
      return {} as never
  }
}

const jsonRpcInternalError = -32603

interface JsonRpcRequest {
  readonly jsonrpc: "2.0"
  readonly id?: number | string | null
  readonly method: string
  readonly params?: unknown
  readonly headers?: ReadonlyArray<[string, string]>
  readonly traceId?: string
  readonly spanId?: string
  readonly sampled?: boolean
}

interface JsonRpcResponse {
  readonly jsonrpc: "2.0"
  readonly id?: number | string | null
  readonly result?: unknown
  readonly chunk?: boolean
  readonly error?: {
    readonly code: number
    readonly message: string
    readonly data?: unknown
    readonly _tag?: "Cause" | "Defect"
  }
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse

const defaultSchemaBinaryMaxFrameSize = 16 * 1024 * 1024

const schemaBinaryTextEncoder = new TextEncoder()

const makeSchemaBinary = (options?: {
  readonly maxFrameSize?: number | "unbounded" | undefined
  readonly fingerprintPayloads?: boolean | undefined
}): RpcSerialization["Service"] => {
  const maxFrameSize = options?.maxFrameSize === "unbounded"
    ? undefined
    : options?.maxFrameSize ?? defaultSchemaBinaryMaxFrameSize
  const codecFor: CodecFor = options?.fingerprintPayloads === true
    ? (schema) => SchemaBinary.toCodecDirect(schema, { fingerprint: true })
    : SchemaBinary.toCodecDirect
  const envelopeOptions = { fingerprint: true } as const
  return RpcSerialization.of({
    contentType: "application/vnd.effect.rpc+schema-binary",
    includesFraming: true,
    codecFor,
    makeUnsafe: () => {
      const parser = SchemaBinary.parser(RpcMessage.EncodedSchema, { ...envelopeOptions, maxFrameSize })
      const encoder = SchemaBinary.encoder(RpcMessage.EncodedSchema, envelopeOptions)
      return {
        decode: (data) => parser.feedSync(typeof data === "string" ? schemaBinaryTextEncoder.encode(data) : data),
        encode: (response) => {
          if (!Array.isArray(response)) {
            return encoder.encode(response)
          }
          if (response.length === 0) return undefined
          return encoder.encodeMany(response)
        }
      }
    }
  })
}

/**
 * RPC serialization layer that uses JSON for serialization.
 *
 * **When to use**
 *
 * Use when you have a transport protocol that already provides message framing.
 *
 * @see {@link layerNdjson} for transports that need newline-delimited framing
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerJson: Layer.Layer<RpcSerialization> = Layer.succeed(RpcSerialization)(json)

/**
 * RPC serialization layer that uses NDJSON for serialization.
 *
 * **When to use**
 *
 * Use when you have a transport protocol that does not provide message framing.
 *
 * @see {@link layerJson} for transports that already provide message framing
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerNdjson: Layer.Layer<RpcSerialization> = Layer.succeed(RpcSerialization)(ndjson)

/**
 * RPC serialization layer that uses NDJSON with custom streaming options.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerNdjsonWith = (options?: StreamOptions): Layer.Layer<RpcSerialization> =>
  Layer.succeed(RpcSerialization)(makeNdjson(options))

/**
 * RPC serialization layer that uses JSON-RPC for serialization.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerJsonRpc = (options?: {
  readonly contentType?: string | undefined
}): Layer.Layer<RpcSerialization> => Layer.succeed(RpcSerialization)(jsonRpc(options))

/**
 * RPC serialization layer that uses newline-delimited JSON-RPC for
 * serialization.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerNdJsonRpc = (options?: {
  readonly contentType?: string | undefined
  readonly maxBufferSize?: number | "unbounded" | undefined
}): Layer.Layer<RpcSerialization> => Layer.succeed(RpcSerialization)(ndJsonRpc(options))

/**
 * RPC serialization layer that uses SchemaBinary with fingerprinted RPC
 * envelopes. Payload fingerprints are disabled by default to support compatible
 * schema evolution. Frames default to a 16 MiB maximum size. Use `"unbounded"`
 * to disable the frame-size limit.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerSchemaBinary = (options?: {
  readonly maxFrameSize?: number | "unbounded" | undefined
  readonly fingerprintPayloads?: boolean | undefined
}): Layer.Layer<RpcSerialization> => Layer.sync(RpcSerialization)(() => makeSchemaBinary(options))
