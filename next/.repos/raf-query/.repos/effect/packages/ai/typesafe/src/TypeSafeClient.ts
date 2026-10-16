/**
 * HTTP client for TypeSafe System One and model discovery.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as AiError from "effect/ai/AiError"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { flow, identity } from "effect/Function"
import * as HttpClient from "effect/http/HttpClient"
import type * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import type * as Schema from "effect/Schema"
import * as Errors from "./internal/errors.ts"
import { TypeSafeConfig } from "./TypeSafeConfig.ts"
import * as TypeSafeSchema from "./TypeSafeSchema.ts"

/**
 * Low-level TypeSafe operations.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface Service {
  readonly client: HttpClient.HttpClient
  readonly systemOne: (
    request: typeof TypeSafeSchema.SystemOneRequest.Encoded
  ) => Effect.Effect<typeof TypeSafeSchema.SystemOneResponse.Type, AiError.AiError>
  readonly listModels: () => Effect.Effect<typeof TypeSafeSchema.ListModelsResponse.Type, AiError.AiError>
}

/**
 * TypeSafe client service.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class TypeSafeClient extends Context.Service<TypeSafeClient, Service>()("@effect/ai-typesafe/TypeSafeClient") {}

/**
 * Authentication, endpoint and HTTP customization options.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface Options {
  readonly apiKey?: Redacted.Redacted<string> | undefined
  readonly apiUrl?: string | undefined
  readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
}

const decodeSystemOne = HttpClientResponse.schemaBodyJson(TypeSafeSchema.SystemOneResponse)
const decodeListModels = HttpClientResponse.schemaBodyJson(TypeSafeSchema.ListModelsResponse)

/**
 * Builds a client without automatic retries. Scoped transforms run after the constructor transform.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(
  function*(options: Options): Effect.fn.Return<Service, never, HttpClient.HttpClient> {
    const base = yield* HttpClient.HttpClient
    const client = base.pipe(
      HttpClient.mapRequest(flow(
        HttpClientRequest.prependUrl(options.apiUrl ?? "https://api.typesafe.ai/v1"),
        options.apiKey ? HttpClientRequest.bearerToken(Redacted.value(options.apiKey)) : identity,
        HttpClientRequest.acceptJson
      )),
      HttpClient.filterStatusOk,
      options.transformClient ?? identity
    )
    const resolveClient = Effect.map(
      TypeSafeConfig.getOrUndefined,
      (config) => config?.transformClient?.(client) ?? client
    )
    const execute = <A>(
      request: HttpClientRequest.HttpClientRequest,
      decode: (
        response: HttpClientResponse.HttpClientResponse
      ) => Effect.Effect<A, HttpClientError.HttpClientError | Schema.SchemaError>,
      method: string
    ) =>
      resolveClient.pipe(
        Effect.flatMap((client) => client.execute(request)),
        Effect.flatMap(decode),
        Effect.catchTags({
          HttpClientError: (error) => Errors.mapHttpClientError(error, method),
          SchemaError: (error) => Effect.fail(Errors.mapSchemaError(error, method))
        })
      )
    return TypeSafeClient.of({
      client,
      systemOne: (payload) =>
        HttpClientRequest.bodyJson(HttpClientRequest.post("/systemone"), payload).pipe(
          Effect.mapError((error) =>
            AiError.make({
              module: "TypeSafeClient",
              method: "systemOne",
              reason: new AiError.InvalidRequestError({ description: String(error) })
            })
          ),
          Effect.flatMap((request) => execute(request, decodeSystemOne, "systemOne"))
        ),
      listModels: () => execute(HttpClientRequest.get("/models"), decodeListModels, "listModels")
    })
  }
)

/**
 * Provides a client from explicit options.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options: Options): Layer.Layer<TypeSafeClient, never, HttpClient.HttpClient> =>
  Layer.effect(TypeSafeClient, make(options))

/**
 * Provides a client from configuration, defaulting to TYPESAFE_API_KEY.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (options?: {
  readonly apiKey?: Config.Config<Redacted.Redacted<string> | undefined> | undefined
  readonly apiUrl?: Config.Config<string> | undefined
  readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
}): Layer.Layer<TypeSafeClient, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(
    TypeSafeClient,
    Effect.gen(function*() {
      return yield* make({
        apiKey: yield* (options?.apiKey ?? Config.Redacted("TYPESAFE_API_KEY")),
        apiUrl: options?.apiUrl ? yield* options.apiUrl : undefined,
        transformClient: options?.transformClient
      })
    })
  )
