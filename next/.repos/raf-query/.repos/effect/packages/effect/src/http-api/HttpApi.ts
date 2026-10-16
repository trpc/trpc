/**
 * Describes an Effect HTTP API as groups of endpoints.
 *
 * An `HttpApi` value is data: it has an identifier, annotations, and groups of
 * endpoints that describe request inputs, responses, middleware, and route
 * metadata. The same description can be used by server builders, generated
 * clients, URL builders, OpenAPI generation, and reflection tools.
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
import type * as Schema from "../Schema.ts"
import type * as SchemaAST from "../SchemaAST.ts"
import * as HttpApiEndpoint from "./HttpApiEndpoint.ts"
import type * as HttpApiGroup from "./HttpApiGroup.ts"
import type * as HttpApiMiddleware from "./HttpApiMiddleware.ts"
import * as HttpApiSchema from "./HttpApiSchema.ts"

const TypeId = "~effect/http-api/HttpApi"

/**
 * Returns `true` when a value is an `HttpApi`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isHttpApi = (u: unknown): u is Top => Predicate.hasProperty(u, TypeId)

/**
 * Groups indexed by their identifier.
 */
type GroupMap<Groups> = {
  readonly [Group in Groups as HttpApiGroup.Identifier<Group>]: Group
}

/**
 * An `HttpApi` is a collection of HTTP API groups and endpoints that represents a
 * portion of your domain.
 *
 * **When to use**
 *
 * Use when endpoint implementations can be provided with `HttpApiBuilder.group`, and the
 * completed API can be registered with `HttpApiBuilder.layer`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HttpApi<
  out Id extends string,
  in out Groups extends HttpApiGroup.Constraint = never
> extends Pipeable {
  new(_: never): {}
  readonly [TypeId]: typeof TypeId
  readonly identifier: Id
  readonly groups: GroupMap<Groups>
  readonly annotations: Context.Context<never>

  /**
   * Add a `HttpApiGroup` to the `HttpApi`.
   */
  add<const A extends NonEmptyReadonlyArray<HttpApiGroup.Constraint>>(...groups: A): HttpApi<Id, Groups | A[number]>

  /**
   * Adds every group from another `HttpApi` while preserving its annotation scope.
   *
   * **When to use**
   *
   * Use when you want to compose an API from groups declared and annotated under another API.
   *
   * **Details**
   *
   * The added API is flattened into this API rather than retained as a nested value. Each added group
   * is copied with the added API's annotations, leaving the added API unchanged. Annotation precedence
   * from least to most specific is this API, the added API, the group, and then the endpoint.
   *
   * **Gotchas**
   *
   * Annotations from the added API do not become top-level annotations of the result and do not affect
   * groups already present in this API. They remain scoped to the groups and endpoints being added.
   */
  addHttpApi<Id2 extends string, Groups2 extends HttpApiGroup.Constraint>(
    api: HttpApi<Id2, Groups2>
  ): HttpApi<Id, Groups | Groups2>

  /**
   * Prefix all endpoints in the `HttpApi`.
   */
  prefix<const Prefix extends PathInput>(prefix: Prefix): HttpApi<Id, HttpApiGroup.AddPrefix<Groups, Prefix>>

  /**
   * Adds a middleware to every endpoint currently in the `HttpApi`.
   *
   * **Gotchas**
   *
   * Endpoints added after this method is called do not receive the middleware.
   */
  middleware<I extends HttpApiMiddleware.AnyId, S>(
    middleware: Context.Key<I, S>
  ): HttpApi<Id, HttpApiGroup.AddMiddleware<Groups, I>>

  /**
   * Annotate the `HttpApi`.
   */
  annotate<I, S>(tag: Context.Key<I, S>, value: S): HttpApi<Id, Groups>

  /**
   * Annotate the `HttpApi` with a Context.
   */
  annotateMerge<I>(context: Context.Context<I>): HttpApi<Id, Groups>
}

