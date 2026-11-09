/**
 * Defines named groups of HTTP API endpoints.
 *
 * A group collects endpoints that belong to the same resource or feature area
 * inside an `HttpApi`. Builders, generated clients, URL builders, and OpenAPI
 * generation read the same group value, including its identifier, endpoints,
 * annotations, and `topLevel` flag. This module includes helpers for creating
 * groups, adding endpoints, prefixing paths, applying middleware, annotating
 * groups or endpoints, and deriving builder or client types.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "../Array.ts"
import * as Context from "../Context.ts"
import type { PathInput } from "../http/HttpRouter.ts"
import * as InternalRecord from "../internal/record.ts"
import { type Pipeable, pipeArguments } from "../Pipeable.ts"
import * as Predicate from "../Predicate.ts"
import * as Record from "../Record.ts"
import type * as HttpApiEndpoint from "./HttpApiEndpoint.ts"
import type * as HttpApiMiddleware from "./HttpApiMiddleware.ts"

const TypeId = "~effect/http-api/HttpApiGroup"

/**
 * Returns `true` when a value is an `HttpApiGroup`, narrowing the value to the
 * group interface.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isHttpApiGroup = (u: unknown): u is Top => Predicate.hasProperty(u, TypeId)

/**
 * Endpoints indexed by their identifier.
 */
type EndpointMap<Endpoints extends HttpApiEndpoint.Constraint> = {
  readonly [Endpoint in Endpoints as HttpApiEndpoint.Identifier<Endpoint>]: Endpoint
}

/**
 * An `HttpApiGroup` is a named collection of `HttpApiEndpoint`s that represents
 * a portion of your domain.
 *
 * **Details**
 *
 * Endpoint implementations can be provided later with `HttpApiBuilder.group`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HttpApiGroup<
  out Id extends string,
  in out Endpoints extends HttpApiEndpoint.Constraint = never,
  out TopLevel extends boolean = false
> extends Pipeable {
  new(_: never): {}
  readonly [TypeId]: typeof TypeId
  /**
   * Stable group identifier. This field intentionally is not named `name`
   * because `HttpApiGroup` values can be extended as classes, where `name`
   * would collide with JavaScript's built-in `Function.name`.
   */
  readonly identifier: Id
  readonly key: string
  readonly topLevel: TopLevel
  readonly endpoints: EndpointMap<Endpoints>
  readonly annotations: Context.Context<never>

  /**
   * Add an `HttpApiEndpoint` to an `HttpApiGroup`.
   */
  add<const A extends NonEmptyReadonlyArray<HttpApiEndpoint.Constraint>>(
    ...endpoints: A
  ): HttpApiGroup<Id, Endpoints | A[number], TopLevel>

  /**
   * Add a path prefix to all endpoints in an `HttpApiGroup`. Note that this will only
   * add the prefix to the endpoints before this api is called.
   */
  prefix<const Prefix extends PathInput>(
    prefix: Prefix
  ): HttpApiGroup<Id, HttpApiEndpoint.AddPrefix<Endpoints, Prefix>, TopLevel>

  /**
   * Adds an `HttpApiMiddleware` to every endpoint currently in the group.
   *
   * **Gotchas**
   *
   * Endpoints added after this method is called do not have the middleware
   * applied.
   */
  middleware<I extends HttpApiMiddleware.AnyId, S>(middleware: Context.Key<I, S>): HttpApiGroup<
    Id,
    HttpApiEndpoint.AddMiddleware<Endpoints, I>,
    TopLevel
  >

  /**
   * Merge the annotations of an `HttpApiGroup` with the provided annotations.
   */
  annotateMerge<I>(annotations: Context.Context<I>): HttpApiGroup<Id, Endpoints, TopLevel>

  /**
   * Add an annotation to an `HttpApiGroup`.
   */
  annotate<I, S>(key: Context.Key<I, S>, value: S): HttpApiGroup<Id, Endpoints, TopLevel>

  /**
   * Merges the provided context into every endpoint currently in the group.
   *
   * **Gotchas**
   *
   * Endpoints added after this method is called do not have these annotations.
   */
  annotateEndpointsMerge<I>(annotations: Context.Context<I>): HttpApiGroup<Id, Endpoints, TopLevel>

  /**
   * Adds an annotation to every endpoint currently in the group.
   *
   * **Gotchas**
   *
   * Endpoints added after this method is called do not have this annotation.
   */
  annotateEndpoints<I, S>(key: Context.Key<I, S>, value: S): HttpApiGroup<Id, Endpoints, TopLevel>
}

