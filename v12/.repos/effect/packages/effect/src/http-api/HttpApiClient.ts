/**
 * Builds HTTP clients from `HttpApi` declarations.
 *
 * The client methods are derived from the groups and endpoints in an `HttpApi`
 * and run through an `HttpClient`. They use the same schema-driven contract as
 * the server: request parts are encoded from endpoint schemas, client
 * middleware is applied, the HTTP request is executed, and declared success or
 * error responses are decoded. This module also includes helpers for building a
 * client for only one group, one endpoint, or only the encoded URL.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as ByteSize from "../ByteSize.ts"
import * as Cause from "../Cause.ts"
import type * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Ndjson from "../encoding/Ndjson.ts"
import * as Sse from "../encoding/Sse.ts"
import { identity } from "../Function.ts"
import type * as Headers from "../http/Headers.ts"
import * as HttpBody from "../http/HttpBody.ts"
import * as HttpClient from "../http/HttpClient.ts"
import * as HttpClientError from "../http/HttpClientError.ts"
import * as HttpClientRequest from "../http/HttpClientRequest.ts"
import type * as HttpClientResponse from "../http/HttpClientResponse.ts"
import * as HttpMethod from "../http/HttpMethod.ts"
import * as internalUrlParams from "../http/internal/urlParams.ts"
import * as UrlParams from "../http/UrlParams.ts"
import * as InternalRecord from "../internal/record.ts"
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import * as SchemaAST from "../SchemaAST.ts"
import * as SchemaIssue from "../SchemaIssue.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"
import type * as Socket from "../socket/Socket.ts"
import * as Stream from "../Stream.ts"
import type { Simplify } from "../Types.ts"
import * as UndefinedOr from "../UndefinedOr.ts"
import * as HttpApi from "./HttpApi.ts"
import * as HttpApiEndpoint from "./HttpApiEndpoint.ts"
import type * as HttpApiGroup from "./HttpApiGroup.ts"
import type * as HttpApiMiddleware from "./HttpApiMiddleware.ts"
import * as HttpApiSchema from "./HttpApiSchema.ts"
import * as MediaType from "./internal/mediaType.ts"
import * as HttpApiPath from "./internal/path.ts"

/**
 * The type-safe client shape generated from HTTP API groups, with non-top-level
 * groups exposed as nested objects and top-level endpoints exposed as methods.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Client<Groups extends HttpApiGroup.Constraint, E = never, R = never> = Simplify<
  & {
    readonly [Group in Extract<Groups, { readonly topLevel: false }> as HttpApiGroup.Identifier<Group>]: Client.Group<
      Group,
      E,
      R
    >
  }
  & Client.TopLevelMethods<Groups, E, R>
>

/**
 * Derives the typed client interface for an `HttpApi`, preserving any additional
 * client error and service requirements supplied by the caller.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ForApi<Api extends HttpApi.Constraint, E = never, R = never> = Api extends
  HttpApi.HttpApi<infer _Id, infer Groups> ? Client<Groups, E, R> :
  never

/**
 * Computes the decoded success value a client receives for an endpoint
 * success schema, including headers, streaming Server-Sent Events, and
 * streaming byte responses.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type SuccessType<S> = S extends HttpApiSchema.WithHeaders<
  infer _Inner,
  infer _Headers
> ? HttpApiSchema.withHeaders<SuccessType<_Inner>, _Headers["Type"]>
  : S extends HttpApiSchema.StreamSse<
    infer _Events,
    infer _Error,
    infer _Value
  > ? Stream.Stream<
      _Value,
      _Error["Type"] | HttpClientError.HttpClientError | Schema.SchemaError | Sse.Retry | Sse.SseError,
      never
    >
  : S extends HttpApiSchema.StreamUint8Array ? Stream.Stream<Uint8Array, HttpClientError.HttpClientError, never>
  : S extends HttpApiSchema.StreamNdjson<infer _S> ?
    Stream.Stream<_S["Type"], HttpClientError.HttpClientError | Schema.SchemaError, never>
  : S extends HttpApiSchema.Upgrade<infer _Headers> ? [_Headers] extends [never] ? Upgraded : Upgraded<_Headers["Type"]>
  : S extends Schema.Constraint ? S["Type"]
  : never

/**
 * Runtime brand key used to mark `Upgraded` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.1.0
 */
export const UpgradedTypeId = "~effect/http-api/HttpApiClient/Upgraded"

/**
 * Type-level brand identifier used by `Upgraded` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.1.0
 */
export type UpgradedTypeId = typeof UpgradedTypeId

/**
 * The value a client method returns for an endpoint declared with
 * `HttpApiSchema.Upgrade`: the headers of the `101 Switching Protocols`
 * response and the upgraded connection.
 *
 * **Details**
 *
 * `headers` is decoded with the upgrade's `headers` schema when it declares
 * one. See `HttpClientResponse.upgrade` for how the connection behaves and
 * when it closes.
 *
 * When the endpoint also declares ordinary success responses, the method
 * returns either an `Upgraded` value or the decoded ordinary success. Use
 * {@link isUpgraded} to tell them apart.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export interface Upgraded<Headers = Headers.Headers> {
  readonly [UpgradedTypeId]: UpgradedTypeId
  readonly headers: Headers
  readonly socket: Socket.Socket
}

/**
 * Returns `true` when a client method result is an upgraded connection.
 *
 * **Details**
 *
 * An endpoint may declare `HttpApiSchema.Upgrade` alongside ordinary success
 * responses, because a server can decline an upgrade (RFC 9110 §7.8). The
 * client method then returns either an `Upgraded` value or the decoded
 * ordinary success, depending on the response status. This predicate narrows
 * that union.
 *
 * **Example** (Handling a declined upgrade)
 *
 * ```ts
 * import { Effect, Schema } from "effect"
 * import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
 *
 * const Api = HttpApi.make("docker").add(
 *   HttpApiGroup.make("exec").add(
 *     HttpApiEndpoint.post("start", "/exec/:id/start", {
 *       params: { id: Schema.String },
 *       payload: Schema.Struct({ Detach: Schema.Boolean }),
 *       success: [HttpApiSchema.Upgrade({ protocol: "tcp" }), HttpApiSchema.Empty(200)]
 *     })
 *   )
 * )
 *
 * const program = Effect.gen(function*() {
 *   const client = yield* HttpApiClient.make(Api)
 *   const result = yield* client.exec.start({ params: { id: "abc" }, payload: { Detach: false } })
 *   if (HttpApiClient.isUpgraded(result)) {
 *     const writer = yield* result.socket.writer
 *     yield* writer.write("ls\n")
 *   }
 * })
 * ```
 *
 * @stability unstable
 * @category guards
 * @since 4.1.0
 */
export const isUpgraded = (u: unknown): u is Upgraded<unknown> => Predicate.hasProperty(u, UpgradedTypeId)

type SuccessDecodingServices<S> = S extends HttpApiSchema.StreamSse<
  infer _Events,
  infer _Error,
  infer _Value
