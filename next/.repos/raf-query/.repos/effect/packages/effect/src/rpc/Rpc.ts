/**
 * Defines schema-backed contracts for individual RPC procedures.
 *
 * An `Rpc` describes one remote procedure by recording its tag, payload schema,
 * success schema, error schema, defect schema, middleware, and annotations.
 * Clients and servers read the same declaration, so the procedure contract is
 * independent of the transport used to call it. This module includes
 * constructors, type helpers for deriving client and handler shapes, exit
 * schemas, and handler wrappers for special execution modes.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import type { Deferred } from "../Deferred.ts"
import type { Effect } from "../Effect.ts"
import type { Exit as Exit_ } from "../Exit.ts"
import type { Headers } from "../http/Headers.ts"
import * as Option from "../Option.ts"
import { type Pipeable, pipeArguments } from "../Pipeable.ts"
import * as Predicate from "../Predicate.ts"
import * as PrimaryKey from "../PrimaryKey.ts"
import type * as Queue from "../Queue.ts"
import * as Schema from "../Schema.ts"
import type { Stream } from "../Stream.ts"
import type * as Struct from "../Struct.ts"
import type { NoInfer } from "../Types.ts"
import type { RequestId } from "./RpcMessage.ts"
import type * as RpcMiddleware from "./RpcMiddleware.ts"
import * as RpcSchema from "./RpcSchema.ts"

const TypeId = "~effect/rpc/Rpc"

/**
 * Returns `true` when the value is an `Rpc` definition.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isRpc = (u: unknown): u is Rpc<any, any, any> => Predicate.hasProperty(u, TypeId)

/**
 * Schema for RPC defects.
 *
 * **Details**
 *
 * Defect schemas decode and encode without services and can be constructed from
 * `null`, `undefined`, or an object value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface DefectSchema extends Schema.Top {
  make(input: null, options?: Schema.MakeOptions): unknown
  make(input: undefined, options?: Schema.MakeOptions): unknown
  make(input: {}, options?: Schema.MakeOptions): unknown
  readonly DecodingServices: never
  readonly EncodingServices: never
}

/**
 * Represents a typed RPC definition.
 *
 * **Details**
 *
 * An RPC is identified by a tag and carries payload, success, error, defect,
 * middleware, and annotation metadata used by RPC clients and servers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Rpc<
  in out Tag extends string,
  out Payload extends Schema.Top = Schema.Void,
  out Success extends Schema.Top = Schema.Void,
  out Error extends Schema.Top = Schema.Never,
  out Middleware extends RpcMiddleware.AnyService = never,
  out Requires = never
> extends Pipeable {
  new(_: never): {}

  readonly [TypeId]: typeof TypeId
  readonly _tag: Tag
  readonly key: string
  readonly payloadSchema: Payload
  readonly successSchema: Success
  readonly errorSchema: Error
  readonly defectSchema: Schema.Top
  readonly annotations: Context.Context<never>
  readonly middlewares: ReadonlySet<Middleware>
  readonly "~requires": Requires

  /**
   * Set the schema for the success response of the rpc.
   */
  setSuccess<S extends Schema.Top>(schema: S): Rpc<
    Tag,
    Payload,
    S,
    Error,
    Middleware,
    Requires
  >

  /**
   * Set the schema for the error response of the rpc.
   */
  setError<E extends Schema.Top>(schema: E): Rpc<
    Tag,
    Payload,
    Success,
    E,
    Middleware,
    Requires
  >

  /**
   * Set the schema for the payload of the rpc.
   */
  setPayload<P extends Schema.Top | Schema.Struct.Fields>(
    schema: P
  ): Rpc<
    Tag,
    P extends Schema.Struct.Fields ? Schema.Struct<P> : P,
    Success,
    Error,
    Middleware,
    Requires
  >

  /**
   * Add an `RpcMiddleware` to this procedure.
   */
  middleware<M extends RpcMiddleware.AnyService>(middleware: M): Rpc<
    Tag,
    Payload,
    Success,
    Error,
    Middleware | M,
    RpcMiddleware.ApplyServices<M["Identifier"], Requires>
  >

  /**
   * Set the schema for the error response of the rpc.
   */
  prefix<const Prefix extends string>(prefix: Prefix): Rpc<
    `${Prefix}${Tag}`,
    Payload,
    Success,
    Error,
    Middleware,
    Requires
  >

  /**
   * Add an annotation on the rpc.
   */
  annotate<I, S>(
    tag: Context.Key<I, S>,
    value: NoInfer<S>
  ): Rpc<Tag, Payload, Success, Error, Middleware, Requires>

  /**
   * Merge the annotations of the rpc with the provided annotations.
   */
  annotateMerge<I>(
    annotations: Context.Context<I>
  ): Rpc<Tag, Payload, Success, Error, Middleware, Requires>
}

