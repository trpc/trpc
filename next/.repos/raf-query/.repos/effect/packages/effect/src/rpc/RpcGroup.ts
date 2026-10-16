/**
 * Collects typed RPC definitions and server handlers.
 *
 * An `RpcGroup` stores RPC definitions by tag and keeps annotations shared by
 * the group. This module provides helpers for composing groups, applying
 * middleware or annotations, deriving handler types, and turning handler objects
 * into `Context` or `Layer` values used by RPC servers.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import { identity } from "../Function.ts"
import type { Headers } from "../http/Headers.ts"
import * as Layer from "../Layer.ts"
import type { Pipeable } from "../Pipeable.ts"
import type * as Queue from "../Queue.ts"
import type * as Record from "../Record.ts"
import type { Scope } from "../Scope.ts"
import * as Stream from "../Stream.ts"
import * as Rpc from "./Rpc.ts"
import type { RequestId } from "./RpcMessage.ts"
import type * as RpcMiddleware from "./RpcMiddleware.ts"

const TypeId = "~effect/rpc/RpcGroup"

/**
 * A collection of RPC definitions that can be composed, annotated, and
 * converted into server handlers or layers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RpcGroup<in out R extends Rpc.Any> extends Pipeable {
  new(_: never): {}

  readonly [TypeId]: typeof TypeId
  readonly requests: ReadonlyMap<string, R>
  readonly annotations: Context.Context<never>

  /**
   * Add one or more procedures to the group.
   */
  add<const Rpcs2 extends ReadonlyArray<Rpc.Any>>(
    ...rpcs: Rpcs2
  ): RpcGroup<R | Rpcs2[number]>

  /**
   * Merge this group with one or more other groups.
   */
  merge<const Groups extends ReadonlyArray<Any>>(
    ...groups: Groups
  ): RpcGroup<R | Rpcs<Groups[number]>>

  /**
   * Omit one or more procedures from the group.
   */
  omit<const Tags extends ReadonlyArray<R["_tag"]>>(
    ...tags: Tags
  ): RpcGroup<Exclude<R, { readonly _tag: Tags[number] }>>

  /**
   * Add middleware to all the procedures added to the group until this point.
   */
  middleware<M extends RpcMiddleware.AnyService>(middleware: M): RpcGroup<Rpc.AddMiddleware<R, M>>

  /**
   * Add a prefix to the procedures in this group, returning a new group
   */
  prefix<const Prefix extends string>(prefix: Prefix): RpcGroup<Rpc.Prefixed<R, Prefix>>

  /**
   * Implement the handlers for the procedures in this group, returning a
   * context object.
   */
  toHandlers<
    Handlers extends HandlersFrom<R>,
    EX = never,
    RX = never
  >(
    build:
      | Handlers
      | Effect.Effect<Handlers, EX, RX>
  ): Effect.Effect<
    Context.Context<Rpc.ToHandler<R>>,
    EX,
    | RX
    | HandlersServices<R, Handlers>
  >

  /**
   * Implement the handlers for the procedures in this group.
   */
  toLayer<
    Handlers extends HandlersFrom<R>,
    EX = never,
    RX = never
  >(
    build:
      | Handlers
      | Effect.Effect<Handlers, EX, RX>
  ): Layer.Layer<
    Rpc.ToHandler<R>,
    EX,
    | Exclude<RX, Scope>
    | HandlersServices<R, Handlers>
  >

  of<const Handlers extends HandlersFrom<R>>(handlers: Handlers): Handlers

  /**
   * Implement a single handler from the group.
   */
  toLayerHandler<
    const Tag extends R["_tag"],
    Handler extends HandlerFrom<R, Tag>,
    EX = never,
    RX = never
  >(
    tag: Tag,
    build:
      | Handler
      | Effect.Effect<Handler, EX, RX>
  ): Layer.Layer<
    Rpc.Handler<Tag>,
    EX,
    | Exclude<RX, Scope>
    | HandlerServices<R, Tag, Handler>
  >

  /**
   * Retrieve a handler for a specific procedure in the group.
   */
  accessHandler<const Tag extends R["_tag"]>(tag: Tag): Effect.Effect<
    (
      payload: Rpc.Payload<Extract<R, { readonly _tag: Tag }>>,
      options: {
        readonly client: Rpc.ServerClient
        readonly requestId: RequestId
        readonly headers: Headers
      }
    ) => Rpc.ResultFrom<Extract<R, { readonly _tag: Tag }>, never>,
    never,
    Rpc.Handler<Tag>
  >

  /**
   * Annotate the group with a value.
   */
  annotate<I, S>(service: Context.Key<I, S>, value: S): RpcGroup<R>

  /**
   * Annotate the Rpc's above this point with a value.
   */
  annotateRpcs<I, S>(service: Context.Key<I, S>, value: S): RpcGroup<R>

  /**
   * Annotate the group with the provided annotations.
   */
  annotateMerge<S>(annotations: Context.Context<S>): RpcGroup<R>

  /**
   * Annotate the Rpc's above this point with the provided annotations.
   */
  annotateRpcsMerge<S>(annotations: Context.Context<S>): RpcGroup<R>
}

