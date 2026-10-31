/**
 * Bun platform socket entry point for Effect sockets.
 *
 * This module re-exports the shared Node socket constructors for TCP clients,
 * Unix domain socket clients, and adapters from existing Node `Duplex` streams.
 * It also provides Bun WebSocket layers using `globalThis.WebSocket`, including
 * a constructor layer and a `Socket.Socket` layer for a WebSocket URL.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Duration from "effect/Duration"
import type { Effect } from "effect/Effect"
import { flow } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Socket from "effect/socket/Socket"

/**
 * @since 4.0.0
 */
export * from "@effect/platform-node-shared/NodeSocket"

/**
 * Provides a `Socket.WebSocketConstructor` backed by Bun's global
 * `WebSocket` implementation, supporting handshake headers and subprotocols
 * together in client options objects.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebSocketConstructor: Layer.Layer<
  Socket.WebSocketConstructor
> = Layer.succeed(Socket.WebSocketConstructor)(
  (url, options) => {
    if (options === undefined || typeof options === "string" || Array.isArray(options)) {
      return new globalThis.WebSocket(url, options)
    }
    // Bun accepts `WebSocketOptions`, but `bun-types` selects the DOM
    // overload when `lib.dom` is loaded and hides those constructor options.
    const WebSocket = globalThis.WebSocket as unknown as {
      new(
        url: string,
        options: {
          protocols?: Array<string> | undefined
          headers?: Readonly<Record<string, string>> | undefined
        }
      ): globalThis.WebSocket
    }
    return new WebSocket(url, {
      // Bun requires a sequence for `protocols` in its options object.
      protocols: typeof options.protocols === "string" ? [options.protocols] : options.protocols,
      headers: options.headers
    })
  }
)

/**
 * Creates a `Socket.Socket` layer for a WebSocket URL using Bun's global
 * `WebSocket` constructor, honoring protocol, handshake-header, open-timeout, and
 * high-water-mark options.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebSocket: (
  url: string | Effect<string>,
  options?: {
    readonly openTimeout?: Duration.Input | undefined
    readonly protocols?: string | Array<string> | undefined
    readonly headers?: Readonly<Record<string, string>> | undefined
    readonly highWaterMark?: number | undefined
  } | undefined
) => Layer.Layer<Socket.Socket, never, never> = flow(
  Socket.makeWebSocket,
  Layer.effect(Socket.Socket),
  Layer.provide(layerWebSocketConstructor)
)
