import { assert, describe, it } from "@effect/vitest"
import { assertTrue } from "@effect/vitest/utils"
import { Equal, Hash, Option, Result, Schema } from "effect"
import * as NetAddress from "effect/net/NetAddress"
import { Buffer } from "node:buffer"
import { inspect } from "node:util"

const success = <A>(result: Result.Result<A, unknown>): A => {
  assertTrue(Result.isSuccess(result), "expected Success")
  return result.success
}

const failure = <E>(result: Result.Result<unknown, E>): E => {
  assertTrue(Result.isFailure(result), "expected Failure")
  return result.failure
}

describe("NetAddress", () => {
  it("returns IP address widths", () => {
    assert.strictEqual(NetAddress.width(success(NetAddress.ipv4FromString("1.2.3.4"))), 32)
    assert.strictEqual(NetAddress.width(success(NetAddress.ipv6FromString("2001:db8::1"))), 128)
  })

  describe("IPv4", () => {
    it("parses strict dotted decimal", () => {
      assert.strictEqual(NetAddress.formatIp(success(NetAddress.ipv4FromString("1.2.3.4"))), "1.2.3.4")
      assert.deepStrictEqual(NetAddress.ipv4ToOctets(success(NetAddress.ipv4FromOctets([127, 0, 0, 1]))), [
        127,
        0,
        0,
        1
      ])
    })

    it("rejects malformed inputs", () => {
      for (
        const input of [
          "",
          "127.1",
          "127.0.0.1.2",
          ".1.2.3",
          "1..2.3",
          "-1.2.3.4",
          "+1.2.3.4",
          " 1.2.3.4",
          "01.2.3.4",
          "001.002.003.004",
          "0x7f.0.0.1",
          "256.0.0.1"
        ]
      ) {
        failure(NetAddress.ipv4FromString(input))
      }
      failure(NetAddress.ipv4FromOctets([0, 0, 0, 256]))
      failure(NetAddress.ipv4FromOctets([0, 0, 0, 1.5]))
    })
  })

  describe("IPv6", () => {
    const cases = [
      ["0:0:0:0:0:0:0:0", "::"],
      ["0:0:0:0:0:0:0:1", "::1"],
      ["2001:0DB8:0000:0000:0001:0000:0000:0001", "2001:db8::1:0:0:1"],
      ["2001:db8:0:1:0:0:0:1", "2001:db8:0:1::1"],
      ["2001:0:0:1:0:0:1:1", "2001::1:0:0:1:1"],
      ["::ffff:192.0.2.128", "::ffff:192.0.2.128"],
      ["::192.0.2.128", "::c000:280"],
      ["2001:db8::192.0.2.1", "2001:db8::c000:201"]
    ] as const

    it("uses canonical compression and embedded IPv4 policy", () => {
      for (const [input, expected] of cases) {
        const parsed = success(NetAddress.ipv6FromString(input))
        assert.strictEqual(NetAddress.formatIp(parsed), expected)
        assert.isTrue(Equal.equals(parsed, success(NetAddress.ipv6FromString(expected))))
      }
    })

    it("rejects malformed inputs", () => {
      for (
        const input of [
          "",
          ":",
          ":::1",
          "1::2::3",
          "1:2:3:4:5:6:7",
          "1:2:3:4:5:6:7:8:9",
          "1:2:3:4:5:6:7:8::",
          "1:2:3:4:5:6:7::8",
          "gggg::1",
          "[::1]",
          "fe80::1%1",
          "::ffff:999.1.1.1",
          "::ffff:192.000.2.1",
          "::ffff:1.2.3",
          "192.0.2.1::"
        ]
      ) {
        failure(NetAddress.ipv6FromString(input))
      }
      failure(NetAddress.ipv6FromSegments([0, 0, 0, 0, 0, 0, 0, 65536]))
    })

    it("round trips constructed numeric values", () => {
      const values = [
        success(NetAddress.ipv6FromSegments([0, 0, 0, 0, 0, 0, 0, 0])),
        success(NetAddress.ipv6FromSegments([0x2001, 0xdb8, 0, 1, 2, 3, 4, 5])),
        success(NetAddress.ipv6FromSegments([0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff]))
      ]
      for (const value of values) {
        const encoded = NetAddress.formatIp(value)
        assert.isTrue(Equal.equals(success(NetAddress.ipv6FromString(encoded)), value))
      }
    })

    it("uses numeric equality and hash laws", () => {
      const expanded = success(NetAddress.ipv6FromString("2001:db8:0:0:0:0:0:1"))
      const compressed = success(NetAddress.ipv6FromString("2001:db8::1"))
      assert.isTrue(Equal.equals(expanded, compressed))
      assert.strictEqual(Hash.hash(expanded), Hash.hash(compressed))
    })

    it("converts mapped IPv4 addresses", () => {
      const ipv4 = success(NetAddress.ipv4FromString("192.0.2.128"))
      const mapped = NetAddress.toIpv4Mapped(ipv4)
      assert.isTrue(NetAddress.isIpv4Mapped(mapped))
      assert.strictEqual(NetAddress.formatIp(mapped), "::ffff:192.0.2.128")
      assert.isTrue(Equal.equals(Option.getOrThrow(NetAddress.fromIpv4Mapped(mapped)), ipv4))
      assert.isTrue(Option.isNone(NetAddress.fromIpv4Mapped(success(NetAddress.ipv6FromString("::1")))))
      assert.isTrue(Equal.equals(NetAddress.toCanonical(mapped), ipv4))
      assert.isTrue(Equal.equals(NetAddress.toCanonical(ipv4), ipv4))
    })

    it("returns IPv6 octets", () => {
      assert.deepStrictEqual(NetAddress.ipv6ToOctets(success(NetAddress.ipv6FromString("2001:db8::1"))), [
        0x20,
        0x01,
        0x0d,
        0xb8,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1
      ])
      assert.strictEqual(
        NetAddress.formatIp(NetAddress.ipv6FromBytesUnsafe(new Uint8Array(16))),
        "::"
      )
      assert.strictEqual(
        NetAddress.formatIp(NetAddress.ipv4FromBytesUnsafe(new Uint8Array([127, 0, 0, 1]))),
        "127.0.0.1"
      )
    })
  })

  describe("MAC", () => {
    it("parses and canonically formats six octets", () => {
      const address = success(NetAddress.macAddressFromString("02:0A:0b:0C:0d:0E"))
      assert.strictEqual(NetAddress.formatMacAddress(address), "02:0a:0b:0c:0d:0e")
      const octets = NetAddress.macAddressToOctets(address)
      assert.deepStrictEqual(octets, [2, 10, 11, 12, 13, 14])
      Reflect.set(octets, 0, 0xff)
      assert.strictEqual(NetAddress.formatMacAddress(address), "02:0a:0b:0c:0d:0e")
      assert.isTrue(NetAddress.isMacAddress(address))
      assert.isTrue(Equal.equals(address, success(NetAddress.macAddressFromOctets([2, 10, 11, 12, 13, 14]))))
      assert.strictEqual(Hash.hash(address), Hash.hash(success(NetAddress.macAddressFromString("02:0a:0b:0c:0d:0e"))))
    })

    it("rejects malformed inputs and invalid octets", () => {
      for (
        const input of [
          "",
          "00:11:22:33:44",
          "00:11:22:33:44:55:66",
          "0:11:22:33:44:55",
          "00-11-22-33-44-55",
          "0011.2233.4455",
          "gg:11:22:33:44:55"
        ]
      ) {
        failure(NetAddress.macAddressFromString(input))
      }
      failure(NetAddress.macAddressFromOctets([0, 0, 0, 0, 0, 256]))
      failure(NetAddress.macAddressFromOctets([0, 0, 0, 0, 0, 1.5]))
      assert.throws(() => NetAddress.macAddressFromStringUnsafe("invalid"))
    })

    it("classifies address bits", () => {
      const mac = (text: string) => success(NetAddress.macAddressFromString(text))
      assert.isTrue(NetAddress.isMacBroadcast(mac("ff:ff:ff:ff:ff:ff")))
      assert.isTrue(NetAddress.isMacMulticast(mac("01:00:5e:00:00:01")))
      assert.isFalse(NetAddress.isMacUnicast(mac("01:00:5e:00:00:01")))
      assert.isTrue(NetAddress.isMacUnicast(mac("00:00:5e:00:53:01")))
      assert.isTrue(NetAddress.isMacLocallyAdministered(mac("02:00:00:00:00:01")))
      assert.isFalse(NetAddress.isMacUniversallyAdministered(mac("02:00:00:00:00:01")))
      assert.isTrue(NetAddress.isMacUniversallyAdministered(mac("00:00:5e:00:53:01")))
    })
  })

  it("classifies documented address ranges at their boundaries", () => {
    const ip = (text: string) => success(NetAddress.ipFromString(text))
    assert.isTrue(NetAddress.isUnspecified(ip("0.0.0.0")))
    assert.isTrue(NetAddress.isUnspecified(ip("::")))
    assert.isTrue(NetAddress.isLoopback(ip("127.255.255.255")))
    assert.isFalse(NetAddress.isLoopback(ip("128.0.0.0")))
    assert.isTrue(NetAddress.isMulticast(ip("224.0.0.0")))
    assert.isFalse(NetAddress.isMulticast(ip("223.255.255.255")))
    assert.isTrue(NetAddress.isMulticast(ip("ff00::")))
    assert.isTrue(NetAddress.isBroadcast(NetAddress.ipv4Broadcast))
    assert.isFalse(NetAddress.isBroadcast(success(NetAddress.ipv4FromString("255.255.255.254"))))
    assert.isTrue(NetAddress.isLinkLocal(ip("169.254.255.255")))
    assert.isFalse(NetAddress.isLinkLocal(ip("169.255.0.0")))
    assert.isTrue(NetAddress.isLinkLocal(ip("febf::")))
    assert.isFalse(NetAddress.isLinkLocal(ip("fec0::")))
    assert.isTrue(NetAddress.isPrivate(success(NetAddress.ipv4FromString("10.255.255.255"))))
    assert.isTrue(NetAddress.isPrivate(success(NetAddress.ipv4FromString("172.31.255.255"))))
    assert.isTrue(NetAddress.isPrivate(success(NetAddress.ipv4FromString("192.168.0.0"))))
    assert.isFalse(NetAddress.isPrivate(success(NetAddress.ipv4FromString("172.32.0.0"))))
    assert.isTrue(NetAddress.isUniqueLocal(success(NetAddress.ipv6FromString("fc00::"))))
    assert.isTrue(
      NetAddress.isUniqueLocal(success(NetAddress.ipv6FromString("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")))
    )
    assert.isFalse(NetAddress.isUniqueLocal(success(NetAddress.ipv6FromString("fe00::"))))
    assert.isTrue(Equal.equals(NetAddress.ipv4Unspecified, ip("0.0.0.0")))
    assert.isTrue(Equal.equals(NetAddress.ipv6Unspecified, ip("::")))
  })

  describe("branded classifications", () => {
    const ip = NetAddress.ipFromStringUnsafe
    const ipv4 = (text: string) => success(NetAddress.ipv4FromString(text))
    const ipv6 = (text: string) => success(NetAddress.ipv6FromString(text))
    const mac = NetAddress.macAddressFromStringUnsafe

    it("classifies IP boundaries without claiming reachability", () => {
      for (const text of ["1.2.3.4", "127.0.0.1", "169.254.1.1", "240.0.0.1", "::1", "fe80::1"]) {
        assert.isTrue(NetAddress.isUnicast(ip(text)), text)
      }
      for (const text of ["0.0.0.0", "224.0.0.0", "255.255.255.255", "::", "ff00::"]) {
        assert.isFalse(NetAddress.isUnicast(ip(text)), text)
      }
      assert.isTrue(NetAddress.isLoopback(ip("127.0.0.0")))
      assert.isTrue(NetAddress.isLoopback(ip("127.255.255.255")))
      assert.isFalse(NetAddress.isLoopback(ip("128.0.0.0")))
      assert.isTrue(NetAddress.isLoopback(ip("::1")))
      assert.isFalse(NetAddress.isLoopback(ip("::2")))
      assert.isFalse(NetAddress.isLoopback(ip("::ffff:127.0.0.1")))
      assert.isFalse(NetAddress.isMulticast(ip("::ffff:224.0.0.1")))
      assert.isTrue(NetAddress.isLinkLocal(ip("169.254.0.0")))
      assert.isTrue(NetAddress.isLinkLocal(ip("169.254.255.255")))
      assert.isFalse(NetAddress.isLinkLocal(ip("169.255.0.0")))
      assert.isTrue(NetAddress.isLinkLocal(ip("fe80::")))
      assert.isTrue(NetAddress.isLinkLocal(ip("febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff")))
      assert.isFalse(NetAddress.isLinkLocal(ip("fec0::")))
      for (const text of ["10.0.0.0", "10.255.255.255", "172.16.0.0", "172.31.255.255", "192.168.0.0"]) {
        assert.isTrue(NetAddress.isPrivate(ipv4(text)), text)
      }
      for (const text of ["9.255.255.255", "172.15.255.255", "172.32.0.0", "192.169.0.0", "100.64.0.1"]) {
        assert.isFalse(NetAddress.isPrivate(ipv4(text)), text)
      }
      assert.isTrue(NetAddress.isUniqueLocal(ipv6("fc00::")))
      assert.isTrue(NetAddress.isUniqueLocal(ipv6("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")))
      assert.isFalse(NetAddress.isUniqueLocal(ipv6("fe00::")))
    })

    it("classifies the independent MAC group and administration bits", () => {
      const cases = [
        ["00:00:5e:00:53:01", false, false],
        ["01:00:5e:00:00:01", true, false],
        ["02:00:00:00:00:01", false, true],
        ["03:00:00:00:00:01", true, true],
        ["ff:ff:ff:ff:ff:ff", true, true]
      ] as const
      for (const [text, multicast, local] of cases) {
        const address = mac(text)
        assert.strictEqual(NetAddress.isMulticast(address), multicast)
        assert.strictEqual(NetAddress.isMacMulticast(address), multicast)
        assert.strictEqual(NetAddress.isUnicast(address), !multicast)
        assert.strictEqual(NetAddress.isMacUnicast(address), !multicast)
        assert.strictEqual(NetAddress.isMacLocallyAdministered(address), local)
        assert.strictEqual(NetAddress.isMacUniversallyAdministered(address), !local)
      }
      const broadcast = mac("ff:ff:ff:ff:ff:ff")
      assert.isTrue(NetAddress.isBroadcast(broadcast))
      assert.isTrue(NetAddress.isMacBroadcast(broadcast))
      assert.isTrue(NetAddress.isMulticast(broadcast))
      assert.isFalse(NetAddress.isBroadcast(mac("01:00:5e:00:00:01")))
      assert.isTrue(NetAddress.isBroadcast(NetAddress.ipv4Broadcast))
      assert.isFalse(NetAddress.isMulticast(NetAddress.ipv4Broadcast))
    })
  })

  it("serializes and inspects canonical strings without private bytes", () => {
    const cases = [
      [NetAddress.ipv4Loopback, "127.0.0.1"],
      [NetAddress.ipv6Loopback, "::1"],
      [NetAddress.macAddressFromStringUnsafe("02:0A:0B:0C:0D:0E"), "02:0a:0b:0c:0d:0e"],
      [NetAddress.inetAddressFromStringUnsafe("127.0.0.1:80"), "127.0.0.1:80"],
      [NetAddress.inetAddressFromStringUnsafe("[fe80::1%2]:80"), "[fe80::1%2]:80"],
      [NetAddress.unixPathAddress("./run/../server.sock"), "./run/../server.sock"]
    ] as const
    for (const [address, expected] of cases) {
      assert.strictEqual(address.toJSON(), expected)
      assert.strictEqual(JSON.stringify(address), JSON.stringify(expected))
      assert.strictEqual(JSON.stringify({ address }), JSON.stringify({ address: expected }))
      assert.strictEqual(inspect(address), expected)
    }
  })

  it("preserves the input rejected by the failing operation", () => {
    const cases = [
      [NetAddress.ipv4FromString, "01.2.3.4", "01.2.3.4"],
      [NetAddress.ipv6FromString, "::ffff:192.000.2.1", "192.000.2.1"],
      [NetAddress.macAddressFromString, "00-11-22-33-44-55", "00-11-22-33-44-55"],
      [NetAddress.inetAddressFromString, "localhost:80", "localhost"],
      [NetAddress.inetAddressFromString, "[::ffff:999.0.0.1]:80", "999.0.0.1"],
      [NetAddress.inetAddressFromString, "[fe80::1%bad]:80", "[fe80::1%bad]:80"]
    ] as const
    for (const [parse, input, rejected] of cases) {
      assert.strictEqual(failure(parse(input)).input, rejected)
    }
    assert.deepStrictEqual(failure(NetAddress.inetAddressFromString("127.0.0.1:65536")).input, NetAddress.ipv4Loopback)
    assert.strictEqual(
      failure(NetAddress.socketAddressFromInput({ address: "localhost", port: 80 })).input,
      "localhost"
    )
    assert.strictEqual(failure(NetAddress.inetAddressFromIpString("localhost", 80)).input, "localhost")
    const octets = [256, 0, 0, 1] as const
    assert.strictEqual(failure(NetAddress.ipv4FromOctets(octets)).input, octets)
  })

  it("retains the address supplied to checked socket constructors", () => {
    const ipv4 = NetAddress.ipv4Loopback
    const ipv6 = NetAddress.ipv6Loopback
    assert.strictEqual(failure(NetAddress.inetAddressV4(ipv4, -1)).input, ipv4)
    assert.strictEqual(failure(NetAddress.inetAddressV6(ipv6, -1)).input, ipv6)
    assert.strictEqual(failure(NetAddress.inetAddressV6(ipv6, 80, { scopeId: -1 })).input, ipv6)
  })

  it("converts internet addresses to normalized URL values", () => {
    for (
      const [input, scheme, expected] of [
        ["[::]:3000", "https", "https://[::]:3000/"],
        ["0.0.0.0:3000", "http", "http://0.0.0.0:3000/"],
        ["[::1]:3000", "ws", "ws://[::1]:3000/"],
        ["192.0.2.1:80", "http", "http://192.0.2.1/"],
        ["[::1]:443", "HTTPS", "https://[::1]/"],
        ["[::1]:0", "http", "http://[::1]:0/"],
        ["192.0.2.1:65535", "http", "http://192.0.2.1:65535/"]
      ]
    ) {
      const address = NetAddress.inetAddressFromStringUnsafe(input)
      const url = success(NetAddress.toUrl(address, scheme))
      assert.instanceOf(url, URL)
      assert.strictEqual(url.href, expected)
    }
    const address = NetAddress.inetAddressFromStringUnsafe("[::]:3000")
    const url = success(NetAddress.toUrl(address))
    assert.strictEqual(url.href, "http://[::]:3000/")
    url.hostname = "127.0.0.1"
    assert.strictEqual(url.origin, "http://127.0.0.1:3000")
    assert.strictEqual(success(NetAddress.toUrl(address, undefined)).hostname, "[::]")
  })

  it("converts bare IP addresses without adding an explicit port", () => {
    for (
      const [input, expected] of [
        ["127.0.0.1", "http://127.0.0.1/"],
        ["::1", "http://[::1]/"],
        ["0.0.0.0", "http://0.0.0.0/"],
        ["::", "http://[::]/"]
      ]
    ) {
      const url = success(NetAddress.toUrl(NetAddress.ipFromStringUnsafe(input)))
      assert.strictEqual(url.href, expected)
      assert.strictEqual(url.port, "")
    }
    assert.strictEqual(success(NetAddress.toUrl(NetAddress.ipv6Loopback, "https")).href, "https://[::1]/")
  })

  it("formats URL strings without trailing slashes or default ports", () => {
    assert.strictEqual(success(NetAddress.formatUrl(NetAddress.ipv4Loopback)), "http://127.0.0.1")
    assert.strictEqual(success(NetAddress.formatUrl(NetAddress.ipv6Loopback, "https")), "https://[::1]")
    assert.strictEqual(NetAddress.formatUrlUnsafe(NetAddress.ipv4Loopback), "http://127.0.0.1")
    assert.strictEqual(NetAddress.formatUrlUnsafe(NetAddress.ipv6Loopback, "https"), "https://[::1]")
    for (
      const [input, scheme, expected] of [
        ["192.0.2.1:80", "http", "http://192.0.2.1"],
        ["[::1]:443", "HTTPS", "https://[::1]"],
        ["[::]:3000", "http", "http://[::]:3000"],
        ["[::1]:0", "http", "http://[::1]:0"],
        ["127.0.0.1:80", "tcp", "tcp://127.0.0.1:80"]
      ]
    ) {
      assert.strictEqual(success(NetAddress.formatUrl(NetAddress.inetAddressFromStringUnsafe(input), scheme)), expected)
    }
    const scoped = NetAddress.inetAddressFromStringUnsafe("[fe80::1%2]:3000")
    const scopedError = failure(NetAddress.formatUrl(scoped))
    assert.strictEqual(scopedError.input, scoped)
    assert.include(scopedError.message, "scoped IPv6")
    const schemeError = failure(NetAddress.formatUrl(NetAddress.ipv4Loopback, "1http"))
    assert.strictEqual(schemeError.input, NetAddress.ipv4Loopback)
    assert.instanceOf(schemeError.cause, TypeError)
    assert.throws(() => NetAddress.formatUrlUnsafe(scoped), NetAddress.NetAddressError, "scoped IPv6")
    assert.throws(() => NetAddress.formatUrlUnsafe(NetAddress.ipv4Loopback, "1http"), NetAddress.NetAddressError)
  })

  it("formats Unix socket paths without encoding or normalizing them", () => {
    for (
      const [path, expected] of [
        ["/tmp/server.sock", "unix:///tmp/server.sock"],
        ["./run/../server.sock", "unix://./run/../server.sock"],
        ["/tmp/socket?#%20", "unix:///tmp/socket?#%20"],
        ["/tmp/socket with spaces.sock", "unix:///tmp/socket with spaces.sock"],
        ["", "unix://"]
      ]
    ) {
      const address = NetAddress.unixPathAddress(path)
      assert.strictEqual(NetAddress.formatUnixPath(address), expected)
      assert.strictEqual(success(NetAddress.formatUrl(address)), expected)
      assert.strictEqual(NetAddress.formatUrlUnsafe(address, "https"), expected)
    }
  })

  it("returns URL conversion errors for scopes and rejected URLs", () => {
    for (const input of ["[fe80::1%2]:3000", "[::%2]:3000"]) {
      const scoped = NetAddress.inetAddressFromStringUnsafe(input)
      const error = failure(NetAddress.toUrl(scoped, "http"))
      assert.instanceOf(error, NetAddress.NetAddressError)
      assert.strictEqual(error.input, scoped)
      assert.include(error.message, "scoped IPv6")
      assert.isUndefined(error.cause)
    }
    const address = NetAddress.inetAddressFromStringUnsafe("127.0.0.1:80")
    for (const scheme of ["", "1http", "file"]) {
      const error = failure(NetAddress.toUrl(address, scheme))
      assert.instanceOf(error, NetAddress.NetAddressError)
      assert.strictEqual(error.input, address)
      assert.strictEqual(error.message, "failed to construct URL")
      assert.instanceOf(error.cause, TypeError)
    }
  })

  it("canonicalizes mapped internet addresses while retaining their port", () => {
    const ipv4 = success(NetAddress.ipv4FromString("192.0.2.128"))
    const expected = success(NetAddress.inetAddressV4(ipv4, 4567))
    for (const scopeId of [0, 7]) {
      const mapped = success(NetAddress.inetAddressV6(NetAddress.toIpv4Mapped(ipv4), 4567, { scopeId }))
      const canonical: NetAddress.InetAddress = NetAddress.toCanonical(mapped)
      assert.isTrue(NetAddress.isInetAddressV4(canonical))
      assert.isTrue(Equal.equals(canonical, expected))
      assert.strictEqual(Hash.hash(canonical), Hash.hash(expected))
      assert.strictEqual(NetAddress.toCanonical(canonical), canonical)
    }
  })

  it("retains identity and scope for internet addresses that need no canonicalization", () => {
    const scoped = success(
      NetAddress.inetAddressV6(success(NetAddress.ipv6FromString("fe80::1")), 1234, { scopeId: 3 })
    )
    for (const address of [success(NetAddress.inetAddressV4(NetAddress.ipv4Loopback, 1234)), scoped]) {
      assert.strictEqual(NetAddress.toCanonical(address), address)
    }
    assert.strictEqual(NetAddress.toCanonical(scoped.address), scoped.address)
  })

  it("constructs immutable address values", () => {
    const ipv4 = success(NetAddress.ipv4FromString("127.0.0.1"))
    const ipv6 = success(NetAddress.ipv6FromString("::1"))
    const inet4 = success(NetAddress.inetAddressV4(ipv4, 80))
    const inet6 = success(NetAddress.inetAddressV6(ipv6, 80, { scopeId: 2 }))
    const mac = success(NetAddress.macAddressFromString("00:00:5e:00:53:01"))
    const unix = NetAddress.unixPathAddress("server.sock")

    for (const address of [ipv4, ipv6, inet4, inet6, mac, unix]) {
      assert.isTrue(Object.isFrozen(address))
    }
  })

  it("copies byte constructor inputs", () => {
    const ipv4Bytes = new Uint8Array([127, 0, 0, 1])
    const ipv6Bytes = new Uint8Array(16)
    ipv6Bytes[15] = 1
    const ipv4 = NetAddress.ipv4FromBytesUnsafe(ipv4Bytes)
    const ipv6 = NetAddress.ipv6FromBytesUnsafe(ipv6Bytes)
    const ipv4Hash = Hash.hash(ipv4)
    const ipv6Hash = Hash.hash(ipv6)

    ipv4Bytes[0] = 1
    ipv6Bytes[15] = 2

    assert.strictEqual(NetAddress.formatIp(ipv4), "127.0.0.1")
    assert.strictEqual(NetAddress.formatIp(ipv6), "::1")
    assert.strictEqual(Hash.hash(ipv4), ipv4Hash)
    assert.strictEqual(Hash.hash(ipv6), ipv6Hash)
  })

  it("copies Buffer constructor inputs", () => {
    const ipv4Bytes = Buffer.from([127, 0, 0, 1])
    const ipv6Bytes = Buffer.alloc(16)
    ipv6Bytes[15] = 1
    const ipv4 = NetAddress.ipv4FromBytesUnsafe(ipv4Bytes)
    const ipv6 = NetAddress.ipv6FromBytesUnsafe(ipv6Bytes)
    const ipv4Hash = Hash.hash(ipv4)
    const ipv6Hash = Hash.hash(ipv6)

    ipv4Bytes[0] = 1
    ipv6Bytes[15] = 2

    assert.strictEqual(NetAddress.formatIp(ipv4), "127.0.0.1")
    assert.strictEqual(NetAddress.formatIp(ipv6), "::1")
    assert.strictEqual(Hash.hash(ipv4), ipv4Hash)
    assert.strictEqual(Hash.hash(ipv6), ipv6Hash)
    assert.isTrue(Equal.equals(ipv4, NetAddress.ipv4Loopback))
    assert.isTrue(Equal.equals(ipv6, NetAddress.ipv6Loopback))
  })

  it("discriminates addresses sharing the common type id", () => {
    assert.isTrue(NetAddress.isIpv4Address(NetAddress.ipv4Loopback))
    assert.isFalse(NetAddress.isIpv6Address(NetAddress.ipv4Loopback))
    assert.isFalse(NetAddress.isMacAddress(NetAddress.ipv4Loopback))
  })

  it("returns NetAddressError from checked operations", () => {
    const result = NetAddress.ipFromString("localhost")
    assertTrue(Result.isFailure(result), "expected Failure")
    assert.instanceOf(result.failure, NetAddress.NetAddressError)
    assert.strictEqual(result.failure.message, "expected exactly four decimal octets")
    assert.strictEqual(result.failure.input, "localhost")
  })

  describe("socket addresses", () => {
    it("constructs socket addresses from input", () => {
      const inet = NetAddress.inetAddressFromStringUnsafe("127.0.0.1:8080")
      assert.strictEqual(success(NetAddress.socketAddressFromInput(inet)), inet)
      assert.strictEqual(
        NetAddress.formatSocketAddress(success(NetAddress.socketAddressFromInput("127.0.0.1:3000"))),
        "127.0.0.1:3000"
      )
      assert.strictEqual(
        NetAddress.formatSocketAddress(success(NetAddress.socketAddressFromInput("[::1]:3000"))),
        "[::1]:3000"
      )
      assert.strictEqual(
        NetAddress.formatSocketAddress(success(NetAddress.socketAddressFromInput({
          address: "::1",
          port: 8080
        }))),
        "[::1]:8080"
      )
      assert.strictEqual(
        NetAddress.formatSocketAddress(success(NetAddress.socketAddressFromInput({
          address: NetAddress.ipv4Loopback,
          port: 8080
        }))),
        "127.0.0.1:8080"
      )
      assert.strictEqual(
        NetAddress.formatSocketAddress(success(NetAddress.socketAddressFromInput({ path: "server.sock" }))),
        "server.sock"
      )
      failure(NetAddress.socketAddressFromInput({ address: "localhost", port: 8080 }))
      failure(NetAddress.socketAddressFromInput({ address: "127.0.0.1", port: 65536 }))
      failure(NetAddress.socketAddressFromInput("localhost:8080"))
      assert.throws(() => NetAddress.socketAddressFromInputUnsafe({ address: "localhost", port: 8080 }))
    })

    it("parses and formats bracketed numeric addresses", () => {
      assert.strictEqual(
        NetAddress.formatInet(success(NetAddress.inetAddressFromString("127.0.0.1:8080"))),
        "127.0.0.1:8080"
      )
      assert.strictEqual(
        NetAddress.formatInet(success(NetAddress.inetAddressFromString("[0:0:0:0:0:0:0:1]:8080"))),
        "[::1]:8080"
      )
      assert.strictEqual(NetAddress.formatInet(success(NetAddress.inetAddressFromIpString("::1", 8080))), "[::1]:8080")
      assert.strictEqual(NetAddress.formatUrlHost(success(NetAddress.ipv6FromString("::1"))), "[::1]")
    })

    it("formats separate socket hosts while preserving IPv6 scope", () => {
      for (
        const [input, expected] of [
          ["127.0.0.1:8080", "127.0.0.1"],
          ["[0:0:0:0:0:0:0:1]:8080", "::1"],
          ["[fe80::1%7]:4567", "fe80::1%7"],
          ["[fe80::1%0]:4567", "fe80::1"]
        ]
      ) {
        const address = NetAddress.inetAddressFromStringUnsafe(input)
        const host = NetAddress.formatHost(address)
        assert.strictEqual(host, expected)
        assert.deepStrictEqual(success(NetAddress.inetAddressFromHostString(host, address.port)), address)
      }
    })

    it("formats native hosts using the supplied platform and interface names", () => {
      const scopeIds = NetAddress.scopeIdsFromInterfaces([
        ["en0", [{ family: "IPv6", scopeid: 7 }]],
        ["en1", [{ family: "IPv6", scopeid: 7 }]]
      ])
      for (const platform of ["win32", "linux", "darwin", undefined]) {
        for (
          const [input, expected] of [
            ["127.0.0.1:8080", "127.0.0.1"],
            ["[0:0:0:0:0:0:0:1]:8080", "::1"],
            ["[fe80::1%0]:4567", "fe80::1"],
            ["[fe80::1%7]:4567", platform === "win32" ? "fe80::1%7" : "fe80::1%en0"],
            ["[fe80::1%9]:4567", "fe80::1%9"]
          ]
        ) {
          const address = NetAddress.inetAddressFromStringUnsafe(input)
          const host = NetAddress.formatNativeHost(address, scopeIds, platform)
          assert.strictEqual(host, expected)
          assert.deepStrictEqual(success(NetAddress.inetAddressFromHostString(host, address.port, scopeIds)), address)
        }
      }
      const address = NetAddress.inetAddressFromStringUnsafe("[fe80::1%7]:4567")
      assert.strictEqual(NetAddress.formatNativeHost(address, scopeIds), "fe80::1%en0")
      assert.strictEqual(NetAddress.formatNativeHost(address, new Map(), "linux"), "fe80::1%7")
      assert.strictEqual(NetAddress.formatNativeHost(address, new Map([["eth0", 7]]), "linux"), "fe80::1%eth0")
    })

    it("formats multicast interfaces using the supplied platform and scope map", () => {
      const scopeIds = NetAddress.scopeIdsFromInterfaces([
        ["en0", [{ family: "IPv6", scopeid: 7 }]],
        ["en1", [{ family: "IPv6", scopeid: 7 }]]
      ])
      for (const platform of ["win32", "linux", "darwin", undefined]) {
        assert.strictEqual(
          NetAddress.formatMulticastInterface(NetAddress.ipv4Loopback, scopeIds, platform),
          "127.0.0.1"
        )
        assert.strictEqual(NetAddress.formatMulticastInterface(0, scopeIds, platform), "::")
        assert.strictEqual(
          NetAddress.formatMulticastInterface(7, scopeIds, platform),
          platform === "win32" ? "::%7" : "::%en0"
        )
        assert.strictEqual(NetAddress.formatMulticastInterface(9, scopeIds, platform), "::%9")
      }
      assert.strictEqual(NetAddress.formatMulticastInterface(7, scopeIds), "::%en0")
      assert.strictEqual(NetAddress.formatMulticastInterface(7, new Map(), "linux"), "::%7")
      assert.strictEqual(NetAddress.formatMulticastInterface(7, new Map([["eth0", 7]]), "linux"), "::%eth0")
    })

    it("resolves named IPv6 zones only through the supplied scope map", () => {
      for (const scopeId of [7, 9]) {
        const scopeIds = new Map([["en0", scopeId]])
        const address = success(NetAddress.inetAddressFromHostString("fe80::1%en0", 4567, scopeIds))
        assert.deepStrictEqual(address, NetAddress.inetAddressFromStringUnsafe(`[fe80::1%${scopeId}]:4567`))
      }
      const unknown = failure(NetAddress.inetAddressFromHostString("fe80::1%en0", 4567, new Map([["en1", 7]])))
      assert.strictEqual(unknown.input, "fe80::1%en0")
      failure(NetAddress.inetAddressFromHostString("fe80::1%en0", 4567))
    })

    it("snapshots the first positive IPv6 scope ID from each interface", () => {
      const linkLocal = { family: "IPv6", scopeid: 7 }
      const interfaces = {
        en0: [
          { family: "IPv4", scopeid: 99 },
          { family: "IPv6" },
          { family: "IPv6", scopeid: 0 },
          { family: "IPv6", scopeid: -1 },
          linkLocal,
          { family: "IPv6", scopeid: 9 }
        ],
        en1: undefined,
        en2: [{ family: "IPv4" }, { family: "IPv6", scopeid: 0 }],
        en3: [{ family: "IPv6", scopeid: 11 }]
      }
      const scopeIds = NetAddress.scopeIdsFromInterfaces(Object.entries(interfaces))
      linkLocal.scopeid = 12
      assert.deepStrictEqual(scopeIds, new Map([["en0", 7], ["en3", 11]]))
      assert.deepStrictEqual(NetAddress.scopeIdsFromInterfaces([]), new Map())
    })

    it("provides throwing counterparts for trusted construction", () => {
      const ip = NetAddress.ipFromStringUnsafe("::1")
      assert.strictEqual(NetAddress.formatIp(ip), "::1")
      assert.strictEqual(NetAddress.formatInet(NetAddress.inetAddressUnsafe(ip, 8080)), "[::1]:8080")
      assert.strictEqual(
        NetAddress.formatInet(NetAddress.inetAddressFromStringUnsafe("127.0.0.1:8080")),
        "127.0.0.1:8080"
      )
      assert.throws(() => NetAddress.ipFromStringUnsafe("localhost"))
      assert.throws(() => NetAddress.inetAddressUnsafe(ip, -1))
      assert.throws(() => NetAddress.inetAddressFromStringUnsafe("localhost:8080"))
    })

    it("checks port boundaries and rejects ambiguous input", () => {
      for (const port of [0, 1, 65535]) {
        assert.strictEqual(success(NetAddress.inetAddressFromString(`127.0.0.1:${port}`)).port, port)
      }
      for (
        const input of [
          "127.0.0.1:-1",
          "127.0.0.1:65536",
          "127.0.0.1:1.5",
          "127.0.0.1:00",
          "127.0.0.1:080",
          "localhost:80",
          "::1:80",
          "[::1]80",
          "[127.0.0.1]:80",
          "[fe80::1%]:80",
          "[fe80::1%-1]:80",
          "[fe80::1%1.5]:80",
          "[fe80::1%en0]:80",
          "[fe80::1%1%2]:80",
          "[fe80::1%4294967296]:80"
        ]
      ) {
        failure(NetAddress.inetAddressFromString(input))
      }
      const invalidPort = NetAddress.inetAddressFromString("127.0.0.1:65536")
      assertTrue(Result.isFailure(invalidPort), "expected Failure")
      assert.strictEqual(invalidPort.failure.message, "port must be an integer from 0 through 65535")

      const missingPort = NetAddress.inetAddressFromString("127.0.0.1")
      assertTrue(Result.isFailure(missingPort), "expected Failure")
      assert.strictEqual(missingPort.failure.message, "expected host:port or [IPv6]:port")
    })

    it("preserves IPv6 scope metadata in equality and hashing", () => {
      const address = success(NetAddress.ipv6FromString("fe80::1"))
      const first = success(NetAddress.inetAddressV6(address, 80, { scopeId: 3 }))
      const second = success(NetAddress.inetAddressV6(address, 80, { scopeId: 3 }))
      const otherScope = success(NetAddress.inetAddressV6(address, 80, { scopeId: 4 }))
      assert.isTrue(Equal.equals(first, second))
      assert.strictEqual(Hash.hash(first), Hash.hash(second))
      assert.isFalse(Equal.equals(first, otherScope))
    })

    it("round trips numeric IPv6 scope identifiers", () => {
      const scoped = success(NetAddress.inetAddressFromString("[fe80::1%4294967295]:65535"))
      if (!NetAddress.isInetAddressV6(scoped)) assert.fail("expected InetAddressV6")
      assert.strictEqual(scoped.scopeId, 0xffffffff)
      assert.strictEqual(NetAddress.formatInet(scoped), "[fe80::1%4294967295]:65535")
      assert.strictEqual(
        NetAddress.formatInet(success(NetAddress.inetAddressFromString("[fe80::1%0]:80"))),
        "[fe80::1]:80"
      )
    })

    it("keeps Unix paths opaque", () => {
      const address = NetAddress.unixPathAddress("./run/../server.sock")
      assert.strictEqual(address.path, "./run/../server.sock")
      assert.strictEqual(NetAddress.formatSocketAddress(address), "./run/../server.sock")
      assert.isTrue(Equal.equals(address, NetAddress.unixPathAddress("./run/../server.sock")))
    })
  })

  it("decodes and canonically encodes schemas", () => {
    assert.strictEqual(Schema.resolveAnnotations(Schema.IpAddress)?.identifier, "IpAddress")
    assert.strictEqual(Schema.resolveAnnotations(Schema.IpAddressFromString)?.identifier, "IpAddressFromString")
    const mac = Schema.decodeUnknownSync(Schema.MacAddressFromString)("02:0A:0b:0C:0d:0E")
    assert.strictEqual(Schema.encodeSync(Schema.MacAddressFromString)(mac), "02:0a:0b:0c:0d:0e")
    const ipv6 = Schema.decodeUnknownSync(Schema.Ipv6AddressFromString)("2001:0DB8:0:0:0:0:0:1")
    assert.strictEqual(Schema.encodeSync(Schema.Ipv6AddressFromString)(ipv6), "2001:db8::1")
    const inet = Schema.decodeUnknownSync(Schema.InetAddressFromString)("[0:0:0:0:0:0:0:1]:0")
    assert.strictEqual(Schema.encodeSync(Schema.InetAddressFromString)(inet), "[::1]:0")
    const scoped = Schema.decodeUnknownSync(Schema.InetAddressFromString)("[fe80::1%3]:80")
    assert.strictEqual(Schema.encodeSync(Schema.InetAddressFromString)(scoped), "[fe80::1%3]:80")
    const unix = Schema.decodeUnknownSync(Schema.UnixPathAddressFromString)("../opaque.sock")
    assert.strictEqual(Schema.encodeSync(Schema.UnixPathAddressFromString)(unix), "../opaque.sock")
    assert.throws(() => Schema.decodeUnknownSync(Schema.MacAddressFromString)("00-11-22-33-44-55"))
    assert.throws(() => Schema.decodeUnknownSync(Schema.Ipv4AddressFromString)("999.0.0.1"))
  })

  it("validates branded address schemas on decode and encode", () => {
    const multicastIp = Schema.decodeUnknownSync(Schema.IpMulticastAddressFromString)("239.255.0.1")
    const multicastMac = Schema.decodeUnknownSync(Schema.MacMulticastAddressFromString)("01:00:5E:00:00:01")
    const broadcastMac = Schema.decodeUnknownSync(Schema.MacBroadcastAddressFromString)("FF:FF:FF:FF:FF:FF")
    assert.strictEqual(Schema.encodeSync(Schema.IpMulticastAddressFromString)(multicastIp), "239.255.0.1")
    assert.strictEqual(
      Schema.encodeSync(Schema.MacMulticastAddressFromString)(multicastMac),
      "01:00:5e:00:00:01"
    )
    assert.isTrue(NetAddress.isMulticast(multicastIp))
    assert.isTrue(NetAddress.isMulticast(multicastMac))
    assert.isTrue(NetAddress.isMulticast(broadcastMac))

    assert.isTrue(NetAddress.isUnicast(Schema.decodeUnknownSync(Schema.IpUnicastAddressFromString)("192.0.2.1")))
    assert.isTrue(
      NetAddress.isMacUnicast(Schema.decodeUnknownSync(Schema.MacUnicastAddressFromString)("00:00:5e:00:53:01"))
    )
    assert.isTrue(
      NetAddress.isBroadcast(Schema.decodeUnknownSync(Schema.Ipv4BroadcastAddressFromString)("255.255.255.255"))
    )
    assert.isTrue(NetAddress.isLoopback(Schema.decodeUnknownSync(Schema.IpLoopbackAddressFromString)("::1")))
    assert.isTrue(NetAddress.isLinkLocal(Schema.decodeUnknownSync(Schema.IpLinkLocalAddressFromString)("fe80::1")))
    assert.isTrue(NetAddress.isUnspecified(Schema.decodeUnknownSync(Schema.IpUnspecifiedAddressFromString)("::")))
    assert.isTrue(NetAddress.isPrivate(Schema.decodeUnknownSync(Schema.Ipv4PrivateAddressFromString)("10.0.0.1")))
    assert.isTrue(
      NetAddress.isUniqueLocal(Schema.decodeUnknownSync(Schema.Ipv6UniqueLocalAddressFromString)("fd00::1"))
    )
    assert.isTrue(
      NetAddress.isMacLocallyAdministered(
        Schema.decodeUnknownSync(Schema.MacLocallyAdministeredAddressFromString)("02:00:00:00:00:01")
      )
    )
    assert.isTrue(
      NetAddress.isMacUniversallyAdministered(
        Schema.decodeUnknownSync(Schema.MacUniversallyAdministeredAddressFromString)("00:00:5e:00:53:01")
      )
    )

    const loopback = NetAddress.ipv4Loopback
    const decodedLoopback: NetAddress.IpAddress = Schema.decodeUnknownSync(Schema.IpLoopbackAddress)(loopback)
    assert.strictEqual(decodedLoopback, loopback)
    assert.isTrue(Schema.is(Schema.IpLoopbackAddress)(loopback))
    assert.isFalse(Schema.is(Schema.IpMulticastAddress)(loopback))
    assert.throws(
      () => Schema.decodeUnknownSync(Schema.IpMulticastAddressFromString)("127.0.0.1"),
      /Expected a multicast address/
    )
    assert.throws(
      () => Schema.decodeUnknownSync(Schema.IpMulticastAddressFromString)("localhost"),
      /expected exactly four decimal octets/
    )
    assert.throws(
      () => Schema.encodeUnknownSync(Schema.IpMulticastAddressFromString)(loopback),
      /Expected a multicast address/
    )
  })
})
