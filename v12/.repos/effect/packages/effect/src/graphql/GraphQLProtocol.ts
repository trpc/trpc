/**
 * Transports for `GraphQLClient`. They accept encoded requests and return raw
 * response bodies with available HTTP status and headers, without schema
 * decoding or middleware.
 *
 * - {@link layerHttp} uses HTTP POST (or GET for queries) and graphql-sse
 *   subscriptions, with an optional graphql-ws subscription transport.
 * - {@link layerWebSocket} multiplexes all operations over graphql-ws.
 *
 * {@link makeHttp} and {@link makeWebSocket} construct the same transports as effects.
 *
 * @stability experimental
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Clock from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Deferred from "../Deferred.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Sse from "../encoding/Sse.ts"
import * as Fiber from "../Fiber.ts"
import { constant } from "../Function.ts"
import * as Headers from "../http/Headers.ts"
import * as HttpClient from "../http/HttpClient.ts"
import * as HttpClientError from "../http/HttpClientError.ts"
import * as HttpClientRequest from "../http/HttpClientRequest.ts"
import * as HttpClientResponse from "../http/HttpClientResponse.ts"
import * as UrlParams from "../http/UrlParams.ts"
import * as internalGraphQL from "../internal/graphql.ts"
import { HeadersSchema } from "../internal/graphqlHeaders.ts"
import * as Layer from "../Layer.ts"
import * as Queue from "../Queue.ts"
import * as Result from "../Result.ts"
import * as Schema from "../Schema.ts"
import type * as Scope from "../Scope.ts"
import * as Socket from "../socket/Socket.ts"
import * as Stream from "../Stream.ts"
import type { Kind } from "./GraphQL.ts"
import { GraphQLError, TransportError } from "./GraphQLClientError.ts"

/**
 * The request a transport sends. Middleware sees and may rewrite it before it
 * reaches the transport.
 *
 * **Details**
 *
 * `kind` is the operation type, which the HTTP transport uses to send queries
 * as `GET` when `queryMethod: "GET"` is set. `variables` are already encoded
 * through the operation's variables Schema.
 *
 * `headers` and `urlParams` are applied by the HTTP transport, to queries,
 * mutations and graphql-sse subscriptions alike. A graphql-ws transport
 * ignores both, because graphql-ws has no per-operation headers or URL.
 * Request headers are normalized, immutable `Headers.Headers` values.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface GraphQLRequest {
  readonly kind: Kind
  readonly query: string
  readonly operationName: string
  readonly variables: unknown
  readonly extensions?: Record<string, unknown> | undefined
  readonly headers: Headers.Headers
  readonly urlParams: UrlParams.UrlParams
}

/**
 * A raw GraphQL result before schema decoding. Middleware receive it from
 * `next` and can read response `extensions`, such as rate-limit costs.
 *
 * **Details**
 *
 * `status` and `headers` are transport metadata, not part of the GraphQL
 * response body: the client decodes the body without them and then copies
 * what the transport reported. Middleware may read or rewrite them, and a
 * failed call's `ResponseError` carries the final values. Headers use
 * `Headers.Headers` at runtime and encode as a plain string record.
 *
 * @stability experimental
 * @category schemas
 * @since 4.0.0
 */
export const ExecutionResult = Schema.Struct({
  data: Schema.optional(Schema.Unknown),
  errors: Schema.optional(Schema.Array(GraphQLError)),
  extensions: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  status: Schema.optional(Schema.Int),
  headers: Schema.optional(HeadersSchema)
})

/**
 * The decoded type of {@link ExecutionResult}.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export type ExecutionResult = typeof ExecutionResult.Type

/**
 * The transport service. `execute` answers a query or mutation with the raw
 * JSON body, and `subscribe` turns a subscription into a stream of raw events.
 * Both fail only with `TransportError`; GraphQL `errors` are left in the body
 * for the client to interpret.
 *
 * **Details**
 *
 * Each answer is `{ body, status?, headers? }`. The HTTP transport sets
 * `headers` on every answer, including graphql-sse events, and `status` on
 * all but graphql-sse events. Headers are `Headers.Headers` values.
 * graphql-ws leaves both unset.
 *
 * **Example** (A scripted transport for tests)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Schema, Stream } from "effect"
 * import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLProtocol } from "effect/graphql"
 *
 * const Viewer = GraphQL.query("Viewer", {
 *   document: "query Viewer{viewer{login}}",
 *   result: Schema.Struct({ viewer: Schema.Struct({ login: Schema.String }) })
 * })
 *
 * const Scripted = Layer.succeed(GraphQLProtocol.GraphQLProtocol, {
 *   execute: () => Effect.succeed({ body: { data: { viewer: { login: "tim" } } } }),
 *   subscribe: () => Stream.empty
 * })
 *
 * const program = Effect.gen(function*() {
 *   const client = yield* GraphQLClient.make(GraphQLGroup.make(Viewer))
 *   return yield* client.Viewer()
 * })
 *
 * await Effect.runPromise(program.pipe(Effect.provide(Scripted))) // => { viewer: { login: "tim" } }
 * ```
 *
 * @stability experimental
 * @category services
 * @since 4.0.0
 */
