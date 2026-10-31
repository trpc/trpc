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
import * as Zlib from "node:zlib"
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
  const httpClient = HttpClient.filterStatusOk(yield* HttpClient.HttpClient)

  const fetchFromFile = Effect.fn("fetchFromFile")(function*(
    path: string,
    provider: string
  ) {
    return yield* fs.readFile(path).pipe(
      Effect.mapError((cause) => new SpecFetchError({ provider, source: path, cause }))
    )
  })

  const fetchFromUrl = Effect.fn("fetchFromUrl")(function*(
    url: string,
    provider: string
  ) {
    return yield* httpClient.get(url).pipe(
      Effect.flatMap((response) => response.arrayBuffer),
      Effect.map((buffer) => new Uint8Array(buffer)),
      Effect.mapError((cause) => new SpecFetchError({ provider, source: url, cause }))
    )
  })

  const parseSpec = (content: Uint8Array, source: string, provider: string) =>
    Effect.try({
      try: () => {
        // Gzipped specs are parsed by the extension that precedes `.gz`
        const isGzip = source.endsWith(".gz")
        const path = isGzip ? source.slice(0, -".gz".length) : source
        const text = new TextDecoder().decode(isGzip ? Zlib.gunzipSync(content) : content)
        const isYaml = path.endsWith(".yaml") || path.endsWith(".yml")
        return isYaml ? Yaml.parse(text) : JSON.parse(text)
      },
      catch: (cause) => new SpecFetchError({ provider, source, cause })
    })

  const fetch = Effect.fn("fetch")(function*(
    source: SpecSource,
    provider: string
  ) {
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
