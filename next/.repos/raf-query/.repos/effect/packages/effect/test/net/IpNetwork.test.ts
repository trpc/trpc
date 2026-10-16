import { assert, describe, it } from "@effect/vitest"
import { assertTrue } from "@effect/vitest/utils"
import { Equal, Hash, Result, Schema } from "effect"
import * as IpInterface from "effect/net/IpInterface"
import * as IpNetwork from "effect/net/IpNetwork"
import * as NetAddress from "effect/net/NetAddress"
import * as fc from "fast-check"
import { inspect } from "node:util"

const success = <A>(result: Result.Result<A, unknown>): A => {
  assertTrue(Result.isSuccess(result), "expected Success")
  return result.success
}

const failure = <E>(result: Result.Result<unknown, E>): E => {
  assertTrue(Result.isFailure(result), "expected Failure")
  return result.failure
}

const ip = (input: string): NetAddress.IpAddress => success(NetAddress.ipFromString(input))
const network = (input: string): IpNetwork.IpNetwork => success(IpNetwork.fromString(input))

describe("IpNetwork", () => {
  it("serializes and inspects canonical strings", () => {
    for (const expected of ["192.0.2.0/24", "2001:db8::/32"]) {
      const address = IpNetwork.fromStringUnsafe(expected)
      assert.strictEqual(address.toJSON(), expected)
      assert.strictEqual(JSON.stringify(address), JSON.stringify(expected))
      assert.strictEqual(inspect(address), expected)
    }
  })

  it("retains the address supplied to checked constructors", () => {
    const address = NetAddress.ipv4Loopback
    assert.strictEqual(failure(IpNetwork.make(address, 33)).input, address)
    assert.strictEqual(failure(IpNetwork.make(address, 8)).input, address)
    assert.strictEqual(failure(IpNetwork.fromAddress(address, 33)).input, address)
  })

  it("forwards errors from address and prefix validation", () => {
    for (const parse of [IpNetwork.fromString, IpNetwork.ipv4FromString]) {
      assert.strictEqual(failure(parse("1.2.3.4/+24")).input, "1.2.3.4/+24")
      assert.strictEqual(failure(parse("010.2.3.4/24")).input, "010.2.3.4")
      assert.deepStrictEqual(failure(parse("1.2.3.4/33")).input, ip("1.2.3.4"))
    }
    for (const parse of [IpNetwork.fromString, IpNetwork.ipv6FromString]) {
      assert.strictEqual(failure(parse("::ffff:192.000.2.1/128")).input, "192.000.2.1")
    }
  })

  it("constructs immutable canonical networks and preserves family identity", () => {
    const ipv4 = IpNetwork.makeUnsafe(NetAddress.ipv4Unspecified, 0)
    const ipv6 = IpNetwork.makeUnsafe(NetAddress.ipv6Unspecified, 0)
    assert.isTrue(Object.isFrozen(ipv4))
    assert.isTrue(Object.isFrozen(ipv6))
    assert.isTrue(IpNetwork.isIpv4Network(ipv4))
    assert.isTrue(IpNetwork.isIpv6Network(ipv6))
    assert.strictEqual(ipv4._tag, "IpNetwork")
    assert.strictEqual(ipv6._tag, "IpNetwork")
    assert.isFalse(IpNetwork.isIpv4Network(ipv6))
    assert.isFalse(IpNetwork.isIpv6Network(ipv4))
    assert.isTrue(IpNetwork.isIpNetwork(ipv4))
    assert.isFalse(Equal.equals(ipv4, ipv6))
    assert.strictEqual(ipv4.toString(), "0.0.0.0/0")
    assert.strictEqual(ipv6.toString(), "::/0")
  })

  it("rejects invalid prefix lengths and host bits", () => {
    const ipv4 = ip("10.1.2.3")
    const ipv6 = ip("2001:db8::1")
    for (const prefix of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 33]) {
      failure(IpNetwork.make(ipv4, prefix))
      failure(IpNetwork.fromAddress(ipv4, prefix))
    }
    failure(IpNetwork.make(ipv6, 129))
    assert.deepStrictEqual(failure(IpNetwork.fromString("10.1.2.3/8")).input, ipv4)
    failure(IpNetwork.make(ipv4, 8))
    failure(IpNetwork.make(ipv6, 32))

    const error = failure(IpNetwork.make(ipv4, -1))
    assert.strictEqual(error._tag, "NetAddressError")
    assert.strictEqual(error.message, "prefix length must be an integer from 0 through 32")
  })

  it("explicitly truncates byte-aligned and partial-byte host addresses", () => {
    assert.strictEqual(IpNetwork.format(success(IpNetwork.fromAddress(ip("10.1.2.3"), 8))), "10.0.0.0/8")
    assert.strictEqual(IpNetwork.format(success(IpNetwork.fromAddress(ip("192.0.2.255"), 25))), "192.0.2.128/25")
    assert.strictEqual(
      IpNetwork.format(success(IpNetwork.fromAddress(ip("2001:db8:0:1:ffff::1"), 63))),
      "2001:db8::/63"
    )
    assert.strictEqual(
      IpNetwork.format(success(IpNetwork.fromAddress(ip("2001:db8:0:1:ffff::1"), 65))),
      "2001:db8:0:1:8000::/65"
    )
  })

  it("requires derived addresses to revalidate refinements", () => {
    const multicast = NetAddress.ipv4FromBytesUnsafe(new Uint8Array([224, 0, 0, 1]))
    if (!NetAddress.isMulticast(multicast)) throw new Error("expected multicast test address")
    const direct = IpNetwork.fromAddressUnsafe(multicast, 0)
    const viaInterface = IpNetwork.fromInterface(IpInterface.makeUnsafe(multicast, 0))
    for (const derived of [direct, viaInterface]) {
      assert.strictEqual(NetAddress.formatIp(derived.address), "0.0.0.0")
      assert.isFalse(NetAddress.isMulticast(derived.address))
      const last = IpNetwork.lastAddress(derived)
      assert.strictEqual(NetAddress.formatIp(last), "255.255.255.255")
      assert.isFalse(NetAddress.isMulticast(last))
    }

    const unspecifiedNetwork = IpNetwork.makeUnsafe(NetAddress.ipv4Unspecified, 0)
    const broadcast = IpNetwork.lastAddress(unspecifiedNetwork)
    assert.isFalse(NetAddress.isUnspecified(broadcast))
    assert.isTrue(NetAddress.isBroadcast(broadcast))

    const loopback = ip("::1")
    assert.isTrue(NetAddress.isLoopback(loopback))
    if (NetAddress.isLoopback(loopback)) {
      const directLoopback = IpNetwork.fromAddressUnsafe(loopback, 64)
      const interfaceLoopback = IpNetwork.fromInterface(IpInterface.makeUnsafe(loopback, 64))
      for (const derived of [directLoopback, interfaceLoopback]) {
        assert.strictEqual(NetAddress.formatIp(derived.address), "::")
        assert.isFalse(NetAddress.isLoopback(derived.address))
        assert.isTrue(NetAddress.isUnspecified(derived.address))
      }
    }
  })

  it("parses strict CIDR and formats canonical address text", () => {
    assert.strictEqual(IpNetwork.format(network("192.0.2.0/24")), "192.0.2.0/24")
    assert.strictEqual(
      IpNetwork.format(network("2001:0DB8:0000:0000:0000:0000:0000:0000/32")),
      "2001:db8::/32"
    )
    assert.strictEqual(IpNetwork.format(network("::ffff:192.0.2.0/120")), "::ffff:192.0.2.0/120")
  })

  it("rejects malformed and non-network CIDR input", () => {
    for (
      const input of [
        "1.2.3.4",
        "1.2.3.4/",
        "/24",
        "1.2.3.4/24/1",
        "1.2.3.4/+24",
        "1.2.3.4/024",
        "1.2.3.4/24 ",
        "1.2.3.4/1e1",
        "1.2.3.4/33",
        "10.1.2.3/8",
        "2001:db8::1/32"
      ]
    ) {
      failure(IpNetwork.fromString(input))
    }
    const parseError = failure(IpNetwork.fromString("1.2.3.4/+24"))
    assert.strictEqual(parseError.message, "prefix length must be an unpadded ASCII decimal integer")
    failure(IpNetwork.ipv4FromString("::/0"))
    failure(IpNetwork.ipv6FromString("0.0.0.0/0"))
  })

  it("uses numeric equality and matching hashes", () => {
    const first = network("2001:0DB8:0:0:0:0:0:0/32")
    const second = network("2001:db8::/32")
    assert.isTrue(Equal.equals(first, second))
    assert.strictEqual(Hash.hash(first), Hash.hash(second))
    assert.isFalse(Equal.equals(first, network("2001:db8::/33")))
  })

  it("computes first, last, and exact address counts", () => {
    const ipv4All = network("0.0.0.0/0")
    const ipv6All = network("::/0")
    assert.strictEqual(NetAddress.formatIp(IpNetwork.firstAddress(ipv4All)), "0.0.0.0")
    assert.strictEqual(NetAddress.formatIp(IpNetwork.lastAddress(ipv4All)), "255.255.255.255")
    assert.strictEqual(IpNetwork.addressCount(ipv4All), BigInt(1) << BigInt(32))
    assert.strictEqual(NetAddress.formatIp(IpNetwork.lastAddress(ipv6All)), "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")
    assert.strictEqual(IpNetwork.addressCount(ipv6All), BigInt(1) << BigInt(128))

    const ipv4Pair = network("192.0.2.0/31")
    assert.strictEqual(NetAddress.formatIp(IpNetwork.lastAddress(ipv4Pair)), "192.0.2.1")
    assert.strictEqual(IpNetwork.addressCount(ipv4Pair), BigInt(2))
    assert.strictEqual(NetAddress.formatIp(IpNetwork.lastAddress(network("192.0.2.128/25"))), "192.0.2.255")
    const ipv6Pair = network("2001:db8::/127")
    assert.strictEqual(NetAddress.formatIp(IpNetwork.lastAddress(ipv6Pair)), "2001:db8::1")
    assert.strictEqual(IpNetwork.addressCount(ipv6Pair), BigInt(2))
    assert.strictEqual(
      NetAddress.formatIp(IpNetwork.lastAddress(network("2001:db8:0:1:8000::/65"))),
      "2001:db8:0:1:ffff:ffff:ffff:ffff"
    )

    const ipv4Host = network("255.255.255.255/32")
    assert.strictEqual(NetAddress.formatIp(IpNetwork.lastAddress(ipv4Host)), "255.255.255.255")
    assert.strictEqual(IpNetwork.addressCount(ipv4Host), BigInt(1))
  })

  it("checks address containment in data-first and data-last forms", () => {
    const self = network("192.0.2.0/25")
    assert.isTrue(IpNetwork.contains(self, ip("192.0.2.0")))
    assert.isTrue(IpNetwork.contains(self, ip("192.0.2.64")))
    assert.isTrue(IpNetwork.contains(ip("192.0.2.127"))(self))
    assert.isFalse(IpNetwork.contains(self, ip("192.0.1.255")))
    assert.isFalse(IpNetwork.contains(self, ip("192.0.2.128")))
    assert.isFalse(IpNetwork.contains(self, ip("::ffff:192.0.2.1")))
  })

  it("checks network containment and overlap", () => {
    const parent = network("2001:db8::/63")
    const child = network("2001:db8:0:1:8000::/65")
    const sibling = network("2001:db8:0:1::/65")
    const disjoint = network("2001:db8:0:2::/63")
    assert.isTrue(IpNetwork.containsNetwork(parent, parent))
    assert.isTrue(IpNetwork.containsNetwork(child)(parent))
    assert.isFalse(IpNetwork.containsNetwork(child, parent))
    assert.isTrue(IpNetwork.overlaps(parent, child))
    assert.isTrue(IpNetwork.overlaps(child, parent))
    assert.isFalse(IpNetwork.overlaps(child, sibling))
    assert.isFalse(IpNetwork.overlaps(parent, disjoint))
    assert.isFalse(IpNetwork.overlaps(parent, network("0.0.0.0/0")))
  })

  it("provides checked unsafe wrappers", () => {
    assert.strictEqual(IpNetwork.format(IpNetwork.fromAddressUnsafe(ip("10.1.2.3"), 8)), "10.0.0.0/8")
    assert.strictEqual(IpNetwork.format(IpNetwork.fromStringUnsafe("10.0.0.0/8")), "10.0.0.0/8")
    assert.throws(() => IpNetwork.makeUnsafe(ip("10.1.2.3"), 8))
    assert.throws(() => IpNetwork.fromAddressUnsafe(ip("10.1.2.3"), 33))
    assert.throws(() => IpNetwork.fromStringUnsafe("10.1.2.3/8"))
  })

  it("decodes declarations and canonically encodes Schema strings", () => {
    const ipv6 = Schema.decodeUnknownSync(Schema.Ipv6NetworkFromString)(
      "2001:0DB8:0000:0000:0000:0000:0000:0000/32"
    )
    assert.strictEqual(Schema.encodeSync(Schema.Ipv6NetworkFromString)(ipv6), "2001:db8::/32")
    assert.strictEqual(
      IpNetwork.format(Schema.decodeUnknownSync(Schema.IpNetworkFromString)("192.0.2.0/24")),
      "192.0.2.0/24"
    )
    assert.throws(() => Schema.decodeUnknownSync(Schema.IpNetworkFromString)("192.0.2.1/24"))
    assert.throws(() =>
      Schema.decodeUnknownSync(Schema.IpNetwork)({ _tag: "IpNetwork", address: ip("192.0.2.0"), prefixLength: 24 })
    )
  })

  it("matches independent range models for generated networks", () => {
    fc.assert(fc.property(
      fc.tuple(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 32 })
      ),
      ([a, b, c, d, prefix]) => {
        const address = success(NetAddress.ipv4FromOctets([a, b, c, d]))
        const value = success(IpNetwork.fromAddress(address, prefix))
        const input = (((a * 256 + b) * 256 + c) * 256 + d) >>> 0
        const hostBits = 32 - prefix
        const hostMask = hostBits === 32 ? 0xffffffff : 2 ** hostBits - 1
        const first = (input & ~hostMask) >>> 0
        const last = (first | hostMask) >>> 0
        const parsed = success(IpNetwork.fromString(IpNetwork.format(value)))
        const firstAddress = IpNetwork.firstAddress(value)
        const lastAddress = IpNetwork.lastAddress(value)
        if (!NetAddress.isIpv4Address(firstAddress) || !NetAddress.isIpv4Address(lastAddress)) {
          assert.fail("expected IPv4 bounds")
        }
        assert.isTrue(Equal.equals(parsed, value))
        assert.deepStrictEqual(NetAddress.ipv4ToOctets(firstAddress), [
          first >>> 24,
          (first >>> 16) & 0xff,
          (first >>> 8) & 0xff,
          first & 0xff
        ])
        assert.deepStrictEqual(NetAddress.ipv4ToOctets(lastAddress), [
          last >>> 24,
          (last >>> 16) & 0xff,
          (last >>> 8) & 0xff,
          last & 0xff
        ])
        assert.strictEqual(IpNetwork.addressCount(value), BigInt(2) ** BigInt(hostBits))
        assert.isTrue(IpNetwork.contains(value, address))
      }
    ))

    fc.assert(fc.property(
      fc.tuple(
        fc.array(fc.integer({ min: 0, max: 0xffff }), { minLength: 8, maxLength: 8 }),
        fc.integer({ min: 0, max: 128 })
      ),
      ([segments, prefix]) => {
        const address = success(NetAddress.ipv6FromSegments(
          segments as [number, number, number, number, number, number, number, number]
        ))
        const value = success(IpNetwork.fromAddress(address, prefix))
        const input = segments.reduce((value, segment) => (value << BigInt(16)) | BigInt(segment), BigInt(0))
        const hostBits = BigInt(128 - prefix)
        const hostMask = (BigInt(1) << hostBits) - BigInt(1)
        const toBigInt = (address: NetAddress.Ipv6Address) =>
          NetAddress.ipv6ToSegments(address).reduce(
            (value, segment) => (value << BigInt(16)) | BigInt(segment),
            BigInt(0)
          )
        const firstAddress = IpNetwork.firstAddress(value)
        const lastAddress = IpNetwork.lastAddress(value)
        if (!NetAddress.isIpv6Address(firstAddress) || !NetAddress.isIpv6Address(lastAddress)) {
          assert.fail("expected IPv6 bounds")
        }
        assert.isTrue(Equal.equals(success(IpNetwork.fromString(IpNetwork.format(value))), value))
        assert.strictEqual(toBigInt(firstAddress), input & ~hostMask)
        assert.strictEqual(toBigInt(lastAddress), input | hostMask)
        assert.strictEqual(IpNetwork.addressCount(value), BigInt(1) << hostBits)
        assert.isTrue(IpNetwork.contains(value, address))
      }
    ))
  })
})