export class GraphQLProtocol extends Context.Service<GraphQLProtocol, {
  readonly execute: (request: GraphQLRequest) => Effect.Effect<{
    readonly body: unknown
    readonly status?: number | undefined
    readonly headers?: Headers.Headers | undefined
  }, TransportError>
  readonly subscribe: (request: GraphQLRequest) => Stream.Stream<{
    readonly body: unknown
    readonly status?: number | undefined
    readonly headers?: Headers.Headers | undefined
  }, TransportError>
  /**
   * Resolves the transport URL for resolver batching. Set by `layerHttp`;
   * optional for custom transports.
   */
  readonly url?:
    | ((options: { readonly kind: Kind; readonly operationName: string }) => Effect.Effect<string>)
    | undefined
}>()("effect/graphql/GraphQLProtocol") {}

/**
 * The URL of an HTTP transport: fixed, resolved for each operation from the
 * calling context, `kind` and `operationName`, or an `Effect` with no errors
 * or requirements. See {@link layerHttp}.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export type Url =
  | string
  | Effect.Effect<string>
  | ((options: {
    readonly context: Context.Context<never>
    readonly kind: Kind
    readonly operationName: string
  }) => string)

const graphqlResponseContentType = "application/graphql-response+json"
const jsonContentType = "application/json"
const eventStreamContentType = "text/event-stream"

const isObject = (u: unknown): u is Record<string, unknown> => typeof u === "object" && u !== null && !Array.isArray(u)

// A gateway's `{ "errors": "Throttled" }` is not a GraphQL response, so its
// status and Retry-After still apply.
const isGraphQLBody = (body: unknown): boolean =>
  isObject(body) && ("data" in body || "errors" in body) &&
  (!("errors" in body) || Array.isArray(body.errors)) &&
  (!("data" in body) || body.data === null || isObject(body.data))

// The JSON body of a POST and the payload of a graphql-ws `subscribe`.
// `extensions` is dropped from the JSON when unset.
const requestBody = (request: GraphQLRequest) => ({
  query: request.query,
  operationName: request.operationName,
  variables: request.variables,
  extensions: request.extensions
})

const postRequest = (url: string, request: GraphQLRequest, accept: string) =>
  HttpClientRequest.post(url).pipe(
    HttpClientRequest.setHeaders(request.headers),
    HttpClientRequest.setHeader("accept", accept),
    HttpClientRequest.appendUrlParams(request.urlParams),
    HttpClientRequest.bodyJsonUnsafe(requestBody(request))
  )

const graphqlGetParams = new Set(["query", "operationName", "variables", "extensions"])

// Remove all protocol params from the configured URL and caller params before
// adding the request's values, including when optional fields are unset. Split
// the URL without resolving it so relative URLs remain supported.
const getRequest = (url: string, request: GraphQLRequest, accept: string) => {
  const hashIndex = url.indexOf("#")
  const hash = hashIndex === -1 ? "" : url.slice(hashIndex)
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex)
  const queryIndex = withoutHash.indexOf("?")
  const baseUrl = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex)
  const urlParams = [
    ...UrlParams.fromInput(new URLSearchParams(queryIndex === -1 ? "" : withoutHash.slice(queryIndex + 1))),
    ...request.urlParams
  ].filter(([key]) => !graphqlGetParams.has(key))
  const params: Record<string, string> = { query: request.query, operationName: request.operationName }
  if (request.variables !== undefined) params.variables = JSON.stringify(request.variables)
  if (request.extensions !== undefined) params.extensions = JSON.stringify(request.extensions)
  return HttpClientRequest.get(baseUrl + hash).pipe(
    HttpClientRequest.setHeaders(request.headers),
    HttpClientRequest.setHeader("accept", accept),
    HttpClientRequest.appendUrlParams(urlParams),
    HttpClientRequest.setUrlParams(params)
  )
}

// Reads the clock when the error arrives, so an HTTP-date `Retry-After` is
// measured from when the response was received.
const fromHttpClientError =
  (clock: Clock.Clock) =>
  <A>(effect: Effect.Effect<A, TransportError | HttpClientError.HttpClientError>): Effect.Effect<A, TransportError> =>
    Effect.catch(effect, (error) =>
      Effect.fail(
        HttpClientError.isHttpClientError(error)
          ? TransportError.fromHttpClientError(error, { now: clock.currentTimeMillisUnsafe() })
          : error
      ))

// Media types are case-insensitive.
const contentTypeOf = (response: HttpClientResponse.HttpClientResponse): string =>
  (response.headers["content-type"] ?? "").toLowerCase()

const readResponse = (
  response: HttpClientResponse.HttpClientResponse
): Effect.Effect<unknown, TransportError | HttpClientError.HttpClientError> => {
  const contentType = contentTypeOf(response)
  // The GraphQL-over-HTTP media type is authoritative, whatever the status.
  if (contentType.includes(graphqlResponseContentType)) {
    return response.json
  }
  // Legacy servers answer with application/json; only a body with the
  // GraphQL keys counts as a GraphQL response.
  if (contentType.includes(jsonContentType)) {
    return Effect.flatMap(response.json, (body) =>
      isGraphQLBody(body)
        ? Effect.succeed(body)
        : Effect.as(HttpClientResponse.filterStatusOk(response), body))
  }
  return Effect.flatMap(
    HttpClientResponse.filterStatusOk(response),
    () =>
      Effect.fail(
        new TransportError({
          description: `Expected a GraphQL response, received ${
            contentType === "" ? "no Content-Type" : `Content-Type ${contentType}`
          }`,
          status: response.status,
          headers: response.headers
        })
      )
  )
}

const readAnswer = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.map(readResponse(response), (body) => ({ body, status: response.status, headers: response.headers }))

const errorMessage = (cause: unknown): string => cause instanceof Error ? cause.message : String(cause)

// The graphql-sse distinct-mode events of a `text/event-stream` body. The
// stream ends on a `complete` event, with or without a `data:` line. A body
// that ends without one means the connection was lost, so it fails with a
// retryable `TransportError`. A `retry:` line is kept and reported as
// `retryAfter` if the body fails or ends early.
const sseEvents = (
  response: HttpClientResponse.HttpClientResponse
): Stream.Stream<{ readonly body: unknown; readonly headers: Headers.Headers }, TransportError> =>
  Stream.suspend(() => {
    const headers = response.headers
    let retryAfter: Duration.Duration | undefined
    let complete = false
    let events: Array<Sse.Event> = []
    const parser = Sse.makeParser((event) => {
      if (event._tag === "Retry") {
        retryAfter = event.duration
      } else {
        events.push(event)
      }
    }, { dispatchEmptyNamedEvents: true })
    return response.stream.pipe(
      Stream.decodeText(),
      Stream.mapError((cause) =>
        new TransportError({ description: `The graphql-sse stream failed: ${cause.message}`, retryAfter, cause })
      ),
      Stream.mapEffect((text) => {
        const error = parser.feed(text)
        if (error !== undefined) {
          return Effect.fail(new TransportError({ description: error.message, cause: error }))
        }
        const batch = events
        events = []
        return Effect.succeed(batch)
      }),
      Stream.flattenIterable,
      Stream.takeWhile((event) => {
        if (event.event === "complete") complete = true
        return !complete
      }),
      Stream.filter((event) => event.event === "next"),
      Stream.mapEffect((event) =>
        Effect.try({
          try: () => ({ body: JSON.parse(event.data) as unknown, headers }),
          catch: (cause) =>
            new TransportError({ description: `Invalid graphql-sse next event: ${errorMessage(cause)}`, cause })
        })
      ),
      Stream.concat(Stream.suspend(() =>
        complete ? Stream.empty : Stream.fail(
          new TransportError({ description: "The graphql-sse stream ended without a complete event", retryAfter })
        )
      ))
    )
  })

interface HttpOptions<R = never> {
  readonly url: Url
  readonly queryMethod?: "GET" | "POST" | undefined
  readonly subscriptions?: {
    readonly webSocket: WebSocketOptions<R>
  } | undefined
}

const makeHttpWith = <R>(options: HttpOptions<R>): Effect.Effect<
  GraphQLProtocol["Service"],
  never,
  HttpClient.HttpClient | Socket.WebSocketConstructor | Scope.Scope | R
> => {
  const resolve = urlResolver(options.url)
  // A resolver batch carries the URL it was grouped by.
  const urlOf = (request: GraphQLRequest) =>
    internalGraphQL.ResolvedUrl.use((resolved) =>
      resolved?.resolve === resolve ? Effect.succeed(resolved.url) : resolve(request)
    )
  const http = Clock.clockWith((clock) =>
    HttpClient.HttpClient.useSync((client) => {
      const execute = (request: GraphQLRequest) =>
        Effect.flatMap(Effect.zip(Effect.service(internalGraphQL.ForcePost), urlOf(request)), ([forcePost, url]) => {
          const toRequest = options.queryMethod === "GET" && request.kind === "query" && !forcePost
            ? getRequest
            : postRequest
          return client.execute(
            toRequest(url, request, `${graphqlResponseContentType}, ${jsonContentType}`)
          ).pipe(
            Effect.flatMap(readAnswer),
            fromHttpClientError(clock)
          )
        })
      const subscribe = (request: GraphQLRequest) =>
        Stream.unwrap(Effect.flatMap(urlOf(request), (url) =>
          client.execute(postRequest(url, request, eventStreamContentType)).pipe(
            Effect.flatMap((response) => {
              const contentType = contentTypeOf(response)
              if (contentType.includes(eventStreamContentType) && response.status >= 200 && response.status < 300) {
                return Effect.succeed(sseEvents(response))
              }
              // A server that rejects the subscription answers with a single
              // GraphQL response, which the client reads like a query's.
              return Effect.map(readAnswer(response), Stream.succeed)
            }),
            fromHttpClientError(clock)
          )))
      return GraphQLProtocol.of({ execute, subscribe, url: resolve })
    })
  )
  const webSocket = options.subscriptions?.webSocket
  return webSocket === undefined
    ? http
    : Effect.zipWith(
      http,
      makeWebSocket(webSocket),
      (http, ws) => GraphQLProtocol.of({ execute: http.execute, subscribe: ws.subscribe, url: http.url })
    )
}

const urlResolver = (url: Url): NonNullable<GraphQLProtocol["Service"]["url"]> => {
  if (typeof url === "string") return constant(Effect.succeed(url))
  if (Effect.isEffect(url)) return constant(url)
  return ({ kind, operationName }) =>
    Effect.contextWith((context: Context.Context<never>) => Effect.succeed(url({ context, kind, operationName })))
}

/**
 * Builds the HTTP transport as an effect, for composing transports by hand.
 * Most code uses {@link layerHttp}.
 *
 * **Details**
 *
 * Takes the same options as {@link layerHttp}, including `queryMethod`.
 * Without `subscriptions`, subscriptions use graphql-sse distinct mode on
 * `url`. With `subscriptions.webSocket`, `url` must be a string, subscriptions
 * go over graphql-ws instead, and the effect also builds the graphql-ws
 * transport, so it needs a `Socket.WebSocketConstructor` and a `Scope`.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const makeHttp: {
  <R = never>(options: {
    readonly url: string
    readonly queryMethod?: "GET" | "POST" | undefined
    readonly subscriptions: {
      readonly webSocket: {
        readonly url: string
        readonly headers?: Headers.Input | undefined
        readonly connectionParams?: Effect.Effect<Record<string, unknown> | undefined, unknown, R> | undefined
        readonly connectionAckTimeout?: Duration.Input | undefined
        readonly keepAlive?: Duration.Input | false | undefined
        readonly idleTimeout?: Duration.Input | undefined
      }
    }
  }): Effect.Effect<
    GraphQLProtocol["Service"],
    never,
    HttpClient.HttpClient | Socket.WebSocketConstructor | Scope.Scope | R
  >
  (options: {
    readonly url: Url
    readonly queryMethod?: "GET" | "POST" | undefined
    readonly subscriptions?: undefined
  }): Effect.Effect<
    GraphQLProtocol["Service"],
    never,
    HttpClient.HttpClient
  >
} = makeHttpWith

/**
 * The HTTP transport: queries and mutations are sent as `POST` with a JSON
 * body to `url`, using the `HttpClient` in context. Subscriptions use
 * graphql-sse distinct mode on the same URL, or graphql-ws when
 * `subscriptions.webSocket` is set.
 *
 * **Details**
 *
 * With `queryMethod: "GET"` (default `"POST"`), queries are sent as `GET`
 * with no body: `query` and `operationName` become URL params, plus
 * `variables` and `extensions` as JSON when set. Mutations are always
 * `POST`, and so are `GraphQLResolver.aliased` batches. A long query is not
 * retried as `POST`.
 *
 * A request's `headers` and `urlParams`, from the call options or from
 * middleware, are applied to every HTTP request. A query string already on
 * `url` is kept. On `GET`, the request's `urlParams` come before the GraphQL
 * params, which replace any caller param with the same name.
 *
 * Every response's HTTP `status` is passed to the client as
 * `ExecutionResult.status`, and a call that fails with GraphQL `errors`
 * reports it as `ResponseError.status`. Response headers are passed the
 * same way, as `ExecutionResult.headers` and `ResponseError.headers`.
 *
 * A response is a GraphQL response when its `Content-Type` is
 * `application/graphql-response+json`, whatever the status, or when it is
 * `application/json` and the body has a list of `errors` or a `data` object
 * (or `null`). Media types match case-insensitively. Anything else
 * is a `TransportError` with the response `status` and `headers`, and a
 * `Retry-After` header (whole seconds or an HTTP date, measured from when the
 * response arrived) becomes `retryAfter`. A non-2xx GraphQL response is passed
 * to the client, which never treats it as a success: it fails with a
 * `ResponseError` when the body has `errors`, and with a `TransportError`
 * carrying the same metadata otherwise.
 *
 * A subscription is a `POST` with `Accept: text/event-stream`. Each `next`
 * event is emitted with the response headers but no status, and the stream
 * ends on a `complete` event, with or without a `data:` line. A body that
 * fails, or ends without a `complete` event, is a retryable `TransportError`
 * with a server `retry:` line as its `retryAfter`, so the client's
 * `subscriptionRetry` resubscribes. A non-stream answer, such as a `400` with
 * `errors`, is read like a query's response. Interrupting the stream aborts
 * the request.
 *
 * With `subscriptions: { webSocket }`, subscriptions go over graphql-ws as in
 * {@link layerWebSocket}, and the layer needs a `Socket.WebSocketConstructor`.
 *
 * To route each query, mutation and graphql-sse subscription, `url` can be a
 * function of the calling fiber's context (including the call's `context`
 * option), `kind` and `operationName`, or an `Effect<string>` with no errors
 * or requirements that runs in that context. Use a defaulted
 * `Context.Reference` to select the server. Reading a missing service with
 * `Context.get` is a defect, not a `TransportError`. Neither form can be
 * combined with `subscriptions.webSocket`: the socket URL is fixed at
 * connection time.
 *
 * **Gotchas**
 *
 * `GraphQLResolver` resolves each lookup's URL once, in the calling fiber,
 * before middleware run and before the batched request exists, then sends
 * each batch to the URL it was grouped by. A single call resolves it in the
 * transport, after middleware.
 * So the URL must depend only on the context and the operation, and
 * middleware must not change `kind` or `operationName` or provide services
 * the URL reads.
 *
 * `RequestResolver.withCache` and `RequestResolver.persisted` key on the lookup,
 * not the URL, so results can leak across servers. For caching, use a separate
 * client and resolver per server, for example with `LayerMap`.
 *
 * **Example** (Building a client over HTTP)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Schema } from "effect"
 * import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLProtocol } from "effect/graphql"
 * import { HttpClient, HttpClientResponse } from "effect/http"
 *
 * const Viewer = GraphQL.query("Viewer", {
 *   document: "query Viewer{viewer{login}}",
 *   result: Schema.Struct({ viewer: Schema.Struct({ login: Schema.String }) })
 * })
 *
 * // A stand-in for a real HttpClient layer such as FetchHttpClient.layer
 * const FakeServer = Layer.succeed(
 *   HttpClient.HttpClient,
 *   HttpClient.make((request) =>
 *     Effect.succeed(HttpClientResponse.fromWeb(
 *       request,
 *       new Response(JSON.stringify({ data: { viewer: { login: "tim" } } }), {
 *         headers: { "content-type": "application/graphql-response+json" }
 *       })
 *     ))
 *   )
 * )
 *
 * const program = Effect.gen(function*() {
 *   const client = yield* GraphQLClient.make(GraphQLGroup.make(Viewer))
 *   return yield* client.Viewer()
 * }).pipe(
 *   Effect.provide(GraphQLProtocol.layerHttp({ url: "https://api.github.com/graphql" })),
 *   Effect.provide(FakeServer)
 * )
 *
 * await Effect.runPromise(program) // => { viewer: { login: "tim" } }
 * ```
 *
 * **Example** (Queries over GET with a per-call URL param)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Schema } from "effect"
 * import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLProtocol } from "effect/graphql"
 * import { HttpClient, HttpClientResponse } from "effect/http"
 *
 * const Viewer = GraphQL.query("Viewer", {
 *   document: "query Viewer{viewer{login}}",
 *   result: Schema.Struct({ viewer: Schema.Struct({ login: Schema.String }) })
 * })
 *
 * // A stand-in server that answers with the method and the `preview` param
 * const FakeServer = Layer.succeed(
 *   HttpClient.HttpClient,
 *   HttpClient.make((request, url) =>
 *     Effect.succeed(HttpClientResponse.fromWeb(
 *       request,
 *       new Response(
 *         JSON.stringify({ data: { viewer: { login: `${request.method} ${url.searchParams.get("preview")}` } } }),
 *         { headers: { "content-type": "application/graphql-response+json" } }
 *       )
 *     ))
 *   )
 * )
 *
 * const program = Effect.gen(function*() {
 *   const client = yield* GraphQLClient.make(GraphQLGroup.make(Viewer))
 *   return yield* client.Viewer(undefined, { urlParams: { preview: "draft-token" } })
 * }).pipe(
 *   Effect.provide(GraphQLProtocol.layerHttp({ url: "https://cms.example.com/graphql", queryMethod: "GET" })),
 *   Effect.provide(FakeServer)
 * )
 *
 * await Effect.runPromise(program) // => { viewer: { login: "GET draft-token" } }
 * ```
 *
 * **Example** (One client for github.com, GHE.com and GitHub Enterprise Server)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, Schema } from "effect"
 * import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLProtocol } from "effect/graphql"
 * import { HttpClient, HttpClientResponse } from "effect/http"
 *
 * const Viewer = GraphQL.query("Viewer", {
 *   document: "query Viewer{viewer{login}}",
 *   result: Schema.Struct({ viewer: Schema.Struct({ login: Schema.String }) })
 * })
 *
 * const GitHubHost = Context.Reference<string>("GitHubHost", { defaultValue: () => "github.com" })
 *
 * const Protocol = GraphQLProtocol.layerHttp({
 *   url: ({ context }) => {
 *     const host = Context.get(context, GitHubHost)
 *     if (host === "github.com") return "https://api.github.com/graphql"
 *     if (host.endsWith(".ghe.com")) return `https://api.${host}/graphql`
 *     return `https://${host}/api/graphql`
 *   }
 * })
 *
 * // Echo the request URL instead of calling GitHub.
 * const FakeServer = Layer.succeed(
 *   HttpClient.HttpClient,
 *   HttpClient.make((request, url) =>
 *     Effect.succeed(HttpClientResponse.fromWeb(
 *       request,
 *       new Response(JSON.stringify({ data: { viewer: { login: url.href } } }), {
 *         headers: { "content-type": "application/graphql-response+json" }
 *       })
 *     ))
 *   )
 * )
 *
 * const program = Effect.gen(function*() {
 *   const client = yield* GraphQLClient.make(GraphQLGroup.make(Viewer))
 *   const dotcom = yield* client.Viewer()
 *   const cloud = yield* client.Viewer().pipe(Effect.provideService(GitHubHost, "acme.ghe.com"))
 *   const server = yield* client.Viewer(undefined, { context: Context.make(GitHubHost, "github.example.com") })
 *   return [dotcom, cloud, server].map((result) => result.viewer.login)
 * }).pipe(
 *   Effect.provide(Protocol),
 *   Effect.provide(FakeServer)
 * )
 *
 * await Effect.runPromise(program) // => ["https://api.github.com/graphql", "https://api.acme.ghe.com/graphql", "https://github.example.com/api/graphql"]
 * ```
 *
 * **Example** (Subscriptions over graphql-ws, everything else over POST)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { GraphQLProtocol } from "effect/graphql"
 *
 * const token = Effect.succeed("secret")
 *
 * // Provide an HttpClient and a Socket.WebSocketConstructor, such as
 * // FetchHttpClient.layer and NodeSocket.layerWebSocketConstructor
 * export const Protocol = GraphQLProtocol.layerHttp({
 *   url: "https://example.com/graphql",
 *   subscriptions: {
 *     webSocket: {
 *       url: "wss://example.com/graphql",
 *       connectionParams: Effect.map(token, (token) => ({ authorization: `Bearer ${token}` }))
 *     }
 *   }
 * })
 * ```
 *
 * @stability experimental
 * @category layers
 * @since 4.0.0
 */