/**
 * Represents server-side metadata for the client associated with an RPC request.
 *
 * **When to use**
 *
 * Use to inspect or annotate the connected client while handling an RPC request
 * on the server.
 *
 * **Details**
 *
 * It stores the client id and request annotations that handlers can read or
 * extend.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class ServerClient {
  readonly id: number
  annotations: Context.Context<never>
  constructor(id: number) {
    this.id = id
    this.annotations = Context.empty()
  }
  annotate<I, S>(
    tag: Context.Key<I, S>,
    value: NoInfer<S>
  ): ServerClient {
    this.annotations = Context.add(this.annotations, tag, value)
    return this
  }
}

/**
 * Represents the server-side implementation of an RPC.
 *
 * **Details**
 *
 * The handler receives the decoded request plus client, request id, headers,
 * and RPC metadata, and returns either an effectful result or a stream result.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Handler<Tag extends string> {
  readonly _: unique symbol
  readonly tag: Tag
  readonly handler: (request: any, options: {
    readonly client: ServerClient
    readonly requestId: RequestId
    readonly headers: Headers
    readonly rpc: Any
  }) => Effect<{} | Deferred<any, any>, any> | Stream<any, any>
  readonly context: Context.Context<never>
}

/**
 * An erased RPC definition that preserves the common runtime metadata shared by
 * all RPCs.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Any extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly _tag: string
  readonly key: string
  readonly annotations: Context.Context<never>
}

/**
 * An erased RPC definition with all schema, middleware, annotation, and service
 * metadata available.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AnyWithProps extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly _tag: string
  readonly key: string
  readonly payloadSchema: Schema.Top
  readonly successSchema: Schema.Top
  readonly errorSchema: Schema.Top
  readonly defectSchema: Schema.Top
  readonly annotations: Context.Context<never>
  readonly middlewares: ReadonlySet<RpcMiddleware.AnyServiceWithProps>
  readonly "~requires": any
}

/**
 * Extracts the tag string from an `Rpc`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Tag<R> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? _Tag
  : never

/**
 * Extracts the success schema from an `Rpc`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type SuccessSchema<R> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? _Success
  : never

/**
 * Extracts the decoded success value type from an `Rpc`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Success<R> = SuccessSchema<R>["Type"]

/**
 * Extracts the encoded success value type from an `Rpc`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type SuccessEncoded<R> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? _Success["Encoded"]
  : never

/**
 * Extracts the success schema used in an RPC exit.
 *
 * **Details**
 *
 * For streaming RPCs, this is the stream element schema; otherwise it is the
 * RPC success schema.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type SuccessExitSchema<R> = SuccessSchema<R> extends RpcSchema.Stream<infer _A, infer _E> ? _A : SuccessSchema<R>

/**
 * Extracts the decoded success value carried by an RPC exit.
 *
 * **Details**
 *
 * For streaming RPCs, the immediate exit success is `void` because stream
 * elements are delivered separately.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type SuccessExit<R> = Success<R> extends infer T ? T extends Stream<infer _A, infer _E, infer _Env> ? void : T
  : never

/**
 * Extracts the decoded stream element type from a streaming RPC, or `never` for
 * non-streaming RPCs.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type SuccessChunk<R> = Success<R> extends Stream<infer _A, infer _E, infer _Env> ? _A : never

/**
 * Extracts the RPC error schema, including error schemas contributed by
 * middleware.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ErrorSchema<R> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? _Error | _Middleware["error"]
  : never

/**
 * Extracts the decoded error value type from an `Rpc`, including middleware
 * errors.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Error<R> = Schema.Schema.Type<ErrorSchema<R>>

/**
 * Extracts the error schema used in an RPC exit.
 *
 * **Details**
 *
 * For streaming RPCs, this includes both the stream error schema and the RPC
 * error schema; otherwise it is the RPC error schema.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ErrorExitSchema<R> = SuccessSchema<R> extends RpcSchema.Stream<infer _A, infer _E> ? _E | ErrorSchema<R>
  : ErrorSchema<R>

/**
 * Extracts the decoded error type used by an RPC exit.
 *
 * **Details**
 *
 * For streaming RPCs, this includes both stream errors and RPC errors.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ErrorExit<R> = Success<R> extends Stream<infer _A, infer _E, infer _Env> ? _E | Error<R> : Error<R>

/**
 * The `Exit` type produced for an RPC, using the RPC's exit success and exit
 * error types.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Exit<R> = Exit_<SuccessExit<R>, ErrorExit<R>>

/**
 * Extracts the payload constructor input type accepted by the RPC payload
 * schema.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type PayloadConstructor<R> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? _Payload["~type.make.in"]
  : never

/**
 * Extracts the decoded payload type from an `Rpc`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Payload<R> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? _Payload["Type"]
  : never

/**
 * Extracts all schema services required to encode or decode an RPC's payload,
 * success, error, and middleware error schemas.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Services<R> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ?
    | _Payload["DecodingServices"]
    | _Payload["EncodingServices"]
    | _Success["DecodingServices"]
    | _Success["EncodingServices"]
    | _Error["DecodingServices"]
    | _Error["EncodingServices"]
    | _Middleware["error"]["DecodingServices"]
    | _Middleware["error"]["EncodingServices"]
  : never

/**
 * Extracts the schema services required on the client side of an RPC.
 *
 * **Details**
 *
 * This includes payload encoding services and success, error, and middleware
 * error decoding services.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ServicesClient<R> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ?
    | _Payload["EncodingServices"]
    | _Success["DecodingServices"]
    | _Error["DecodingServices"]
    | _Middleware["error"]["DecodingServices"]
  : never

/**
 * Extracts the schema services required on the server side of an RPC.
 *
 * **Details**
 *
 * This includes payload decoding services and success, error, and middleware
 * error encoding services.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ServicesServer<R> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ?
    | _Payload["DecodingServices"]
    | _Success["EncodingServices"]
    | _Error["EncodingServices"]
    | _Middleware["error"]["EncodingServices"]
  : never

/**
 * Extracts the service identifiers for middleware attached to an `Rpc`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Middleware<R> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? Context.Service.Identifier<_Middleware>
  : never

/**
 * Extracts client-side middleware service requirements for middleware marked as
 * required on the client.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type MiddlewareClient<R> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? _Middleware extends { readonly requiredForClient: true } ? RpcMiddleware.ForClient<_Middleware["Identifier"]>
  : never
  : never

/**
 * Returns an RPC type with an additional error schema unioned into its error
 * channel.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type AddError<R extends Any, Error extends Schema.Top> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? Rpc<
    _Tag,
    _Payload,
    _Success,
    _Error | Error,
    _Middleware,
    _Requires
  > :
  never

/**
 * Returns an RPC type with additional middleware and the corresponding
 * middleware service requirements applied.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type AddMiddleware<R extends Any, Middleware extends RpcMiddleware.AnyService> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? Rpc<
    _Tag,
    _Payload,
    _Success,
    _Error,
    _Middleware | Middleware,
    RpcMiddleware.ApplyServices<Middleware["Identifier"], _Requires>
  > :
  never

/**
 * Converts an RPC definition into the corresponding `Handler` type.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ToHandler<R extends Any> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? Handler<_Tag> :
  never

/**
 * The function signature for implementing an RPC handler.
 *
 * **Details**
 *
 * The function receives the decoded payload and request metadata, and returns
 * the RPC result shape, optionally wrapped with `Wrapper` options.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ToHandlerFn<Current extends Any, R = any> = (
  payload: Payload<Current>,
  options: {
    readonly client: ServerClient
    readonly requestId: RequestId
    readonly headers: Headers
    readonly rpc: Current
  }
) => WrapperOr<ResultFrom<Current, R>>

/**
 * Returns `true` when the RPC with the specified tag has a streaming success
 * schema, or `never` otherwise.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type IsStream<R extends Any, Tag extends string> = R extends Rpc<
  Tag,
  infer _Payload,
  RpcSchema.Stream<infer _A, infer _E>,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? true :
  never

/**
 * Extracts RPCs whose tags match the given tag or union of tags.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ExtractTag<R extends Any, Tag extends string> = R extends Rpc<
  infer _Tag extends Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? R :
  never

/**
 * Extracts the services provided by middleware on the RPC with the specified
 * tag.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ExtractProvides<R extends Any, Tag extends string> = R extends Rpc<
  Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? RpcMiddleware.Provides<_Middleware["Identifier"]> :
  never

/**
 * Extracts the service requirements of the RPC with the specified tag.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ExtractRequires<R extends Any, Tag extends string> = R extends Rpc<
  Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? _Requires :
  never

/**
 * Removes the services provided by middleware for the specified RPC tag from an
 * environment type.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ExcludeProvides<Env, R extends Any, Tag extends string> = Exclude<
  Env,
  ExtractProvides<R, Tag>
>

/**
 * Computes the allowed handler result type for an RPC.
 *
 * **Details**
 *
 * Streaming RPCs may return a stream or an effect that produces a queue. Other
 * RPCs return an effect that succeeds with the success value or a deferred
 * success value.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ResultFrom<R extends Any, Services> = R extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? [_Success] extends [RpcSchema.Stream<infer _SA, infer _SE>] ?
      | Stream<
        _SA["Type"],
        _SE["Type"] | _Error["Type"],
        Services
      >
      | Effect<
        Queue.Dequeue<_SA["Type"], _SE["Type"] | _Error["Type"] | Cause.Done>,
        _SE["Type"] | Schema.Schema.Type<_Error>,
        Services
      > :
  Effect<
    _Success["Type"] | Deferred<_Success["Type"], _Error["Type"]>,
    _Error["Type"],
    Services
  > :
  never

/**
 * Returns an RPC type with the specified string prefix added to its tag while
 * preserving its payload, success, error, middleware, and requirements.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Prefixed<Rpcs extends Any, Prefix extends string> = Rpcs extends Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? Rpc<
    `${Prefix}${_Tag}`,
    _Payload,
    _Success,
    _Error,
    _Middleware,
    _Requires
  >
  : never

const Proto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  },
  setSuccess(
    this: AnyWithProps,
    successSchema: Schema.Top
  ) {
    return makeProto({
      _tag: this._tag,
      payloadSchema: this.payloadSchema,
      successSchema,
      errorSchema: this.errorSchema,
      defectSchema: this.defectSchema,
      annotations: this.annotations,
      middlewares: this.middlewares
    })
  },
  setError(this: AnyWithProps, errorSchema: Schema.Top) {
    return makeProto({
      _tag: this._tag,
      payloadSchema: this.payloadSchema,
      successSchema: this.successSchema,
      errorSchema,
      defectSchema: this.defectSchema,
      annotations: this.annotations,
      middlewares: this.middlewares
    })
  },
  setPayload(this: AnyWithProps, payloadSchema: Schema.Struct<Schema.Struct.Fields> | Schema.Struct.Fields) {
    return makeProto({
      _tag: this._tag,
      payloadSchema: Schema.isSchema(payloadSchema) ? payloadSchema as any : Schema.Struct(payloadSchema as any),
      successSchema: this.successSchema,
      errorSchema: this.errorSchema,
      defectSchema: this.defectSchema,
      annotations: this.annotations,
      middlewares: this.middlewares
    })
  },
  middleware(this: AnyWithProps, middleware: RpcMiddleware.AnyService) {
    return makeProto({
      _tag: this._tag,
      payloadSchema: this.payloadSchema,
      successSchema: this.successSchema,
      errorSchema: this.errorSchema,
      defectSchema: this.defectSchema,
      annotations: this.annotations,
      middlewares: new Set([...this.middlewares, middleware])
    })
  },
  prefix(this: AnyWithProps, prefix: string) {
    return makeProto({
      _tag: `${prefix}${this._tag}`,
      payloadSchema: this.payloadSchema,
      successSchema: this.successSchema,
      errorSchema: this.errorSchema,
      defectSchema: this.defectSchema,
      annotations: this.annotations,
      middlewares: this.middlewares
    })
  },
  annotate(this: AnyWithProps, tag: Context.Key<any, any>, value: any) {
    return makeProto({
      _tag: this._tag,
      payloadSchema: this.payloadSchema,
      successSchema: this.successSchema,
      errorSchema: this.errorSchema,
      defectSchema: this.defectSchema,
      middlewares: this.middlewares,
      annotations: Context.add(this.annotations, tag, value)
    })
  },
  annotateMerge(this: AnyWithProps, context: Context.Context<any>) {
    return makeProto({
      _tag: this._tag,
      payloadSchema: this.payloadSchema,
      successSchema: this.successSchema,
      errorSchema: this.errorSchema,
      defectSchema: this.defectSchema,
      middlewares: this.middlewares,
      annotations: Context.merge(this.annotations, context)
    })
  }
}

const makeProto = <
  const Tag extends string,
  Payload extends Schema.Top,
  Success extends Schema.Top,
  Error extends Schema.Top,
  Middleware extends RpcMiddleware.AnyService,
  Requires
>(options: {
  readonly _tag: Tag
  readonly payloadSchema: Payload
  readonly successSchema: Success
  readonly errorSchema: Error
  readonly defectSchema: Schema.Constraint
  readonly annotations: Context.Context<never>
  readonly middlewares: ReadonlySet<Middleware>
}): Rpc<Tag, Payload, Success, Error, Middleware, Requires> => {
  function Rpc() {}
  Object.setPrototypeOf(Rpc, Proto)
  Object.assign(Rpc, options)
  Rpc.key = `effect/rpc/Rpc/${options._tag}`
  return Rpc as any
}

/**
 * Creates an RPC definition with the supplied tag and optional schemas.
 *
 * **Details**
 *
 * Payload options can be either a schema or struct fields. `stream: true` wraps
 * the success and error schemas in a stream schema and sets the normal error
 * schema to `Schema.Never`. `primaryKey` creates a payload class with a
 * primary key derived from the payload value.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <
  const Tag extends string,
  Payload extends Schema.Top | Schema.Struct.Fields = Schema.Void,
  Success extends Schema.Top = Schema.Void,
  Error extends Schema.Top = Schema.Never,
  const Stream extends boolean = false
>(tag: Tag, options?: {
  readonly payload?: Payload
  readonly success?: Success
  readonly error?: Error
  readonly defect?: DefectSchema
  readonly stream?: Stream
  readonly primaryKey?: [Payload] extends [Schema.Struct.Fields] ? ((
      payload: Payload extends Schema.Struct.Fields ? Struct.Simplify<Schema.Struct<Payload>["Type"]> : Payload["Type"]
    ) => string) :
    never
}): Rpc<
  Tag,
  Payload extends Schema.Struct.Fields ? Schema.Struct<Payload> : Payload,
  Stream extends true ? RpcSchema.Stream<Success, Error> : Success,
  Stream extends true ? typeof Schema.Never : Error
> => {
  const successSchema = options?.success ?? Schema.Void
  const errorSchema = options?.error ?? Schema.Never
  const defectSchema = options?.defect ?? Schema.Defect()
  let payloadSchema: any
  if (options?.primaryKey) {
    payloadSchema = class Payload extends Schema.Class<Payload>(`effect/rpc/Rpc/${tag}`)(options.payload as any) {
      [PrimaryKey.symbol](): string {
        return options.primaryKey!(this as any)
      }
    }
  } else {
    payloadSchema = Schema.isSchema(options?.payload)
      ? options?.payload as any
      : options?.payload
      ? Schema.Struct(options?.payload as any)
      : Schema.Void
  }
  return makeProto({
    _tag: tag,
    payloadSchema,
    successSchema: options?.stream ?
      RpcSchema.Stream(successSchema, errorSchema) :
      successSchema,
    errorSchema: options?.stream ? Schema.Never : errorSchema,
    defectSchema,
    annotations: Context.empty(),
    middlewares: new Set<never>()
  }) as any
}

/**
 * Creates a custom `Rpc` constructor that can transform the output schemas.
 *
 * **Example** (Defining a paginated RPC constructor)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Rpc } from "effect/rpc"
 *
 * // Create a custom Rpc wrapper definition by transforming the success and error
 * // schemas.
 * export interface RpcWithPagination extends Rpc.Custom {
 *   readonly out: Rpc.Custom.Out<
 *     Paginated<this["success"]>,
 *     this["error"]
 *   >
 * }
 *
 * // The type definition for the transformed success schema.
 * export interface Paginated<S extends Schema.Constraint> extends
 *   Schema.Struct<{
 *     readonly offset: Schema.Number
 *     readonly total: Schema.Number
 *     readonly results: Schema.$Array<S>
 *   }>
 * {}
 *
 * // You can then implement the schema transformation using `Rpc.custom`
 * export const makePaginated = Rpc.custom<RpcWithPagination>((schemas) => ({
 *   ...schemas,
 *   success: Schema.Struct({
 *     offset: Schema.Number,
 *     total: Schema.Number,
 *     results: Schema.Array(schemas.success)
 *   })
 * }))
 *
 * // You can then use the custom constructor in the same way `Rpc.make` is used.
 * export const listAllRpc = makePaginated("listAll", {
 *   success: Schema.String
 * })
 *
 * const result = [listAllRpc._tag, Schema.isSchema(listAllRpc.successSchema)] // => ["listAll", true]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const custom = <Def extends Custom>(
  f: (options: Custom.OutDefault) => (Def & Custom.OutDefault)["out"]
) =>
<
  const Tag extends string,
  Payload extends Schema.Top | Schema.Struct.Fields = Schema.Void,
  Success extends Schema.Top = Schema.Void,
  Error extends Schema.Top = Schema.Never,
  const Stream extends boolean = false,
  Out extends Custom.OutDefault = Custom.Kind<Def, Success, Error>
>(tag: Tag, options?: {
  readonly payload?: Payload
  readonly success?: Success
  readonly error?: Error
  readonly defect?: DefectSchema
  readonly stream?: Stream
  readonly primaryKey?: [Payload] extends [Schema.Struct.Fields] ? ((
      payload: Payload extends Schema.Struct.Fields ? Struct.Simplify<Schema.Struct<Payload>["Type"]> : Payload["Type"]
    ) => string) :
    never
}): Rpc<
  Tag,
  Payload extends Schema.Struct.Fields ? Schema.Struct<Payload> : Payload,
  Stream extends true ? RpcSchema.Stream<Out["success"], Out["error"]> : Out["success"],
  Stream extends true ? typeof Schema.Never : Out["error"]
> => {
  const success = options?.success ?? Schema.Void
  const error = options?.error ?? Schema.Never
  const defect = options?.defect ?? Schema.Defect()
  const out = f({
    success,
    error,
    defect
  })
  return make(tag, {
    ...out,
    primaryKey: options?.primaryKey,
    payload: options?.payload,
    stream: options?.stream
  }) as any
}

/**
 * Defines the type-level contract for an RPC custom constructor.
 *
 * **Details**
 *
 * A custom constructor receives the original success, error, and defect schemas
 * and returns transformed output schemas through `out`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export interface Custom {
  readonly out: Custom.OutDefault
  readonly success: Schema.Top
  readonly error: Schema.Top
  readonly defect: DefectSchema
}

/**
 * Helper types for defining RPC custom constructors.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Custom {
  /**
   * The transformed schemas produced by a custom RPC constructor.
   *
   * @stability unstable
   * @category constructors
   * @since 4.0.0
   */
  export interface Out<
    Success extends Schema.Constraint,
    Error extends Schema.Constraint
  > {
    readonly success: Success
    readonly error: Error
    readonly defect: DefectSchema
  }

  /**
   * The default custom-constructor output shape for arbitrary success and error
   * schemas.
   *
   * @stability unstable
   * @category constructors
   * @since 4.0.0
   */
  export type OutDefault = Out<Schema.Top, Schema.Top>

  /**
   * Applies a custom constructor definition to concrete success and error
   * schemas and returns its transformed output schema type.
   *
   * @stability unstable
   * @category constructors
   * @since 4.0.0
   */
  export type Kind<
    Def extends Custom,
    Success extends Schema.Constraint,
    Error extends Schema.Constraint
  > = (Def & {
    readonly success: Success
    readonly error: Error
  })["out"]
}

