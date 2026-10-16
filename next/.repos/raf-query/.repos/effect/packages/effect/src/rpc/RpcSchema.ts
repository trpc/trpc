/**
 * RPC schema markers and interruption annotations.
 *
 * This module contains the small pieces of schema metadata that the RPC
 * declaration, client, server, cluster, and reactivity layers share. It marks
 * streamed responses and annotates interruptions that came from a remote client
 * closing or cancelling a request.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import { constUndefined } from "../Function.ts"
import * as Option from "../Option.ts"
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import type * as SchemaAST from "../SchemaAST.ts"
import * as Stream_ from "../Stream.ts"

const StreamSchemaTypeId = "~effect/rpc/RpcSchema/StreamSchema"

/**
 * Returns `true` when a schema is an RPC stream schema created by
 * `RpcSchema.Stream`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export function isStreamSchema(schema: Schema.Constraint): schema is Stream<Schema.Top, Schema.Top> {
  return Predicate.hasProperty(schema, StreamSchemaTypeId)
}

/**
 * @internal
 */
export function getStreamSchemas(schema: Schema.Constraint): Option.Option<{
  readonly success: Schema.Top
  readonly error: Schema.Top
}> {
  return isStreamSchema(schema) ?
    Option.some({
      success: schema.success,
      error: schema.error
    }) :
    Option.none()
}

/**
 * A schema marker for RPC streaming responses, storing the success element
 * schema and stream error schema used for encoding and decoding stream chunks.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Stream<A extends Schema.Constraint, E extends Schema.Constraint> extends
  Schema.BottomLazy<
    SchemaAST.Declaration,
    Stream<A, E>
  >
{
  readonly "Type": Stream_.Stream<A["Type"], E["Type"]>
  readonly "Encoded": Stream_.Stream<A["Encoded"], E["Encoded"]>
  readonly "DecodingServices": A["DecodingServices"] | E["DecodingServices"]
  readonly "EncodingServices": A["EncodingServices"] | E["EncodingServices"]
  readonly "Rebuild": Stream<A, E>
  readonly "~type.make.in": Stream_.Stream<A["Type"], E["Type"]>
  readonly "~type.make": Stream_.Stream<A["Type"], E["Type"]>
  readonly "Iso": Stream_.Stream<A["Type"], E["Type"]>
  readonly [StreamSchemaTypeId]: typeof StreamSchemaTypeId
  readonly success: A
  readonly error: E
}

const schema = Schema.declare(Stream_.isStream)

/**
 * Creates an RPC stream schema from a stream element success schema and stream
 * error schema.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function Stream<A extends Schema.Constraint, E extends Schema.Constraint>(success: A, error: E): Stream<A, E> {
  return Schema.make(schema.ast, { [StreamSchemaTypeId]: StreamSchemaTypeId, success, error })
}

/**
 * Annotation that marks interruptions that originate from an RPC client
 * abort.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class ClientAbort extends Context.Service<ClientAbort, true>()("effect/rpc/RpcSchema/ClientAbort") {
  static annotation = this.context(true).pipe(
    Context.add(Cause.StackTrace, {
      name: "ClientAbort",
      stack: constUndefined,
      parent: undefined
    })
  )
}
