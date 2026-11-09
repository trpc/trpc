/**
 * Describes request values whose results can be persisted.
 *
 * A `Persistable` request has a primary key and schemas for its success and
 * error results. `Persistence` and `PersistedCache` use that information to
 * store the request's `Exit` value and restore it later from a backing store.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Duration from "../Duration.ts"
import type * as Effect from "../Effect.ts"
import type * as Exit from "../Exit.ts"
import * as InternalRecord from "../internal/record.ts"
import * as PrimaryKey from "../PrimaryKey.ts"
import * as Request from "../Request.ts"
import * as Schema from "../Schema.ts"
import type * as Types from "../Types.ts"
import type { PersistenceError } from "./Persistence.ts"

/**
 * Defines the property key used to attach success and error schemas to persistable
 * requests.
 *
 * **When to use**
 *
 * Use to implement persistable request values by attaching success and error
 * schemas at this property key.
 *
 * @stability unstable
 * @category symbols
 * @since 4.0.0
 */
export const symbol = "~effect/persistence/Persistable" as const

/**
 * A primary-keyed request value whose success and error results can be
 * serialized for persistence.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Persistable<A extends Schema.Constraint, E extends Schema.Constraint> extends PrimaryKey.PrimaryKey {
  readonly [symbol]: {
    readonly success: A
    readonly error: E
  }
}

/**
 * Any persistable request regardless of its success and error schemas.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Any = Persistable<Schema.Constraint, Schema.Constraint>

/**
 * Extracts the success schema from a persistable request.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type SuccessSchema<A extends Any> = A["~effect/persistence/Persistable"]["success"]

/**
 * Extracts the success value type from a persistable request.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Success<A extends Any> = A["~effect/persistence/Persistable"]["success"]["Type"]

/**
 * Extracts the error schema from a persistable request.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ErrorSchema<A extends Any> = A["~effect/persistence/Persistable"]["error"]

/**
 * Extracts the error value type from a persistable request.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Error<A extends Any> = A["~effect/persistence/Persistable"]["error"]["Type"]

/**
 * Services required to decode a persisted success or error value for the
 * request.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type DecodingServices<A extends Any> =
  | A["~effect/persistence/Persistable"]["success"]["DecodingServices"]
  | A["~effect/persistence/Persistable"]["error"]["DecodingServices"]

/**
 * Services required to encode a success or error value for persistence.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type EncodingServices<A extends Any> =
  | A["~effect/persistence/Persistable"]["success"]["EncodingServices"]
  | A["~effect/persistence/Persistable"]["error"]["EncodingServices"]

/**
 * All schema services required to encode and decode a persistable request
 * result.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Services<A extends Any> =
  | A["~effect/persistence/Persistable"]["success"]["DecodingServices"]
  | A["~effect/persistence/Persistable"]["success"]["EncodingServices"]
  | A["~effect/persistence/Persistable"]["error"]["DecodingServices"]
  | A["~effect/persistence/Persistable"]["error"]["EncodingServices"]

/**
 * Computes the time to live for a persisted result from the result `Exit` and
 * request value.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type TimeToLiveFn<K extends Any> = (exit: Exit.Exit<Success<K>, Error<K>>, request: K) => Duration.Input

/**
 * Creates request classes that implement `Persistable` and `Request.Request`.
 *
 * **Details**
 *
 * The generated class stores the supplied tag, derives its primary key from
 * the payload, and carries schemas for persisted success and error exits.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Class = <
  Config extends {
    payload: Record<string, unknown>
    requires?: any
    requestError?: any
  } = { payload: {} }
>() =>
<
  const Tag extends string,
  A extends Schema.Constraint = Schema.Void,
  E extends Schema.Constraint = Schema.Never
>(tag: Tag, options: {
  readonly primaryKey: (payload: Config["payload"]) => string
  readonly success?: A | undefined
  readonly error?: E | undefined
}): new(
  args: Types.EqualsWith<
    Config["payload"],
    {},
    void,
    {
      readonly [
        P in keyof Config["payload"] as P extends "_tag" ? never : P
      ]: Config["payload"][P]
    }
  >
) =>
  & { readonly _tag: Tag }
  & { readonly [K in keyof Config["payload"]]: Config["payload"][K] }
  & Persistable<A, E>
  & Request.Request<
    A["Type"],
    | E["Type"]
    | ("requestError" extends keyof Config ? Config["requestError"] : (PersistenceError | Schema.SchemaError)),
    | A["DecodingServices"]
    | A["EncodingServices"]
    | E["DecodingServices"]
    | E["EncodingServices"]
    | ("requires" extends keyof Config ? Config["requires"] : never)
  > =>
{
  function Persistable(this: any, props: object | undefined) {
    this._tag = tag
    if (props) {
      InternalRecord.assignProperties(this, props)
    }
  }
  Persistable.prototype = {
    ...Request.RequestPrototype,
    [PrimaryKey.symbol]() {
      return options.primaryKey(this)
    },
    [symbol]: {
      success: options.success ?? Schema.Void,
      error: options.error ?? Schema.Never
    }
  }
  return Persistable as any
}

/**
 * Returns the cached `Exit` schema for a persistable request's success and
 * error schemas.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const exitSchema = <A extends Schema.Constraint, E extends Schema.Constraint>(
  self: Persistable<A, E>
): Schema.Exit<A, E, Schema.Defect> => {
  let schema = exitSchemaCache.get(self)
  if (schema) return schema as Schema.Exit<A, E, Schema.Defect>
  schema = Schema.Exit(self[symbol].success, self[symbol].error, Schema.Defect())
  exitSchemaCache.set(self, schema)
  return schema as Schema.Exit<A, E, Schema.Defect>
}

const exitSchemaCache = new WeakMap<Persistable<any, any>, Schema.Exit<any, any, Schema.Defect>>()

/**
 * Encodes an `Exit` for a persistable request using its success and error
 * schemas.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const serializeExit = <A extends Schema.Constraint, E extends Schema.Constraint>(
  self: Persistable<A, E>,
  exit: Exit.Exit<A["Type"], E["Type"]>
): Effect.Effect<unknown, Schema.SchemaError, A["EncodingServices"] | E["EncodingServices"]> => {
  const schema = Schema.toCodecJson(exitSchema(self))
  return Schema.encodeEffect(schema)(exit)
}

/**
 * Decodes a persisted value into an `Exit` for a persistable request using its
 * success and error schemas.
 *
 * @stability unstable
 * @category serialization
 * @since 4.0.0
 */
export const deserializeExit = <A extends Schema.Constraint, E extends Schema.Constraint>(
  self: Persistable<A, E>,
  encoded: unknown
): Effect.Effect<
  Exit.Exit<A["Type"], E["Type"]>,
  Schema.SchemaError,
  A["DecodingServices"] | E["DecodingServices"]
> => {
  const schema = Schema.toCodecJson(exitSchema(self))
  return Schema.decodeUnknownEffect(schema)(encoded)
}
