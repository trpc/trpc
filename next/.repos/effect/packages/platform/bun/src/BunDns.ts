/**
 * Bun implementation of Effect's `Dns` service.
 *
 * Address lookups use `Bun.dns.lookup` with the `system` backend, which calls
 * the operating system resolver (`getaddrinfo`) and therefore also reads the
 * hosts file. Bun's `node:dns` lookup uses c-ares instead, which bypasses the
 * system's name service configuration. Record queries and reverse lookups use
 * `NodeDns.resolver` without the UTF-8 correction of `NodeDns.make`,
 * because Bun already decodes TXT and CAA character strings as UTF-8.
 *
 * **Gotchas**
 *
 * Bun returns each character string of a TXT record as a separate record, so
 * a record made of several strings arrives as several TXT records whose chunks
 * cannot be reassembled (https://github.com/oven-sh/bun/issues/44692).
 *
 * Bun's resolver cannot query TLSA records, so TLSA queries fail with
 * `Unsupported`.
 *
 * @stability experimental
 * @since 4.0.0
 */
import * as NodeDns from "@effect/platform-node-shared/NodeDns"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Dns from "effect/net/Dns"
import type * as NetAddress from "effect/net/NetAddress"

export type {
  /**
   * Options for the Bun `Dns` service: name servers, timeout, and tries for
   * record queries and reverse lookups.
   *
   * @stability experimental
   * @category re-exports
   * @since 4.0.0
   */
  Options
} from "@effect/platform-node-shared/NodeDns"

/**
 * Creates a Bun `Dns` service whose resolver lives as long as the scope.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*(options?: NodeDns.Options) {
  const resolve = yield* NodeDns.resolver(options)
  return Dns.make({
    lookup: (host, family) =>
      Effect.tryPromise({
        try: () => Bun.dns.lookup(host, { family: NodeDns.toFamily(family), backend: "system" }),
        catch: (cause) => NodeDns.dnsErrorFromCause(cause, "lookup", host)
      }).pipe(Effect.map(NodeDns.addressesFromLookup)),
    resolve
  })
})

/**
 * Layer that provides the Bun `Dns` service using the system resolver
 * configuration.
 *
 * @stability experimental
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Dns.Dns> = Layer.effect(Dns.Dns, Effect.orDie(make()))

/**
 * Creates a layer that provides the Bun `Dns` service with options read
 * from configuration.
 *
 * @stability experimental
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  options: Config.Wrap<NodeDns.Options>
): Layer.Layer<Dns.Dns, Config.ConfigError | NetAddress.NetAddressError> =>
  Layer.effect(Dns.Dns, Effect.flatMap(Config.unwrap(options), make))
