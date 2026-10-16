/**
 * The `OpenAiClient` module defines the low-level Effect service used by the
 * OpenAI integration for Responses API and embedding requests. It builds a
 * configured HTTP client with authentication and OpenAI organization or project
 * headers, exposes helpers for non-streaming responses, SSE response streams,
 * WebSocket response streams, and embeddings, and maps transport or decoding
 * failures into `AiError`.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as AiError from "effect/ai/AiError"
import * as ResponseIdTracker from "effect/ai/ResponseIdTracker"
import * as Array from "effect/Array"
import * as Cause from "effect/Cause"
import type * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Sse from "effect/encoding/Sse"
import { identity } from "effect/Function"
import * as Function from "effect/Function"
import * as Headers from "effect/http/Headers"
import * as HttpBody from "effect/http/HttpBody"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Queue from "effect/Queue"
import * as RcRef from "effect/RcRef"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import * as Errors from "./internal/errors.ts"
import { OpenAiConfig } from "./OpenAiConfig.ts"
import * as OpenAiSchema from "./OpenAiSchema.ts"

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Effect service interface for the handwritten OpenAI client.
 *
 * **Details**
 *
 * Provides the configured HTTP client plus helpers for Responses API calls, streaming Responses events, and embeddings. Transport and schema decoding failures are mapped to `AiError`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface Service {
  /**
   * The transformed HTTP client used by this service.
   */
  readonly client: HttpClient.HttpClient

  /**
   * Create a response using the OpenAI responses endpoint.
   */
  readonly createResponse: (
    options: typeof OpenAiSchema.CreateResponse.Encoded
  ) => Effect.Effect<
    readonly [body: typeof OpenAiSchema.Response.Type, response: HttpClientResponse.HttpClientResponse],
    AiError.AiError
  >

  /**
   * Create a streaming response using the OpenAI responses endpoint.
   */
  readonly createResponseStream: (
    options: Omit<typeof OpenAiSchema.CreateResponse.Encoded, "stream">
  ) => Effect.Effect<
    readonly [
      response: HttpClientResponse.HttpClientResponse,
      stream: Stream.Stream<typeof OpenAiSchema.ResponseStreamEvent.Type, AiError.AiError>
    ],
    AiError.AiError
  >

  /**
   * Create embeddings using the OpenAI embeddings endpoint.
   */
  readonly createEmbedding: (
    options: typeof OpenAiSchema.CreateEmbeddingRequest.Encoded
  ) => Effect.Effect<typeof OpenAiSchema.CreateEmbeddingResponse.Type, AiError.AiError>
}

// =============================================================================
// Service Identifier
// =============================================================================

/**
 * Service tag for the OpenAI client.
 *
 * **When to use**
 *
 * Use when accessing or providing the OpenAI client service through Effect's
 * context.
 *
 * @see {@link make} for constructing an OpenAI client effectfully
 * @see {@link layer} for providing a client from explicit options
 * @see {@link layerConfig} for providing a client from `Config`
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class OpenAiClient extends Context.Service<OpenAiClient, Service>()(
  "@effect/ai-openai/OpenAiClient"
) {}

// =============================================================================
// Options
// =============================================================================

/**
 * Options for configuring the OpenAI client.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type Options = {
  /**
   * The OpenAI API key.
   */
  readonly apiKey?: Redacted.Redacted<string> | undefined

  /**
   * The base URL for the OpenAI API.
   *
   * @default "https://api.openai.com/v1"
   */
  readonly apiUrl?: string | undefined

  /**
   * Optional organization ID for multi-org accounts.
   */
  readonly organizationId?: Redacted.Redacted<string> | undefined

  /**
   * Optional project ID for project-scoped requests.
   */
  readonly projectId?: Redacted.Redacted<string> | undefined

  /**
   * Optional transformer for the HTTP client.
   */
  readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
}

// =============================================================================
// Constructor
// =============================================================================

const RedactedOpenAiHeaders = {
  OpenAiOrganization: "OpenAI-Organization",
  OpenAiProject: "OpenAI-Project"
}

