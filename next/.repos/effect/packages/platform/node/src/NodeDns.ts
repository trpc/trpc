/**
 * The `NodeDns` module provides the Node.js `Dns` service for Effect programs.
 *
 * Address lookups use the operating system resolver through `dns.lookup`, so
 * they also read the hosts file. Record queries and reverse lookups share one
 * `dns.Resolver`. Node.js cannot cancel a single query or address lookup, so
 * interrupting one discards its result but lets the underlying work finish: a
 * query runs until it is answered or times out, and a `getaddrinfo` call keeps
 * a libuv thread pool worker busy until it returns.
 *
 * @stability experimental
 * @since 4.0.0
 */

export type {
  /**
   * Options for the Node.js `Dns` service: name servers, timeout, and tries
   * for record queries and reverse lookups.
   *
   * @stability experimental
   * @category re-exports
   * @since 4.0.0
   */
  Options
} from "@effect/platform-node-shared/NodeDns"

export {
  /**
   * Layer that provides the Node.js `Dns` service using the system resolver
   * configuration.
   *
   * @stability experimental
   * @category re-exports
   * @since 4.0.0
   */
  layer,
  /**
   * Creates a layer that provides the Node.js `Dns` service with options read
   * from configuration.
   *
   * @stability experimental
   * @category re-exports
   * @since 4.0.0
   */
  layerConfig,
  /**
   * Creates a Node.js `Dns` service whose resolver lives as long as the scope.
   *
   * @stability experimental
   * @category re-exports
   * @since 4.0.0
   */
  make
} from "@effect/platform-node-shared/NodeDns"