> ?
    | _Events["DecodingServices"]
    | _Error["DecodingServices"]
  : S extends HttpApiSchema.StreamUint8Array ? never
  : S extends HttpApiSchema.StreamNdjson<infer _S> ? _S["DecodingServices"]
  : S extends HttpApiSchema.Upgrade<infer _Headers> ? _Headers["DecodingServices"]
  : S extends Schema.Constraint ? S["DecodingServices"]
  : never

// An uninferred type parameter is instantiated with its constraint, so methods
// without a streaming payload must constrain `PayloadR` to `never`. `StreamNdjson<any>`
// also matches item schemas that are only a `Schema.Constraint` (`disableCodecs`)
type PayloadServicesConstraint<Payload> =
  [Extract<Payload, HttpApiSchema.StreamUint8Array | HttpApiSchema.StreamNdjson<any>>] extends [never] ? never : unknown

/**
 * Helper types used to describe generated HTTP API clients, including endpoint
 * methods, response modes, and grouped client shapes.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Client {
  /**
   * The response mode accepted by generated client methods, controlling whether a
   * call returns the decoded success value, the raw response, or both.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type ResponseMode = HttpApiEndpoint.ClientResponseMode

  /**
   * Computes the value returned by a client method for a success type and response
   * mode.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Response<Success, Mode extends ResponseMode> = Mode extends "decoded-and-response"
    ? [Success, HttpClientResponse.HttpClientResponse]
    : Mode extends "response-only" ? HttpClientResponse.HttpClientResponse
    : Success

  type GroupByEndpoint<Group extends HttpApiGroup.Constraint, E, R> = Group["endpoints"] extends
    infer Endpoints extends Readonly<Record<string, HttpApiEndpoint.ConstraintRequest>> ? {
      readonly [Identifier in keyof Endpoints]: Method<Endpoints[Identifier], E, R>
    }
    : {}

  /**
   * The client object for one API group, mapping each endpoint identifier in that
   * group to its typed client method.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Group<Group extends HttpApiGroup.Constraint, E, R> = GroupByEndpoint<Group, E, R>

  type MethodReturn<
    Endpoint extends HttpApiEndpoint.ConstraintRequest,
    E,
    R,
    Mode extends ResponseMode,
    PayloadR
  > = Effect.Effect<
    Response<SuccessType<Endpoint["~Success"]>, Mode>,
    | HttpApiMiddleware.Error<Endpoint["~Middleware"]>
    | HttpApiMiddleware.ClientError<Endpoint["~Middleware"]>
    | E
    | HttpClientError.HttpClientError
    | ([Mode] extends ["response-only"] ? never : Endpoint["~Error"]["Type"] | Schema.SchemaError),
    | R
    | PayloadR
    | Endpoint["~Params"]["EncodingServices"]
    | Endpoint["~Query"]["EncodingServices"]
    | Endpoint["~Payload"]["EncodingServices"]
    | Endpoint["~Headers"]["EncodingServices"]
    | ([Mode] extends ["response-only"] ? never
      :
        | SuccessDecodingServices<Endpoint["~Success"]>
        | Endpoint["~Error"]["DecodingServices"])
  >

  /**
   * The typed function generated for an endpoint, accepting the endpoint request
   * shape, including optional per-call SSE decoding options. The returned effect's success,
   * error, and service channels reflect the endpoint schemas, middleware, and
   * selected response mode.
   *
   * **Details**
   *
   * The services of a streaming `payload` are inferred and added to the
   * returned effect.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Method<
    Endpoint extends HttpApiEndpoint.ConstraintRequest,
    E,
    R
  > = <
    Mode extends ResponseMode = "decoded-only",
    PayloadR extends PayloadServicesConstraint<Endpoint["~Payload"]> = never
  >(
    request: Simplify<
      HttpApiEndpoint.ClientRequest<
        Endpoint["~Params"],
        Endpoint["~Query"],
        Endpoint["~Payload"],
        Endpoint["~Headers"],
        Mode,
        PayloadR
      >
    >
  ) => MethodReturn<Endpoint, E, R, Mode, NoInfer<PayloadR>>

  /**
   * Extracts client methods for endpoints in top-level groups so they can be exposed
   * directly on the generated client object.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type TopLevelMethods<Groups extends HttpApiGroup.Constraint, E, R> = {
    readonly [
      Endpoint in Extract<
        HttpApiGroup.Endpoints<Extract<Groups, { readonly topLevel: true }>>,
        HttpApiEndpoint.ConstraintRequest
      > as Endpoint["identifier"]
    ]: Method<Endpoint, E, R>
  }
}

type UrlBuilderRequestPart<Key extends string, Value> = [Value] extends [never] ? {}
  : { readonly [K in Key]: Value }

type UrlBuilderRequest<
  Endpoint extends HttpApiEndpoint.Constraint,
  Params = HttpApiEndpoint.Params<Endpoint>["Type"],
  Query = HttpApiEndpoint.Query<Endpoint>["Type"]
> = (
  & UrlBuilderRequestPart<"params", Params>
  & UrlBuilderRequestPart<"query", Query>
) extends infer Request ? keyof Request extends never ? void | undefined : Request
  : never

type UrlBuilderArgs<Request> = [Request] extends [void | undefined] ? [request?: Request]
  : [request: Request]

/**
 * The type-safe URL builder shape for an HTTP API, mirroring the generated client
 * layout while returning URL strings instead of executing requests.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type UrlBuilder<Api extends HttpApi.Constraint> = Api extends HttpApi.HttpApi<infer _ApiId, infer Groups> ?
  [Extract<Groups, { readonly topLevel: true }>] extends [never] ? UrlBuilderGroups<Groups>
  : [Extract<Groups, { readonly topLevel: false }>] extends [never] ? UrlBuilderTopLevelMethods<Groups>
  : Simplify<UrlBuilderGroups<Groups> & UrlBuilderTopLevelMethods<Groups>>
  : never

type UrlBuilderGroups<Groups extends HttpApiGroup.Constraint> = {
  readonly [Group in Extract<Groups, { readonly topLevel: false }> as HttpApiGroup.Identifier<Group>]: UrlBuilderGroup<
    HttpApiGroup.Endpoints<Group>
  >
}

type UrlBuilderGroup<Endpoints extends HttpApiEndpoint.Constraint> = {
  readonly [Endpoint in Endpoints as HttpApiEndpoint.Identifier<Endpoint>]: UrlBuilderMethod<Endpoint>
}

type UrlBuilderMethod<Endpoint extends HttpApiEndpoint.Constraint> = (
  ...args: UrlBuilderArgs<UrlBuilderRequest<Endpoint>>
) => string

type UrlBuilderTopLevelMethods<Groups extends HttpApiGroup.Constraint> = {
  readonly [
    Endpoint in HttpApiGroup.Endpoints<Extract<Groups, { readonly topLevel: true }>> as HttpApiEndpoint.Identifier<
      Endpoint
    >
  ]: UrlBuilderMethod<Endpoint>
}

/**
 * @internal
 */
