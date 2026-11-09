/**
 * Re-exports the `ws` package and provides a WebSocket client layer backed by
 * it. `NodeSocket` clients use Node's global `WebSocket` and do not load `ws`.
 *
 * @stability unstable
 * @since 4.1.0
 */
import { WebSocket } from "@effect/platform-node-shared/NodeWS"
import * as Layer from "effect/Layer"
import * as Socket from "effect/socket/Socket"

/**
 * @since 4.1.0
 */
export * from "@effect/platform-node-shared/NodeWS"

/**
 * Provides a `Socket.WebSocketConstructor` backed by the `ws` package.
 *
 * **Details**
 *
 * Supports handshake headers alongside subprotocols, and pauses reads once
 * buffered frames reach the `Socket.fromWebSocket` `highWaterMark` (64 KiB by
 * default).
 *
 * @stability unstable
 * @category layers
 * @since 4.1.0
 */
export const layerWebSocketConstructor: Layer.Layer<
  Socket.WebSocketConstructor
> = Layer.succeed(Socket.WebSocketConstructor)((url, options) => {
  if (options === undefined || typeof options === "string" || Array.isArray(options)) {
    return new WebSocket(url, options)
  }
  return new WebSocket(url, options.protocols, { headers: options.headers })
})