export const layerHttp: {
  <R = never>(options: {
    readonly url: string
    readonly queryMethod?: "GET" | "POST" | undefined
    readonly subscriptions: {
      readonly webSocket: {
        readonly url: string
        readonly headers?: Headers.Input | undefined
        readonly connectionParams?: Effect.Effect<Record<string, unknown> | undefined, unknown, R> | undefined
        readonly connectionAckTimeout?: Duration.Input | undefined
        readonly keepAlive?: Duration.Input | false | undefined
        readonly idleTimeout?: Duration.Input | undefined
      }
    }
  }): Layer.Layer<GraphQLProtocol, never, HttpClient.HttpClient | Socket.WebSocketConstructor | R>
  (options: {
    readonly url: Url
    readonly queryMethod?: "GET" | "POST" | undefined
    readonly subscriptions?: undefined
  }): Layer.Layer<
    GraphQLProtocol,
    never,
    HttpClient.HttpClient
  >
} = <R>(
  options: HttpOptions<R>
): Layer.Layer<GraphQLProtocol, never, HttpClient.HttpClient | Socket.WebSocketConstructor | R> =>
  Layer.effect(GraphQLProtocol, makeHttpWith(options))

interface WebSocketOptions<R = never> {
  readonly url: string
  readonly headers?: Headers.Input | undefined
  readonly connectionParams?: Effect.Effect<Record<string, unknown> | undefined, unknown, R> | undefined
  readonly connectionAckTimeout?: Duration.Input | undefined
  readonly keepAlive?: Duration.Input | false | undefined
  readonly idleTimeout?: Duration.Input | undefined
}