export const makeClient = <ApiId extends string, Groups extends HttpApiGroup.Constraint, E, R>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  options: {
    readonly httpClient: HttpClient.HttpClient.With<E, R>
    readonly predicate?: Predicate.Predicate<{
      readonly endpoint: HttpApiEndpoint.Top
      readonly group: HttpApiGroup.Top
    }>
    readonly onGroup?: (options: {
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
      readonly endpointFn: Function
    }) => void
    readonly transformResponse?:
      | ((effect: Effect.Effect<unknown, unknown, unknown>) => Effect.Effect<unknown, unknown, unknown>)
      | undefined
    readonly baseUrl?: URL | string | undefined
  }
): Effect.Effect<void> =>
  Effect.gen(function*() {
    const services = yield* Effect.context()

    const httpClient = options.httpClient.pipe(
      options?.baseUrl === undefined
        ? identity
        : HttpClient.mapRequest(
          HttpClientRequest.prependUrl(options.baseUrl.toString())
        )
    )

    function executeMiddleware(
      group: HttpApiGroup.Top,
      endpoint: HttpApiEndpoint.Top,
      request: HttpClientRequest.HttpClientRequest,
      middlewareKeys: ReadonlyArray<string>,
      index: number
    ): Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError> {
      if (index === -1) {
        return httpClient.execute(request) as unknown as Effect.Effect<
          HttpClientResponse.HttpClientResponse,
          HttpClientError.HttpClientError
        >
      }
      const middleware = services.mapUnsafe.get(middlewareKeys[index]) as
        | HttpApiMiddleware.HttpApiMiddlewareClient<any, any, any>
        | undefined
      if (middleware === undefined) {
        return executeMiddleware(group, endpoint, request, middlewareKeys, index - 1)
      }
      return middleware({
        endpoint,
        group,
        request,
        next(request) {
          return executeMiddleware(group, endpoint, request, middlewareKeys, index - 1)
        }
      }) as Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
    }

    HttpApi.reflect(api, {
      predicate: options?.predicate,
      onGroup(onGroupOptions) {
        options.onGroup?.(onGroupOptions)
      },
      onEndpoint(onEndpointOptions) {
        const { group, endpoint, mergedAnnotations } = onEndpointOptions
        const parseOptions = HttpApi.getSlotParseOptions(mergedAnnotations)
        const makeUrl = compilePath(endpoint.path, endpoint.params)
        const upgrade = getUpgradeSuccessSchema(endpoint)
        const decodeEndpointResponse = makeEndpointDecoder(onEndpointOptions)

        const encodeParams = UndefinedOr.map(
          endpoint.params,
          (schema) => Schema.encodeUnknownEffect(schema, parseOptions.params)
        )

        const payloadSchemas: Array<Schema.Top> = []
        let streamPayload: StreamPayloadSchema | undefined
        for (const schema of HttpApiEndpoint.getPayloadSchemas(endpoint)) {
          if (HttpApiSchema.isStreamUint8Array(schema) || HttpApiSchema.isStreamNdjson(schema)) {
            streamPayload = schema
          } else {
            payloadSchemas.push(schema)
          }
        }
        const streamPayloadEncoder = UndefinedOr.map(streamPayload, (schema) => ({
          contentType: schema.contentType,
          encode: makeStreamPayloadEncoder(schema, parseOptions.payload)
        }))
        const encodePayload = Arr.isArrayNonEmpty(payloadSchemas) ?
          Schema.encodeUnknownEffect(
            HttpMethod.hasBody(endpoint.method)
              ? getEncodePayloadSchema(payloadSchemas, endpoint.method)
              : Schema.Union(payloadSchemas),
            parseOptions.payload
          ) :
          undefined

        const encodeHeaders = UndefinedOr.map(
          endpoint.headers,
          (schema) => Schema.encodeUnknownEffect(schema, parseOptions.headers)
        )
        const encodeQuery = UndefinedOr.map(
          endpoint.query,
          (schema) => Schema.encodeUnknownEffect(schema, parseOptions.query)
        )

        const middlewareKeys = Array.from(onEndpointOptions.middleware, (tag) => `${tag.key}/Client`)

        const endpointFn = Effect.fnUntraced(function*(
          request: {
            readonly params: Record<string, string> | undefined
            readonly query: unknown
            readonly payload: unknown
            readonly headers: Record<string, string> | undefined
            readonly responseMode?: HttpApiEndpoint.ClientResponseMode
            readonly sseOptions?: Sse.DecodeOptions | undefined
          } | undefined
        ) {
          let httpRequest = HttpClientRequest.make(endpoint.method)(endpoint.path)

          if (request !== undefined) {
            // params
            if (encodeParams !== undefined) {
              const params = (yield* encodeParams(request.params)) as Record<string, string>
              httpRequest = HttpClientRequest.setUrl(httpRequest, makeUrl(params))
            }

            // payload
            if (streamPayloadEncoder !== undefined && Stream.isStream(request.payload)) {
              const context = yield* Effect.context<never>()
              httpRequest = HttpClientRequest.setBody(
                httpRequest,
                HttpBody.stream(
                  Stream.provideContext(
                    streamPayloadEncoder.encode(request.payload),
                    context as Context.Context<unknown>
                  ),
                  streamPayloadEncoder.contentType
                )
              )
            } else if (encodePayload !== undefined) {
              if (HttpMethod.hasBody(endpoint.method)) {
                if (request.payload instanceof FormData) {
                  httpRequest = HttpClientRequest.bodyFormData(httpRequest, request.payload)
                } else {
                  const body = (yield* encodePayload(request.payload)) as HttpBody.HttpBody
                  httpRequest = HttpClientRequest.setBody(httpRequest, body)
                }
              } else {
                const urlParams = (yield* encodePayload(request.payload)) as Record<string, string>
                httpRequest = HttpClientRequest.appendUrlParams(httpRequest, urlParams)
              }
            } else if (streamPayloadEncoder !== undefined) {
              return yield* new Schema.SchemaError(
                new SchemaIssue.InvalidValue({ message: "Expected a Stream payload" }, request.payload)
              )
            }

            // headers
            if (encodeHeaders !== undefined) {
              const headers = (yield* encodeHeaders(request.headers)) as Record<string, string>
              httpRequest = HttpClientRequest.setHeaders(httpRequest, headers)
            }

            // query
            if (encodeQuery !== undefined) {
              const query = (yield* encodeQuery(request.query)) as Record<string, string>
              httpRequest = HttpClientRequest.appendUrlParams(httpRequest, query)
            }
          }

          if (upgrade !== undefined) {
            httpRequest = HttpClientRequest.upgrade(httpRequest, upgrade.protocol)
          }

          const response = yield* executeMiddleware(
            group,
            endpoint,
            httpRequest,
            middlewareKeys,
            middlewareKeys.length - 1
          )

          if (request?.responseMode === "response-only") {
            return response
          }

          const decoded = decodeEndpointResponse(response, request?.sseOptions)
          const value = yield* (options.transformResponse === undefined
            ? decoded
            : options.transformResponse(decoded))

          return request?.responseMode === "decoded-and-response" ? [value, response] : value
        })

        options.onEndpoint({
          ...onEndpointOptions,
          endpointFn
        })
      }
    })
  })