const withRedactedHeaders = Effect.updateService(
  Headers.CurrentRedactedNames,
  Array.appendAll(Object.values(RedactedOpenAiHeaders))
)

/**
 * Creates an OpenAI client service with the given options.
 *
 * **When to use**
 *
 * Use when you need the OpenAI client service value inside an effect.
 *
 * **Details**
 *
 * The returned service uses the current `HttpClient`, prepends `apiUrl` or
 * `https://api.openai.com/v1`, adds the bearer token and optional OpenAI
 * organization/project headers, accepts JSON responses, filters for successful
 * HTTP statuses, and applies `transformClient` when provided.
 *
 * **Gotchas**
 *
 * A scoped `OpenAiConfig.withClientTransform` is applied when request helpers
 * run, after the `transformClient` option supplied to `make`.
 *
 * @see {@link layer} for providing this client from explicit options
 * @see {@link layerConfig} for loading client settings from `Config`
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(
  function*(
    options: Options
  ): Effect.fn.Return<Service, never, HttpClient.HttpClient> {
    const baseClient = yield* HttpClient.HttpClient
    const apiUrl = options.apiUrl ?? "https://api.openai.com/v1"

    const httpClient = baseClient.pipe(
      HttpClient.mapRequest(Function.flow(
        HttpClientRequest.prependUrl(apiUrl),
        options.apiKey
          ? HttpClientRequest.bearerToken(Redacted.value(options.apiKey))
          : identity,
        options.organizationId
          ? HttpClientRequest.setHeader(
            RedactedOpenAiHeaders.OpenAiOrganization,
            Redacted.value(options.organizationId)
          )
          : identity,
        options.projectId
          ? HttpClientRequest.setHeader(
            RedactedOpenAiHeaders.OpenAiProject,
            Redacted.value(options.projectId)
          )
          : identity,
        HttpClientRequest.acceptJson
      )),
      HttpClient.filterStatusOk,
      options.transformClient
        ? options.transformClient
        : identity
    )

    const resolveHttpClient = Effect.map(
      OpenAiConfig.getOrUndefined,
      (config) =>
        Predicate.isNotUndefined(config?.transformClient)
          ? config.transformClient(httpClient)
          : httpClient
    )

    const decodeResponse = HttpClientResponse.schemaBodyJson(OpenAiSchema.Response)

    const createResponse = (
      payload: typeof OpenAiSchema.CreateResponse.Encoded
    ): Effect.Effect<
      [body: typeof OpenAiSchema.Response.Type, response: HttpClientResponse.HttpClientResponse],
      AiError.AiError
    > =>
      resolveHttpClient.pipe(
        Effect.flatMap((client) =>
          client.execute(HttpClientRequest.post("/responses", {
            body: HttpBody.jsonUnsafe(payload)
          })).pipe(
            Effect.flatMap((response) =>
              decodeResponse(response).pipe(
                Effect.map((body): [typeof OpenAiSchema.Response.Type, HttpClientResponse.HttpClientResponse] => [
                  body,
                  response
                ])
              )
            ),
            Effect.catchTags({
              HttpClientError: (error) => Errors.mapHttpClientError(error, "createResponse"),
              SchemaError: (error) => Effect.fail(Errors.mapSchemaError(error, "createResponse"))
            })
          )
        ),
        withRedactedHeaders
      )

    const buildResponseStream = (
      response: HttpClientResponse.HttpClientResponse
    ): [
      HttpClientResponse.HttpClientResponse,
      Stream.Stream<typeof OpenAiSchema.ResponseStreamEvent.Type, AiError.AiError>
    ] => {
      const stream = response.stream.pipe(
        Stream.decodeText(),
        Stream.pipeThroughChannel(Sse.decodeDataSchema(OpenAiSchema.ResponseStreamEvent)),
        Stream.takeUntil((event) =>
          event.data.type === "response.completed" ||
          event.data.type === "response.incomplete" ||
          event.data.type === "response.failed"
        ),
        Stream.map((event) => event.data),
        Stream.catchTags({
          // TODO: handle SSE retries
          Retry: (error) => Stream.die(error),
          SseError: (error) => Stream.fail(Errors.mapSseError(error, "createResponseStream")),
          HttpClientError: (error) => Stream.fromEffect(Errors.mapHttpClientError(error, "createResponseStream")),
          SchemaError: (error) => Stream.fail(Errors.mapSchemaError(error, "createResponseStream"))
        })
      )
      return [response, stream]
    }

    const createResponseStream: Service["createResponseStream"] = (payload) =>
      Effect.contextWith((services) => {
        const socket = Context.getOrUndefined(services, OpenAiSocket)
        if (socket) return socket.createResponseStream(payload)
        return resolveHttpClient.pipe(
          Effect.flatMap((client) =>
            client.execute(HttpClientRequest.post("/responses", {
              body: HttpBody.jsonUnsafe({ ...payload, stream: true })
            })).pipe(
              Effect.map(buildResponseStream),
              Effect.catchTag(
                "HttpClientError",
                (error) => Errors.mapHttpClientError(error, "createResponseStream")
              )
            )
          ),
          withRedactedHeaders
        )
      })

    const decodeEmbedding = HttpClientResponse.schemaBodyJson(OpenAiSchema.CreateEmbeddingResponse)

    const createEmbedding = (
      payload: typeof OpenAiSchema.CreateEmbeddingRequest.Encoded
    ): Effect.Effect<typeof OpenAiSchema.CreateEmbeddingResponse.Type, AiError.AiError> =>
      resolveHttpClient.pipe(
        Effect.flatMap((client) =>
          client.execute(HttpClientRequest.post("/embeddings", {
            body: HttpBody.jsonUnsafe(payload)
          })).pipe(
            Effect.flatMap(decodeEmbedding),
            Effect.catchTags({
              HttpClientError: (error) => Errors.mapHttpClientError(error, "createEmbedding"),
              SchemaError: (error) => Effect.fail(Errors.mapSchemaError(error, "createEmbedding"))
            })
          )
        ),
        withRedactedHeaders
      )

    return OpenAiClient.of({
      client: httpClient,
      createResponse,
      createResponseStream,
      createEmbedding
    })
  },
  withRedactedHeaders
)

// =============================================================================
// Layers
// =============================================================================

/**
 * Creates a layer for the OpenAI client with the given options.
 *
 * **When to use**
 *
 * Use when you already have explicit `Options` values, such as an API key or
 * custom API URL, and want to provide `OpenAiClient` as a `Layer`.
 *
 * @see {@link make} for constructing the client service effectfully
 * @see {@link layerConfig} for loading client settings from `Config`
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options: Options): Layer.Layer<OpenAiClient, never, HttpClient.HttpClient> =>
  Layer.effect(OpenAiClient, make(options))

/**
 * Creates a layer for the OpenAI client from provided `Config` values.
 *
 * **When to use**
 *
 * Use when you need client settings for OpenAI-compatible APIs to be read from
 * Effect `Config` values while providing `OpenAiClient` as a `Layer`.
 *
 * **Details**
 *
 * Only config values supplied in `options` are loaded. Omitted fields are
 * passed to `make` as `undefined`, and `transformClient` is forwarded as a
 * plain option.
 *
 * @see {@link make} for constructing the client service effectfully
 * @see {@link layer} for providing the client from already-resolved options
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (options?: {
  /**
   * The config value to load for the API key.
   */
  readonly apiKey?: Config.Config<Redacted.Redacted<string> | undefined> | undefined

  /**
   * The config value to load for the API URL.
   */
  readonly apiUrl?: Config.Config<string> | undefined

  /**
   * The config value to load for the organization ID.
   */
  readonly organizationId?: Config.Config<Redacted.Redacted<string> | undefined> | undefined

  /**
   * The config value to load for the project ID.
   */
  readonly projectId?: Config.Config<Redacted.Redacted<string> | undefined> | undefined

  /**
   * Optional transformer for the HTTP client.
   */
  readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
}): Layer.Layer<OpenAiClient, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(
    OpenAiClient,
    Effect.gen(function*() {
      const apiKey = Predicate.isNotUndefined(options?.apiKey)
        ? yield* options.apiKey :
        undefined
      const apiUrl = Predicate.isNotUndefined(options?.apiUrl)
        ? yield* options.apiUrl :
        undefined
      const organizationId = Predicate.isNotUndefined(options?.organizationId)
        ? yield* options.organizationId
        : undefined
      const projectId = Predicate.isNotUndefined(options?.projectId)
        ? yield* options.projectId :
        undefined
      return yield* make({
        apiKey,
        apiUrl,
        organizationId,
        projectId,
        transformClient: options?.transformClient
      })
    })
  )