const exitSchemaCache = new WeakMap<Any, Schema.Exit<Schema.Top, Schema.Top, DefectSchema>>()

/**
 * Builds the `Schema.Exit` used to encode and decode RPC results.
 *
 * **Details**
 *
 * The failure side includes the RPC error schema, middleware error schemas, and
 * stream error schema for streaming RPCs. Streaming RPCs use `Schema.Void` for
 * the exit success value. The schema is cached per RPC definition.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const exitSchema = <R extends Any>(
  self: R
): Schema.Exit<
  SuccessExitSchema<R>,
  ErrorExitSchema<R>,
  DefectSchema
> => {
  if (exitSchemaCache.has(self)) {
    return exitSchemaCache.get(self) as any
  }
  const rpc = self as any as AnyWithProps
  const failures = new Set<Schema.Top>([rpc.errorSchema])
  const streamSchemas = RpcSchema.getStreamSchemas(rpc.successSchema)
  if (Option.isSome(streamSchemas)) {
    failures.add(streamSchemas.value.error)
  }
  for (const middleware of rpc.middlewares) {
    failures.add(middleware.error)
  }
  const schema = Schema.Exit(
    Option.isSome(streamSchemas) ? Schema.Void : rpc.successSchema,
    Schema.Union([...failures]),
    rpc.defectSchema
  )
  exitSchemaCache.set(self, schema as any)
  return schema as any
}

const WrapperTypeId = "~effect/rpc/Rpc/Wrapper"

/**
 * Wraps a handler result with execution options for the RPC server.
 *
 * **Details**
 *
 * `fork` requests concurrent execution, and `uninterruptible` requests
 * uninterruptible execution.
 *
 * @stability unstable
 * @category wrapping
 * @since 4.0.0
 */
