/**
 * Defines the transport envelopes exchanged by cluster entities.
 *
 * Request envelopes wrap decoded RPC payloads with the target entity address,
 * RPC tag, request id, headers, and optional tracing context. The module also
 * includes acknowledgement envelopes for streamed reply chunks, interrupt
 * envelopes for in-flight requests, JSON codecs for partially decoded
 * envelopes, guards, request constructors, and storage primary-key helpers.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Headers from "../http/Headers.ts"
import * as Predicate from "../Predicate.ts"
import * as PrimaryKey from "../PrimaryKey.ts"
import type { ReadonlyRecord } from "../Record.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import * as Schema from "../Schema.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"
import { EntityAddress } from "./EntityAddress.ts"
import { type Snowflake, SnowflakeFromBigInt } from "./Snowflake.ts"

/**
 * Type identifier used to mark runtime cluster envelope values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId = "~effect/cluster/Envelope"

/**
 * Schema for a value that has already been encoded by the transport's hole
 * codec.
 *
 * **Details**
 *
 * Cluster payloads are encoded twice: the entity payload is encoded with the
 * entity RPC schema, and the result is carried opaquely inside the runner
 * envelope. This schema names that hole so the outer runner encode leaves it
 * alone. It is the identity under `Schema.toCodecJson`, so JSON, NDJSON, and
 * text transports stay wire-compatible. A binary codec compiles it as a
 * bytes leaf.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const OpaqueHole: Schema.declare<any> = Schema.declare(
  (_: unknown): _ is any => true,
  {
    expected: "an already-encoded value",
    toCodecJson: () => undefined,
    toCodec: () =>
      Schema.link<any>()(
        Schema.Uint8Array,
        SchemaTransformation.passthrough()
      )
  }
)

/**
 * Union of cluster envelopes exchanged for an RPC request.
 *
 * **Details**
 *
 * An envelope is either a request, an acknowledgement for a streamed reply chunk,
 * or an interrupt signal.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Envelope<R extends Rpc.Any> = Request<R> | AckChunk | Interrupt

/**
 * JSON-serializable form of a cluster envelope.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Encoded = PartialRequestEncoded | AckChunkEncoded | InterruptEncoded

/**
 * Helper types associated with cluster envelopes.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Envelope {
  /**
   * Envelope type for any RPC protocol.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Any = Envelope<any>
}

/**
 * Runtime envelope for an RPC request addressed to a specific entity.
 *
 * **Details**
 *
 * It carries the request ID, entity address, RPC tag, decoded payload, request
 * headers, and optional tracing context.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Request<in out Rpc extends Rpc.Any> {
  readonly [TypeId]: typeof TypeId
  readonly _tag: "Request"
  readonly requestId: Snowflake
  readonly address: EntityAddress
  readonly tag: Rpc.Tag<Rpc>
  readonly payload: Rpc.Payload<Rpc>
  readonly headers: Headers.Headers
  readonly traceId?: string
  readonly spanId?: string
  readonly sampled?: boolean
}

/**
 * Schema for a request envelope before its RPC payload has been decoded.
 *
 * **Details**
 *
 * The envelope metadata is decoded, while the payload remains `unknown` until it
 * is decoded with the target RPC payload schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class PartialRequest extends Schema.Opaque<PartialRequest>()(Schema.Struct({
  _tag: Schema.tag("Request"),
  requestId: SnowflakeFromBigInt,
  address: EntityAddress,
  tag: Schema.String,
  payload: OpaqueHole,
  headers: Schema.Headers,
  traceId: Schema.optional(Schema.String),
  spanId: Schema.optional(Schema.String),
  sampled: Schema.optional(Schema.Boolean)
})) {}

/**
 * Serialized JSON shape of a request envelope.
 *
 * **Details**
 *
 * Identifiers are encoded as strings and the RPC payload remains unknown until
 * decoded with the RPC schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PartialRequestEncoded {
  readonly _tag: "Request"
  readonly requestId: string
  readonly address: {
    readonly shardId: {
      readonly group: string
      readonly id: number
    }
    readonly entityType: string
    readonly entityId: string
  }
  readonly tag: string
  readonly payload: unknown
  readonly headers: ReadonlyRecord<string, string>
  readonly traceId?: string
  readonly spanId?: string
  readonly sampled?: boolean
}

/**
 * Represents an envelope acknowledging receipt of a streamed reply chunk for a
 * request.
 *
 * **Details**
 *
 * The `replyId` identifies the chunk reply that has been received.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class AckChunk extends Schema.Class<AckChunk>("effect/cluster/Envelope/AckChunk")({
  _tag: Schema.tag("AckChunk"),
  id: SnowflakeFromBigInt,
  address: EntityAddress,
  requestId: SnowflakeFromBigInt,
  replyId: SnowflakeFromBigInt
}) {
  /**
   * Marks this value as a cluster envelope for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Returns a copy of this acknowledgement associated with the supplied request id.
   *
   * @stability unstable
   * @since 4.0.0
   */
  withRequestId(requestId: Snowflake): AckChunk {
    return new AckChunk({
      ...this,
      requestId
    })
  }
}

