/**
 * Service for fetching OpenAPI specifications from URLs or the filesystem.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as HttpClient from "effect/http/HttpClient"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Yaml from "yaml"
import type { SpecSource } from "./Config.ts"

/**
 * Error when fetching a spec fails.
 *
 * **Example** (Creating a spec fetch error)
 *
 * ```ts import.meta.vitest
 * import * as SpecFetcher from "@effect/ai-codegen/SpecFetcher"
 *
 * const error = new SpecFetcher.SpecFetchError({
 *   provider: "openai",
 *   source: "https://example.com/openapi.json",
 *   cause: new Error("Network error")
 * })
 *
 * error._tag // => "SpecFetchError"
 * error.provider // => "openai"
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export class SpecFetchError extends Data.TaggedError("SpecFetchError")<{
  readonly provider: string
  readonly source: string
  readonly cause: unknown
}> {}

/**
 * Service for fetching OpenAPI specifications.
 *
 * @category services
 * @since 4.0.0
 */
export interface SpecFetcher {
  readonly fetch: (
    source: SpecSource,
    provider: string
  ) => Effect.Effect<unknown, SpecFetchError>
}

/**
 * Service tag for fetching OpenAPI specifications from configured sources.
 *
 * @category services
 * @since 4.0.0
 */
export const SpecFetcher: Context.Service<SpecFetcher, SpecFetcher> = Context.Service(
  "@effect/ai-codegen/SpecFetcher"
)

/**
 * Layer providing the SpecFetcher service.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  SpecFetcher,
  never,
  FileSystem.FileSystem | HttpClient.HttpClient
> = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const httpClient = yield* HttpClient.HttpClient

  const fetchFromFile = Effect.fn("fetchFromFile")(function*(
    path: string,
    provider: string
  ) {
    return yield* fs.readFileString(path).pipe(
      Effect.mapError((cause) => new SpecFetchError({ provider, source: path, cause }))
    )
  })

  const fetchFromUrl = Effect.fn("fetchFromUrl")(function*(
    url: string,
    provider: string
  ) {
    return yield* httpClient.get(url).pipe(
      Effect.flatMap((response) => response.text),
      Effect.mapError((cause) => new SpecFetchError({ provider, source: url, cause }))
    )
  })

  const parseSpec = (content: string, sourceUrl: string, provider: string) => {
    const isYaml = sourceUrl.endsWith(".yaml") || sourceUrl.endsWith(".yml")
    return Effect.try({
      try: () => isYaml ? Yaml.parse(content) : JSON.parse(content),
      catch: (cause) => new SpecFetchError({ provider, source: sourceUrl, cause })
    })
  }

  const fetchViaStainlessStats = Effect.fn("fetchViaStainlessStats")(function*(
    statsUrl: string,
    provider: string
  ) {
    // Fetch stats.yml
    const statsContent = yield* httpClient.get(statsUrl).pipe(
      Effect.flatMap((response) => response.text),
      Effect.mapError((cause) => new SpecFetchError({ provider, source: `stats:${statsUrl}`, cause }))
    )

    // Parse YAML and extract openapi_spec_url
    const stats = yield* Effect.try({
      try: () => Yaml.parse(statsContent),
      catch: (cause) => new SpecFetchError({ provider, source: `stats:${statsUrl}`, cause })
    })

    const specUrl = stats?.openapi_spec_url
    if (typeof specUrl !== "string") {
      return yield* new SpecFetchError({
        provider,
        source: `stats:${statsUrl}`,
        cause: new Error("Missing or invalid openapi_spec_url in stats file")
      })
    }

    // Fetch and parse the actual spec
    const content = yield* fetchFromUrl(specUrl, provider)
    return yield* parseSpec(content, specUrl, provider)
  })

  const fetch = Effect.fn("fetch")(function*(
    source: SpecSource,
    provider: string
  ) {
    // StainlessStats handles its own parsing since the URL is resolved dynamically
    if (source._tag === "StainlessStats") {
      return yield* fetchViaStainlessStats(source.statsUrl, provider)
    }

    const content = yield* Match.value(source).pipe(
      Match.tag("File", ({ path }) => fetchFromFile(path, provider)),
      Match.tag("Url", ({ url }) => fetchFromUrl(url, provider)),
      Match.exhaustive
    )

    const sourceString = source._tag === "Url" ? source.url : source.path
    return yield* parseSpec(content, sourceString, provider)
  })

  return { fetch }
}).pipe(Layer.effect(SpecFetcher))
