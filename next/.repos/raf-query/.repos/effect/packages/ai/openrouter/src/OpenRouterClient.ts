/**
 * HTTP client for OpenRouter's chat completions and alpha Decisions APIs,
 * with authentication, site ranking headers, typed errors, and chat streaming.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as AiError from "effect/ai/AiError"
import type * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Sse from "effect/encoding/Sse"
import { identity } from "effect/Function"
import * as HttpBody from "effect/http/HttpBody"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import type * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Generated from "./Generated.ts"
import * as Errors from "./internal/errors.ts"
import { OpenRouterConfig } from "./OpenRouterConfig.ts"
import * as OpenRouterSchema from "./OpenRouterSchema.ts"

// =============================================================================
// Service Interface
// =============================================================================

/**
 * The OpenRouter client service interface.
 *
 * **Details**
 *
 * Provides methods for interacting with OpenRouter's Chat Completions API,
 * including both synchronous and streaming message creation.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface Service {
  readonly client: Generated.OpenRouterClient

  readonly createDecisions: (
    options: typeof OpenRouterSchema.DecisionsRequest.Encoded
  ) => Effect.Effect<
    [body: typeof OpenRouterSchema.DecisionsResponse.Type, response: HttpClientResponse.HttpClientResponse],
    AiError.AiError
  >

  readonly createChatCompletion: (
    options: typeof Generated.ChatRequest.Encoded
  ) => Effect.Effect<
    [body: typeof Generated.SendChatCompletionRequest200.Type, response: HttpClientResponse.HttpClientResponse],
    AiError.AiError
  >

  readonly createChatCompletionStream: (
    options: Omit<typeof Generated.ChatRequest.Encoded, "stream" | "stream_options">
  ) => Effect.Effect<
    [
      response: HttpClientResponse.HttpClientResponse,
      stream: Stream.Stream<ChatStreamingResponseChunkData, AiError.AiError>
    ],
    AiError.AiError
  >
}

/**
 * Decoded `data` payload from an OpenRouter chat completion streaming chunk.
 *
 * **Details**
 *
 * The payload contains streamed choices, model metadata, optional usage, and may
 * include an OpenRouter error object for a streamed response.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ChatStreamingResponseChunkData = typeof Generated.ChatStreamingResponse.fields.data.Type

// =============================================================================
// Service Identifier
// =============================================================================

/**
 * Service tag for the OpenRouter client.
 *
 * **When to use**
 *
 * Use when accessing or providing the OpenRouter client service through
 * Effect's context.
 *
 * @see {@link make} for constructing an OpenRouter client effectfully
 * @see {@link layer} for providing a client from explicit options
 * @see {@link layerConfig} for providing a client from `Config`
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class OpenRouterClient extends Context.Service<
  OpenRouterClient,
  Service
>()("@effect/ai-openrouter/OpenRouterClient") {}

// =============================================================================
// Options
// =============================================================================

/**
 * Configuration for creating an OpenRouter client.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type Options = {
  readonly apiKey?: Redacted.Redacted<string> | undefined

  /**
   * Base URL for the versioned API. Decisions replace a trailing "/v1" with
   * "/alpha/decisions"; otherwise they append "/alpha/decisions" to this URL.
   */
  readonly apiUrl?: string | undefined

  /**
   * Optional URL of your site for rankings on `openrouter.ai`.
   */
  readonly siteReferrer?: string | undefined

  /**
   * Optional title of your site for rankings on `openrouter.ai`.
   */
  readonly siteTitle?: string | undefined

  /**
   * Optional transformer for the underlying HTTP client.
   *
   * **When to use**
   *
   * Use to add middleware, logging, or custom request/response handling.
   */
  readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
}

// =============================================================================
// Constructor
// =============================================================================