/**
 * Constructs a type-safe client for an HTTP API using the `HttpClient` service,
 * endpoint schemas, middleware, and optional client or response transformations.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <ApiId extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  options?: {
    readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
    readonly transformResponse?:
      | ((effect: Effect.Effect<unknown, unknown, unknown>) => Effect.Effect<unknown, unknown, unknown>)
      | undefined
    readonly baseUrl?: URL | string | undefined
  }
): Effect.Effect<
  Client<Groups>,
  never,
  HttpClient.HttpClient | HttpApiGroup.MiddlewareClient<Groups>
> =>
  Effect.flatMap(HttpClient.HttpClient, (httpClient) =>
    makeWith(api, {
      ...options,
      httpClient: options?.transformClient ? options.transformClient(httpClient) : httpClient
    }))

/**
 * Constructs a type-safe client for an HTTP API from the supplied `HttpClient`,
 * using the API metadata to encode requests, execute middleware, and decode
 * responses.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeWith = <ApiId extends string, Groups extends HttpApiGroup.Constraint, E, R>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  options: {
    readonly httpClient: HttpClient.HttpClient.With<E, R>
    readonly transformResponse?:
      | ((effect: Effect.Effect<unknown, unknown, unknown>) => Effect.Effect<unknown, unknown, unknown>)
      | undefined
    readonly baseUrl?: URL | string | undefined
  }
): Effect.Effect<
  Client<Groups, Exclude<E, HttpClientError.HttpClientError>, R>,
  never,
  HttpApiGroup.MiddlewareClient<Groups>
> => {
  const client: Record<string, Record<string, any>> = {}
  return makeClient(api, {
    ...options,
    onGroup({ group }) {
      if (group.topLevel) return
      InternalRecord.assignProperty(client, group.identifier, {})
    },
    onEndpoint({ endpoint, endpointFn, group }) {
      InternalRecord.assignProperty(
        group.topLevel ? client : client[group.identifier],
        endpoint.identifier,
        endpointFn
      )
    }
  }).pipe(Effect.as(client)) as any
}

/**
 * Builds a typed client object for a single API group from the supplied
 * `HttpClient`, filtering the API to that group.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const group = <
  ApiId extends string,
  Groups extends HttpApiGroup.Constraint,
  const GroupIdentifier extends HttpApiGroup.Identifier<Groups>,
  E,
  R
>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  options: {
    readonly group: GroupIdentifier
    readonly httpClient: HttpClient.HttpClient.With<E, R>
    readonly transformResponse?:
      | ((effect: Effect.Effect<unknown, unknown, unknown>) => Effect.Effect<unknown, unknown, unknown>)
      | undefined
    readonly baseUrl?: URL | string | undefined
  }
): Effect.Effect<
  Client.Group<HttpApiGroup.WithIdentifier<Groups, GroupIdentifier>, E, R>,
  never,
  HttpApiGroup.MiddlewareClient<HttpApiGroup.WithIdentifier<Groups, GroupIdentifier>>
> => {
  const client: Record<string, any> = {}
  return makeClient(api, {
    ...options,
    predicate: ({ group }) => group.identifier === options.group,
    onEndpoint({ endpoint, endpointFn }) {
      InternalRecord.assignProperty(client, endpoint.identifier, endpointFn)
    }
  }).pipe(Effect.map(() => client)) as any
}

type EndpointReturn<
  Groups extends HttpApiGroup.Constraint,
  GroupIdentifier extends HttpApiGroup.Identifier<Groups>,
  EndpointIdentifier extends HttpApiGroup.EndpointsWithIdentifier<Groups, GroupIdentifier>["identifier"],
  E,
  R,
  Endpoint extends HttpApiEndpoint.ConstraintRequest = Extract<
    HttpApiEndpoint.WithIdentifier<HttpApiGroup.EndpointsWithIdentifier<Groups, GroupIdentifier>, EndpointIdentifier>,
    HttpApiEndpoint.ConstraintRequest
  >
> = Effect.Effect<Client.Method<Endpoint, E, R>, never, HttpApiEndpoint.MiddlewareClient<Endpoint>>

/**
 * Builds the typed client method for one endpoint in one API group, using the
 * supplied `HttpClient` and endpoint metadata.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const endpoint = <
  ApiId extends string,
  Groups extends HttpApiGroup.Constraint,
  const GroupIdentifier extends HttpApiGroup.Identifier<Groups>,
  const EndpointIdentifier extends HttpApiGroup.EndpointsWithIdentifier<Groups, GroupIdentifier>["identifier"],
  E,
  R
>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  options: {
    readonly group: GroupIdentifier
    readonly endpoint: EndpointIdentifier
    readonly httpClient: HttpClient.HttpClient.With<E, R>
    readonly transformClient?:
      | ((client: HttpClient.HttpClient.With<E, R>) => HttpClient.HttpClient.With<E, R>)
      | undefined
    readonly transformResponse?:
      | ((effect: Effect.Effect<unknown, unknown, unknown>) => Effect.Effect<unknown, unknown, unknown>)
      | undefined
    readonly baseUrl?: URL | string | undefined
  }
): EndpointReturn<Groups, GroupIdentifier, EndpointIdentifier, E, R> => {
  let client: any = undefined
  return makeClient(api, {
    ...options,
    httpClient: options.transformClient
      ? options.transformClient(options.httpClient)
      : options.httpClient,
    predicate: ({ endpoint, group }) => group.identifier === options.group && endpoint.identifier === options.endpoint,
    onEndpoint({ endpointFn }) {
      client = endpointFn
    }
  }).pipe(Effect.map(() => client)) as any
}

type DecodeResponse<
  Groups extends HttpApiGroup.Constraint,
  GroupIdentifier extends HttpApiGroup.Identifier<Groups>,
  EndpointIdentifier extends HttpApiGroup.EndpointsWithIdentifier<Groups, GroupIdentifier>["identifier"],
  Endpoint extends HttpApiEndpoint.ConstraintRequest = Extract<
    HttpApiEndpoint.WithIdentifier<HttpApiGroup.EndpointsWithIdentifier<Groups, GroupIdentifier>, EndpointIdentifier>,
    HttpApiEndpoint.ConstraintRequest
  >
> = (
  response: HttpClientResponse.HttpClientResponse,
  options?: {
    readonly sseOptions?: Sse.DecodeOptions | undefined
  }
) => Effect.Effect<
  SuccessType<Endpoint["~Success"]>,
  HttpApiEndpoint.Errors<Endpoint> | HttpClientError.HttpClientError | Schema.SchemaError,
  SuccessDecodingServices<Endpoint["~Success"]> | HttpApiEndpoint.ErrorServicesDecode<Endpoint>
>

/**
 * Builds a decoder for raw responses of one endpoint in one API group, using
 * the same success and error decoding as a generated client method in
 * `"decoded-only"` mode.
 *
 * **When to use**
 *
 * Use with `responseMode: "response-only"` when the response head and body
 * arrive at different times, such as long polling, and the body should be
 * decoded later.
 *
 * **Details**
 *
 * The response does not need to come from a generated client. Declared error
 * responses fail with the decoded error, and undeclared statuses fail with an
 * `HttpClientError` whose reason is a `DecodeError`. Parse options are resolved
 * from the API, group and endpoint annotations. The body is only read when the
 * returned effect runs, so it must run inside the scope that owns the response.
 * Middleware and `transformResponse` are not applied.
 *
 * Building the decoder walks the API declaration, so build it once per
 * endpoint and reuse it.
 *
 * **Example** (Decoding a response body after the head arrives)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 * import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
 *
 * const Api = HttpApi.make("Api").add(
 *   HttpApiGroup.make("containers").add(
 *     HttpApiEndpoint.post("wait", "/containers/:id/wait", {
 *       params: { id: Schema.String },
 *       success: Schema.Struct({ StatusCode: Schema.Number })
 *     })
 *   )
 * )
 *
 * const decodeWait = HttpApiClient.decodeResponse(Api, {
 *   group: "containers",
 *   endpoint: "wait"
 * })
 *
 * const program = Effect.gen(function*() {
 *   const client = yield* HttpApiClient.make(Api)
 *   // Succeeds as soon as the response head arrives
 *   const response = yield* client.containers.wait({
 *     params: { id: "my-container" },
 *     responseMode: "response-only"
 *   })
 *   // Waits for the body, then decodes it with the endpoint schemas
 *   return yield* decodeWait(response)
 * })
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.7
 */
