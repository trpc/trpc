/**
 * Deno HTTP client built on the fetch-based `HttpClient`.
 *
 * This module re-exports `effect/http/FetchHttpClient` and adds `makeClient`
 * and `layerOptions`, which route every request through a `Deno.HttpClient`
 * created from native `Deno.createHttpClient` options, such as a Unix domain
 * socket transport or custom TLS certificates.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"

/**
 * @category re-exports
 * @since 4.0.0
 */
export * from "effect/http/FetchHttpClient"

/**
 * Options accepted by `Deno.createHttpClient`, used by `makeClient` and
 * `layerOptions`.
 *
 * **Details**
 *
 * Supported fields include `caCerts` for additional root certificates,
 * `cert` and `key` for a client certificate in PEM format, `proxy` for an
 * alternative transport (`http`, `https`, `socks5`, `tcp`, `unix` or `vsock`),
 * `poolMaxIdlePerHost`, `poolIdleTimeout`, `http1`, `http2`, `allowHost` and
 * `localAddress`.
 *
 * Deno has no option to skip certificate verification or to override the
 * server name used for verification. Unix domain socket transports are not
 * supported on Windows.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export type Options = Parameters<typeof Deno.createHttpClient>[0]

/**
 * Creates a `Deno.HttpClient` from the supplied options and closes it when
 * the scope ends.
 *
 * **When to use**
 *
 * Use when you need the native client itself, for example to call `fetch`
 * directly with `{ client }` or to share one client between several layers,
 * with the same scoped cleanup `layerOptions` provides. Otherwise prefer
 * `layerOptions`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.6
 */
export const makeClient = (options?: Options): Effect.Effect<Deno.HttpClient, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => Deno.createHttpClient(options ?? {})),
    (client) => Effect.sync(() => client.close())
  )

interface ClientRequestInit extends globalThis.RequestInit {
  readonly client: Deno.HttpClient
}

/**
 * Layer that provides an `HttpClient` sending every request through a
 * `Deno.HttpClient` created with the supplied native options.
 *
 * **When to use**
 *
 * Use to send every request over a Unix domain socket with
 * `{ proxy: { transport: "unix", path } }`, or over TLS with a custom CA and
 * client certificate with `{ caCerts: [ca], cert, key }`.
 *
 * **Details**
 *
 * The native client is acquired in the layer's scope and closed when the
 * scope ends. Before each request it is set as the `client` field of the
 * `RequestInit` in effect for that request: the `RequestInit` service in the
 * request context, or otherwise the one provided while building this layer.
 * An application-wide `RequestInit` for `credentials`, `cache` or default
 * headers therefore still applies, and only `client` is overridden. Method,
 * headers, body and abort signal are set per request.
 *
 * **Example** (Sending requests over a Unix domain socket)
 *
 * ```ts
 * import { DenoHttpClient } from "@effect/platform-deno"
 *
 * const DockerClient = DenoHttpClient.layerOptions({
 *   proxy: { transport: "unix", path: "/var/run/docker.sock" }
 * })
 * ```
 *
 * **Example** (Mutual TLS with a private CA)
 *
 * ```ts
 * import { DenoHttpClient } from "@effect/platform-deno"
 *
 * declare const ca: string
 * declare const cert: string
 * declare const key: string
 *
 * const MtlsClient = DenoHttpClient.layerOptions({ caCerts: [ca], cert, key })
 * ```
 *
 * @see {@link Options} for the accepted fields and limitations
 * @see {@link makeClient} for acquiring the native client on its own
 *
 * @stability unstable
 * @category layers
 * @since 4.0.6
 */
export const layerOptions = (options?: Options): Layer.Layer<HttpClient.HttpClient> =>
  Layer.effect(HttpClient.HttpClient)(
    Effect.gen(function*() {
      const client = yield* makeClient(options)
      const httpClient = yield* HttpClient.HttpClient
      const defaults = Context.getOrUndefined(yield* Effect.context<never>(), FetchHttpClient.RequestInit)
      return HttpClient.transformResponse(
        httpClient,
        Effect.updateContext((context: Context.Context<never>) => {
          const init: ClientRequestInit = {
            ...(Context.getOrUndefined(context, FetchHttpClient.RequestInit) ?? defaults),
            client
          }
          return Context.add(context, FetchHttpClient.RequestInit, init)
        })
      )
    })
  ).pipe(Layer.provide(FetchHttpClient.layer))