/**
 * Creates an OpenRouter client service from explicit options.
 *
 * **Details**
 *
 * The returned service uses the current `HttpClient`, prepends `apiUrl` or
 * `https://openrouter.ai/api/v1`, adds the bearer token and optional
 * `HTTP-Referer` and `X-Title` headers, accepts JSON responses, and applies
 * `transformClient` when provided.
 *
 * Scoped `OpenRouterConfig.withClientTransform` applies to generated client
 * methods and alpha Decisions requests, but not streaming chat completions.
 *
 * @see {@link layer} for providing this client from explicit options
 * @see {@link layerConfig} for loading client settings from `Config`
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(
  function*(options: Options): Effect.fn.Return<Service, never, HttpClient.HttpClient> {
    const baseClient = yield* HttpClient.HttpClient

    const makeHttpClient = (baseUrl: string) =>
      baseClient.pipe(
        HttpClient.mapRequest((request) =>
          request.pipe(
            HttpClientRequest.prependUrl(baseUrl),
            options.apiKey ? HttpClientRequest.bearerToken(options.apiKey) : identity,
            options.siteReferrer ? HttpClientRequest.setHeader("HTTP-Referer", options.siteReferrer) : identity,
            options.siteTitle ? HttpClientRequest.setHeader("X-Title", options.siteTitle) : identity,
            HttpClientRequest.acceptJson
          )
        ),
        options.transformClient ?? identity
      )

    const httpClient = makeHttpClient(options.apiUrl ?? "https://openrouter.ai/api/v1")
    const httpClientOk = HttpClient.filterStatusOk(httpClient)

    // Remove the version suffix for alpha requests, preserving proxy prefixes.
    const decisionsClient = makeHttpClient(
      (options.apiUrl ?? "https://openrouter.ai/api/v1").replace(/\/v1\/?$/, "")
    )
    const createDecisions: Service["createDecisions"] = Effect.fnUntraced(
      function*(payload) {
        const config = yield* OpenRouterConfig.getOrUndefined
        const client = HttpClient.filterStatusOk(
          config?.transformClient ? config.transformClient(decisionsClient) : decisionsClient
        )
        const request = yield* HttpClientRequest.bodyJson(HttpClientRequest.post("/alpha/decisions"), payload).pipe(
          Effect.mapError((error) =>
            AiError.make({
              module: "OpenRouterClient",
              method: "createDecisions",
              reason: new AiError.InvalidRequestError({ description: String(error) })
            })
          )
        )
        const response = yield* client.execute(request)
        const body = yield* HttpClientResponse.schemaBodyJson(OpenRouterSchema.DecisionsResponse)(response)
        return [body, response] as [
          typeof OpenRouterSchema.DecisionsResponse.Type,
          HttpClientResponse.HttpClientResponse
        ]
      },
      Effect.catchTags({
        HttpClientError: (error) => Errors.mapHttpClientError(error, "createDecisions"),
        SchemaError: (error) => Effect.fail(Errors.mapSchemaError(error, "createDecisions"))
      })
    )

    const client = Generated.make(httpClient, {
      transformClient: Effect.fnUntraced(function*(client) {
        const config = yield* OpenRouterConfig.getOrUndefined
        if (Predicate.isNotUndefined(config?.transformClient)) {
          return config.transformClient(client)
        }
        return client
      })
    })

    const createChatCompletion: Service["createChatCompletion"] = (payload) =>
      client.sendChatCompletionRequest({ payload, config: { includeResponse: true } }).pipe(
        Effect.catchTags({
          SendChatCompletionRequest400: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest401: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest402: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest403: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest404: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest408: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest413: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest422: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest429: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest500: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest502: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest503: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest524: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          SendChatCompletionRequest529: (error) => Effect.fail(Errors.mapClientError(error, "createChatCompletion")),
          HttpClientError: (error) => Errors.mapHttpClientError(error, "createChatCompletion"),
          SchemaError: (error) => Effect.fail(Errors.mapSchemaError(error, "createChatCompletion"))
        })
      )

    const buildChatCompletionStream = (
      response: HttpClientResponse.HttpClientResponse
    ): [
      HttpClientResponse.HttpClientResponse,
      Stream.Stream<ChatStreamingResponseChunkData, AiError.AiError>
    ] => {
      const stream = response.stream.pipe(
        Stream.decodeText(),
        Stream.pipeThroughChannel(Sse.decode()),
        Stream.mapEffect((event) => decodeChatCompletionSseData(event.data)),
        Stream.takeWhile((data) => data !== "[DONE]"),
        Stream.catchTags({
          // TODO: handle SSE retries
          Retry: (error) => Stream.die(error),
          SseError: (error) => Stream.fail(Errors.mapSseError(error, "createChatCompletionStream")),
          HttpClientError: (error) => Stream.fromEffect(Errors.mapHttpClientError(error, "createChatCompletionStream")),
          SchemaError: (error) => Stream.fail(Errors.mapSchemaError(error, "createChatCompletionStream"))
        })
      ) as any
      return [response, stream]
    }

    const createChatCompletionStream: Service["createChatCompletionStream"] = (payload) =>
      httpClientOk.execute(
        HttpClientRequest.post("/chat/completions", {
          body: HttpBody.jsonUnsafe({
            ...payload,
            stream: true,
            stream_options: { include_usage: true }
          })
        })
      ).pipe(
        Effect.map(buildChatCompletionStream),
        Effect.catchTag(
          "HttpClientError",
          (error) => Errors.mapHttpClientError(error, "createChatCompletionStream")
        )
      )

    return OpenRouterClient.of({
      client,
      createDecisions,
      createChatCompletion,
      createChatCompletionStream
    })
  }
)

// =============================================================================
// Layers
// =============================================================================

/**
 * Creates a layer for the OpenRouter client with the given options.
 *
 * **When to use**
 *
 * Use when you already have the OpenRouter client options in code and want to
 * provide `OpenRouterClient` as a layer.
 *
 * @see {@link make} for constructing the client service effectfully
 * @see {@link layerConfig} for loading client settings from `Config`
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options: Options): Layer.Layer<OpenRouterClient, never, HttpClient.HttpClient> =>
  Layer.effect(OpenRouterClient, make(options))

/**
 * Creates a layer for the OpenRouter client from provided `Config` values.
 *
 * **When to use**
 *
 * Use when you need client settings for OpenRouter to be read from Effect
 * `Config` values while providing `OpenRouterClient` as a layer.
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
   * The config value to load for the site referrer URL.
   */
  readonly siteReferrer?: Config.Config<string> | undefined

  /**
   * The config value to load for the site title.
   */
  readonly siteTitle?: Config.Config<string> | undefined

  /**
   * Optional transformer for the HTTP client.
   */
  readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
}): Layer.Layer<OpenRouterClient, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(
    OpenRouterClient,
    Effect.gen(function*() {
      const apiKey = Predicate.isNotUndefined(options?.apiKey)
        ? yield* options.apiKey
        : undefined
      const apiUrl = Predicate.isNotUndefined(options?.apiUrl)
        ? yield* options.apiUrl
        : undefined
      const siteReferrer = Predicate.isNotUndefined(options?.siteReferrer)
        ? yield* options.siteReferrer
        : undefined
      const siteTitle = Predicate.isNotUndefined(options?.siteTitle)
        ? yield* options.siteTitle
        : undefined
      return yield* make({
        apiKey,
        apiUrl,
        siteReferrer,
        siteTitle,
        transformClient: options?.transformClient
      })
    })
  )

// =============================================================================
// Internal Utilities
// =============================================================================

const ChatStreamingResponseChunkDataFromString = Schema.fromJsonString(Generated.ChatStreamingResponse.fields.data)
const decodeChatStreamingResponseChunkData = Schema.decodeUnknownEffect(ChatStreamingResponseChunkDataFromString)

const decodeChatCompletionSseData = (
  data: string
): Effect.Effect<ChatStreamingResponseChunkData | "[DONE]", Schema.SchemaError> =>
  data === "[DONE]"
    ? Effect.succeed(data)
    : decodeChatStreamingResponseChunkData(data)
