/**
 * Typed event definitions for the unstable event-log system.
 *
 * An `Event` is the durable contract shared by writers, handlers, journals, and
 * replicas. It gives an event a stable tag, derives the aggregate or entity
 * primary key from the decoded payload, and records the schemas used for the
 * payload, handler result, and handler errors. The payload schema is also used
 * to derive the SchemaBinary encoding for journal entries and remote
 * replication.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as SchemaBinary from "../encoding/SchemaBinary.ts"
import { pipeArguments } from "../Pipeable.ts"
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"

/**
 * Unique type identifier used to mark event log event definitions.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/eventlog/Event"

/**
 * Runtime type identifier used to mark event log event definitions.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/eventlog/Event"

/**
 * Returns `true` when a value is an event log event definition.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isEvent = (u: unknown): u is Event<any, any, any, any> => Predicate.hasProperty(u, TypeId)

/**
 * Definition of an event type that can be written to an `EventLog`.
 *
 * **Details**
 *
 * An event definition contains its tag, primary-key function, payload schema,
 * SchemaBinary payload codec, success schema, and error schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Event<
  out Tag extends string,
  in out Payload extends Schema.Top = typeof Schema.Void,
  in out Success extends Schema.Top = typeof Schema.Void,
  in out Error extends Schema.Top = typeof Schema.Never
> {
  readonly [TypeId]: TypeId
  readonly tag: Tag
  readonly primaryKey: (payload: Schema.Schema.Type<Payload>) => string
  readonly payload: Payload
  readonly payloadSchemaBinary: SchemaBinary.toCodec<Payload>
  readonly success: Success
  readonly error: Error
}

/**
 * Marker service associated with the handler for an event tag.
 *
 * **Details**
 *
 * `ToService` derives this service from an `Event` so handler layers can expose
 * which events they implement.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EventHandler<in out Tag extends string> {
  readonly _: unique symbol
  readonly tag: Tag
}

/**
 * Type-erased event log event definition.
 *
 * **Details**
 *
 * It preserves the runtime tag, primary-key function, payload schema, success
 * schema, and error schema without retaining the original type parameters.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Any {
  readonly [TypeId]: TypeId
  readonly tag: string
  readonly primaryKey: (payload: any) => string
  readonly payload: Schema.Top
  readonly payloadSchemaBinary: SchemaBinary.toCodec<Schema.Top>
  readonly success: Schema.Top
  readonly error: Schema.Top
}

/**
 * Type-erased event definition with its runtime properties available
 * structurally.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AnyWithProps extends Any {}

/**
 * Derives the handler service marker for an event definition.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ToService<A> = A extends Event<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error
> ? EventHandler<_Tag> :
  never

/**
 * Extracts the tag string from an event definition.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Tag<A> = A extends Event<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error
> ? _Tag :
  never

/**
 * Extracts the error schema from an event definition.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ErrorSchema<A extends Any> = A extends Event<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error
> ? _Error
  : never

/**
 * Decoded error value type for an event definition.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Error<A extends Any> = Schema.Schema.Type<ErrorSchema<A>>

/**
 * Returns an event definition type whose error schema also includes the provided
 * error schema.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type AddError<A extends Any, Error extends Schema.Top> = A extends Event<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error
> ? Event<_Tag, _Payload, _Success, _Error | Error>
  : never

/**
 * Extracts the payload schema from an event definition.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type PayloadSchema<A extends Any> = A extends Event<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error
> ? _Payload
  : never

/**
 * Extracts the payload schema for the event in a union with the specified tag.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type PayloadSchemaWithTag<A extends Any, Tag extends string> = A extends Event<
  Tag,
  infer _Payload,
  infer _Success,
  infer _Error
> ? _Payload
  : never

/**
 * Decoded payload value type for an event definition.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Payload<A extends Any> = Schema.Schema.Type<PayloadSchema<A>>

/**
 * Tagged payload value for an event definition.
 *
 * **Details**
 *
 * The result contains `_tag` set to the event tag and `payload` set to the
 * decoded payload value.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type TaggedPayload<A extends Any> = A extends Event<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error
> ? {
    readonly _tag: _Tag
    readonly payload: Schema.Schema.Type<_Payload>
  }
  : never

/**
 * Extracts the success schema from an event definition.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type SuccessSchema<A extends Any> = A extends Event<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error
> ? _Success
  : never

/**
 * Decoded success value type for an event definition.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Success<A extends Any> = Schema.Schema.Type<SuccessSchema<A>>

/**
 * Schema services required by a client for an event definition.
 *
 * **Details**
 *
 * This includes payload encoding services plus success and error decoding
 * services.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ServicesClient<A> = A extends Event<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error
> ?
    | _Payload["EncodingServices"]
    | _Success["DecodingServices"]
    | _Error["DecodingServices"]
  : never

/**
 * Schema services required by a server for an event definition.
 *
 * **Details**
 *
 * This includes payload decoding services plus success and error encoding
 * services.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ServicesServer<A> = A extends Event<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error
> ?
    | _Payload["DecodingServices"]
    | _Success["EncodingServices"]
    | _Error["EncodingServices"]
  : never

/**
 * All schema services required to encode and decode the payload, success, and
 * error schemas for an event definition.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Services<A> = A extends Event<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error
> ?
    | _Payload["DecodingServices"]
    | _Success["EncodingServices"]
    | _Error["EncodingServices"]
    | _Payload["EncodingServices"]
    | _Success["DecodingServices"]
    | _Error["DecodingServices"]
  : never

/**
 * Extracts the event definition with the specified tag from an event union.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type WithTag<Events extends Any, Tag extends string> = Extract<Events, { readonly tag: Tag }>

/**
 * Removes event definitions with the specified tag from an event union.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ExcludeTag<Events extends Any, Tag extends string> = Exclude<Events, { readonly tag: Tag }>

/**
 * Decoded payload value type for the event in a union with the specified tag.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type PayloadWithTag<Events extends Any, Tag extends string> = Payload<WithTag<Events, Tag>>

/**
 * Decoded success value type for the event in a union with the specified tag.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type SuccessWithTag<Events extends Any, Tag extends string> = Success<WithTag<Events, Tag>>

/**
 * Decoded error value type for the event in a union with the specified tag.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ErrorWithTag<Events extends Any, Tag extends string> = Error<WithTag<Events, Tag>>

/**
 * Client-side schema services required for the event in a union with the specified
 * tag.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ServicesClientWithTag<Events extends Any, Tag extends string> = ServicesClient<WithTag<Events, Tag>>

const Proto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Creates an event log event definition.
 *
 * **Details**
 *
 * If omitted, the payload and success schemas default to `Schema.Void`, the error
 * schema defaults to `Schema.Never`, and the SchemaBinary payload codec is derived
 * from the payload schema.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function make<
  Tag extends string,
  Payload extends Schema.Top = typeof Schema.Void,
  Success extends Schema.Top = typeof Schema.Void,
  Error extends Schema.Top = typeof Schema.Never
>(options: {
  readonly tag: Tag
  readonly primaryKey: (payload: Schema.Schema.Type<Payload>) => string
  readonly payload?: Payload | undefined
  readonly success?: Success | undefined
  readonly error?: Error | undefined
}): Event<Tag, Payload, Success, Error>
/**
 * @stability unstable
 */