/**
 * An `HttpApi` value with its identifier and group types erased.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Constraint {
  readonly [TypeId]: typeof TypeId
}

/**
 * An `HttpApi` with broad identifier and group types while retaining the concrete
 * runtime properties used by implementation helpers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Top extends HttpApi<string, HttpApiGroup.Top> {}

const Proto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  },
  add(
    this: Top,
    ...toAdd: NonEmptyReadonlyArray<HttpApiGroup.Top>
  ) {
    const groups = { ...this.groups }
    for (const group of toAdd) {
      InternalRecord.assignProperty(groups, group.identifier, group)
    }
    return makeProto({
      ...optionsFromApi(this),
      groups
    })
  },
  addHttpApi(
    this: Top,
    api: Top
  ) {
    const newGroups = { ...this.groups }
    for (const key of Object.keys(api.groups)) {
      const group = api.groups[key]
      InternalRecord.assignProperty(
        newGroups,
        key,
        group.annotateMerge(Context.merge(api.annotations, group.annotations))
      )
    }
    return makeProto({
      ...optionsFromApi(this),
      groups: newGroups
    })
  },
  prefix(this: Top, prefix: PathInput) {
    return makeProto({
      ...optionsFromApi(this),
      groups: Record.map(this.groups, (group) => group.prefix(prefix))
    })
  },
  middleware(this: Top, tag: HttpApiMiddleware.AnyService) {
    return makeProto({
      ...optionsFromApi(this),
      groups: Record.map(this.groups, (group) => group.middleware(tag as any))
    })
  },
  annotate(this: Top, key: Context.Key<any, any>, value: any) {
    return makeProto({
      ...optionsFromApi(this),
      annotations: Context.add(this.annotations, key, value)
    })
  },
  annotateMerge(this: Top, annotations: Context.Context<never>) {
    return makeProto({
      ...optionsFromApi(this),
      annotations: Context.merge(this.annotations, annotations)
    })
  }
}

const optionsFromApi = (api: Top) => ({
  identifier: api.identifier,
  groups: api.groups,
  annotations: api.annotations
})

const makeProto = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  options: {
    readonly identifier: Id
    readonly groups: Record.ReadonlyRecord<string, HttpApiGroup.Constraint>
    readonly annotations: Context.Context<never>
  }
): HttpApi<Id, Groups> => {
  function HttpApi() {}
  Object.setPrototypeOf(HttpApi, Proto)
  return Object.assign(HttpApi, options) as any
}

/**
 * Creates an empty `HttpApi` with the supplied identifier.
 *
 * **When to use**
 *
 * Use when you need to start defining an HTTP API, add groups with `add` or
 * `addHttpApi`, provide endpoint implementations with `HttpApiBuilder.group`,
 * and register the API with `HttpApiBuilder.layer`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <const Id extends string>(identifier: Id): HttpApi<Id, never> =>
  makeProto({
    identifier,
    groups: {},
    annotations: Context.empty()
  })

/**
 * Describes the groups and endpoints in an `HttpApi`.
 *
 * **Details**
 *
 * The callbacks receive each group or endpoint with merged annotations, endpoint
 * middleware, and response schemas grouped by HTTP status.
 *
 * @stability unstable
 * @category reflection
 * @since 4.0.0
 */
