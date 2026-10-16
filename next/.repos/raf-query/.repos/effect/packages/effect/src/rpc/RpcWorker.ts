/**
 * Initial messages for worker-backed RPC protocols.
 *
 * A worker-backed RPC client can send one schema-encoded value before normal RPC
 * requests are handled. This module defines the `InitialMessage` service, a
 * helper for encoding that value while collecting transferables, a layer for
 * providing it to the client protocol, and a decoder for reading it from the
 * worker server protocol.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NoSuchElementError } from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as Schema from "../Schema.ts"
import * as Transferable from "../workers/Transferable.ts"
import type { Protocol } from "./RpcServer.ts"

/**
 * Context service that supplies the initial RPC worker message as encoded data
 * paired with any transferables that should be posted with it.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class InitialMessage extends Context.Service<
  InitialMessage,
  Effect.Effect<
    readonly [
      data: unknown,
      transfers: ReadonlyArray<Transferable>
    ]
  >
>()("effect/rpc/RpcWorker/InitialMessage") {}

/**
 * Types related to the encoded initial message exchanged with an RPC worker.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace InitialMessage {
  /**
   * Tagged wire representation of an RPC worker initial message after schema
   * encoding.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Encoded {
    readonly _tag: "InitialMessage"
    readonly value: unknown
  }
}

const ProtocolTag = Context.Service<Protocol, Protocol["Service"]>(
  "effect/rpc/RpcServer/Protocol" satisfies Protocol["key"]
)

/**
 * Runs an effect, encodes its result with the schema's JSON codec, and returns
 * the encoded value together with collected transferables.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const makeInitialMessage = <S extends Schema.Constraint, E, R2>(
  schema: S,
  effect: Effect.Effect<S["Type"], E, R2>
): Effect.Effect<
  readonly [data: unknown, transferables: ReadonlyArray<globalThis.Transferable>],
  E | Schema.SchemaError,
  S["EncodingServices"] | R2
> => {
  const schemaJson = Schema.toCodecJson(schema)
  return Effect.flatMap(effect, (value) => {
    const collector = Transferable.makeCollectorUnsafe()
    return Schema.encodeEffect(schemaJson)(value).pipe(
      Effect.provideService(Transferable.Collector, collector),
      Effect.map((encoded) => [encoded, collector.clearUnsafe()] as const)
    )
  })
}

/**
 * Provides the `InitialMessage` service from a schema and build effect,
 * capturing the layer context and dying if schema encoding fails.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerInitialMessage = <S extends Schema.Constraint, R2>(
  schema: S,
  build: Effect.Effect<S["Type"], never, R2>
): Layer.Layer<InitialMessage, never, S["EncodingServices"] | R2> =>
  Layer.effect(InitialMessage)(
    Effect.contextWith((context: Context.Context<S["EncodingServices"] | R2>) =>
      Effect.succeed(
        Effect.provideContext(Effect.orDie(makeInitialMessage(schema, build)), context)
      )
    )
  )

/**
 * Reads the protocol initial message and decodes it with the supplied schema,
 * failing if no initial message is available or decoding fails.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const initialMessage = <S extends Schema.Constraint>(
  schema: S
): Effect.Effect<S["Type"], NoSuchElementError | Schema.SchemaError, Protocol | S["DecodingServices"]> =>
  ProtocolTag.pipe(
    Effect.flatMap((protocol) => protocol.initialMessage),
    Effect.flatMap(Effect.fromOption),
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.toCodecJson(schema)))
  )