export function make(options: {
  readonly tag: string
  readonly primaryKey: (payload: Schema.Schema.Type<Schema.Top>) => string
  readonly payload?: Schema.Constraint | undefined
  readonly success?: Schema.Constraint | undefined
  readonly error?: Schema.Constraint | undefined
}): Event<string, Schema.Top, Schema.Top, typeof Schema.Never> {
  const payload = options.payload ?? Schema.Void
  const success = options.success ?? Schema.Void
  const error = options.error ?? Schema.Never
  return Object.assign(Object.create(Proto), {
    tag: options.tag,
    primaryKey: options.primaryKey,
    payload,
    payloadSchemaBinary: SchemaBinary.toCodec(payload),
    success,
    error
  })
}

/**
 * Adds another error schema to an event definition.
 *
 * **Details**
 *
 * The returned event keeps the same tag, primary key, payload, and success schema
 * while replacing the error schema with a union of the existing and new errors.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function addError<A extends Any, Error2 extends Schema.Top>(
  event: A,
  error: Error2
): AddError<A, Error2>
/**
 * @stability unstable
 */
export function addError(event: Any, error: Schema.Top): Any {
  return make({
    tag: event.tag,
    primaryKey: event.primaryKey,
    payload: event.payload,
    success: event.success,
    error: Schema.Union([event.error, error])
  })
}
