/**
 * @stability unstable
 * @since 4.0.0
 */
import * as Array from "effect/Array"
import type * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { identity } from "effect/Function"
import * as Function from "effect/Function"
import * as Headers from "effect/http/Headers"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Redacted from "effect/Redacted"
import * as Generated from "./Generated.ts"
import { OpenAiConfig } from "./OpenAiConfig.ts"

// =============================================================================
// Service Identifier
// =============================================================================

/**
 * Service identifier for the generated OpenAI client.
 *
 * @since 4.0.0
 * @stability unstable
 * @category service
 */
export class OpenAiClientGenerated extends Context.Service<OpenAiClientGenerated, Generated.OpenAiClient>()(
  "@effect/ai-openai/OpenAiClientGenerated"
) {}

// =============================================================================
// Options
// =============================================================================

/**
 * Options for configuring the generated OpenAI client.
 *
 * @since 4.0.0
 * @stability unstable
 * @category options
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

const RedactedOpenAiHeaders = {
  OpenAiOrganization: "OpenAI-Organization",
  OpenAiProject: "OpenAI-Project"
}

const withRedactedHeaders = Effect.updateService(
  Headers.CurrentRedactedNames,
  Array.appendAll(Object.values(RedactedOpenAiHeaders))
)

// =============================================================================
// Constructor
// =============================================================================

/**
 * Creates a generated OpenAI client service with the given options.
 *
 * @since 4.0.0
 * @stability unstable
 * @category constructors
 */
export const make = Effect.fnUntraced(
  function*(options: Options): Effect.fn.Return<Generated.OpenAiClient, never, HttpClient.HttpClient> {
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
      options.transformClient
        ? options.transformClient
        : identity
    )

    return Generated.make(httpClient, {
      transformClient: Effect.fnUntraced(function*(client) {
        const config = yield* OpenAiConfig.getOrUndefined
        if (Predicate.isNotUndefined(config?.transformClient)) {
          return config.transformClient(client)
        }
        return client
      })
    })
  },
  withRedactedHeaders
)

// =============================================================================
// Layers
// =============================================================================

/**
 * Creates a layer for the generated OpenAI client with the given options.
 *
 * @since 4.0.0
 * @stability unstable
 * @category layers
 */
export const layer = (options: Options): Layer.Layer<OpenAiClientGenerated, never, HttpClient.HttpClient> =>
  Layer.effect(OpenAiClientGenerated, make(options))

/**
 * Creates a layer for the generated OpenAI client, loading the requisite
 * configuration via Effect's `Config` module.
 *
 * @since 4.0.0
 * @stability unstable
 * @category layers
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
}): Layer.Layer<OpenAiClientGenerated, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(
    OpenAiClientGenerated,
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
