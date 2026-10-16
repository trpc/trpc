/**
 * Fetch-based implementation of the Effect HTTP client service.
 *
 * This module provides an `HttpClient` layer that executes requests through a
 * Web Fetch API implementation. It is the transport to use in browsers, edge
 * runtimes, and Node.js environments where `globalThis.fetch` is available, or
 * anywhere a compatible fetch function can be supplied.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type * as Layer from "../Layer.ts"
import * as Stream from "../Stream.ts"
import * as Headers from "./Headers.ts"
import * as HttpClient from "./HttpClient.ts"
import * as HttpClientError from "./HttpClientError.ts"
import * as HttpClientResponse from "./HttpClientResponse.ts"

/**
 * Context reference for the `fetch` implementation used by the fetch-based HTTP client.
 *
 * **Details**
 *
 * Defaults to `globalThis.fetch`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Fetch = Context.Reference<typeof globalThis.fetch>("effect/http/FetchHttpClient/Fetch", {
  defaultValue: () => globalThis.fetch
})

/**
 * Service that contains default fetch options for the fetch-based HTTP client.
 *
 * **When to use**
 *
 * Use to provide default credentials, cache, redirect, integrity, or other
 * fetch options for outgoing HTTP requests.
 *
 * **Details**
 *
 * Request-specific method, headers, body, and abort signal are supplied by the client when a request is executed.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class RequestInit extends Context.Service<RequestInit, globalThis.RequestInit>()(
  "effect/http/FetchHttpClient/RequestInit"
) {}

const fetch: HttpClient.HttpClient = HttpClient.make((request, url, signal, fiber) => {
  const fetch = fiber.getRef(Fetch)
  const options: globalThis.RequestInit = Context.getOrUndefined(fiber.context, RequestInit) ?? {}
  let headers = options.headers
    ? Headers.merge(Headers.fromInput(options.headers as Headers.Input), request.headers)
    : request.headers
  if (headers["content-length"]) {
    headers = Headers.remove(headers, "content-length")
  }
  const send = (body: BodyInit | undefined) =>
    Effect.map(
      Effect.tryPromise({
        try: () =>
          fetch(url, {
            ...options,
            method: request.method,
            headers,
            body,
            duplex: typeof ReadableStream !== "undefined" && body instanceof ReadableStream ? "half" : undefined,
            signal
          } as any),
        catch: (cause) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              request,
              cause
            })
          })
      }),
      (response) => HttpClientResponse.fromWeb(request, response)
    )
  switch (request.body._tag) {
    case "Raw":
    case "Uint8Array":
      return send(request.body.body as any)
    case "FormData":
      return send(request.body.formData)
    case "Stream":
      return Effect.flatMap(Stream.toReadableStreamEffect(request.body.stream), send)
  }
  return send(undefined)
})

/**
 * Layer that provides an `HttpClient` implementation backed by the configured
 * `Fetch` function.
 *
 * **When to use**
 *
 * Use when an Effect program should execute `HttpClient` requests through the
 * platform `fetch` implementation, especially in browser, edge, or Node.js
 * runtimes with `globalThis.fetch`.
 *
 * **Details**
 *
 * The layer uses the current `Fetch` reference and optional `RequestInit`
 * service for each request. Request-specific method, headers, body, and abort
 * signal are supplied by the client and override matching `RequestInit` fields.
 *
 * **Gotchas**
 *
 * Fetch behavior comes from the runtime's implementation, so CORS, cookies,
 * redirects, abort handling, and streaming support can vary by platform. Stream
 * request bodies are sent as Web streams with `duplex: "half"`, and any
 * `content-length` header is removed before calling `fetch`.
 *
 * @see {@link Fetch} for supplying the fetch implementation used by this layer
 * @see {@link RequestInit} for default `RequestInit` options applied before request-specific fields
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<HttpClient.HttpClient> = HttpClient.layerMergedContext(Effect.succeed(fetch))
