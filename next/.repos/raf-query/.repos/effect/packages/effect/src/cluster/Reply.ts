/**
 * Defines reply values produced by clustered RPC execution.
 *
 * Every reply belongs to a request and is either a final `WithExit`, which
 * carries the final RPC `Exit`, or a streaming `Chunk`, which carries a
 * non-empty batch of success values. This module includes runtime and encoded
 * reply shapes, guards, per-RPC schema builders, `ReplyWithContext` for
 * carrying encoding services, and serialization helpers for storage or
 * transport.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "../Array.ts"
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Option from "../Option.ts"
import { hasProperty } from "../Predicate.ts"
import * as Rpc from "../rpc/Rpc.ts"
import type * as RpcMessage from "../rpc/RpcMessage.ts"
import type * as RpcSchema from "../rpc/RpcSchema.ts"
import type * as RpcSerialization from "../rpc/RpcSerialization.ts"
import * as Schema from "../Schema.ts"
import * as SchemaIssue from "../SchemaIssue.ts"
import * as SchemaParser from "../SchemaParser.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"
import { MalformedMessage } from "./ClusterError.ts"
import * as Envelope from "./Envelope.ts"
import type { OutgoingRequest } from "./Message.ts"
import { Snowflake, SnowflakeFromBigInt } from "./Snowflake.ts"

const TypeId = "~effect/cluster/Reply"

/**
 * Returns `true` when the supplied value is a runtime cluster reply, based on the
 * reply type identifier.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isReply = (u: unknown): u is Reply<Rpc.Any> => hasProperty(u, TypeId)

/**
 * Runtime reply sent for an RPC request, either as a final exit or a chunk of a
 * streaming success value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Reply<R extends Rpc.Any> = WithExit<R> | Chunk<R>

/**
 * JSON-serializable form of a cluster reply.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Encoded = WithExitEncoded | ChunkEncoded

/**
 * Schema for reply values that are already in encoded form.
 *
 * **Details**
 *
 * Per-RPC payload validation is performed by `Reply(rpc)`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Encoded: Schema.Codec<Encoded> = Envelope.OpaqueHole as any

/**
 * Represents a cluster reply paired with the RPC definition and service context required to
 * serialize it for transport.
 *
 * **When to use**
 *
 * Use to carry a runtime reply together with the RPC schema and services needed
 * to encode it for storage or transport.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class ReplyWithContext<R extends Rpc.Any> extends Data.TaggedClass("ReplyWithContext")<{
  readonly reply: Reply<R>
  readonly context: Context.Context<Rpc.Services<R>>
  readonly rpc: R
}> {
  /**
   * Creates a terminal reply context that dies with the supplied defect.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static fromDefect(options: {
    readonly id: Snowflake
    readonly requestId: Snowflake
    readonly defect: unknown
  }): ReplyWithContext<any> {
    return new ReplyWithContext({
      reply: new WithExit({
        requestId: options.requestId,
        id: options.id,
        exit: Exit.die(Schema.encodeSync(Schema.Defect())(options.defect))
      }),
      context: Context.empty() as any,
      rpc: neverRpc
    })
  }
  /**
   * Creates a terminal reply context that interrupts the supplied request.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static interrupt(options: {
    readonly id: Snowflake
    readonly requestId: Snowflake
  }): ReplyWithContext<any> {
    return new ReplyWithContext({
      reply: new WithExit({
        requestId: options.requestId,
        id: options.id,
        exit: Exit.interrupt()
      }),
      context: Context.empty() as any,
      rpc: neverRpc
    })
  }
}

const neverRpc = Rpc.make("Never", {
  success: Schema.Never as any,
  error: Schema.Never,
  payload: {}
})

/**
 * Wire-format representation of a terminal reply containing the request id, reply
 * id, and encoded RPC exit value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface WithExitEncoded<A = unknown, E = unknown> {
  readonly _tag: "WithExit"
  readonly requestId: string
  readonly id: string
  readonly exit: RpcMessage.ExitEncoded<A, E>
}

/**
 * Wire-format representation of a streaming reply chunk, including the request id,
 * reply id, sequence number, and non-empty encoded values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ChunkEncoded {
  readonly _tag: "Chunk"
  readonly requestId: string
  readonly id: string
  readonly sequence: number
  readonly values: NonEmptyReadonlyArray<unknown>
}

// Keyed by codec first: the storage path and the transport path can compile
// different codecs for the same RPC.
const schemaCaches = new WeakMap<RpcSerialization.CodecFor, WeakMap<Rpc.Any, Schema.Top>>()

/**
 * Represents a streaming RPC reply chunk for a request, carrying a non-empty
 * batch of success values together with the reply id and sequence number.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Chunk<R extends Rpc.Any> extends Data.TaggedClass("Chunk")<{
  readonly requestId: Snowflake
  readonly id: Snowflake
  readonly sequence: number
  readonly values: NonEmptyReadonlyArray<Rpc.SuccessChunk<R>>
}> {
  /**
   * Marks this value as a runtime cluster reply.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Creates an empty chunk reply for the supplied request id.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static emptyFrom(requestId: Snowflake) {
    return new Chunk({
      requestId,
      id: Snowflake(BigInt(0)),
      sequence: 0,
      values: [undefined]
    })
  }

  /**
   * Schema that accepts any runtime chunk reply without validating payload values.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly Any = Schema.declare((u): u is Chunk<never> => isReply(u) && u._tag === "Chunk")

  /**
   * Transformation between encoded chunk records and `Chunk` instances.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly transform: SchemaTransformation.Transformation<any, any> = SchemaTransformation.transform({
    decode: (a: any) => new Chunk(a),
    encode: (a) => a as any
  })

  /**
   * Builds a chunk schema from the streaming success schema of an RPC.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static schema<R extends Rpc.Any>(
    rpc: R
  ): Schema.declareConstructor<Chunk<R>, Chunk<R>, readonly [Rpc.SuccessExitSchema<R>]> {
    const successSchema = ((rpc as any as Rpc.AnyWithProps).successSchema as RpcSchema.Stream<any, any>).success
    if (!successSchema) {
      return Schema.Never as any
    }
    return this.schemaFrom(successSchema) as any
  }

  /**
   * Builds a chunk schema that validates each success value with the supplied schema.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static schemaFrom<Success extends Schema.Constraint>(
    success: Success
  ): Schema.declareConstructor<Chunk<Rpc.Any>, Chunk<Rpc.Any>, readonly [Success]> {
    // TODO: extract to a helper function
    return Schema.declareConstructor<Chunk<Rpc.Any>>()(
      [success],
      ([success]) => (input, ast, options) => {
        if (!isReply(input) || input._tag !== "Chunk") {
          return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
        }
        return Effect.mapBothEager(SchemaParser.decodeEffect(Schema.NonEmptyArray(success))(input.values, options), {
          onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "values", issue, input, options),
          onSuccess: (values) => new Chunk({ ...input, values } as any)
        })
      },
      {
        expected: "Reply.Chunk",
        toCodecJson: ([success]) =>
          Schema.link<Chunk<Rpc.Any>>()(
            Schema.Struct({
              _tag: Schema.Literal("Chunk"),
              requestId: SnowflakeFromBigInt,
              id: SnowflakeFromBigInt,
              sequence: Schema.Int,
              values: Schema.NonEmptyArray(success)
            }),
            SchemaTransformation.transform({
              decode: (encoded) => new Chunk(encoded),
              encode: (result) => ({ ...result })
            })
          )
      }
    )
  }

  /**
   * Returns a copy of this chunk associated with the supplied request id.
   *
   * @stability unstable
   * @since 4.0.0
   */
  withRequestId(requestId: Snowflake): Chunk<R> {
    return new Chunk({
      ...this,
      requestId
    })
  }
}