/**
 * Serialized JSON shape of an `AckChunk` envelope.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AckChunkEncoded {
  readonly _tag: "AckChunk"
  readonly id: string
  readonly address: {
    readonly shardId: {
      readonly group: string
      readonly id: number
    }
    readonly entityType: string
    readonly entityId: string
  }
  readonly requestId: string
  readonly replyId: string
}

/**
 * Represents an envelope used to interrupt an in-flight entity request.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Interrupt extends Schema.Class<Interrupt>("effect/cluster/Envelope/Interrupt")({
  _tag: Schema.tag("Interrupt"),
  id: SnowflakeFromBigInt,
  address: EntityAddress,
  requestId: SnowflakeFromBigInt
}) {
  /**
   * Marks this value as a cluster envelope for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Returns a copy of this interrupt associated with the supplied request id.
   *
   * @stability unstable
   * @since 4.0.0
   */
  withRequestId(requestId: Snowflake): Interrupt {
    return new Interrupt({
      ...this,
      requestId
    })
  }
}

/**
 * Serialized JSON shape of an `Interrupt` envelope.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface InterruptEncoded {
  readonly _tag: "Interrupt"
  readonly id: string
  readonly address: {
    readonly shardId: {
      readonly group: string
      readonly id: number
    }
    readonly entityType: string
    readonly entityId: string
  }
  readonly requestId: string
}

/**
 * Schema for partially decoded cluster envelopes.
 *
 * **Details**
 *
 * It accepts `PartialRequest`, `AckChunk`, and `Interrupt` envelope values.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Partial: Schema.Union<
  readonly [
    typeof PartialRequest,
    typeof AckChunk,
    typeof Interrupt
  ]
> = Schema.Union([PartialRequest, AckChunk, Interrupt])

/**
 * Decoded value type produced by the `Partial` envelope schema.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type Partial = typeof Partial.Type

/**
 * JSON codec for partial cluster envelopes.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const PartialJson: Schema.Codec<
  AckChunk | Interrupt | PartialRequest,
  Encoded
> = Schema.toCodecJson(Partial) as any

/**
 * Schema for mutable arrays of JSON-encoded partial cluster envelopes.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const PartialArray: Schema.mutable<
  Schema.$Array<Schema.Codec<AckChunk | Interrupt | PartialRequest, Encoded>>
> = Schema.mutable(Schema.Array(PartialJson))

/**
 * Helper types associated with request envelopes.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Request {
  /**
   * Request envelope type for any RPC protocol.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Any = Request<any>
}

/**
 * Returns `true` when the supplied value is a runtime cluster envelope.
 *
 * **Details**
 *
 * The check is based on the envelope type identifier.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isEnvelope = (u: unknown): u is Envelope<any> => Predicate.hasProperty(u, TypeId)

/**
 * Constructs a runtime request envelope and attaches the envelope type identifier.
 *
 * **Details**
 *
 * Tracing fields are included only when a `traceId` is provided.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeRequest = <Rpc extends Rpc.Any>(
  options: {
    readonly requestId: Snowflake
    readonly address: EntityAddress
    readonly tag: Rpc.Tag<Rpc>
    readonly payload: Rpc.Payload<Rpc>
    readonly headers: Headers.Headers
    readonly traceId?: string | undefined
    readonly spanId?: string | undefined
    readonly sampled?: boolean | undefined
  }
): Request<Rpc> => ({
  [TypeId]: TypeId,
  _tag: "Request",
  requestId: options.requestId,
  tag: options.tag,
  address: options.address,
  payload: options.payload,
  headers: options.headers,
  ...(options.traceId !== undefined ?
    {
      traceId: options.traceId!,
      spanId: options.spanId!,
      sampled: options.sampled!
    } :
    {})
})

/**
 * Schema for runtime cluster envelopes recognized by their type identifier.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const Envelope = Schema.declare(isEnvelope, {
  identifier: "Envelope"
})

/**
 * Schema for runtime request envelopes.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const Request = Schema.declare(
  (u): u is Request.Any => isEnvelope(u) && u._tag === "Request",
  { identifier: "Request" }
)

/**
 * Transforms plain request data with `makeRequest` and encodes
 * request envelopes back to their raw representation.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const RequestTransform: SchemaTransformation.Transformation<
  Request.Any,
  any
> = SchemaTransformation.transform({
  decode: (u: any) => makeRequest(u),
  encode: (u) => u as any
})

/**
 * Returns the storage primary key for a request envelope whose payload has a
 * primary key, or `null` when the envelope is not a keyed request.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const primaryKey = <R extends Rpc.Any>(envelope: Envelope<R>): string | null => {
  if (envelope._tag !== "Request" || !PrimaryKey.isPrimaryKey(envelope.payload)) {
    return null
  }
  return primaryKeyByAddress({
    address: envelope.address,
    tag: envelope.tag,
    id: PrimaryKey.value(envelope.payload)
  })
}

/**
 * Builds a storage primary-key string from an entity address, RPC tag, and
 * payload primary-key ID.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const primaryKeyByAddress = (options: {
  readonly address: EntityAddress
  readonly tag: string
  readonly id: string
}): string =>
  // storage drivers with fixed-width key columns (e.g. SqlMessageStorage)
  // hash this composed key at their own boundary
  `${options.address.entityType}/${options.address.entityId}/${options.tag}/${options.id}`
