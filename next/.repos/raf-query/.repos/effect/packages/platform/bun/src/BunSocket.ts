/**
 * Bun platform socket entry point for Effect sockets.
 *
 * This module re-exports the shared Node socket constructors for TCP clients,
 * Unix domain socket clients, and adapters from existing Node `Duplex` streams.
 * It also provides Bun WebSocket layers using `globalThis.WebSocket`, including
 * a constructor layer and a `Socket.Socket` layer for a WebSocket URL.
 *
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
 * `WebSocket` implementation.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerWebSocketConstructor: Layer.Layer<
  Socket.WebSocketConstructor
> = Layer.succeed(Socket.WebSocketConstructor)(
  (url, options) =>
    // Bun accepts `WebSocketOptions`, but `bun-types` selects the DOM overload
    // when `lib.dom` is loaded and hides those constructor options.
    new globalThis.WebSocket(url, options as string | Array<string> | undefined)
)

/**
 * Creates a `Socket.Socket` layer for a WebSocket URL using Bun's global
 * `WebSocket` constructor, honoring protocol, open-timeout, and
 * high-water-mark options.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerWebSocket: (
  url: string | Effect<string>,
  options?: {
    readonly openTimeout?: Duration.Input | undefined
    readonly protocols?: string | Array<string> | undefined
    readonly highWaterMark?: number | undefined
  } | undefined
) => Layer.Layer<Socket.Socket, never, never> = flow(
  Socket.makeWebSocket,
  Layer.effect(Socket.Socket),
  Layer.provide(layerWebSocketConstructor)
)