/**
 * Represents a terminal RPC reply for a request, carrying the final `Exit` for the remote
 * call.
 *
 * **When to use**
 *
 * Use to represent the final success, typed failure, defect, or interruption
 * for a clustered RPC request.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class WithExit<R extends Rpc.Any> extends Data.TaggedClass("WithExit")<{
  readonly requestId: Snowflake
  readonly id: Snowflake
  readonly exit: Rpc.Exit<R>
}> {
  /**
   * Marks this value as a runtime cluster reply.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Returns `true` when the value is a terminal `WithExit` reply.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static is(u: unknown): u is WithExit<any> {
    return isReply(u) && u._tag === "WithExit"
  }

  /**
   * Builds a terminal reply schema from the exit schema of an RPC.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static schema<R extends Rpc.Any>(
    rpc: R
  ): Schema.declareConstructor<
    WithExit<R>,
    WithExit<R>,
    readonly [Schema.Exit<Rpc.SuccessExitSchema<R>, Rpc.ErrorExitSchema<R>, Rpc.DefectSchema>]
  > {
    return this.schemaFrom(Rpc.exitSchema(rpc))
  }

  /**
   * Builds a terminal reply schema that validates the encoded exit value.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static schemaFrom<
    Success extends Schema.Constraint,
    Error extends Schema.Constraint,
    Defect extends Schema.Constraint
  >(
    exitSchema: Schema.Exit<Success, Error, Defect>
  ): Schema.declareConstructor<
    WithExit<Rpc.Any>,
    WithExit<Rpc.Any>,
    readonly [Schema.Exit<Success, Error, Defect>]
  > {
    // TODO: extract to a helper function
    return Schema.declareConstructor<WithExit<Rpc.Any>>()(
      [exitSchema],
      ([exit]) => (input, ast, options) => {
        if (!isReply(input) || input._tag !== "WithExit") {
          return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
        }
        return Effect.mapBothEager(SchemaParser.decodeEffect(exit)(input.exit, options), {
          onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "exit", issue, input, options),
          onSuccess: (exit) => new WithExit({ ...input, exit: exit as any })
        })
      },
      {
        expected: "Reply.WithExit",
        toCodecJson: ([exit]) =>
          Schema.link<WithExit<Rpc.Any>>()(
            Schema.Struct({
              _tag: Schema.Literal("WithExit"),
              requestId: SnowflakeFromBigInt,
              id: SnowflakeFromBigInt,
              exit
            }),
            SchemaTransformation.transform({
              decode: (encoded) => new WithExit(encoded as any),
              encode: (result) => ({ ...result })
            })
          )
      }
    )
  }

  /**
   * Returns a copy of this terminal reply associated with the supplied request id.
   *
   * @stability unstable
   * @since 4.0.0
   */
  withRequestId(requestId: Snowflake): WithExit<R> {
    return new WithExit({
      ...this,
      requestId
    })
  }
}

