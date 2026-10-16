/**
 * HTTP client for Cloudflare Clef decisions through Workers AI REST.
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
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as CloudflareSchema from "./CloudflareSchema.ts"
import * as Errors from "./internal/errors.ts"

/**
 * Low-level Cloudflare decision operations.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface Service {
  readonly client: HttpClient.HttpClient
  readonly createDecisions: (
    request: typeof CloudflareSchema.DecisionsRequest.Encoded
  ) => Effect.Effect<typeof CloudflareSchema.DecisionsResponse.Type, AiError.AiError>
}

/**
 * Cloudflare Workers AI client service.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class CloudflareClient
  extends Context.Service<CloudflareClient, Service>()("@effect/ai-cloudflare/CloudflareClient")
{}

/**
 * Account, authentication, API base URL, and HTTP customization options.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface Options {
  readonly accountId: string
  readonly apiKey: Redacted.Redacted<string>
  readonly apiUrl?: string | undefined
  readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
}

const decodeResponse = HttpClientResponse.schemaBodyJson(Schema.Union([
  Schema.Struct({ success: Schema.Literal(true), result: CloudflareSchema.DecisionsResponse }),
  Schema.Struct({ success: Schema.Literal(false) })
]))

/**
 * Builds a Cloudflare client without automatic retries.
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
        HttpClientRequest.prependUrl(options.apiUrl ?? "https://api.cloudflare.com/client/v4"),
        HttpClientRequest.bearerToken(Redacted.value(options.apiKey)),
        HttpClientRequest.acceptJson
      )),
      HttpClient.filterStatusOk,
      options.transformClient ?? identity
    )
    const path = `/accounts/${encodeURIComponent(options.accountId)}/ai/run/@cf/cloudflare/`
    return CloudflareClient.of({
      client,
      createDecisions: (payload) =>
        HttpClientRequest.bodyJson(HttpClientRequest.post(path + payload.model), payload).pipe(
          Effect.mapError((error) =>
            AiError.make({
              module: "CloudflareClient",
              method: "createDecisions",
              reason: new AiError.InvalidRequestError({ description: String(error) })
            })
          ),
          Effect.flatMap(client.execute),
          Effect.flatMap((response) =>
            decodeResponse(response).pipe(
              Effect.flatMap((body) => body.success ? Effect.succeed(body.result) : Errors.mapResponseError(response))
            )
          ),
          Effect.catchTags({
            HttpClientError: Errors.mapHttpClientError,
            SchemaError: (error) =>
              Effect.fail(AiError.make({
                module: "CloudflareClient",
                method: "createDecisions",
                reason: AiError.InvalidOutputError.fromSchemaError(error)
              }))
          })
        )
    })
  }
)

/**
 * Provides a Cloudflare client from explicit options.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options: Options): Layer.Layer<CloudflareClient, never, HttpClient.HttpClient> =>
  Layer.effect(CloudflareClient, make(options))

/**
 * Provides a client from configuration, defaulting to CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (options?: {
  readonly accountId?: Config.Config<string> | undefined
  readonly apiKey?: Config.Config<Redacted.Redacted<string>> | undefined
  readonly apiUrl?: Config.Config<string> | undefined
  readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
}): Layer.Layer<CloudflareClient, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(
    CloudflareClient,
    Effect.gen(function*() {
      return yield* make({
        accountId: yield* (options?.accountId ?? Config.String("CLOUDFLARE_ACCOUNT_ID")),
        apiKey: yield* (options?.apiKey ?? Config.Redacted("CLOUDFLARE_API_TOKEN")),
        apiUrl: options?.apiUrl ? yield* options.apiUrl : undefined,
        transformClient: options?.transformClient
      })
    })
  )