interface WsMessage {
  readonly type: string
  readonly id?: string | undefined
  readonly payload?: unknown
}

// One WebSocket connection. `error` is set once it is lost, and the operations
// attached to it fail with it.
interface Connection {
  readonly ack: Deferred.Deferred<void, TransportError>
  error: TransportError | undefined
  receivedFrame: boolean
  fiber: Fiber.Fiber<void> | undefined
}

interface Operation {
  readonly queue: Queue.Queue<{ readonly body: unknown }, TransportError | Cause.Done>
  readonly connection: Connection
}

const textDecoder = new TextDecoder()

// As in graphql-ws's `validateMessage`, `error` carries at least one entry with
// a `message`.
const isFormattedErrors = (u: unknown): boolean =>
  Array.isArray(u) && u.length > 0 && u.every((error) => isObject(error) && "message" in error)

const connectionError = (cause: Cause.Cause<unknown>): TransportError => {
  const found = Cause.findError(cause)
  if (Result.isFailure(found)) {
    return new TransportError({ description: "The graphql-ws connection was closed" })
  }
  const error = found.success
  if (error instanceof TransportError) {
    return error
  }
  if (Socket.isSocketError(error) && error.reason._tag === "SocketCloseError") {
    return new TransportError({
      description: `The graphql-ws connection closed with ${error.reason.message}`,
      closeCode: error.reason.code,
      cause: error
    })
  }
  return new TransportError({ description: `The graphql-ws connection failed: ${errorMessage(error)}`, cause: error })
}

