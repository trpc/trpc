import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as AddressResolver from "effect/net/AddressResolver"
import * as Host from "effect/net/Host"
import * as NetAddress from "effect/net/NetAddress"
import * as Os from "node:os"

const endpoint = Host.hostPortFromStringUnsafe

/**
 * Runs tests of a platform `AddressResolver` layer against the host's hosts
 * file and network interfaces. They need no DNS server.
 */
export const describeAddressResolver = (
  label: string,
  layer: Layer.Layer<AddressResolver.AddressResolver>
) =>
  describe(label, () => {
    const resolver = Effect.service(AddressResolver.AddressResolver).pipe(Effect.provide(layer))

    it.effect("looks up domain names from the hosts file", () =>
      Effect.gen(function*() {
        const addresses = yield* (yield* resolver).resolve(endpoint("localhost:8080"), { family: "IPv4" })
        assert.isTrue(addresses.some((address) => NetAddress.formatInet(address) === "127.0.0.1:8080"))
      }))

    it.effect("resolves IPv6 zones from the network interfaces", () =>
      Effect.gen(function*() {
        const resolve = (yield* resolver).resolve
        const [zone, scopeId] = [...NetAddress.scopeIdsFromInterfaces(Object.entries(Os.networkInterfaces()))][0] ??
          []
        if (zone !== undefined) {
          const addresses = yield* resolve(endpoint(`[fe80::1%${zone}]:80`))
          assert.deepStrictEqual(addresses.map(NetAddress.formatInet), [`[fe80::1%${scopeId}]:80`])
        }
        const unknown = yield* Effect.flip(resolve(endpoint("[fe80::1%nonexistent0]:80")))
        assert.strictEqual(unknown._tag, "NetAddressError")
      }))
  })
