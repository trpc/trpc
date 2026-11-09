/**
 * Re-export of the Undici HTTP client package used by the Node platform.
 *
 * This module gives Effect applications a package-local import for Undici
 * primitives while working with `@effect/platform-node`. Import named Undici
 * APIs from here when configuring Node HTTP client dispatchers, creating agents
 * or mock agents, setting the process-global dispatcher, or sharing the same
 * Undici types with integrations that use the platform HTTP client.
 *
 * The module does not wrap or reinterpret Undici behavior. It forwards the
 * installed `undici` named exports and default export, so connection pooling,
 * dispatcher lifetimes, mocking, aborts, and request options follow Undici's
 * own semantics.
 *
 * @stability unstable
 * @since 4.0.0
 */
import Undici from "undici"

/**
 * @stability unstable
 * @category re-exports
 * @since 4.0.0
 */
export * from "undici"

/**
 * @stability unstable
 * @category re-exports
 * @since 4.0.0
 */
export default Undici
