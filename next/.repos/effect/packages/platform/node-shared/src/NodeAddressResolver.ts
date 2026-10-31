/**
 * Node.js implementation of Effect's `AddressResolver` service.
 *
 * Domain names are looked up with the `Dns` service, and IPv6 literals with a
 * named zone such as `fe80::1%eth0` get their scope ID from
 * `os.networkInterfaces()`, queried each time to reflect interface changes.
 *
 * @stability experimental
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as AddressResolver from "effect/net/AddressResolver"
import type * as Dns from "effect/net/Dns"
import * as NetAddress from "effect/net/NetAddress"
import * as Os from "node:os"

const scopeId: AddressResolver.ScopeIdLookup = (name) =>
  Effect.try({
    try: () => NetAddress.scopeIdFromInterface(Os.networkInterfaces()[name]),
    catch: (cause) => new NetAddress.NetAddressError({ input: name, message: "cannot list network interfaces", cause })
  })

/**
 * Layer that provides the Node.js `AddressResolver` service using the `Dns`
 * service.
 *
 * @stability experimental
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<AddressResolver.AddressResolver, never, Dns.Dns> = AddressResolver.layer({ scopeId })