// =============================================================================
// Websocket mode
// =============================================================================

/**
 * Response stream event emitted by the OpenAI Responses API.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ResponseStreamEvent = typeof OpenAiSchema.ResponseStreamEvent.Type

/**
 * Service for creating OpenAI response streams over a WebSocket connection.
 *
 * **When to use**
 *
 * Use when you need direct access to the WebSocket-backed response streaming
 * service rather than wrapping an effect with WebSocket mode.
 *
 * **Details**
 *
 * `createResponseStream` sends a `response.create` message over the WebSocket
 * connection and returns an HTTP response together with a stream of
 * `ResponseStreamEvent` values.
 *
 * **Gotchas**
 *
 * WebSocket response streams are serialized to one request at a time by the
 * shared socket service.
 *
 * @see {@link withWebSocketMode} for enabling WebSocket mode for one effect
 * @see {@link layerWebSocketMode} for providing WebSocket mode through a layer
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class OpenAiSocket extends Context.Service<OpenAiSocket, {
  /**
   * Create a streaming response using the OpenAI responses endpoint.
   */
  readonly createResponseStream: (
    options: Omit<typeof OpenAiSchema.CreateResponse.Encoded, "stream">
  ) => Effect.Effect<
    readonly [
      response: HttpClientResponse.HttpClientResponse,
      stream: Stream.Stream<ResponseStreamEvent, AiError.AiError>
    ],
    AiError.AiError
  >
}>()("@effect/ai-openai/OpenAiClient/OpenAiSocket") {}

