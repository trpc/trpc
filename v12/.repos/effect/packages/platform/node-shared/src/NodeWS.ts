/**
 * Re-exports the `ws` package, used for WebSocket servers and HTTP upgrades.
 * It is kept out of `NodeSocket` so client-only imports do not load `ws`.
 *
 * @stability unstable
 * @since 4.1.0
 */

/**
 * @stability unstable
 * @category re-exports
 * @since 4.1.0
 */
export * from "ws"