/**
 * Type-level service produced by the layer that implements one group of an HTTP
 * API.
 *
 * **Details**
 *
 * `HttpApiBuilder.group` provides this service, and `HttpApiBuilder.layer`
 * requires one service for each group in the API. The type carries both the API
 * id and the group identifier so the relationship between an API and its
 * implemented groups is checked at compile time.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface Service<ApiId extends string, Identifier extends string> {
  readonly _: unique symbol
  readonly apiId: ApiId
  readonly identifier: Identifier
}

/**
 * Derives the group implementation service required for each group in an HTTP
 * API.
 *
 * **Details**
 *
 * When given an API id and a group or union of groups, this type maps each group
 * to the `Service` identity that must be provided by `HttpApiBuilder.group`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ToService<ApiId extends string, Group extends Constraint> = Group extends Constraint ?
  Service<ApiId, Group["identifier"]>
  : never

/**
 * A widened `HttpApiGroup` type used when the concrete group identifier,
 * endpoints, and top-level flag are not needed.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Constraint {
  readonly [TypeId]: typeof TypeId
  readonly identifier: string
  readonly key: string
  readonly endpoints: Record.ReadonlyRecord<string, HttpApiEndpoint.Constraint>
}

/**
 * A widened group type that preserves concrete runtime properties such as
 * identifier, key, top-level status, endpoints, and annotations.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Top extends HttpApiGroup<string, HttpApiEndpoint.Top, boolean> {}

/**
 * Selects the group with the specified identifier from a union of groups.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type WithIdentifier<Group, Identifier extends string> = Extract<Group, { readonly identifier: Identifier }>

/**
 * Extracts the identifier literal from an `HttpApiGroup`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Identifier<Group> = Group extends Constraint ? Group["identifier"] : never

/**
 * Extracts the endpoint union contained in an `HttpApiGroup`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Endpoints<Group> = Group extends HttpApiGroup<infer _Identifier, infer _Endpoints, infer _TopLevel> ?
  _Endpoints
  : never

/**
 * Computes the services required to encode error responses for every endpoint in a
 * group.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ErrorServicesEncode<Group> = HttpApiEndpoint.ErrorServicesEncode<Endpoints<Group>>

/**
 * Computes the services required to decode error responses for every endpoint in a
 * group.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ErrorServicesDecode<Group> = HttpApiEndpoint.ErrorServicesDecode<Endpoints<Group>>

/**
 * Computes the middleware error union for every endpoint in a group.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type MiddlewareError<Group> = HttpApiEndpoint.MiddlewareError<Endpoints<Group>>

/**
 * Computes the services provided by middleware attached to any endpoint in a
 * group.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type MiddlewareProvides<Group> = HttpApiEndpoint.MiddlewareProvides<Endpoints<Group>>

/**
 * Computes the client-side middleware services required by endpoints in a group.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type MiddlewareClient<Group> = HttpApiEndpoint.MiddlewareClient<Endpoints<Group>>

/**
 * Extracts the runtime services required by middleware attached to the endpoints in an `HttpApiGroup`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type MiddlewareServices<Group> = HttpApiEndpoint.MiddlewareServices<Endpoints<Group>>

/**
 * Extracts the endpoint union from the group with the specified identifier.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type EndpointsWithIdentifier<Group extends Constraint, Identifier extends string> = Endpoints<
  WithIdentifier<Group, Identifier>
>

/**
 * Computes the schema encoding and decoding services required by clients for all endpoints in a group.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ClientServices<Group> = Group extends HttpApiGroup<infer _Identifier, infer _Endpoints, infer _TopLevel> ?
  HttpApiEndpoint.ClientServices<_Endpoints>
  : never

/**
 * Returns the type of a group after adding the supplied path prefix to each endpoint in the group.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type AddPrefix<Group, Prefix extends PathInput> = Group extends
  HttpApiGroup<infer _Identifier, infer _Endpoints, infer _TopLevel> ?
  HttpApiGroup<_Identifier, HttpApiEndpoint.AddPrefix<_Endpoints, Prefix>, _TopLevel>
  : never

/**
 * Returns the type of a group after applying a middleware identifier to every endpoint in the group.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type AddMiddleware<Group, Id extends HttpApiMiddleware.AnyId> = Group extends
  HttpApiGroup<infer _Identifier, infer _Endpoints, infer _TopLevel> ?
  HttpApiGroup<_Identifier, HttpApiEndpoint.AddMiddleware<_Endpoints, Id>, _TopLevel>
  : never

const Proto = {
  [TypeId]: TypeId,
  add(this: Top, ...toAdd: NonEmptyReadonlyArray<HttpApiEndpoint.Top>) {
    const endpoints = { ...this.endpoints }
    for (const endpoint of toAdd) {
      InternalRecord.assignProperty(endpoints, endpoint.identifier, endpoint)
    }
    return makeProto({
      ...optionsFromGroup(this),
      endpoints
    })
  },
  prefix(this: Top, prefix: PathInput) {
    return makeProto({
      ...optionsFromGroup(this),
      endpoints: Record.map(this.endpoints, (endpoint) => endpoint.prefix(prefix))
    })
  },
  middleware(this: Top, middleware: HttpApiMiddleware.AnyService) {
    return makeProto({
      ...optionsFromGroup(this),
      endpoints: Record.map(this.endpoints, (endpoint) => endpoint.middleware(middleware as any))
    })
  },
  annotateMerge<I>(this: Top, annotations: Context.Context<I>) {
    return makeProto({
      ...optionsFromGroup(this),
      annotations: Context.merge(this.annotations, annotations)
    })
  },
  annotate<I, S>(this: Top, annotation: Context.Key<I, S>, value: S) {
    return makeProto({
      ...optionsFromGroup(this),
      annotations: Context.add(this.annotations, annotation, value)
    })
  },
  annotateEndpointsMerge<I>(this: Top, annotations: Context.Context<I>) {
    return makeProto({
      ...optionsFromGroup(this),
      endpoints: Record.map(this.endpoints, (endpoint) => endpoint.annotateMerge(annotations))
    })
  },
  annotateEndpoints<I, S>(this: Top, annotation: Context.Key<I, S>, value: S) {
    return makeProto({
      ...optionsFromGroup(this),
      endpoints: Record.map(this.endpoints, (endpoint) => endpoint.annotate(annotation, value))
    })
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const optionsFromGroup = (group: Top) => ({
  identifier: group.identifier,
  topLevel: group.topLevel,
  endpoints: group.endpoints,
  annotations: group.annotations
})

const makeProto = <
  Id extends string,
  Endpoints extends HttpApiEndpoint.Constraint,
  TopLevel extends (true | false)
>(options: {
  readonly identifier: Id
  readonly topLevel: TopLevel
  readonly endpoints: Record.ReadonlyRecord<string, HttpApiEndpoint.Constraint>
  readonly annotations: Context.Context<never>
}): HttpApiGroup<Id, Endpoints, TopLevel> => {
  function HttpApiGroup() {}
  Object.setPrototypeOf(HttpApiGroup, Proto)
  HttpApiGroup.key = `effect/http-api/HttpApiGroup/${options.identifier}`
  return Object.assign(HttpApiGroup, options) as any
}

/**
 * Creates an empty `HttpApiGroup` with the supplied identifier.
 *
 * **Details**
 *
 * Add endpoints with `add`, provide implementations with `HttpApiBuilder.group`,
 * and set `topLevel` when the generated client should expose endpoint methods
 * directly instead of nesting them under the group identifier.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <const Id extends string, const TopLevel extends boolean = false>(identifier: Id, options?: {
  readonly topLevel?: TopLevel | undefined
}): HttpApiGroup<Id, never, TopLevel> =>
  makeProto({
    identifier,
    topLevel: (options?.topLevel ?? false) as TopLevel,
    endpoints: {},
    annotations: Context.empty()
  })
