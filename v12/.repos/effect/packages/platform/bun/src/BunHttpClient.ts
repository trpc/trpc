/**
 * Bun HTTP client built on the fetch-based `HttpClient`.
 *
 * This module re-exports `effect/http/FetchHttpClient` and adds
 * `layerOptions`, which applies Bun's native fetch options, such as Unix
 * domain sockets and custom TLS settings, to every request.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as Layer from "effect/Layer"

/**
 * @category re-exports
 * @since 4.0.0
 */
export * from "effect/http/FetchHttpClient"

/**
 * Bun fetch options applied to every request sent by `layerOptions`.
 *
 * **Details**
 *
 * This is Bun's `BunFetchRequestInit` without the fields the client sets per
 * request: `method`, `body`, `signal` and `duplex`. `headers` are merged with
 * the request headers, with request headers taking precedence.
 *
 * Bun-specific fields include `unix` for a Unix domain socket path, `tls` for
 * `ca`, `cert`, `key`, `rejectUnauthorized` and `checkServerIdentity`, `proxy`,
 * `session` for a shared connection pool, `protocol`, `decompress`, `verbose`
 * and `s3`. Standard `RequestInit` fields such as `credentials` or `redirect`
 * are accepted too.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export type Options = Omit<BunFetchRequestInit, "method" | "body" | "signal" | "duplex">

/**
 * Layer that provides an `HttpClient` sending every request through Bun's
 * `fetch` with the supplied native options.
 *
 * **When to use**
 *
 * Use to send every request over a Unix domain socket with `{ unix: path }`,
 * or over TLS with a custom CA and client certificate with
 * `{ tls: { ca, cert, key } }`.
 *
 * **Details**
 *
 * Before each request the options are merged over the `RequestInit` in effect
 * for that request: the `RequestInit` service in the request context, or
 * otherwise the one provided while building this layer. An application-wide
 * `RequestInit` for `credentials`, `cache` or default headers therefore still
 * applies, and the native options win per top-level key. Method, body, abort
 * signal and duplex mode are set per request, and request headers override
 * the same keys in `headers`.
 *
 * **Example** (Sending requests over a Unix domain socket)
 *
 * ```ts
 * import { BunHttpClient } from "@effect/platform-bun"
 *
 * const DockerClient = BunHttpClient.layerOptions({ unix: "/var/run/docker.sock" })
 * ```
 *
 * **Example** (Mutual TLS with a private CA)
 *
 * ```ts
 * import { BunHttpClient } from "@effect/platform-bun"
 *
 * declare const ca: string
 * declare const cert: string
 * declare const key: string
 *
 * const MtlsClient = BunHttpClient.layerOptions({ tls: { ca, cert, key } })
 * ```
 *
 * @see {@link Options} for the accepted fields
 *
 * @stability unstable
 * @category layers
 * @since 4.0.6
 */
export const layerOptions = (options: Options): Layer.Layer<HttpClient.HttpClient> =>
  Layer.effect(HttpClient.HttpClient)(
    Effect.gen(function*() {
      const client = yield* HttpClient.HttpClient
      const defaults = Context.getOrUndefined(yield* Effect.context<never>(), FetchHttpClient.RequestInit)
      return HttpClient.transformResponse(
        client,
        Effect.updateContext((context: Context.Context<never>) =>
          Context.add(context, FetchHttpClient.RequestInit, {
            ...(Context.getOrUndefined(context, FetchHttpClient.RequestInit) ?? defaults),
            ...options
          })
        )
      )
    })
  ).pipe(Layer.provide(FetchHttpClient.layer))