export interface Wrapper<A> {
  readonly [WrapperTypeId]: typeof WrapperTypeId
  readonly value: A
  readonly fork: boolean
  readonly uninterruptible: boolean
}

/**
 * A value that may be returned directly or wrapped with RPC server execution
 * options.
 *
 * @stability unstable
 * @category wrapping
 * @since 4.0.0
 */
export type WrapperOr<A> = A | Wrapper<A>

/**
 * Returns `true` when the value is an RPC `Wrapper`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isWrapper = (u: object): u is Wrapper<any> => WrapperTypeId in u

/**
 * Wraps a handler result with RPC server execution options.
 *
 * **Details**
 *
 * When the value is already wrapped, unspecified options are inherited from the
 * existing wrapper.
 *
 * @stability unstable
 * @category wrapping
 * @since 4.0.0
 */
export const wrap = (options: {
  readonly fork?: boolean | undefined
  readonly uninterruptible?: boolean | undefined
}) =>
<A extends object>(value: A): Wrapper<A> =>
  isWrapper(value) ?
    {
      [WrapperTypeId]: WrapperTypeId,
      value: value.value,
      fork: options.fork ?? value.fork,
      uninterruptible: options.uninterruptible ?? value.uninterruptible
    } :
    {
      [WrapperTypeId]: WrapperTypeId,
      value,
      fork: options.fork ?? false,
      uninterruptible: options.uninterruptible ?? false
    }

