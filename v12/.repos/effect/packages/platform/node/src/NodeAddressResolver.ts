/**
 * The `NodeAddressResolver` module provides the Node.js `AddressResolver`
 * service for Effect programs.
 *
 * IPv6 literals with a named zone such as `fe80::1%eth0` get their scope ID
 * from `os.networkInterfaces()`, listed each time a named zone is resolved.
 *
 * @stability experimental
 * @since 4.0.0
 */

/**
 * @stability experimental
 * @since 4.0.0
 */
export * from "@effect/platform-node-shared/NodeAddressResolver"