export const reflect = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  self: HttpApi<Id, Groups>,
  options: {
    readonly predicate?:
      | Predicate.Predicate<{
        readonly endpoint: HttpApiEndpoint.Top
        readonly group: HttpApiGroup.Top
      }>
      | undefined
    readonly onGroup: (options: {
      readonly group: HttpApiGroup.Top
      readonly mergedAnnotations: Context.Context<never>
    }) => void
    readonly onEndpoint: (options: {
      readonly group: HttpApiGroup.Top
      readonly endpoint: HttpApiEndpoint.Top
      readonly mergedAnnotations: Context.Context<never>
      readonly middleware: ReadonlySet<HttpApiMiddleware.AnyService>
      readonly successes: ReadonlyMap<number, readonly [Schema.Top, ...Array<Schema.Top>]>
      readonly errors: ReadonlyMap<number, readonly [Schema.Top, ...Array<Schema.Top>]>
    }) => void
  }
) => {
  const groups = Object.values(self.groups) as any as Array<HttpApiGroup.Top>
  for (const group of groups) {
    const groupAnnotations = Context.merge(self.annotations, group.annotations)
    options.onGroup({
      group,
      mergedAnnotations: groupAnnotations
    })
    const endpoints = Object.values(group.endpoints) as Iterable<HttpApiEndpoint.Top>
    for (const endpoint of endpoints) {
      if (
        options.predicate && !options.predicate({
          endpoint,
          group
        } as any)
      ) continue

      options.onEndpoint({
        group,
        endpoint,
        middleware: endpoint.middlewares as any,
        mergedAnnotations: Context.merge(groupAnnotations, endpoint.annotations),
        successes: extractResponseContent(
          HttpApiEndpoint.getSuccessSchemas(endpoint),
          HttpApiSchema.getStatusSuccessSchema
        ),
        errors: extractResponseContent(
          HttpApiEndpoint.getErrorSchemas(endpoint),
          HttpApiSchema.getStatusErrorSchema
        )
      })
    }
  }
}

// -------------------------------------------------------------------------------------

const extractResponseContent = (
  schemas: Array<Schema.Top>,
  getStatus: (schema: Schema.Constraint) => number
): ReadonlyMap<number, [Schema.Top, ...Array<Schema.Top>]> => {
  const map = new Map<number, [Schema.Top, ...Array<Schema.Top>]>()

  schemas.forEach(add)

  return map

  function add(schema: Schema.Top) {
    const body = HttpApiSchema.isWithHeaders(schema) ? schema.schema : schema
    if (HttpApiSchema.isStreamSchema(body)) return
    const status = getStatus(schema)
    const schemas = map.get(status)
    if (schemas === undefined) {
      map.set(status, [schema])
    } else {
      schemas.push(schema)
    }
  }
}

