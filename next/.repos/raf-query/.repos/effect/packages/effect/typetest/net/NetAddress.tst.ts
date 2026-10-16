import { Effect, type Result, Schema } from "effect"
import type * as Brand from "effect/Brand"
import * as HttpServer from "effect/http/HttpServer"
import * as NetAddress from "effect/net/NetAddress"
import { describe, expect, it } from "tstyche"

describe("NetAddress", () => {
  it("exposes checked and throwing constructors", () => {
    expect(NetAddress.macAddressFromString("00:00:5e:00:53:01")).type.toBe<
      Result.Result<NetAddress.MacAddress, NetAddress.NetAddressError>
    >()
    expect(NetAddress.macAddressFromStringUnsafe("00:00:5e:00:53:01")).type.toBe<NetAddress.MacAddress>()
    expect(NetAddress.ipFromString("::1")).type.toBe<Result.Result<NetAddress.IpAddress, NetAddress.NetAddressError>>()
    expect(NetAddress.ipFromStringUnsafe("::1")).type.toBe<NetAddress.IpAddress>()
    expect(NetAddress.inetAddressUnsafe(NetAddress.ipv6Loopback, 80)).type.toBe<NetAddress.InetAddress>()
    expect(NetAddress.inetAddressFromStringUnsafe("[::1]:80")).type.toBe<NetAddress.InetAddress>()
    expect(NetAddress.socketAddressFromInput({ address: "::1", port: 80 })).type.toBe<
      Result.Result<NetAddress.SocketAddress, NetAddress.NetAddressError>
    >()
    expect(NetAddress.socketAddressFromInput("127.0.0.1:3000")).type.toBe<
      Result.Result<NetAddress.SocketAddress, NetAddress.NetAddressError>
    >()
    expect(NetAddress.socketAddressFromInputUnsafe({ path: "server.sock" })).type.toBe<NetAddress.SocketAddress>()
    expect(NetAddress.ipv4FromBytesUnsafe(new Uint8Array(4))).type.toBe<NetAddress.Ipv4Address>()
    expect(NetAddress.ipv6FromBytesUnsafe(new Uint8Array(16))).type.toBe<NetAddress.Ipv6Address>()
    expect(NetAddress.ipv4FromOctets([127, 0, 0, 1])).type.toBe<
      Result.Result<NetAddress.Ipv4Address, NetAddress.NetAddressError>
    >()
    expect(NetAddress.ipv6FromSegments([0, 0, 0, 0, 0, 0, 0, 1])).type.toBe<
      Result.Result<NetAddress.Ipv6Address, NetAddress.NetAddressError>
    >()
    expect(NetAddress.macAddressFromOctets([0, 0, 0, 0, 0, 0])).type.toBe<
      Result.Result<NetAddress.MacAddress, NetAddress.NetAddressError>
    >()
    // @ts-expect-error Source has 3 element(s) but target requires 4.
    NetAddress.ipv4FromOctets([127, 0, 1])
    expect(NetAddress.ipv6ToOctets(NetAddress.ipv6Loopback)).type.toBe<ReadonlyArray<number>>()
    // @ts-expect-error Property 'bytes' does not exist
    void NetAddress.ipv4Loopback.bytes
  })

  it("requires canonical socket addresses at consumer constructors", () => {
    const server = HttpServer.make({
      address: NetAddress.inetAddressUnsafe(NetAddress.ipv4Loopback, 8080),
      serve: () => Effect.void
    })
    expect(server.address).type.toBe<NetAddress.SocketAddress>()

    HttpServer.make({
      // @ts-expect-error Type 'string' is not assignable to type 'Ipv6Address'
      address: { address: "localhost", port: 8080 },
      serve: () => Effect.void
    })
  })

  it("converts internet addresses to URLs and exposes rejected inputs", () => {
    const address = NetAddress.inetAddressUnsafe(NetAddress.ipv6Unspecified, 80)
    expect(NetAddress.toUrl(address)).type.toBe<Result.Result<URL, NetAddress.NetAddressError>>()
    expect(NetAddress.toUrl(address, undefined)).type.toBe<Result.Result<URL, NetAddress.NetAddressError>>()
    expect(NetAddress.toUrl(address, "https")).type.toBe<Result.Result<URL, NetAddress.NetAddressError>>()
    const unix = NetAddress.unixPathAddress("server.sock")
    expect(NetAddress.toUrl(NetAddress.ipv4Loopback)).type.toBe<Result.Result<URL, NetAddress.NetAddressError>>()
    expect(NetAddress.toUrl(NetAddress.ipv6Loopback, "https")).type.toBe<
      Result.Result<URL, NetAddress.NetAddressError>
    >()
    expect(NetAddress.toUrl).type.not.toBeCallableWith(unix)
    expect(NetAddress.toUrl).type.not.toBeCallableWith(unix, "http")
    expect(NetAddress.formatUrl(address)).type.toBe<Result.Result<string, NetAddress.NetAddressError>>()
    expect(NetAddress.formatUrl(NetAddress.ipv4Loopback, "https")).type.toBe<
      Result.Result<string, NetAddress.NetAddressError>
    >()
    expect(NetAddress.formatUrl(unix)).type.toBe<Result.Result<string, NetAddress.NetAddressError>>()
    expect(NetAddress.formatUrlUnsafe(address)).type.toBe<string>()
    expect(NetAddress.formatUrlUnsafe(NetAddress.ipv4Loopback, "https")).type.toBe<string>()
    expect(NetAddress.formatUrlUnsafe(unix)).type.toBe<string>()
    expect(NetAddress.formatUnixPath(unix)).type.toBe<string>()
    expect(new NetAddress.NetAddressError({ input: address, message: "invalid" }).input).type.toBe<unknown>()
  })

  it("narrows address unions", () => {
    const address = null as unknown as NetAddress.SocketAddress
    if (NetAddress.isUnixPathAddress(address)) {
      expect(address).type.toBe<NetAddress.UnixPathAddress>()
    } else if (NetAddress.isInetAddressV4(address)) {
      expect(address.address).type.toBe<NetAddress.Ipv4Address>()
    } else {
      expect(address.address).type.toBe<NetAddress.Ipv6Address>()
    }
  })

  it("preserves multicast families and the IP-only default", () => {
    const ip = null as unknown as NetAddress.IpAddress
    const mac = null as unknown as NetAddress.MacAddress
    const inet = null as unknown as NetAddress.InetAddress
    const group = null as unknown as NetAddress.MulticastAddress
    const macGroup = null as unknown as NetAddress.MulticastAddress<NetAddress.MacAddress>
    const wideGroup = null as unknown as NetAddress.MulticastAddress<NetAddress.IpAddress | NetAddress.MacAddress>
    const addMembership = null as unknown as <A extends NetAddress.IpAddress>(
      group: NetAddress.MulticastAddress<A>
    ) => void

    if (NetAddress.isMulticast(ip)) {
      expect(ip).type.toBe<NetAddress.MulticastAddress<NetAddress.IpAddress>>()
      if (NetAddress.isIpv4Address(ip)) {
        expect(ip).type.toBe<NetAddress.MulticastAddress<NetAddress.Ipv4Address>>()
      }
    } else {
      expect(ip).type.toBe<NetAddress.IpAddress>()
    }
    if (NetAddress.isMulticast(mac)) {
      expect(mac).type.toBe<NetAddress.MulticastAddress<NetAddress.MacAddress>>()
    }
    expect(NetAddress.isMulticast).type.not.toBeCallableWith(inet)
    addMembership(group)
    expect(addMembership).type.not.toBeCallableWith(macGroup)
    expect(addMembership).type.not.toBeCallableWith(wideGroup)
  })

  it("narrows classifications while preserving address families", () => {
    const ip = null as unknown as NetAddress.IpAddress
    const ipv4 = null as unknown as NetAddress.Ipv4Address
    const ipv6 = null as unknown as NetAddress.Ipv6Address
    const mac = null as unknown as NetAddress.MacAddress

    if (NetAddress.isUnicast(ip)) expect(ip).type.toBe<NetAddress.UnicastAddress<NetAddress.IpAddress>>()
    if (NetAddress.isBroadcast(ipv4)) {
      expect(ipv4).type.toBe<NetAddress.BroadcastAddress<NetAddress.Ipv4Address>>()
    }
    if (NetAddress.isLoopback(ip)) expect(ip).type.toBe<NetAddress.LoopbackAddress<NetAddress.IpAddress>>()
    if (NetAddress.isLinkLocal(ip)) expect(ip).type.toBe<NetAddress.LinkLocalAddress<NetAddress.IpAddress>>()
    if (NetAddress.isUnspecified(ip)) {
      expect(ip).type.toBe<NetAddress.UnspecifiedAddress<NetAddress.IpAddress>>()
    }
    if (NetAddress.isPrivate(ipv4)) expect(ipv4).type.toBe<NetAddress.PrivateAddress>()
    if (NetAddress.isUniqueLocal(ipv6)) expect(ipv6).type.toBe<NetAddress.UniqueLocalAddress>()
    if (NetAddress.isMacLocallyAdministered(mac)) {
      expect(mac).type.toBe<NetAddress.LocallyAdministeredAddress>()
    }
    if (NetAddress.isMacUniversallyAdministered(mac)) {
      expect(mac).type.toBe<NetAddress.UniversallyAdministeredAddress>()
    }
    expect(NetAddress.isLoopback).type.toBeAssignableTo<(self: NetAddress.IpAddress) => boolean>()
  })

  it("stacks brands and models MAC broadcast as multicast", () => {
    const ipv4 = null as unknown as NetAddress.Ipv4Address
    const mac = null as unknown as NetAddress.MacAddress

    if (NetAddress.isMacLocallyAdministered(mac) && NetAddress.isMulticast(mac)) {
      expect(mac).type.toBe<
        NetAddress.MulticastAddress<NetAddress.LocallyAdministeredAddress<NetAddress.MacAddress>>
      >()
    }
    if (NetAddress.isUnicast(ipv4) && NetAddress.isPrivate(ipv4)) {
      expect(ipv4).type.toBe<
        NetAddress.PrivateAddress<NetAddress.UnicastAddress<NetAddress.Ipv4Address>>
      >()
    }
    if (NetAddress.isMacBroadcast(mac)) {
      expect(mac).type.toBeAssignableTo<NetAddress.MulticastAddress<NetAddress.MacAddress>>()
    }
    expect(NetAddress.ipv4Broadcast).type.not.toBeAssignableTo<NetAddress.MulticastAddress>()
    expect(
      [
        NetAddress.ipv4Loopback,
        NetAddress.ipv4Unspecified,
        NetAddress.ipv4Broadcast
      ] as const
    ).type.toBe<readonly [NetAddress.Ipv4Address, NetAddress.Ipv4Address, NetAddress.Ipv4Address]>()
    expect(
      [
        NetAddress.ipv6Loopback,
        NetAddress.ipv6Unspecified
      ] as const
    ).type.toBe<readonly [NetAddress.Ipv6Address, NetAddress.Ipv6Address]>()
  })

  it("narrows singleton constants to generic classifications on demand", () => {
    const ipv4Loopback = NetAddress.ipv4Loopback
    const ipv6Unspecified = NetAddress.ipv6Unspecified
    const ipv4Broadcast = NetAddress.ipv4Broadcast

    if (NetAddress.isLoopback(ipv4Loopback)) {
      expect(ipv4Loopback).type.toBe<NetAddress.LoopbackAddress<NetAddress.Ipv4Address>>()
    }
    if (NetAddress.isUnspecified(ipv6Unspecified)) {
      expect(ipv6Unspecified).type.toBe<NetAddress.UnspecifiedAddress<NetAddress.Ipv6Address>>()
    }
    if (NetAddress.isBroadcast(ipv4Broadcast)) {
      expect(ipv4Broadcast).type.toBe<NetAddress.BroadcastAddress<NetAddress.Ipv4Address>>()
    }
  })

  it("preserves families and prior brands in higher-order inference", () => {
    type CustomIpv4Address = NetAddress.Ipv4Address & Brand.Brand<"CustomIpv4Address">
    const ips = null as unknown as Array<NetAddress.IpAddress>
    const custom = null as unknown as CustomIpv4Address
    const multicastSchema = Schema.IpAddress.pipe(Schema.refine(NetAddress.isMulticast))

    expect(ips.filter(NetAddress.isMulticast)).type.toBe<
      Array<NetAddress.MulticastAddress<NetAddress.IpAddress>>
    >()
    expect(Schema.revealCodec(multicastSchema)).type.toBe<
      Schema.Codec<NetAddress.MulticastAddress<NetAddress.IpAddress>, NetAddress.IpAddress, never, never>
    >()
    if (NetAddress.isMulticast(custom)) {
      expect(custom).type.toBe<NetAddress.MulticastAddress<CustomIpv4Address>>()
    }
  })

  it("derives address families, internet addresses, and multicast interfaces", () => {
    type CustomIpv4Address = NetAddress.Ipv4Address & Brand.Brand<"CustomIpv4Address">

    expect<NetAddress.Family<NetAddress.InetAddressV6>>().type.toBe<NetAddress.Ipv6Address>()
    expect<NetAddress.Family<NetAddress.MulticastAddress<NetAddress.Ipv4Address>>>().type.toBe<
      NetAddress.Ipv4Address
    >()
    expect<NetAddress.Family<CustomIpv4Address>>().type.toBe<NetAddress.Ipv4Address>()
    expect<NetAddress.Family<NetAddress.Ipv6Address>>().type.toBe<NetAddress.Ipv6Address>()
    expect<NetAddress.Family<NetAddress.IpAddress>>().type.toBe<NetAddress.IpAddress>()
    expect<NetAddress.Family<NetAddress.InetAddress>>().type.toBe<NetAddress.IpAddress>()
    expect<NetAddress.Family<never>>().type.toBe<never>()

    expect<NetAddress.Inet<NetAddress.Ipv4Address>>().type.toBe<NetAddress.InetAddressV4>()
    expect<NetAddress.Inet<NetAddress.Ipv6Address>>().type.toBe<NetAddress.InetAddressV6>()
    expect<NetAddress.Inet<NetAddress.MulticastAddress<NetAddress.Ipv4Address>>>().type.toBe<
      NetAddress.InetAddressV4
    >()
    expect<NetAddress.Inet>().type.toBe<NetAddress.InetAddress>()
    expect<NetAddress.Inet<never>>().type.toBe<never>()

    expect<NetAddress.MulticastInterface<NetAddress.Ipv4Address>>().type.toBe<NetAddress.Ipv4Address>()
    expect<NetAddress.MulticastInterface<NetAddress.Ipv6Address>>().type.toBe<number>()
    expect<NetAddress.MulticastInterface>().type.toBe<NetAddress.Ipv4Address | number>()
    expect<Parameters<typeof NetAddress.formatMulticastInterface>[0]>().type.toBe<NetAddress.MulticastInterface>()

    const localV4 = null as unknown as NetAddress.InetAddressV4
    const remoteV4 = null as unknown as NetAddress.InetAddressV4
    const remoteV6 = null as unknown as NetAddress.InetAddressV6
    const bind = <L extends NetAddress.InetAddress>(options: {
      readonly localAddress: L
      readonly remote?: NoInfer<NetAddress.Inet<NetAddress.Family<L>>> | undefined
    }): NetAddress.Family<L> => options.localAddress.address as NetAddress.Family<L>

    expect(bind({ localAddress: localV4, remote: remoteV4 })).type.toBe<NetAddress.Ipv4Address>()
    expect(bind).type.not.toBeCallableWith({ localAddress: localV4, remote: remoteV6 })
  })

  it("preserves named schema types when annotating codecs", () => {
    expect(Schema.MacAddressFromString.annotate({ identifier: "custom" })).type.toBe<Schema.MacAddressFromString>()
    expect(Schema.Ipv4AddressFromString.annotate({ identifier: "custom" })).type.toBe<Schema.Ipv4AddressFromString>()
    expect(Schema.Ipv6AddressFromString.annotate({ identifier: "custom" })).type.toBe<Schema.Ipv6AddressFromString>()
    expect(Schema.IpAddressFromString.annotate({ identifier: "custom" })).type.toBe<Schema.IpAddressFromString>()
    expect(Schema.Ipv4InterfaceFromString.annotate({ identifier: "custom" })).type.toBe<
      Schema.Ipv4InterfaceFromString
    >()
    expect(Schema.Ipv6InterfaceFromString.annotate({ identifier: "custom" })).type.toBe<
      Schema.Ipv6InterfaceFromString
    >()
    expect(Schema.IpInterfaceFromString.annotate({ identifier: "custom" })).type.toBe<Schema.IpInterfaceFromString>()
    expect(Schema.Ipv4NetworkFromString.annotate({ identifier: "custom" })).type.toBe<Schema.Ipv4NetworkFromString>()
    expect(Schema.Ipv6NetworkFromString.annotate({ identifier: "custom" })).type.toBe<Schema.Ipv6NetworkFromString>()
    expect(Schema.IpNetworkFromString.annotate({ identifier: "custom" })).type.toBe<Schema.IpNetworkFromString>()
    expect(Schema.InetAddressFromString.annotate({ identifier: "custom" })).type.toBe<Schema.InetAddressFromString>()
    expect(Schema.UnixPathAddressFromString.annotate({ identifier: "custom" })).type.toBe<
      Schema.UnixPathAddressFromString
    >()
  })

  it("exposes string transformation schemas", () => {
    expect(Schema.MacAddressFromString).type.toBeAssignableTo<Schema.Codec<NetAddress.MacAddress, string>>()
    expect(Schema.IpAddressFromString).type.toBeAssignableTo<Schema.Codec<NetAddress.IpAddress, string>>()
    expect(Schema.InetAddressFromString).type.toBeAssignableTo<Schema.Codec<NetAddress.InetAddress, string>>()
    expect(Schema.UnixPathAddressFromString).type.toBeAssignableTo<
      Schema.Codec<NetAddress.UnixPathAddress, string>
    >()
    expect(Schema.IpMulticastAddressFromString).type.toBeAssignableTo<
      Schema.Codec<NetAddress.MulticastAddress<NetAddress.IpAddress>, string>
    >()
    expect(Schema.MacBroadcastAddressFromString).type.toBeAssignableTo<
      Schema.Codec<NetAddress.BroadcastAddress<NetAddress.MacAddress>, string>
    >()
  })

  it("exposes representative named classification schema outputs", () => {
    expect<Schema.Schema.Type<typeof Schema.IpMulticastAddressFromString>>().type.toBe<
      NetAddress.MulticastAddress<NetAddress.IpAddress>
    >()
    expect<Schema.Schema.Type<typeof Schema.MacBroadcastAddressFromString>>().type.toBe<
      NetAddress.BroadcastAddress<NetAddress.MacAddress>
    >()
    expect<Schema.Schema.Type<typeof Schema.Ipv4PrivateAddress>>().type.toBe<
      NetAddress.PrivateAddress<NetAddress.Ipv4Address>
    >()
  })
})
