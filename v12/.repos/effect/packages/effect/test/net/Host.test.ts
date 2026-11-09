import { assert, describe, it } from "@effect/vitest"
import { assertTrue } from "@effect/vitest/utils"
import { Equal, Hash, Result, Schema } from "effect"
import * as Host from "effect/net/Host"
import * as NetAddress from "effect/net/NetAddress"

const success = <A>(result: Result.Result<A, unknown>): A => {
  assertTrue(Result.isSuccess(result), "expected Success")
  return result.success
}

const failure = <E>(result: Result.Result<unknown, E>): E => {
  assertTrue(Result.isFailure(result), "expected Failure")
  return result.failure
}

describe("Host", () => {
  it("normalizes domain names", () => {
    assert.strictEqual(success(Host.domainNameFromString("Example.COM.")), "example.com.")
    assert.strictEqual(success(Host.domainNameFromString("_pg._tcp.DB.internal")), "_pg._tcp.db.internal")
    assert.strictEqual(success(Host.domainNameFromString("Bücher.Example")), "xn--bcher-kva.example")
    assert.strictEqual(success(Host.domainNameFromString("=\u0338.example")), "xn--1ch.example")
  })

  it("makes domain names fully qualified", () => {
    for (const input of ["example.com", "example.com.", "."]) {
      const name = Host.toFullyQualified(Host.domainNameFromStringUnsafe(input))
      assert.strictEqual(name, input.endsWith(".") ? input : `${input}.`)
      assertTrue(Host.isFullyQualified(name))
    }
  })

  it("makes domain names relative", () => {
    for (const [input, expected] of [["example.com.", "example.com"], ["example.com", "example.com"], [".", "."]]) {
      assert.strictEqual(Host.toRelative(Host.domainNameFromStringUnsafe(input)), expected)
    }
  })

  it("rejects malformed domain names", () => {
    for (const input of ["", "a..b", "-bad.com", "a b.com", "1.2.3.4", `${"a".repeat(64)}.com`, "xn--a.\u212A"]) {
      failure(Host.domainNameFromString(input))
    }
  })

  it("parses hosts", () => {
    assert.isTrue(NetAddress.isIpv4Address(success(Host.hostFromString("10.0.0.5"))))
    assert.strictEqual<unknown>(success(Host.hostFromString("FE80:0::1%eth0")), "fe80::1%eth0")
    assert.strictEqual<unknown>(success(Host.hostFromString("DB.internal")), "db.internal")
    failure(Host.hostFromString("10.0.0.1%eth0"))
  })

  it("parses and formats endpoints", () => {
    for (
      const [input, expected] of [
        ["DB.internal:5432", "db.internal:5432"],
        ["[2001:DB8::1]:443", "[2001:db8::1]:443"],
        ["[fe80::1%eth0]:80", "[fe80::1%eth0]:80"]
      ] as const
    ) {
      assert.strictEqual(Host.formatHostPort(success(Host.hostPortFromString(input))), expected)
    }
    for (const input of ["example.com", "example.com:65536", "::1:80", "[example.com]:80"]) {
      failure(Host.hostPortFromString(input))
    }
  })

  it("implements equality and hashing for endpoints", () => {
    const a = success(Host.hostPortFromString("example.com:80"))
    const b = success(Host.hostPortFromString("EXAMPLE.com:80"))
    assert.isTrue(Equal.equals(a, b))
    assert.strictEqual(Hash.hash(a), Hash.hash(b))
    assert.isFalse(Equal.equals(a, success(Host.hostPortFromString("example.com:81"))))
  })

  it("decodes and encodes schemas", () => {
    const host = Schema.decodeUnknownSync(Schema.HostFromString)("2001:DB8::1")
    assert.strictEqual(Schema.encodeSync(Schema.HostFromString)(host), "2001:db8::1")
    const endpoint = Schema.decodeUnknownSync(Schema.HostPortFromString)("DB.internal:5432")
    assert.strictEqual(Schema.encodeSync(Schema.HostPortFromString)(endpoint), "db.internal:5432")
    assert.throws(() => Schema.decodeUnknownSync(Schema.Host)("DB.internal"))
  })
})

describe("fromInput", () => {
  it("parses strings and returns values unchanged", () => {
    const address = success(NetAddress.ipFromString("192.0.2.1"))
    const endpoint = success(Host.hostPortFromString("Example.COM:443"))

    assert.strictEqual(success(Host.domainNameFromInput("Example.COM.")), "example.com.")
    assert.strictEqual(Host.formatHost(success(Host.hostFromInput("DB.internal"))), "db.internal")
    assertTrue(Equal.equals(success(Host.hostFromInput("192.0.2.1")), address))
    assertTrue(Equal.equals(success(Host.hostPortFromInput("example.com:443")), endpoint))

    assert.strictEqual(success(Host.hostFromInput(address)), address)
    assert.strictEqual(success(Host.hostPortFromInput(endpoint)), endpoint)

    failure(Host.domainNameFromInput("bad name"))
    failure(Host.hostFromInput("bad name"))
    failure(Host.hostPortFromInput("example.com"))
  })

  it("converts IP address inputs and parts", () => {
    const address = success(NetAddress.ipFromString("192.0.2.1"))

    assertTrue(Equal.equals(success(Host.hostFromInput([192, 0, 2, 1])), address))
    assertTrue(Equal.equals(
      success(Host.hostPortFromInput({ host: "Example.COM", port: 443 })),
      success(Host.hostPortFromString("example.com:443"))
    ))
    assertTrue(Equal.equals(
      success(Host.hostPortFromInput({ host: new Uint8Array([192, 0, 2, 1]), port: 53 })),
      success(Host.hostPortFromString("192.0.2.1:53"))
    ))

    failure(Host.hostFromInput(new Uint8Array(5)))
    failure(Host.hostPortFromInput({ host: "bad name", port: 443 }))
    failure(Host.hostPortFromInput({ host: "example.com", port: 65536 }))
  })

  it("has unsafe variants that throw on failure", () => {
    const endpoint = Host.hostPortFromStringUnsafe("example.com:443")
    assert.strictEqual(Host.domainNameFromInputUnsafe("Example.COM"), "example.com")
    assert.strictEqual(Host.formatHost(Host.hostFromInputUnsafe("DB.internal")), "db.internal")
    assert.strictEqual(Host.hostPortFromInputUnsafe(endpoint), endpoint)
    assert.throws(() => Host.domainNameFromInputUnsafe("bad name"))
    assert.throws(() => Host.hostFromInputUnsafe("bad name"))
    assert.throws(() => Host.hostPortFromInputUnsafe("example.com"))
  })
})

describe("parseHostsFile", () => {
  it("reads addresses and aliases", () => {
    const hosts = Host.parseHostsFile([
      "127.0.0.1   localhost",
      "::1         localhost ip6-localhost # loopback",
      "# 192.0.2.9 commented.example",
      "192.0.2.1   DB.Example.  db",
      "192.0.2.1   db",
      "fe80::1%eth0 router",
      "not-an-ip   ignored.example",
      "192.0.2.2   bad..name good.example",
      "192.0.2.3"
    ].join("\n"))
    assert.deepStrictEqual(
      Object.fromEntries([...hosts].map(([name, addresses]) => [name, addresses.map(NetAddress.formatIp)])),
      {
        localhost: ["127.0.0.1", "::1"],
        "ip6-localhost": ["::1"],
        "db.example": ["192.0.2.1"],
        db: ["192.0.2.1"],
        "good.example": ["192.0.2.2"]
      }
    )
  })
})