const makeSocket = Effect.gen(function*() {
  const client = yield* OpenAiClient
  const tracker = yield* ResponseIdTracker.make
  const socketScope = yield* Effect.scope
  const makeRequest = Effect.flatMap(
    OpenAiConfig.getOrUndefined,
    (config) => {
      const httpClient = Predicate.isNotUndefined(config?.transformClient)
        ? config.transformClient(client.client)
        : client.client
      return Effect.orDie(httpClient.preprocess(HttpClientRequest.post("/responses")))
    }
  )
  const makeWebSocket = yield* Socket.WebSocketConstructor

  const decoder = new TextDecoder()

  // The response currently in flight, or undefined between turns. Each turn
  // owns its queue; the reader ends or fails it, so a turn that is still
  // current when its consumer leaves was abandoned mid-response.
  type Turn = Queue.Queue<ResponseStreamEvent, AiError.AiError | Cause.Done>
  type SocketConnection = {
    readonly send: (message: typeof OpenAiSchema.CreateResponse.Encoded) => Effect.Effect<void, AiError.AiError>
    current: Turn | undefined
  }

  const queueRef: RcRef.RcRef<SocketConnection> = yield* RcRef.make({
    idleTimeToLive: 60_000,
    acquire: Effect.gen(function*() {
      const scope = yield* Effect.scope
      const request = yield* makeRequest
      const socket = yield* Socket.makeWebSocket(request.url.replace(/^http/, "ws")).pipe(
        Effect.provideService(Socket.WebSocketConstructor, (url) =>
          makeWebSocket(url, {
            headers: request.headers
          }))
      )
      const writer = yield* socket.writer

      yield* Scope.addFinalizerExit(scope, () => {
        tracker.clearUnsafe()
        return Effect.void
      })

      const connection: SocketConnection = {
        current: undefined,
        send: (message) =>
          writer.write(JSON.stringify({
            type: "response.create",
            ...message
          })).pipe(
            Effect.mapError((_error) =>
              AiError.make({
                module: "OpenAiClient",
                method: "createResponseStream",
                reason: new AiError.NetworkError({
                  reason: "TransportError",
                  request: {
                    method: "POST",
                    url: request.url,
                    urlParams: [],
                    hash: undefined,
                    headers: request.headers
                  },
                  description: "Failed to send message over WebSocket"
                })
              })
            )
          )
      }

      const handleMessage = (msg: Uint8Array | string): void => {
        const turn = connection.current
        if (turn === undefined) return
        let event: typeof AllEvents.Type
        try {
          event = decodeEvent(typeof msg === "string" ? msg : decoder.decode(msg))
        } catch {
          return
        }
        if (event.type === "error") {
          const status = "status" in event ? Number(event.status) : NaN
          const error = ("error" in event ? event.error : event) as {
            readonly type?: string
            readonly code?: string
            readonly message: string
          }
          const errorType = error.code ??
            (error.type === "api_error" && /^gRPC error: Response with id=\S+ not found$/.test(error.message)
              ? "previous_response_not_found"
              : error.type ?? "unknown")
          const json = JSON.stringify(error)
          // LanguageModel retries `previous_response_not_found` with the full
          // prompt on this socket. Other errors leave the turn current so its
          // finalizer invalidates the connection, preserving the existing policy.
          if (errorType === "previous_response_not_found") {
            connection.current = undefined
          }
          Queue.failCauseUnsafe(
            turn,
            Cause.fail(AiError.make({
              module: "OpenAiClient",
              method: "createResponseStream",
              reason: AiError.reasonFromHttpStatus({
                description: json,
                status: errorType === "previous_response_not_found"
                  ? 400
                  : isNaN(status)
                  ? Object.hasOwn(errorTypeToStatus, errorType)
                    ? errorTypeToStatus[errorType]
                    : 500
                  : status,
                metadata: error as any,
                http: {
                  body: json,
                  request: {
                    method: "POST",
                    url: request.url,
                    urlParams: [],
                    hash: undefined,
                    headers: request.headers
                  }
                }
              })
            }))
          )
          return
        }
        Queue.offerUnsafe(turn, event)
        if (
          event.type === "response.completed" || event.type === "response.incomplete" ||
          event.type === "response.failed"
        ) {
          connection.current = undefined
          Queue.endUnsafe(turn)
        }
      }

      yield* Effect.gen(function*() {
        const { pull } = yield* socket.reader
        while (true) {
          const messages = yield* pull
          for (let i = 0; i < messages.length; i++) {
            handleMessage(messages[i])
          }
        }
      }).pipe(
        Effect.scoped,
        Effect.catchTag("SocketError", (error) =>
          AiError.make({
            module: "OpenAiClient",
            method: "createResponseStream",
            reason: new AiError.NetworkError({
              reason: "TransportError",
              request: {
                method: "POST",
                url: request.url,
                urlParams: [],
                hash: undefined,
                headers: request.headers
              },
              description: error.message
            })
          })),
        Effect.catchCause((cause) =>
          connection.current === undefined ? Effect.void : Queue.failCause(connection.current, cause)
        ),
        Effect.ensuring(Effect.forkIn(RcRef.invalidate(queueRef), socketScope, {
          startImmediately: true
        })),
        Effect.forkScoped({ startImmediately: true })
      )

      return connection
    })
  })

  // Prime the websocket
  yield* Effect.scoped(RcRef.get(queueRef))

  // Websocket mode only allows one request at a time
  const semaphore = Semaphore.makeUnsafe(1)
  const request = yield* makeRequest

  return OpenAiSocket.context({
    createResponseStream(options) {
      const stream = Stream.unwrap(Effect.gen(function*() {
        const scope = yield* Effect.scope
        yield* Effect.acquireRelease(
          semaphore.take(1),
          () => semaphore.release(1),
          { interruptible: true }
        )
        const connection = yield* RcRef.get(queueRef)
        const turn: Turn = yield* Queue.unbounded<ResponseStreamEvent, AiError.AiError | Cause.Done>()
        connection.current = turn

        // Leaving while the response is still streaming makes the socket
        // unusable for the next turn.
        yield* Scope.addFinalizerExit(
          scope,
          () => connection.current === turn ? RcRef.invalidate(queueRef) : Effect.void
        )

        yield* connection.send(options).pipe(
          Effect.forkScoped({ startImmediately: true })
        )

        return Stream.fromQueue(turn)
      }))

      return Effect.succeed([
        HttpClientResponse.fromWeb(request, new Response()),
        stream
      ])
    }
  }).pipe(
    Context.add(ResponseIdTracker.ResponseIdTracker, tracker)
  )
})

