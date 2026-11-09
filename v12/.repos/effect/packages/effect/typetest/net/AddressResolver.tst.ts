import type { Effect } from "effect"
import type * as Arr from "effect/Array"
import type * as AddressResolver from "effect/net/AddressResolver"
import type * as Dns from "effect/net/Dns"
import type * as Host from "effect/net/Host"
import type * as NetAddress from "effect/net/NetAddress"
import { describe, expect, it } from "tstyche"

declare const resolver: AddressResolver.AddressResolver["Service"]
declare const hostPort: Host.HostPort
declare const socket: NetAddress.SocketAddress
declare const family: NetAddress.IpFamily

type Resolved<A> = Effect.Effect<Arr.NonEmptyReadonlyArray<A>, Dns.DnsError | NetAddress.NetAddressError>

describe("AddressResolver", () => {
  it("accepts string endpoints without widening results or errors", () => {
    expect(resolver.resolve("db.internal:5432")).type.toBe<Resolved<NetAddress.InetAddress>>()
    expect(resolver.resolve("db.internal:5432", { family: "IPv4" })).type.toBe<Resolved<NetAddress.InetAddressV4>>()
    expect(resolver.resolve("db.internal:5432", { family: "IPv6" })).type.toBe<Resolved<NetAddress.InetAddressV6>>()
  })

  it("narrows internet addresses by literal family", () => {
    expect(resolver.resolve(hostPort)).type.toBe<Resolved<NetAddress.InetAddress>>()
    expect(resolver.resolve(hostPort, { family })).type.toBe<Resolved<NetAddress.InetAddress>>()
    expect(resolver.resolve(hostPort, { family: "IPv4" })).type.toBe<Resolved<NetAddress.InetAddressV4>>()
  })

  it("returns socket addresses for targets that may be Unix paths", () => {
    expect(resolver.resolve(socket, { family: "IPv4" })).type.toBe<Resolved<NetAddress.SocketAddress>>()
  })
})
