import { Effect } from "effect"
import type * as Arr from "effect/Array"
import * as Dns from "effect/net/Dns"
import type * as Host from "effect/net/Host"
import type * as NetAddress from "effect/net/NetAddress"
import { describe, expect, it } from "tstyche"

declare const dns: Dns.Dns["Service"]

describe("Dns", () => {
  it("accepts string inputs without widening results or errors", () => {
    expect(dns.lookup("db.example.com")).type.toBe<
      Effect.Effect<Arr.NonEmptyReadonlyArray<NetAddress.IpAddress>, Dns.DnsError>
    >()
    expect(dns.lookup("db.example.com", { family: "IPv4" })).type.toBe<
      Effect.Effect<Arr.NonEmptyReadonlyArray<NetAddress.Ipv4Address>, Dns.DnsError>
    >()
    expect(dns.lookup("db.example.com", { family: "IPv6" })).type.toBe<
      Effect.Effect<Arr.NonEmptyReadonlyArray<NetAddress.Ipv6Address>, Dns.DnsError>
    >()
    expect(dns.resolve("db.example.com", "SRV")).type.toBe<
      Effect.Effect<Arr.NonEmptyReadonlyArray<Dns.Srv>, Dns.DnsError>
    >()
    expect(dns.resolve("_443._tcp.example.com", "TLSA")).type.toBe<
      Effect.Effect<Arr.NonEmptyReadonlyArray<Dns.Tlsa>, Dns.DnsError>
    >()
  })

  it("keeps platform inputs and stored record names branded", () => {
    Dns.make({
      lookup: (host, family) => {
        expect(host).type.toBe<Host.DomainName>()
        expect(family).type.toBe<NetAddress.IpFamily | undefined>()
        return Effect.succeed([])
      },
      resolve: (host, type) => {
        expect(host).type.toBe<Host.DomainName>()
        expect(type).type.toBe<Dns.RecordType>()
        return Effect.succeed([])
      }
    })
    expect<Dns.Cname["target"]>().type.toBe<Host.DomainName>()
    expect<Dns.Mx["exchange"]>().type.toBe<Host.DomainName>()
    expect<Dns.Srv["target"]>().type.toBe<Host.DomainName>()
    expect<Dns.Soa["primary"]>().type.toBe<Host.DomainName>()
    expect(Dns.makeRecord).type.not.toBeCallableWith("CNAME", { target: "db.example.com" })
  })
})