/**
 * Adds additional schemas to components/schemas.
 * The provided schemas must have a `identifier` annotation.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class AdditionalSchemas extends Context.Service<
  AdditionalSchemas,
  ReadonlyArray<Schema.Constraint>
>()("effect/http-api/HttpApi/AdditionalSchemas") {}

/**
 * Schema parse options for server and client codecs, set on an API, group, or
 * endpoint.
 *
 * **Details**
 *
 * Each codec slot has its own annotation:
 *
 * - `ParamsParseOptions` for path params
 * - `QueryParseOptions` for the query string
 * - `HeadersParseOptions` for request headers and `WithHeaders` response headers
 * - `PayloadParseOptions` for request bodies
 * - `SuccessParseOptions` for success bodies
 * - `ErrorParseOptions` for error bodies
 *
 * A slot annotation at any level takes precedence over `ParseOptions` at any
 * level. If neither is set, Schema defaults apply. Options are replaced, not
 * merged. For the same annotation, endpoint overrides group, which overrides
 * API. Annotate the API before passing it to `HttpApiBuilder.group` or
 * `HttpApiBuilder.endpoint`.
 *
 * **Gotchas**
 *
 * Header codecs receive all HTTP headers, including undeclared transport
 * headers such as `content-type`, `content-length`, `host`, `user-agent` and
 * proxy headers. Without `HeadersParseOptions`, headers use `ParseOptions`:
 *
 * - `onExcessProperty: "error"` rejects real requests and `WithHeaders`
 *   responses with transport headers.
 * - `onExcessProperty: "preserve"` includes transport headers in the decoded
 *   value.
 *
 * Set `HeadersParseOptions` to `{}` at the API level to use Schema defaults for
 * headers, even if an endpoint sets `ParseOptions`.
 *
 * **Example** (Strict bodies with default header parsing)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
 *
 * const api = HttpApi.make("Api")
 *   .add(
 *     HttpApiGroup.make("users").add(
 *       HttpApiEndpoint.post("create", "/users", {
 *         headers: { "x-api-key": Schema.String },
 *         payload: { name: Schema.String }
 *       })
 *     )
 *   )
 *   .annotate(HttpApi.ParseOptions, { onExcessProperty: "error" })
 *   .annotate(HttpApi.HeadersParseOptions, {})
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class ParseOptions extends Context.Service<
  ParseOptions,
  SchemaAST.ParseOptions
>()("effect/http-api/HttpApi/ParseOptions") {}

/**
 * Schema parse options for path params: server decoding, client encoding, and
 * `HttpApiClient.urlBuilder`. Falls back to `ParseOptions` when unset.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class ParamsParseOptions extends Context.Service<
  ParamsParseOptions,
  SchemaAST.ParseOptions
>()("effect/http-api/HttpApi/ParamsParseOptions") {}

/**
 * Schema parse options for the query string: server decoding, client encoding,
 * and `HttpApiClient.urlBuilder`. Falls back to `ParseOptions` when unset.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class QueryParseOptions extends Context.Service<
  QueryParseOptions,
  SchemaAST.ParseOptions
>()("effect/http-api/HttpApi/QueryParseOptions") {}

/**
 * Schema parse options for request headers and the headers of `WithHeaders`
 * responses: server decoding/encoding and client encoding/decoding, including
 * buffered and streamed responses. Falls back to `ParseOptions` when unset.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class HeadersParseOptions extends Context.Service<
  HeadersParseOptions,
  SchemaAST.ParseOptions
>()("effect/http-api/HttpApi/HeadersParseOptions") {}

/**
 * Schema parse options for request bodies, including multipart payloads:
 * server decoding and client encoding. Falls back to `ParseOptions` when unset.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class PayloadParseOptions extends Context.Service<
  PayloadParseOptions,
  SchemaAST.ParseOptions
>()("effect/http-api/HttpApi/PayloadParseOptions") {}

/**
 * Schema parse options for success bodies, including streams, SSE events, and
 * the body of `WithHeaders` responses: server encoding and client decoding. Falls back to `ParseOptions` when unset.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class SuccessParseOptions extends Context.Service<
  SuccessParseOptions,
  SchemaAST.ParseOptions
>()("effect/http-api/HttpApi/SuccessParseOptions") {}

/**
 * Schema parse options for error bodies: server encoding and client decoding. Falls back to `ParseOptions` when unset.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class ErrorParseOptions extends Context.Service<
  ErrorParseOptions,
  SchemaAST.ParseOptions
>()("effect/http-api/HttpApi/ErrorParseOptions") {}

/**
 * @internal
 */
export interface SlotParseOptions {
  readonly params: SchemaAST.ParseOptions | undefined
  readonly query: SchemaAST.ParseOptions | undefined
  readonly headers: SchemaAST.ParseOptions | undefined
  readonly payload: SchemaAST.ParseOptions | undefined
  readonly success: SchemaAST.ParseOptions | undefined
  readonly error: SchemaAST.ParseOptions | undefined
}

/**
 * @internal
 */
export const getSlotParseOptions = (annotations: Context.Context<never>): SlotParseOptions => {
  const fallback = Context.getOrUndefined(annotations, ParseOptions)
  return {
    params: Context.getOrUndefined(annotations, ParamsParseOptions) ?? fallback,
    query: Context.getOrUndefined(annotations, QueryParseOptions) ?? fallback,
    headers: Context.getOrUndefined(annotations, HeadersParseOptions) ?? fallback,
    payload: Context.getOrUndefined(annotations, PayloadParseOptions) ?? fallback,
    success: Context.getOrUndefined(annotations, SuccessParseOptions) ?? fallback,
    error: Context.getOrUndefined(annotations, ErrorParseOptions) ?? fallback
  }
}