export const decodeResponse = <
  ApiId extends string,
  Groups extends HttpApiGroup.Constraint,
  const GroupIdentifier extends HttpApiGroup.Identifier<Groups>,
  const EndpointIdentifier extends HttpApiGroup.EndpointsWithIdentifier<Groups, GroupIdentifier>["identifier"]
>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  options: {
    readonly group: GroupIdentifier
    readonly endpoint: EndpointIdentifier
  }
): DecodeResponse<Groups, GroupIdentifier, EndpointIdentifier> => {
  let decode: ResponseDecoder | undefined
  HttpApi.reflect(api, {
    predicate: ({ endpoint, group }) => group.identifier === options.group && endpoint.identifier === options.endpoint,
    onGroup() {},
    onEndpoint(endpointOptions) {
      decode = makeEndpointDecoder(endpointOptions)
    }
  })
  return ((response, decodeOptions) => decode!(response, decodeOptions?.sseOptions)) as DecodeResponse<
    Groups,
    GroupIdentifier,
    EndpointIdentifier
  >
}

/**
 * Creates a type-safe URL builder that mirrors `HttpApiClient.make`.
 *
 * **Example** (Building typed URLs)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
 *
 * const Api = HttpApi.make("Api").add(
 *   HttpApiGroup.make("users").add(
 *     HttpApiEndpoint.get("getUser", "/users/:id", {
 *       params: { id: Schema.String }
 *     })
 *   )
 * )
 *
 * const buildUrl = HttpApiClient.urlBuilder(Api, {
 *   baseUrl: "https://api.example.com"
 * })
 *
 * buildUrl.users.getUser({
 *   params: { id: "123" }
 * }) // => "https://api.example.com/users/123"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const urlBuilder = <Api extends HttpApi.Constraint>(api: Api, options?: {
  readonly baseUrl?: URL | string | undefined
}): UrlBuilder<Api> => {
  const builder: Record<string, any> = {}

  HttpApi.reflect(api as unknown as HttpApi.Top, {
    onGroup({ group }) {
      if (group.topLevel) return
      InternalRecord.assignProperty(builder, group.identifier, {})
    },
    onEndpoint({ group, endpoint, mergedAnnotations }) {
      const parseOptions = HttpApi.getSlotParseOptions(mergedAnnotations)
      const makeUrl = compilePath(endpoint.path, endpoint.params)
      const encodeParams = endpoint.params === undefined
        ? undefined
        : Schema.encodeSync(endpoint.params as unknown as Schema.ConstraintEncoder<unknown>, parseOptions.params)
      const encodeQuery = endpoint.query === undefined
        ? undefined
        : Schema.encodeSync(endpoint.query as unknown as Schema.ConstraintEncoder<unknown>, parseOptions.query)

      const endpointBuilder = (request?: {
        readonly params?: unknown
        readonly query?: unknown
      }) => {
        const params = request?.params
        const path = params === undefined
          ? endpoint.path
          : makeUrl((encodeParams === undefined ? params : encodeParams(params)) as Record<string, string | undefined>)
        const queryInput = request?.query === undefined
          ? undefined
          : (encodeQuery === undefined ? request.query : encodeQuery(request.query)) as UrlParams.Input
        const urlParams = queryInput === undefined ? UrlParams.empty : UrlParams.fromInput(queryInput)
        if (options?.baseUrl === undefined) {
          const query = UrlParams.toString(urlParams)
          return query === "" ? path : `${path}?${query}`
        }
        const url = new URL(
          HttpClientRequest.prependUrl(HttpClientRequest.get(path), options.baseUrl.toString()).url
        )
        for (const [key, value] of urlParams.params) {
          if (value !== undefined) {
            url.searchParams.append(key, internalUrlParams.unwrap(value))
          }
        }
        return url.toString()
      }
      InternalRecord.assignProperty(
        group.topLevel ? builder : builder[group.identifier],
        endpoint.identifier,
        endpointBuilder
      )
    }
  })

  return builder as UrlBuilder<Api>
}

// ----------------------------------------------------------------------------

const compilePath = (path: string, schema: Schema.Top | undefined) => {
  if (schema === undefined || !path.includes(":")) {
    return (_: any) => path
  }
  const paramNames = HttpApiPath.getParamNames(schema)
  return (params: Record<string, string | undefined>) =>
    HttpApiPath.replaceParams(path, paramNames, (key, optional) => {
      const value = params[key]
      if (value === "." || value === "..") {
        // dot segments survive encoding and would be resolved by URL normalization
        throw new Error(`Invalid path parameter: ${key}`)
      }
      if (value !== undefined) return encodeURIComponent(value)
      if (optional) return undefined
      throw new Error(`Missing path parameter: ${key}`)
    })
}

function schemasToResponse(
  schemas: readonly [Schema.Constraint, ...Array<Schema.Constraint>],
  options: SchemaAST.ParseOptions | undefined,
  headersOptions: SchemaAST.ParseOptions | undefined
): ResponseDecoder {
  const hasWithHeaders = schemas.some((schema) =>
    HttpApiSchema.isWithHeaders(schema) || HttpApiSchema.getWithHeadersAnnotation(schema.ast) !== undefined
  )
  const codec = hasWithHeaders
    ? Schema.Union(schemas.map((schema) => toCodecArrayBufferWithHeaders(schema, options, headersOptions)))
    : toCodecArrayBuffer(schemas)
  const decode = Schema.decodeUnknownEffect(codec, options)
  return (response) =>
    Effect.flatMap(
      response.arrayBuffer,
      hasWithHeaders
        ? (body) => decode({ body, headers: response.headers })
        : decode
    )
}

const ResponsePair = Schema.Struct({ body: Schema.Unknown, headers: Schema.Unknown })

// Decodes the body with `options` and the headers with `headersOptions`, so
// they are not applied from the outer decode.
function toCodecArrayBufferWithHeaders(
  schema: Schema.Constraint,
  options: SchemaAST.ParseOptions | undefined,
  headersOptions: SchemaAST.ParseOptions | undefined
): Schema.Top {
  const annotation = HttpApiSchema.getWithHeadersAnnotation(schema.ast)
  const parts: {
    readonly body: Schema.Constraint
    readonly headers: Schema.Top
    readonly toValue: (pair: { readonly body: unknown; readonly headers: unknown }) => unknown
  } = annotation !== undefined
    ? { body: annotation.bodyCodec, headers: annotation.headersCodec, toValue: annotation.transformation.decode }
    : HttpApiSchema.isWithHeaders(schema)
    ? { body: schema.schema, headers: schema.headers, toValue: HttpApiSchema.withHeaders }
    : { body: schema, headers: Schema.Unknown, toValue: (pair) => pair.body }
  const decodeBody = Schema.decodeUnknownEffect(fromArrayBuffer(parts.body).pipe(Schema.decodeTo(parts.body)), options)
  const decodeHeaders = Schema.decodeUnknownEffect(parts.headers, headersOptions)
  return ResponsePair.pipe(Schema.decodeTo(
    HttpApiSchema.isWithHeaders(schema) ? schema : Schema.toType(schema),
    SchemaTransformation.transformEffect<unknown, typeof ResponsePair.Type, unknown, never>({
      decode: (pair) =>
        Effect.all({ body: decodeBody(pair.body), headers: decodeHeaders(pair.headers) }).pipe(
          Effect.map(parts.toValue),
          Effect.mapError((error) => error.issue)
        ),
      encode: (input, options) =>
        Effect.fail(new SchemaIssue.Forbidden({ message: "Decode only schema" }, input, options))
    })
  ))
}

const makeEndpointDecoder = (options: {
  readonly endpoint: HttpApiEndpoint.Top
  readonly mergedAnnotations: Context.Context<never>
  readonly successes: ReadonlyMap<number, readonly [Schema.Top, ...Array<Schema.Top>]>
  readonly errors: ReadonlyMap<number, readonly [Schema.Top, ...Array<Schema.Top>]>
}): ResponseDecoder => {
  const { endpoint, errors, successes, mergedAnnotations } = options
  const parseOptions = HttpApi.getSlotParseOptions(mergedAnnotations)
  const decodeMap: Record<number | "orElse", ResponseDecoder> = { orElse: statusOrElse }
  const errorAlternatives = new Map<number, Array<ResponseAlternative>>()
  for (const [status, schemas] of errors.entries()) {
    const grouped = groupSchemasByContentType(schemas)
    for (const [contentType, schemas] of grouped.entries()) {
      addResponseAlternative(
        errorAlternatives,
        status,
        contentType,
        schemasToResponse(schemas, parseOptions.error, parseOptions.headers)
      )
    }
  }
  for (const [status, alternatives] of errorAlternatives.entries()) {
    const decode = makeResponseDecoder(alternatives)
    decodeMap[status] = (response) =>
      Effect.flatMap(
        Effect.catchCause(decode(response), (cause) =>
          Effect.failCause(Cause.combine(
            Cause.fail(
              new HttpClientError.HttpClientError({
                reason: new HttpClientError.StatusCodeError({
                  request: response.request,
                  response
                })
              })
            ),
            cause
          ))),
        Effect.fail
      )
  }

  const successAlternatives = new Map<number, Array<ResponseAlternative>>()
  for (const [status, schemas] of successes.entries()) {
    const grouped = groupSchemasByContentType(schemas)
    for (const [contentType, schemas] of grouped.entries()) {
      addResponseAlternative(
        successAlternatives,
        status,
        contentType,
        schemasToResponse(schemas, parseOptions.success, parseOptions.headers)
      )
    }
  }
  for (const streamSuccess of getStreamSuccessSchemas(endpoint)) {
    const streamSchema = isWithHeadersStreamSuccess(streamSuccess) ? streamSuccess.schema : streamSuccess
    const status = HttpApiSchema.getStatusSuccessSchema(streamSuccess)
    const decode = streamToResponse(streamSuccess, parseOptions.success, parseOptions.headers)
    for (const contentType of streamSchema.contentTypes) {
      addResponseAlternative(successAlternatives, status, contentType, decode)
    }
  }
  for (const [status, alternatives] of successAlternatives.entries()) {
    decodeMap[status] = makeResponseDecoder(alternatives)
  }
  const upgrade = getUpgradeSuccessSchema(endpoint)
  if (upgrade !== undefined) {
    const decodeHeaders = upgrade.headers === undefined
      ? Effect.succeed
      : Schema.decodeUnknownEffect(upgrade.headers, parseOptions.headers)
    decodeMap[101] = (response) =>
      // the cleanup must be in place before an interruption can be observed
      Effect.uninterruptibleMask((restore) =>
        Effect.flatMap(response.upgrade, (socket) =>
          restore(decodeHeaders(response.headers)).pipe(
            Effect.map((headers): Upgraded<unknown> => ({ [UpgradedTypeId]: UpgradedTypeId, headers, socket })),
            // nothing takes the connection on failure, so close it: releasing
            // the reader's scope closes the connection
            Effect.onError(() => Effect.ignore(Effect.scoped(socket.reader)))
          ))
      )
  }

  return (response, sseOptions) => (decodeMap[response.status] ?? decodeMap.orElse)(response, sseOptions)
}

type ResponseDecoder = (
  response: HttpClientResponse.HttpClientResponse,
  sseOptions?: Sse.DecodeOptions
) => Effect.Effect<unknown, unknown, unknown>

interface ResponseAlternative {
  readonly contentType: string
  readonly decode: ResponseDecoder
}

function addResponseAlternative(
  map: Map<number, Array<ResponseAlternative>>,
  status: number,
  contentType: string,
  decode: ResponseDecoder
) {
  const normalizedContentType = MediaType.normalize(contentType)
  const alternatives = map.get(status)
  if (alternatives === undefined) {
    map.set(status, [{ contentType: normalizedContentType, decode }])
  } else {
    alternatives.push({ contentType: normalizedContentType, decode })
  }
}

function makeResponseDecoder(alternatives: ReadonlyArray<ResponseAlternative>): ResponseDecoder {
  const first = alternatives[0]
  if (first !== undefined && alternatives.every((alternative) => alternative.decode === first.decode)) {
    return first.decode
  }
  return (response, sseOptions) => {
    const contentType = MediaType.normalize(response.headers["content-type"] ?? "")
    const alternative = alternatives.find((alternative) => alternative.contentType === contentType)
    return alternative === undefined
      ? failUnsupportedContentType(response, contentType, alternatives)
      : alternative.decode(response, sseOptions)
  }
}

function groupSchemasByContentType(
  schemas: Arr.NonEmptyReadonlyArray<Schema.Top>
): Map<string, Arr.NonEmptyReadonlyArray<Schema.Top>> {
  const grouped = new Map<string, [Schema.Top, ...Array<Schema.Top>]>()
  for (const schema of schemas) {
    const body = HttpApiSchema.isWithHeaders(schema) ? schema.schema : schema
    const contentType = HttpApiSchema.isNoContent(body.ast)
      ? ""
      : MediaType.normalize(HttpApiSchema.getResponseEncodingSchema(schema).contentType)
    const existing = grouped.get(contentType)
    if (existing === undefined) {
      grouped.set(contentType, [schema])
    } else {
      existing.push(schema)
    }
  }
  return grouped
}

function failUnsupportedContentType(
  response: HttpClientResponse.HttpClientResponse,
  contentType: string,
  alternatives: ReadonlyArray<ResponseAlternative>
) {
  const expected = Array.from(new Set(alternatives.map((alternative) => alternative.contentType))).join(", ")
  return Effect.fail(
    new HttpClientError.HttpClientError({
      reason: new HttpClientError.DecodeError({
        request: response.request,
        response,
        description: `Unsupported response content-type for status ${response.status}: ${
          contentType || "<missing>"
        }. Expected one of: ${expected}`
      })
    })
  )
}

const reservedStreamFailureEvent = "effect/http-api/stream/failure"

type StreamSuccessSchema =
  | HttpApiSchema.StreamSchema
  | HttpApiSchema.WithHeaders<HttpApiSchema.StreamSchema, Schema.Top>

const isWithHeadersStreamSuccess = (
  schema: StreamSuccessSchema
): schema is HttpApiSchema.WithHeaders<HttpApiSchema.StreamSchema, Schema.Top> => HttpApiSchema.isWithHeaders(schema)

function getUpgradeSuccessSchema(endpoint: HttpApiEndpoint.Top): HttpApiSchema.Upgrade | undefined {
  for (const schema of endpoint.success) {
    if (HttpApiSchema.isUpgrade(schema)) return schema
  }
}

function getStreamSuccessSchemas(endpoint: HttpApiEndpoint.Top): Array<StreamSuccessSchema> {
  const schemas: Array<StreamSuccessSchema> = []
  for (const schema of endpoint.success) {
    const body = HttpApiSchema.isWithHeaders(schema) ? schema.schema : schema
    if (HttpApiSchema.isStreamSchema(body)) {
      schemas.push(schema as StreamSuccessSchema)
    }
  }
  return schemas
}

function streamToResponse(
  successSchema: StreamSuccessSchema,
  options: SchemaAST.ParseOptions | undefined,
  headersOptions: SchemaAST.ParseOptions | undefined
) {
  const isWithHeaders = isWithHeadersStreamSuccess(successSchema)
  const streamSchema = isWithHeaders ? successSchema.schema : successSchema
  const decodeBody = makeStreamBodyDecoder(streamSchema, options)
  const toStream: ResponseDecoder = (response, sseOptions) =>
    Effect.map(Effect.context<never>(), (context) =>
      Stream.provideContext(
        decodeBody(response, sseOptions),
        context as Context.Context<unknown>
      ))
  if (!isWithHeaders) return toStream

  const decodeHeaders = Schema.decodeUnknownEffect(successSchema.headers, headersOptions)
  return (response: HttpClientResponse.HttpClientResponse, sseOptions?: Sse.DecodeOptions) =>
    Effect.flatMap(
      decodeHeaders(response.headers),
      (headers) => Effect.map(toStream(response, sseOptions), (body) => HttpApiSchema.withHeaders({ body, headers }))
    )
}

function makeStreamBodyDecoder(
  streamSchema: HttpApiSchema.StreamSchema,
  options: SchemaAST.ParseOptions | undefined
): (
  response: HttpClientResponse.HttpClientResponse,
  sseOptions: Sse.DecodeOptions | undefined
) => Stream.Stream<unknown, unknown, unknown> {
  if (HttpApiSchema.isStreamUint8Array(streamSchema)) {
    return (response) => response.stream
  }
  if (HttpApiSchema.isStreamNdjson(streamSchema)) {
    const decodeElement = Schema.decodeUnknownEffect(Schema.toCodecJson(streamSchema.schema), options)
    const maxElementBytes = ByteSize.toNumberUnsafe(streamSchema.maxElementBytes)
    return (response) =>
      response.stream.pipe(
        Stream.pipeThroughChannel(Ndjson.decode({ ignoreEmptyLines: true, maxLineBytes: maxElementBytes })),
        Stream.mapError((error) => {
          if (!Ndjson.isNdjsonError(error)) return error
          if (error.reason !== "LineTooLarge") return ndjsonSchemaError(error)
          return new HttpClientError.HttpClientError({
            reason: new HttpClientError.DecodeError({
              request: response.request,
              response,
              description: `NDJSON line exceeds maxElementBytes of ${maxElementBytes} bytes`
            })
          })
        }),
        Stream.mapEffect((json) => decodeElement(json))
      )
  }
  const decoder = makeSseDecoder(streamSchema, options)
  return (response, sseOptions) => decodeSseStream(response.stream, streamSchema, decoder(sseOptions))
}

// `JSON.stringify` found no JSON representation for an encoded element
const isNdjsonPackError = (error: unknown): error is Ndjson.NdjsonError =>
  Ndjson.isNdjsonError(error) && error.kind === "Pack"

const ndjsonSchemaError = (error: Ndjson.NdjsonError): Schema.SchemaError =>
  new Schema.SchemaError(
    new SchemaIssue.InvalidValue({
      message: error.reason === "InvalidUtf8"
        ? "Expected valid UTF-8"
        : error.unterminated
        ? "Expected a valid JSON line, got an unterminated final line"
        : "Expected a valid JSON line"
    })
  )

function makeSseDecoder(
  declaration: HttpApiSchema.StreamSse<Sse.EventCodec, Schema.Constraint, unknown>,
  parseOptions: SchemaAST.ParseOptions | undefined
) {
  const Event = Schema.Union([
    Schema.Struct({
      id: Schema.optional(Schema.String),
      event: Schema.Literal(reservedStreamFailureEvent),
      data: Schema.fromJsonString(Schema.toCodecJson(Schema.Cause(declaration.error, Schema.Defect())))
    }),
    declaration.events
  ])
  const defaultDecoder = Sse.decodeSchema(Event, undefined, parseOptions)
  return (options?: Sse.DecodeOptions) =>
    options === undefined ? defaultDecoder : Sse.decodeSchema(Event, options, parseOptions)
}

function decodeSseStream(
  stream: Stream.Stream<Uint8Array, HttpClientError.HttpClientError>,
  declaration: HttpApiSchema.StreamSse<Sse.EventCodec, Schema.Constraint, unknown>,
  decoder: ReturnType<ReturnType<typeof makeSseDecoder>>
): Stream.Stream<unknown, unknown, unknown> {
  const events = Stream.transformPull(
    stream.pipe(
      Stream.decodeText,
      Stream.pipeThroughChannel(decoder)
    ),
    (pull) =>
      Effect.sync(() => {
        let pendingFailureCause: Cause.Cause<unknown> | undefined = undefined
        return Effect.suspend(() => {
          if (pendingFailureCause !== undefined) {
            return Effect.failCause(pendingFailureCause)
          }
          return Effect.flatMap(pull, (events) => {
            for (let i = 0; i < events.length; i++) {
              const event = events[i]
              if (event.event === reservedStreamFailureEvent && Cause.isCause(event.data)) {
                if (i === 0) {
                  return Effect.failCause(event.data)
                }
                pendingFailureCause = event.data
                events = events.slice(0, i) as any
                break
              }
            }
            return Effect.succeed(events)
          })
        })
      })
  )
  if (declaration.sseMode === "data") {
    return Stream.map(events, (event) => event.data)
  }
  return events
}

const ArrayBuffer = Schema.instanceOf(globalThis.ArrayBuffer, {
  expected: "ArrayBuffer"
})

// _tag: Uint8Array
const Uint8ArrayFromArrayBuffer = ArrayBuffer.pipe(
  Schema.decodeTo(
    Schema.Uint8Array as Schema.instanceOf<Uint8Array<ArrayBuffer>>,
    SchemaTransformation.transform({
      decode(fromA) {
        return new Uint8Array(fromA)
      },
      encode(arr) {
        return arr.byteLength === arr.buffer.byteLength ?
          arr.buffer :
          arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength)
      }
    })
  )
)

// _tag: Text
const StringFromArrayBuffer = ArrayBuffer.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode(fromA) {
        return new TextDecoder().decode(fromA)
      },
      encode(toI) {
        const arr = new TextEncoder().encode(toI) as Uint8Array<ArrayBuffer>
        return arr.byteLength === arr.buffer.byteLength ?
          arr.buffer :
          arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength)
      }
    })
  )
)

// _tag: Json
const UnknownFromArrayBuffer = StringFromArrayBuffer.pipe(Schema.decodeTo(
  Schema.Union([
    // Handle No Content
    Schema.Literal("").pipe(Schema.decodeTo(
      Schema.Undefined,
      SchemaTransformation.transform({
        decode: () => undefined,
        encode: () => ""
      })
    )),
    Schema.UnknownFromJsonString
  ])
))

function toCodecArrayBuffer(schemas: readonly [Schema.Constraint, ...Array<Schema.Constraint>]): Schema.Top {
  return Schema.Union(schemas.map(onSchema))

  function onSchema(schema: Schema.Constraint) {
    return fromArrayBuffer(schema).pipe(Schema.decodeTo(schema))
  }
}

function fromArrayBuffer(schema: Schema.Constraint): Schema.Top {
  const encoding = HttpApiSchema.getResponseEncoding(schema.ast)
  switch (encoding._tag) {
    case "Json": {
      // handle json codecs that transform void schemas to null
      const encodedIsNull = SchemaAST.isNull(SchemaAST.toEncoded(schema.ast))
      return encodedIsNull
        ? UnknownFromArrayBuffer.pipe(
          Schema.decodeTo(
            Schema.Unknown,
            SchemaTransformation.transform({
              decode: (a) => a === undefined ? null : a,
              encode: (a) => a === null ? undefined : a
            }) as any
          )
        )
        : UnknownFromArrayBuffer
    }
    case "FormUrlEncoded":
      return StringFromArrayBuffer.pipe(Schema.decodeTo(
        Schema.RecordFromUrlParams,
        SchemaTransformation.transform({
          decode: (text) => UrlParams.fromInput(new URLSearchParams(text)),
          encode: UrlParams.toString
        })
      ))
    case "Uint8Array":
      return Uint8ArrayFromArrayBuffer
    case "Text":
      return StringFromArrayBuffer
  }
}

const statusOrElse = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.fail(
    new HttpClientError.HttpClientError({
      reason: new HttpClientError.DecodeError({
        request: response.request,
        response,
        description: "undeclared status code"
      })
    })
  )

const $HttpBody = Schema.declare(HttpBody.isHttpBody)

type StreamPayloadSchema = HttpApiSchema.StreamUint8Array | HttpApiSchema.StreamNdjson<Schema.Top>

function makeStreamPayloadEncoder(
  schema: StreamPayloadSchema,
  options: SchemaAST.ParseOptions | undefined
): (stream: Stream.Stream<unknown, unknown, unknown>) => Stream.Stream<Uint8Array, unknown, unknown> {
  if (HttpApiSchema.isStreamUint8Array(schema)) {
    return (stream) => stream as Stream.Stream<Uint8Array, unknown, unknown>
  }
  const encodeElements = Schema.encodeUnknownEffect(Schema.NonEmptyArray(Schema.toCodecJson(schema.schema)), options)
  return (stream) =>
    stream.pipe(
      Stream.mapArrayEffect((elements) => encodeElements(elements)),
      Stream.pipeThroughChannel(Ndjson.encode()),
      Stream.catchIf(isNdjsonPackError, Stream.die)
    )
}

function getEncodePayloadSchema(
  schemas: readonly [Schema.Constraint, ...Array<Schema.Constraint>],
  method: HttpMethod.HttpMethod
): Schema.Top {
  return Schema.Union(schemas.map((s) => getEncodePayloadSchemaFromBody(s, method)))
}

const bodyFromPayloadCache = new WeakMap<SchemaAST.AST, Schema.Top>()

function getEncodePayloadSchemaFromBody(
  schema: Schema.Constraint,
  method: HttpMethod.HttpMethod
): Schema.Top {
  const ast = schema.ast
  const cached = bodyFromPayloadCache.get(ast)
  if (cached !== undefined) {
    return cached
  }
  const encoding = HttpApiSchema.getPayloadEncoding(ast, method)
  const out = $HttpBody.pipe(Schema.decodeTo(
    schema,
    SchemaTransformation.transformEffect<unknown, HttpBody.HttpBody>({
      decode(input, options) {
        return Effect.fail(
          new SchemaIssue.Forbidden({ message: "Encode only schema" }, input, options)
        )
      },
      encode(t, options) {
        switch (encoding._tag) {
          case "Multipart":
            return Effect.fail(
              new SchemaIssue.Forbidden(
                { message: "Payload must be a FormData" },
                t,
                options
              )
            )
          case "Json": {
            try {
              const body = JSON.stringify(t)
              return Effect.succeed(HttpBody.text(body, encoding.contentType))
            } catch {
              return Effect.fail(
                new SchemaIssue.InvalidValue(
                  { expected: "a JSON-serializable request body" },
                  t,
                  options
                )
              )
            }
          }
          case "Text": {
            if (typeof t !== "string") {
              return Effect.fail(
                new SchemaIssue.InvalidValue({ message: "Expected a string" }, t, options)
              )
            }
            return Effect.succeed(HttpBody.text(t, encoding.contentType))
          }
          case "FormUrlEncoded": {
            if (!Predicate.isObject(t)) {
              return Effect.fail(
                new SchemaIssue.InvalidValue({ message: "Expected a record" }, t, options)
              )
            }
            return Effect.succeed(HttpBody.urlParams(UrlParams.fromInput(t as any), encoding.contentType))
          }
          case "Uint8Array": {
            if (!(t instanceof Uint8Array)) {
              return Effect.fail(
                new SchemaIssue.InvalidValue(
                  { message: "Expected a Uint8Array" },
                  t,
                  options
                )
              )
            }
            return Effect.succeed(HttpBody.uint8Array(t, encoding.contentType))
          }
        }
      }
    })
  ))
  bodyFromPayloadCache.set(ast, out)
  return out
}