/**
 * Builds the transport codec for replies to the specified RPC, covering terminal
 * `WithExit` replies and streaming `Chunk` replies.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Reply = <R extends Rpc.Any>(
  rpc: R,
  codecFor: RpcSerialization.CodecFor
): Schema.Codec<
  WithExit<R> | Chunk<R>,
  Encoded,
  Rpc.ServicesClient<R>,
  Rpc.ServicesServer<R>
> => {
  let schemaCache = schemaCaches.get(codecFor)
  if (schemaCache === undefined) {
    schemaCache = new WeakMap()
    schemaCaches.set(codecFor, schemaCache)
  }
  const cached = schemaCache.get(rpc)
  if (cached !== undefined) {
    return cached as any
  }
  const schema = codecFor(Schema.Union([WithExit.schema(rpc), Chunk.schema(rpc)]))
  schemaCache.set(rpc, schema)
  return schema as any
}

/**
 * Serializes a `ReplyWithContext` into its encoded wire representation, using the
 * reply's RPC schema and context and refailing encoding errors as
 * `MalformedMessage`.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const serialize = <R extends Rpc.Any>(
  self: ReplyWithContext<R>,
  codecFor: RpcSerialization.CodecFor
): Effect.Effect<Encoded, MalformedMessage> => {
  const schema = Reply(self.rpc, codecFor)
  return MalformedMessage.refail(
    Effect.provideContext(
      Schema.encodeEffect(schema)(self.reply),
      self.context
    )
  )
}

/**
 * Serializes a `ReplyWithContext`, falling back to a serializable defect reply
 * when the original reply cannot be encoded.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const serializeOrDefect = <R extends Rpc.Any>(
  self: ReplyWithContext<R>,
  codecFor: RpcSerialization.CodecFor
): Effect.Effect<Encoded> =>
  Effect.catchTag(
    serialize(self, codecFor),
    "MalformedMessage",
    (error) =>
      Effect.orDie(serialize(
        ReplyWithContext.fromDefect({
          id: self.reply.id,
          requestId: self.reply.requestId,
          defect: error
        }),
        codecFor
      ))
  )

/**
 * Serializes an outgoing request's last received reply when one exists, returning
 * `None` when no reply has been received and refailing encoding errors as
 * `MalformedMessage`.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const serializeLastReceived = <R extends Rpc.Any>(
  self: OutgoingRequest<R>,
  codecFor: RpcSerialization.CodecFor
): Effect.Effect<Option.Option<Encoded>, MalformedMessage> => {
  const lastReceivedReply = self.lastReceivedReply
  if (lastReceivedReply._tag === "None") {
    return Effect.succeedNone
  }
  const schema = Reply(self.rpc, codecFor)
  return MalformedMessage.refail(
    Effect.provideContext(Schema.encodeEffect(schema)(lastReceivedReply.value), self.context)
  ).pipe(
    Effect.map(Option.some)
  )
}
