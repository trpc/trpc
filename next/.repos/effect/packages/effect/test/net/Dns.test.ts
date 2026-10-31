import { assert, describe, it } from "@effect/vitest"
import { Duration, Effect, Equal, Hash, Result, Schema } from "effect"
import * as Dns from "effect/net/Dns"
import * as Host from "effect/net/Host"
import * as NetAddress from "effect/net/NetAddress"

const ip = NetAddress.ipFromStringUnsafe
const name = Host.domainNameFromStringUnsafe

const srv = (target: string, priority: number, weight: number) =>
  Dns.makeRecordUnsafe("SRV", { target: name(target), port: 5432, priority, weight })

const tlsa = (data: Uint8Array) => Dns.makeRecordUnsafe("TLSA", { certUsage: 3, selector: 1, matchingType: 1, data })

describe("Dns", () => {
  describe("records", () => {
    it("rejects invalid fields", () => {
      assert.isTrue(
        Result.isFailure(Dns.makeRecord("SRV", { target: name("a.b"), port: 70000, priority: 0, weight: 0 }))
      )
      assert.isTrue(Result.isFailure(Dns.makeRecord("MX", { exchange: name("a.b"), priority: 1.5 })))
      assert.isTrue(Result.isFailure(Dns.makeRecord("CNAME", { target: "not a name" as Host.DomainName })))
      assert.isTrue(
        Result.isFailure(Dns.makeRecord("A", { address: ip("2001:db8::1") as NetAddress.Ipv4Address }))
      )
      assert.isTrue(
        Result.isFailure(
          Dns.makeRecord("TLSA", { certUsage: 256, selector: 1, matchingType: 1, data: new Uint8Array([1]) })
        )
      )
      assert.isTrue(
        Result.isFailure(Dns.makeRecord("TLSA", { certUsage: 3, selector: 1, matchingType: 1, data: new Uint8Array() }))
      )
    })

    it("copies TLSA data", () => {
      const data = new Uint8Array([0xab, 0xcd])
      const record = tlsa(data)
      data[0] = 0
      assert.deepStrictEqual(record.data, new Uint8Array([0xab, 0xcd]))
    })

    it("formats records in presentation format", () => {
      assert.strictEqual(Dns.formatRecord(srv("db.internal", 10, 5)), "SRV 10 5 5432 db.internal")
      assert.strictEqual(
        Dns.formatRecord(Dns.makeRecordUnsafe("TXT", { chunks: ["a \"b\"", "ü"] })),
        "TXT \"a \\\"b\\\"\" \"\\195\\188\""
      )
      assert.strictEqual(
        Dns.formatRecord(Dns.makeRecordUnsafe("PTR", { host: "Office Printer._ipp._tcp.local." })),
        "PTR Office\\032Printer._ipp._tcp.local."
      )
      assert.strictEqual(Dns.formatRecord(tlsa(new Uint8Array([0x0a, 0xbc, 0xde]))), "TLSA 3 1 1 0ABCDE")
    })

    it("implements equality and hashing", () => {
      const a = srv("db.internal", 10, 5)
      assert.isTrue(Equal.equals(a, srv("db.internal", 10, 5)))
      assert.strictEqual(Hash.hash(a), Hash.hash(srv("db.internal", 10, 5)))
      assert.isFalse(Equal.equals(a, srv("db.internal", 10, 6)))
      const b = tlsa(new Uint8Array([1, 2]))
      assert.isTrue(Equal.equals(b, tlsa(new Uint8Array([1, 2]))))
      assert.strictEqual(Hash.hash(b), Hash.hash(tlsa(new Uint8Array([1, 2]))))
      assert.isFalse(Equal.equals(b, tlsa(new Uint8Array([1, 3]))))
    })

    it("builds reverse lookup names", () => {
      assert.strictEqual(Dns.reverseName(ip("192.0.2.1")), "1.2.0.192.in-addr.arpa")
      assert.strictEqual(
        Dns.reverseName(ip("2001:db8::567:89ab")),
        "b.a.9.8.7.6.5.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa"
      )
    })

    it("encodes and decodes JSON", () => {
      const codec = Schema.toCodecJson(Schema.DnsRecord)
      const soa = Dns.makeRecordUnsafe("SOA", {
        primary: name("ns.example.com"),
        admin: "hostmaster.example.com",
        serial: 1,
        refresh: Duration.hours(1),
        retry: Duration.minutes(10),
        expire: Duration.days(7),
        minimum: Duration.minutes(5)
      })
      const json = {
        _tag: "SOA",
        primary: "ns.example.com",
        admin: "hostmaster.example.com",
        serial: 1,
        refresh: 3600,
        retry: 600,
        expire: 604800,
        minimum: 300
      }
      assert.deepStrictEqual(Schema.encodeSync(codec)(soa), json)
      assert.isTrue(Equal.equals(Schema.decodeUnknownSync(codec)(json), soa))
      assert.throws(() => Schema.decodeUnknownSync(codec)({ _tag: "CNAME", target: "Example.com" }))
      const record = tlsa(new Uint8Array([0x0a, 0xbc]))
      const tlsaJson = { _tag: "TLSA", certUsage: 3, selector: 1, matchingType: 1, data: "0abc" }
      assert.deepStrictEqual(Schema.encodeSync(codec)(record), tlsaJson)
      assert.isTrue(Equal.equals(Schema.decodeUnknownSync(codec)(tlsaJson), record))
      assert.throws(() => Schema.decodeUnknownSync(codec)({ ...tlsaJson, data: "" }))
    })
  })

  describe("service", () => {
    for (const method of ["lookup", "resolve"] as const) {
      it.effect(`normalizes string inputs before ${method}`, () =>
        Effect.gen(function*() {
          const dns = Dns.make({
            lookup: (host) => Effect.succeed(host === "xn--bcher-kva.example." ? [ip("10.0.0.1")] : []),
            resolve: (host) =>
              Effect.succeed(
                host === "xn--bcher-kva.example."
                  ? [Dns.makeRecordUnsafe("TXT", { chunks: ["normalized"] })]
                  : []
              )
          })
          const result = method === "lookup"
            ? yield* dns.lookup("Bücher.Example.").pipe(Effect.map((addresses) => addresses.map(NetAddress.formatIp)))
            : yield* dns.resolve("Bücher.Example.", "TXT").pipe(Effect.map((records) => records.map(Dns.formatRecord)))
          assert.deepStrictEqual(result, method === "lookup" ? ["10.0.0.1"] : ["TXT \"normalized\""])
        }))

      it.effect(`reports invalid ${method} string inputs as BadName`, () =>
        Effect.gen(function*() {
          const dns = Dns.make({
            lookup: () => Effect.succeed([ip("10.0.0.1")]),
            resolve: () => Effect.succeed([Dns.makeRecordUnsafe("TXT", { chunks: ["valid"] })])
          })
          const error = method === "lookup"
            ? yield* Effect.flip(dns.lookup("not a name"))
            : yield* Effect.flip(dns.resolve("not a name", "TXT"))
          assert.strictEqual(error._tag, "DnsError")
          assert.strictEqual(error.reason, "BadName")
          assert.strictEqual(error.method, method)
          assert.strictEqual(error.hostname, "not a name")
          assert.strictEqual(error.recordType, method === "lookup" ? undefined : "TXT")
        }))
    }

    it.effect("parses reverse lookup addresses given as strings", () =>
      Effect.gen(function*() {
        const seen: Array<string> = []
        const dns = Dns.make({
          lookup: () => Effect.succeed([]),
          reverse: (address) => {
            seen.push(NetAddress.formatIp(address))
            return Effect.succeed(["host.example."])
          }
        })
        assert.deepStrictEqual<ReadonlyArray<string>>(yield* dns.reverse("2001:DB8::1"), ["host.example."])
        assert.deepStrictEqual(seen, ["2001:db8::1"])
        const error = yield* Effect.flip(dns.reverse("not an address"))
        assert.deepStrictEqual([error.reason, error.method, error.hostname], ["BadName", "reverse", "not an address"])
        assert.deepStrictEqual(seen, ["2001:db8::1"])
      }))

    it.effect("filters and deduplicates results, and fails on empty results", () =>
      Effect.gen(function*() {
        const dns = Dns.make({
          lookup: () => Effect.succeed([ip("10.0.0.1"), ip("::1"), ip("10.0.0.1")]),
          resolve: () => Effect.succeed([])
        })
        const all = yield* dns.lookup("a.b")
        assert.deepStrictEqual(all.map(NetAddress.formatIp), ["10.0.0.1", "::1"])
        const v6 = yield* dns.lookup("a.b", { family: "IPv6" })
        assert.deepStrictEqual(v6.map(NetAddress.formatIp), ["::1"])
        const error = yield* Effect.flip(dns.resolve("a.b", "MX"))
        assert.strictEqual(error.reason, "NotFound")
      }))

    it.effect("reports record queries as unsupported without a resolve operation", () =>
      Effect.gen(function*() {
        const dns = Dns.make({ lookup: () => Effect.succeed([ip("10.0.0.1")]) })
        const addresses = yield* dns.lookup("a.b")
        assert.deepStrictEqual(addresses.map(NetAddress.formatIp), ["10.0.0.1"])
        const resolve = yield* Effect.flip(dns.resolve("a.b", "TXT"))
        assert.strictEqual(resolve.reason, "Unsupported")
        assert.strictEqual(resolve.method, "resolve")
        assert.strictEqual(resolve.hostname, "a.b")
        assert.strictEqual(resolve.recordType, "TXT")
        const reverse = yield* Effect.flip(dns.reverse(ip("192.0.2.1")))
        assert.strictEqual(reverse.reason, "Unsupported")
        assert.strictEqual(reverse.method, "reverse")
        assert.strictEqual(reverse.hostname, "192.0.2.1")
      }))

    it.effect("derives reverse lookups from PTR queries", () =>
      Effect.gen(function*() {
        const dns = Dns.make({
          lookup: () => Effect.succeed([]),
          resolve: (hostname, type) =>
            hostname === "1.2.0.192.in-addr.arpa"
              ? Effect.succeed([
                Dns.makeRecordUnsafe("PTR", { host: "web.example.com." }),
                Dns.makeRecordUnsafe("PTR", { host: "not a host.example.com." })
              ])
              : Effect.fail(
                new Dns.DnsError({ reason: "ServerFailure", method: "resolve", hostname, recordType: type })
              )
        })
        assert.deepStrictEqual<ReadonlyArray<string>>(yield* dns.reverse(ip("192.0.2.1")), ["web.example.com."])
        const error = yield* Effect.flip(dns.reverse(ip("192.0.2.2")))
        assert.strictEqual(error.reason, "ServerFailure")
        assert.strictEqual(error.method, "reverse")
        assert.strictEqual(error.hostname, "192.0.2.2")
      }))

    it.effect("answers from a static zone", () =>
      Effect.gen(function*() {
        const dns = yield* Dns.Dns
        const addresses = yield* dns.lookup("DB.internal.")
        assert.deepStrictEqual(addresses.map(NetAddress.formatIp), ["10.0.0.5"])
        const records = yield* dns.resolve("example.com", "MX")
        assert.deepStrictEqual(records.map(Dns.formatRecord), ["MX 10 mail.example.com"])
        assert.deepStrictEqual<ReadonlyArray<string>>(yield* dns.reverse(ip("10.0.0.5")), ["db.internal"])
        const missing = yield* Effect.flip(dns.lookup("missing.internal"))
        assert.strictEqual(missing.reason, "NotFound")
      }).pipe(Effect.provide(Dns.layerStatic({
        hosts: { "db.internal": ["10.0.0.5"] },
        records: {
          "example.com": [Dns.makeRecordUnsafe("MX", { exchange: name("mail.example.com"), priority: 10 })]
        }
      }))))

    it.effect("converts static host address inputs", () =>
      Effect.gen(function*() {
        const dns = yield* Effect.fromResult(Dns.makeStatic({
          hosts: { "db.internal": ["10.0.0.5", [10, 0, 0, 6], ip("fd00::5")] }
        }))
        const addresses = yield* dns.lookup("db.internal")
        assert.deepStrictEqual(addresses.map(NetAddress.formatIp), ["10.0.0.5", "10.0.0.6", "fd00::5"])
        const invalid = Dns.makeStatic({ hosts: { "db.internal": ["not-an-ip"] } })
        assert.isTrue(Result.isFailure(invalid) && invalid.failure.input === "not-an-ip")
      }))
  })

  describe("nameServerFromString", () => {
    it("parses IP addresses with and without a port", () => {
      const format = (input: string) => Result.map(Dns.nameServerFromString(input), NetAddress.formatInet)
      assert.deepStrictEqual(
        ["192.0.2.53", "192.0.2.53:5353", "2001:db8::53", "[2001:db8::53]:5353", "fe80::1%2"].map(format),
        [
          Result.succeed("192.0.2.53:53"),
          Result.succeed("192.0.2.53:5353"),
          Result.succeed("[2001:db8::53]:53"),
          Result.succeed("[2001:db8::53]:5353"),
          Result.succeed("[fe80::1%2]:53")
        ]
      )
      for (const input of ["ns.example", "ns.example:53", "192.0.2.53:", "[2001:db8::53]", "192.0.2.256", ""]) {
        assert.isTrue(Result.isFailure(Dns.nameServerFromString(input)), input)
      }
    })
  })

  describe("nameServerFromInput", () => {
    it("parses strings, converts address inputs, and uses port 53 for IP addresses", () => {
      const inet = NetAddress.inetAddressFromStringUnsafe("192.0.2.53:5353")
      const format = (input: NetAddress.IpAddressInput | NetAddress.InetAddressInput) =>
        Result.map(Dns.nameServerFromInput(input), NetAddress.formatInet)
      assert.deepStrictEqual(
        [
          "2001:db8::53",
          NetAddress.ipFromStringUnsafe("192.0.2.53"),
          [192, 0, 2, 53] as const,
          inet,
          { address: "2001:db8::53", port: 5353 }
        ].map(format),
        [
          Result.succeed("[2001:db8::53]:53"),
          Result.succeed("192.0.2.53:53"),
          Result.succeed("192.0.2.53:53"),
          Result.succeed("192.0.2.53:5353"),
          Result.succeed("[2001:db8::53]:5353")
        ]
      )
      assert.strictEqual(Result.getOrThrow(Dns.nameServerFromInput(inet)), inet)
      for (
        const input of ["ns.example", [192, 0, 2] as unknown as NetAddress.IpAddressInput, { address: "ns", port: 53 }]
      ) {
        assert.isTrue(Result.isFailure(Dns.nameServerFromInput(input)), JSON.stringify(input))
      }
    })
  })
})