/**
 * Returns the wrapped response value when the input is an RPC `Wrapper`, or the
 * input itself when it is already unwrapped.
 *
 * @stability unstable
 * @category wrapping
 * @since 4.0.0
 */
export const unwrap = <A extends object>(value: WrapperOr<A>): A => isWrapper(value) ? value.value : value

/**
 * Maps the value inside an RPC wrapper, preserving wrapper options such as
 * `fork` and `uninterruptible`; unwrapped values are mapped directly.
 *
 * @stability unstable
 * @category wrapping
 * @since 4.0.0
 */
export const wrapMap = <A extends object, B extends object>(self: WrapperOr<A>, f: (value: A) => B): WrapperOr<B> => {
  if (isWrapper(self)) {
    return wrap(self)(f(self.value))
  }
  return f(self)
}

/**
 * Wraps a response Effect or Stream so the RPC server executes it concurrently
 * regardless of the server concurrency setting.
 *
 * @stability unstable
 * @category wrapping
 * @since 4.0.0
 */
export const fork: <A extends object>(value: A) => Wrapper<A> = wrap({ fork: true })

/**
 * Wraps a response Effect or Stream so the RPC server runs it in an uninterruptible region.
 *
 * @stability unstable
 * @category wrapping
 * @since 4.0.0
 */
export const uninterruptible: <A extends object>(value: A) => Wrapper<A> = wrap({ uninterruptible: true })
