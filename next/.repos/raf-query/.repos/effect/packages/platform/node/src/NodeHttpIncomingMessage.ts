/**
 * Adapter base for exposing Node `http.IncomingMessage` values as Effect HTTP
 * incoming messages.
 *
 * Server requests and Node client responses both arrive as Node readable
 * streams with raw header objects, socket metadata, and one-shot body
 * consumption. This module's `NodeHttpIncomingMessage` class keeps the original
 * Node message available while presenting Effect's `HttpIncomingMessage` shape:
 * typed headers, remote address lookup, stream access, and text, JSON,
 * URL-encoded, and array-buffer body readers.
 *
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import * as Headers from "effect/http/Headers"
import * as IncomingMessage from "effect/http/HttpIncomingMessage"
import * as UrlParams from "effect/http/UrlParams"
import * as Inspectable from "effect/Inspectable"
import * as Option from "effect/Option"
import type * as Schema from "effect/Schema"
import type * as Stream from "effect/Stream"
import type * as Http from "node:http"
import * as NodeStream from "./NodeStream.ts"

/**
 * Adapts a Node `IncomingMessage` to Effect HTTP incoming messages.
 *
 * **When to use**
 *
 * Use to implement Node HTTP request or response adapters that expose the
 * Effect HTTP incoming-message interface.
 *
 * **Details**
 *
 * The adapter exposes headers, remote address, stream access, and cached body
 * decoders. Subclasses provide the error mapping for unknown Node errors.
 *
 * @category constructors
 * @since 4.0.0
 */
export abstract class NodeHttpIncomingMessage<E> extends Inspectable.Class
  implements IncomingMessage.HttpIncomingMessage<E>
{
  /**
   * Marks this value as an HTTP incoming message for runtime guards.
   *
   * @since 4.0.0
   */
  readonly [IncomingMessage.TypeId]: typeof IncomingMessage.TypeId
  readonly source: Http.IncomingMessage
  readonly onError: (error: unknown) => E
  readonly remoteAddressOverride?: Option.Option<string> | undefined

  constructor(
    source: Http.IncomingMessage,
    onError: (error: unknown) => E,
    remoteAddressOverride?: Option.Option<string>
  ) {
    super()
    this[IncomingMessage.TypeId] = IncomingMessage.TypeId
    this.source = source
    this.onError = onError
    this.remoteAddressOverride = remoteAddressOverride
  }

  get headers() {
    return Headers.fromInput(this.source.headers as any)
  }

  get remoteAddress() {
    return this.remoteAddressOverride ?? Option.fromNullishOr(this.source.socket?.remoteAddress)
  }

  private textEffect: Effect.Effect<string, E> | undefined
  get text(): Effect.Effect<string, E> {
    if (this.textEffect) {
      return this.textEffect
    }
    this.textEffect = Effect.map(this.arrayBuffer, (_) => Buffer.from(_).toString("utf8"))
    return this.textEffect
  }

  get textUnsafe(): string {
    return Effect.runSync(this.text)
  }

  get json(): Effect.Effect<Schema.Json, E> {
    return Effect.flatMap(this.text, (text) =>
      Effect.try({
        try: () => text === "" ? null : JSON.parse(text),
        catch: this.onError
      }))
  }

  get jsonUnsafe(): Schema.Json {
    return Effect.runSync(this.json)
  }

  get urlParamsBody(): Effect.Effect<UrlParams.UrlParams, E> {
    return Effect.flatMap(this.text, (_) =>
      Effect.try({
        try: () => UrlParams.fromInput(new URLSearchParams(_)),
        catch: this.onError
      }))
  }

  get stream(): Stream.Stream<Uint8Array, E> {
    return NodeStream.fromReadable({
      evaluate: () => this.source,
      onError: this.onError
    })
  }

  private arrayBufferEffect: Effect.Effect<ArrayBuffer, E> | undefined
  get arrayBuffer(): Effect.Effect<ArrayBuffer, E> {
    if (this.arrayBufferEffect) {
      return this.arrayBufferEffect
    }
    this.arrayBufferEffect = Effect.withFiber((fiber) =>
      NodeStream.toArrayBuffer(() => this.source, {
        onError: this.onError,
        maxBytes: fiber.getRef(IncomingMessage.MaxBodySize)
      })
    ).pipe(
      Effect.cached,
      Effect.runSync
    )
    this.textEffect = Effect.map(this.arrayBufferEffect, (_) => new TextDecoder().decode(_))
    return this.arrayBufferEffect
  }
}