const ErrorEvent = Schema.Struct({
  type: Schema.Literal("error").pipe(
    Schema.withDecodingDefault(Effect.succeed("error" as const))
  ),
  status: Schema.optionalKey(Schema.Int),
  // xAI sends `code` in place of `type`, e.g. `previous_response_not_found`
  error: Schema.Struct({
    type: Schema.optional(Schema.String),
    code: Schema.optional(Schema.String),
    message: Schema.String
  })
})

const errorTypeToStatus: Record<string, number> = {
  invalid_request_error: 400,
  invalid_api_key_error: 401,
  insufficient_quota_error: 429,
  rate_limit_error: 429,
  service_unavailable_error: 503
}

const AllEvents = Schema.Union([ErrorEvent, OpenAiSchema.ResponseStreamEvent])
const decodeEvent = Schema.decodeUnknownSync(Schema.fromJsonString(AllEvents))

/**
 * Uses OpenAI's WebSocket mode for response streams within the provided effect.
 *
 * **When to use**
 *
 * Use to enable WebSocket mode around one effect that creates OpenAI response
 * streams.
 *
 * **Gotchas**
 *
 * This only works with the following WebSocket constructor layers:
 *
 * - `NodeSocket.layerWebSocketConstructorWS`
 * - `BunSocket.layerWebSocketConstructor`
 *
 * These constructor layers support the non-standard options needed to set the
 * Authorization header.
 *
 * @see {@link layerWebSocketMode} for providing WebSocket mode through a layer
 * @see {@link OpenAiSocket} for direct access to the WebSocket-backed streaming service
 *
 * @stability unstable
 * @category providing services
 * @since 4.0.0
 */
export const withWebSocketMode = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<
  A,
  E,
  Exclude<R, OpenAiSocket | ResponseIdTracker.ResponseIdTracker> | OpenAiClient | Socket.WebSocketConstructor
> =>
  Effect.scopedWith((scope) =>
    Effect.flatMap(
      Scope.provide(makeSocket, scope),
      (services) => Effect.provideContext(effect, services)
    )
  )

/**
 * Uses OpenAI's websocket mode for all responses that use the Layer.
 *
 * **When to use**
 *
 * Use to provide WebSocket mode through layer composition for effects that use
 * OpenAI response streaming.
 *
 * **Gotchas**
 *
 * This only works with the following WebSocket constructor layers:
 *
 * - `NodeSocket.layerWebSocketConstructorWS`
 * - `BunSocket.layerWebSocketConstructor`
 *
 * These constructor layers support the non-standard options needed to set the
 * Authorization header.
 *
 * @see {@link withWebSocketMode} for enabling WebSocket mode around a single effect
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebSocketMode: Layer.Layer<
  OpenAiSocket | ResponseIdTracker.ResponseIdTracker,
  never,
  OpenAiClient | Socket.WebSocketConstructor
> = Layer.effectContext(makeSocket)