/**
 * An erased `RpcGroup` type for APIs that only need to know that a value is an
 * RPC group.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export interface Any {
  readonly [TypeId]: typeof TypeId
}

/**
 * Builds the object type of server handler functions required to implement each
 * RPC in a union.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type HandlersFrom<Rpc extends Rpc.Any> = {
  readonly [Current in Rpc as Current["_tag"]]: Rpc.ToHandlerFn<Current>
}

/**
 * Extracts the server handler function type for a specific RPC tag from an RPC
 * union.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type HandlerFrom<Rpc extends Rpc.Any, Tag extends Rpc["_tag"]> = Extract<Rpc, { readonly _tag: Tag }> extends
  infer Current ? Current extends Rpc.Any ? Rpc.ToHandlerFn<Current> : never : never

/**
 * Computes the services required by all handlers in a handler object for an RPC
 * union.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type HandlersServices<Rpcs extends Rpc.Any, Handlers> = keyof Handlers extends infer K ?
  K extends keyof Handlers & string ? HandlerServices<Rpcs, K, Handlers[K]> : never :
  never

/**
 * Computes the services required by a single RPC handler, excluding services
 * provided by middleware and `Scope` where the server supplies it.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type HandlerServices<Rpcs extends Rpc.Any, K extends Rpcs["_tag"], Handler> = true extends
  Rpc.IsStream<Rpcs, K> ? Handler extends (...args: any) =>
    | Stream.Stream<infer _A, infer _E, infer _R>
    | Rpc.Wrapper<Stream.Stream<infer _A, infer _E, infer _R>>
    | Effect.Effect<
      Queue.Dequeue<infer _A, infer _E | Cause.Done>,
      infer _EX,
      infer _R
    >
    | Rpc.Wrapper<
      Effect.Effect<
        Queue.Dequeue<infer _A, infer _E | Cause.Done>,
        infer _EX,
        infer _R
      >
    > ? Exclude<Rpc.ExcludeProvides<_R, Rpcs, K>, Scope> | Rpc.ExtractRequires<Rpcs, K> :
  never :
  Handler extends (
    ...args: any
  ) => Effect.Effect<infer _A, infer _E, infer _R> | Rpc.Wrapper<Effect.Effect<infer _A, infer _E, infer _R>> ?
    Exclude<Rpc.ExcludeProvides<_R, Rpcs, K>, Scope> | Rpc.ExtractRequires<Rpcs, K>
  : never

/**
 * Extracts the union of RPC definitions from an `RpcGroup`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Rpcs<Group> = Group extends RpcGroup<infer R> ? string extends R["_tag"] ? never : R : never

const RpcGroupProto = {
  add(this: RpcGroup<any>, ...rpcs: Array<Rpc.Any>) {
    const requests = new Map(this.requests)
    for (const rpc of rpcs) {
      requests.set(rpc._tag, rpc)
    }
    return makeProto({
      requests,
      annotations: this.annotations
    })
  },
  merge(this: RpcGroup<any>, ...groups: ReadonlyArray<RpcGroup<any>>) {
    const requests = new Map(this.requests)
    const annotations = new Map(this.annotations.mapUnsafe)

    for (const group of groups) {
      for (const [tag, rpc] of group.requests) {
        requests.set(tag, rpc)
      }
      for (const [key, value] of group.annotations.mapUnsafe) {
        annotations.set(key, value)
      }
    }

    return makeProto({
      requests,
      annotations: Context.makeUnsafe(annotations)
    })
  },
  omit(this: RpcGroup<any>, ...tags: Array<string>) {
    const requests = new Map(this.requests)
    for (const tag of tags) {
      requests.delete(tag)
    }
    return makeProto({
      requests,
      annotations: this.annotations
    })
  },
  middleware(this: RpcGroup<any>, middleware: RpcMiddleware.AnyService) {
    const requests = new Map<string, any>()
    for (const [tag, rpc] of this.requests) {
      requests.set(tag, rpc.middleware(middleware))
    }
    return makeProto({
      requests,
      annotations: this.annotations
    })
  },
  toHandlers(this: RpcGroup<any>, build: Effect.Effect<Record<string, (request: any) => any>>) {
    // oxlint-disable-next-line no-this-alias
    const self = this
    return Effect.gen(function*() {
      const services = yield* Effect.context<never>()
      const handlers = Effect.isEffect(build) ? yield* build : build
      const contextMap = new Map<string, unknown>()
      self.requests.forEach((rpc, tag) => {
        contextMap.set(rpc.key, {
          tag: rpc._tag,
          handler: handlers[tag],
          context: services
        })
      })
      return Context.makeUnsafe(contextMap)
    })
  },
  prefix<const Prefix extends string>(this: RpcGroup<any>, prefix: Prefix) {
    const requests = new Map<string, any>()
    for (const rpc of this.requests.values()) {
      const newRpc = rpc.prefix(prefix)
      requests.set(newRpc._tag, newRpc)
    }
    return makeProto({
      requests,
      annotations: this.annotations
    })
  },
  toLayer(this: RpcGroup<any>, build: Effect.Effect<Record<string, (request: any) => any>>) {
    return Layer.effectContext(this.toHandlers(build))
  },
  of: identity,
  toLayerHandler(this: RpcGroup<any>, service: string, build: Effect.Effect<Record<string, (request: any) => any>>) {
    // oxlint-disable-next-line no-this-alias
    const self = this
    return Layer.effectContext(Effect.gen(function*() {
      const services = yield* Effect.context<never>()
      const handler = Effect.isEffect(build) ? yield* build : build
      const contextMap = new Map<string, unknown>()
      const rpc = self.requests.get(service)!
      contextMap.set(rpc.key, {
        handler,
        context: services
      })
      return Context.makeUnsafe(contextMap)
    }))
  },
  accessHandler(this: RpcGroup<any>, service: string) {
    return Effect.contextWith((parentContext: Context.Context<any>) => {
      const rpc = this.requests.get(service)!
      const { handler, context } = Context.getOrUndefinedUnsafe(parentContext, rpc.key) as Rpc.Handler<any>
      return Effect.succeed((payload: Rpc.Payload<any>, options: any) => {
        options.rpc = rpc
        const result = handler(payload, options)
        const effectOrStream = Rpc.isWrapper(result) ? result.value : result
        return Effect.isEffect(effectOrStream)
          ? Effect.provide(effectOrStream, context)
          : Stream.provideContext(effectOrStream, context)
      })
    })
  },
  annotate(this: RpcGroup<any>, service: Context.Key<any, any>, value: any) {
    return makeProto({
      requests: this.requests,
      annotations: Context.add(this.annotations, service, value)
    })
  },
  annotateRpcs(this: RpcGroup<any>, service: Context.Key<any, any>, value: any) {
    return this.annotateRpcsMerge(Context.make(service, value))
  },
  annotateMerge(this: RpcGroup<any>, context: Context.Context<any>) {
    return makeProto({
      requests: this.requests,
      annotations: Context.merge(this.annotations, context)
    })
  },
  annotateRpcsMerge(this: RpcGroup<any>, context: Context.Context<any>) {
    const requests = new Map<string, any>()
    for (const [tag, rpc] of this.requests) {
      requests.set(tag, rpc.annotateMerge(Context.merge(context, rpc.annotations)))
    }
    return makeProto({
      requests,
      annotations: this.annotations
    })
  }
}

const makeProto = <Rpcs extends Rpc.Any>(options: {
  readonly requests: ReadonlyMap<string, Rpcs>
  readonly annotations: Context.Context<never>
}): RpcGroup<Rpcs> =>
  Object.assign(function() {}, RpcGroupProto, {
    requests: options.requests,
    annotations: options.annotations
  }) as any

/**
 * Creates an `RpcGroup` from one or more RPC definitions.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <const Rpcs extends ReadonlyArray<Rpc.Any>>(
  ...rpcs: Rpcs
): RpcGroup<Rpcs[number]> =>
  makeProto({
    requests: new Map(rpcs.map((rpc) => [rpc._tag, rpc])),
    annotations: Context.empty()
  })