/**
 * Builds the graphql-ws transport as an effect, for composing transports by
 * hand. Most code uses {@link layerWebSocket}, which describes the options.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const makeWebSocket = <R = never>(
  options: {
    readonly url: string
    readonly headers?: Headers.Input | undefined
    readonly connectionParams?: Effect.Effect<Record<string, unknown> | undefined, unknown, R> | undefined
    readonly connectionAckTimeout?: Duration.Input | undefined
    readonly keepAlive?: Duration.Input | false | undefined
    readonly idleTimeout?: Duration.Input | undefined
  }
): Effect.Effect<GraphQLProtocol["Service"], never, Socket.WebSocketConstructor | Scope.Scope | R> =>
  Effect.gen(function*() {
    const socket = yield* Socket.makeWebSocket(options.url, {
      protocols: "graphql-transport-ws",
      headers: options.headers === undefined ? undefined : Headers.fromInput(options.headers)
    })
    const writer = yield* socket.writer
    const scope = yield* Effect.scope
    const context = yield* Effect.context<R>()
    const connectionParams = options.connectionParams === undefined
      ? Effect.succeed(undefined)
      : options.connectionParams.pipe(
        Effect.provideContext(context),
        Effect.mapError((cause) =>
          new TransportError({ description: `graphql-ws connectionParams failed: ${errorMessage(cause)}`, cause })
        )
      )
    const ackTimeout = options.connectionAckTimeout ?? Duration.seconds(10)
    const keepAlive = options.keepAlive ?? Duration.seconds(10)
    const idleTimeout = Duration.fromInputUnsafe(options.idleTimeout ?? 0)

    const operations = new Map<string, Operation>()
    let connection: Connection | undefined
    let nextId = 0
    let active = 0
    let idleGeneration = 0

    const send = (message: WsMessage) =>
      writer.write(JSON.stringify(message)).pipe(
        Effect.mapError((cause) => connectionError(Cause.fail(cause)))
      )

    const lose = (conn: Connection, error: TransportError) => {
      if (conn.error !== undefined) return
      conn.error = error
      if (connection === conn) connection = undefined
      Deferred.doneUnsafe(conn.ack, Effect.fail(error))
      for (const [id, operation] of operations) {
        if (operation.connection !== conn) continue
        operations.delete(id)
        Queue.failCauseUnsafe(operation.queue, Cause.fail(error))
      }
    }

    // An invalid server message closes the connection with 4400, which is
    // fatal for every operation on it.
    const invalid = (reason: string, cause?: unknown) =>
      Effect.andThen(
        Effect.ignore(writer.write(new Socket.CloseEvent(4400, "Invalid message"))),
        Effect.fail(
          new TransportError({ description: `Invalid graphql-ws message: ${reason}`, closeCode: 4400, cause })
        )
      )

    const handle = (conn: Connection, frame: string | Uint8Array): Effect.Effect<void, TransportError> => {
      // Any frame answers a keep-alive ping; an invalid one drops the connection anyway.
      conn.receivedFrame = true
      let message: WsMessage
      try {
        message = JSON.parse(typeof frame === "string" ? frame : textDecoder.decode(frame))
      } catch (cause) {
        return invalid(errorMessage(cause), cause)
      }
      if (!isObject(message)) {
        return invalid("expected an object")
      }
      switch (message.type) {
        case "connection_ack":
        case "ping":
        case "pong": {
          if (message.payload != null && !isObject(message.payload)) {
            return invalid(`${message.type} with a payload that is not an object`)
          }
          if (message.type === "connection_ack") {
            Deferred.doneUnsafe(conn.ack, Effect.void)
          }
          return message.type === "ping" ? send({ type: "pong" }) : Effect.void
        }
        case "next":
        case "error":
        case "complete": {
          const id = message.id
          if (typeof id !== "string" || id === "") {
            return invalid(`${message.type} without an id`)
          }
          if (message.type === "next" && !isObject(message.payload)) {
            return invalid("next with a payload that is not an object")
          }
          if (message.type === "error" && !isFormattedErrors(message.payload)) {
            return invalid("error with a payload that is not a list of GraphQL errors")
          }
          const operation = operations.get(id)
          // Unknown ids, including operations this client already completed, are dropped.
          if (operation === undefined || operation.connection !== conn) return Effect.void
          if (message.type === "next") {
            Queue.offerUnsafe(operation.queue, { body: message.payload })
            return Effect.void
          }
          operations.delete(id)
          if (message.type === "error") {
            // The server rejected the operation; the client fails it with a ResponseError.
            Queue.offerUnsafe(operation.queue, { body: { errors: message.payload } })
          }
          Queue.endUnsafe(operation.queue)
          return Effect.void
        }
        default: {
          return invalid(`unknown type ${JSON.stringify(message.type)}`)
        }
      }
    }

    const pinger = Effect.fnUntraced(function*(conn: Connection) {
      if (keepAlive === false) return yield* Effect.never
      while (true) {
        yield* Effect.sleep(keepAlive)
        if (!conn.receivedFrame) {
          return yield* Effect.fail(
            new TransportError({ description: "The graphql-ws server did not answer the keep-alive ping" })
          )
        }
        conn.receivedFrame = false
        yield* send({ type: "ping" })
      }
    })

    const run = Effect.fnUntraced(
      function*(conn: Connection) {
        const { pull } = yield* socket.reader
        const init = Effect.flatMap(connectionParams, (payload) => send({ type: "connection_init", payload }))
        const read = Effect.forever(
          Effect.flatMap(pull, (frames) => Effect.forEach(frames, (frame) => handle(conn, frame), { discard: true }))
        )
        const acknowledged = Deferred.await(conn.ack).pipe(
          Effect.timeoutOrElse({
            duration: ackTimeout,
            orElse: () =>
              Effect.fail(new TransportError({ description: "The graphql-ws server did not send connection_ack" }))
          })
        )
        // Reading starts with `connectionParams`, so a close while it runs still
        // fails the waiting operations. The ack timeout starts once
        // `connection_init` is sent.
        yield* Effect.all([read, init.pipe(Effect.andThen(acknowledged), Effect.andThen(pinger(conn)))], {
          concurrency: 2,
          discard: true
        })
      },
      // Runs before the socket closes, so no write waits on a dead socket.
      (effect, conn) => Effect.onError(effect, (cause) => Effect.sync(() => lose(conn, connectionError(cause)))),
      (effect) => Effect.ignore(Effect.scoped(effect))
    )

    const close = (conn: Connection) => {
      lose(conn, new TransportError({ description: "The graphql-ws connection was closed" }))
      return conn.fiber === undefined ? Effect.void : Fiber.interrupt(conn.fiber)
    }

    const acquireConnection = Effect.suspend(() => {
      if (connection !== undefined) return Effect.succeed(connection)
      const conn: Connection = {
        ack: Deferred.makeUnsafe(),
        error: undefined,
        receivedFrame: true,
        fiber: undefined
      }
      connection = conn
      return Effect.forkIn(run(conn), scope).pipe(
        Effect.map((fiber) => {
          conn.fiber = fiber
          return conn
        })
      )
    })

    const register = Effect.suspend(() => {
      // A connection forked into a closed scope is interrupted before it
      // starts, so new operations fail instead of waiting for an ack.
      if (scope.state._tag === "Closed") {
        return Effect.fail(
          new TransportError({ description: "The graphql-ws transport's scope is closed", fatal: true })
        )
      }
      active++
      idleGeneration++
      return Effect.map(acquireConnection, (conn) => [String(++nextId), conn] as const)
    })

    const closeIfIdle = Effect.suspend(() => {
      if (--active > 0 || connection === undefined) return Effect.void
      const conn = connection
      if (Duration.isZero(idleTimeout)) return close(conn)
      const generation = ++idleGeneration
      const closeIfStillIdle = Effect.suspend(() =>
        generation === idleGeneration && connection === conn ? close(conn) : Effect.void
      )
      return Effect.asVoid(Effect.forkIn(Effect.delay(closeIfStillIdle, idleTimeout), scope))
    })

    const release = (id: string, conn: Connection) =>
      Effect.suspend(() =>
        Effect.andThen(
          // Only a subscribed operation the server has not completed is still in `operations`.
          operations.delete(id) && conn.error === undefined
            ? Effect.ignore(send({ id, type: "complete" }))
            : Effect.void,
          closeIfIdle
        )
      )

    const operation = (request: GraphQLRequest): Stream.Stream<{ readonly body: unknown }, TransportError> =>
      Stream.unwrap(Effect.gen(function*() {
        const [id, conn] = yield* Effect.acquireRelease(register, ([id, conn]) => release(id, conn))
        yield* Deferred.await(conn.ack)
        if (conn.error !== undefined) {
          return yield* Effect.fail(conn.error)
        }
        const queue = yield* Queue.unbounded<{ readonly body: unknown }, TransportError | Cause.Done>()
        operations.set(id, { queue, connection: conn })
        // Per-call `request.headers` and `request.urlParams` are ignored:
        // graphql-ws has no per-operation headers or URL.
        yield* send({ id, type: "subscribe", payload: requestBody(request) })
        return Stream.fromQueue(queue)
      }))

    const execute = (request: GraphQLRequest): Effect.Effect<{ readonly body: unknown }, TransportError> =>
      Effect.flatMap(Stream.runHead(operation(request)), (result) =>
        result._tag === "Some"
          ? Effect.succeed(result.value)
          : Effect.fail(new TransportError({ description: "The graphql-ws operation completed without a result" })))

    return GraphQLProtocol.of({ execute, subscribe: operation })
  })

/**
 * The graphql-ws transport: every operation goes over one WebSocket using the
 * `graphql-transport-ws` subprotocol, with the `Socket.WebSocketConstructor`
 * in context.
 *
 * **Details**
 *
 * The socket connects lazily and multiplexes operations by id. It closes after
 * `idleTimeout` (default 0) with no active operations, or with code `1000`
 * when the layer's scope closes.
 *
 * - Operations wait for `connection_ack`. `connectionAckTimeout` (default
 *   10 seconds) starts after sending `connection_init`.
 * - `connectionParams` runs on every connection, allowing token refresh.
 *   Failure or a socket close during evaluation is a `TransportError`.
 * - Handshake `headers` accept `Headers.Input` and are normalized before
 *   reaching the socket. They require a Node or Bun WebSocket constructor;
 *   browsers cannot set them. Per-operation `headers` and `urlParams` are ignored.
 * - Results carry no HTTP `status`.
 * - `keepAlive` (default 10 seconds, or `false` to disable) sends `ping`.
 *   No server frame in the following interval causes a retryable failure.
 *   Server `ping` receives `pong`.
 * - Lost connections fail every active operation with a `TransportError`
 *   carrying the close code. See `GraphQLClientError.isFatalCloseCode` for
 *   non-retryable codes. The transport never replays operations; the client
 *   retries subscriptions and the next operation reconnects.
 * - Once the layer's scope has closed, every new operation fails at once
 *   with a non-retryable `TransportError` marked `fatal`.
 * - Messages follow graphql-ws validation. Invalid messages close the socket
 *   with fatal code `4400`; valid messages for unknown ids are ignored.
 * - Server `error` messages become `ResponseError` values. Interrupting a
 *   subscription sends `complete`.
 *
 * **Example** (A client over graphql-ws)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 * import { GraphQLProtocol } from "effect/graphql"
 * import type { Socket } from "effect/socket"
 *
 * // Provide a Socket.WebSocketConstructor, such as
 * // Socket.layerWebSocketConstructorGlobal in a browser
 * export const Protocol: Layer.Layer<GraphQLProtocol.GraphQLProtocol, never, Socket.WebSocketConstructor> =
 *   GraphQLProtocol.layerWebSocket({
 *     url: "wss://example.com/graphql",
 *     connectionParams: Effect.succeed({ authorization: "Bearer secret" }),
 *     idleTimeout: "30 seconds"
 *   })
 * ```
 *
 * @stability experimental
 * @category layers
 * @since 4.0.0
 */
export const layerWebSocket = <R = never>(
  options: {
    readonly url: string
    readonly headers?: Headers.Input | undefined
    readonly connectionParams?: Effect.Effect<Record<string, unknown> | undefined, unknown, R> | undefined
    readonly connectionAckTimeout?: Duration.Input | undefined
    readonly keepAlive?: Duration.Input | false | undefined
    readonly idleTimeout?: Duration.Input | undefined
  }
): Layer.Layer<GraphQLProtocol, never, Socket.WebSocketConstructor | R> =>
  Layer.effect(GraphQLProtocol, makeWebSocket(options))
