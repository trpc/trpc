/**
 * Pure, platform-neutral values for MAC, IP, internet socket, and Unix path addresses.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Brand from "../Brand.ts"
import * as Data from "../Data.ts"
import * as Equal from "../Equal.ts"
import { dual } from "../Function.ts"
import * as Hash from "../Hash.ts"
import { NodeInspectSymbol } from "../Inspectable.ts"
import * as Option from "../Option.ts"
import { hasProperty } from "../Predicate.ts"
import * as Result from "../Result.ts"

const TypeId = "~effect/net/NetAddress" as const

/**
 * An immutable 32-bit IPv4 address.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv4Address extends Equal.Equal, Hash.Hash {
  readonly _tag: "Ipv4Address"
  readonly [TypeId]: typeof TypeId
  toString(): string
  toJSON(): string
}

/**
 * An immutable 128-bit IPv6 address without socket scope metadata.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv6Address extends Equal.Equal, Hash.Hash {
  readonly _tag: "Ipv6Address"
  readonly [TypeId]: typeof TypeId
  toString(): string
  toJSON(): string
}

/**
 * A numeric IPv4 or IPv6 address.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type IpAddress = Ipv4Address | Ipv6Address

/**
 * An immutable 48-bit IEEE 802 MAC address.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacAddress extends Equal.Equal, Hash.Hash {
  readonly _tag: "MacAddress"
  readonly [TypeId]: typeof TypeId
  toString(): string
  toJSON(): string
}

const MulticastTypeId = "~effect/net/NetAddress/MulticastAddress" as const
const UnicastTypeId = "~effect/net/NetAddress/UnicastAddress" as const
const BroadcastTypeId = "~effect/net/NetAddress/BroadcastAddress" as const
const LoopbackTypeId = "~effect/net/NetAddress/LoopbackAddress" as const
const LinkLocalTypeId = "~effect/net/NetAddress/LinkLocalAddress" as const
const UnspecifiedTypeId = "~effect/net/NetAddress/UnspecifiedAddress" as const
const PrivateTypeId = "~effect/net/NetAddress/PrivateAddress" as const
const UniqueLocalTypeId = "~effect/net/NetAddress/UniqueLocalAddress" as const
const LocallyAdministeredTypeId = "~effect/net/NetAddress/LocallyAdministeredAddress" as const
const UniversallyAdministeredTypeId = "~effect/net/NetAddress/UniversallyAdministeredAddress" as const

/**
 * An IP or MAC address proven to be multicast (IPv4 `224.0.0.0/4`, IPv6
 * `ff00::/8`, or a MAC address with the IEEE group bit set).
 *
 * **Details**
 *
 * This is a branded refinement of the underlying address. Construction returns
 * the same runtime value, preserving identity, equality, hashing, and formatting.
 * The MAC all-ones broadcast address has the group bit set and is therefore
 * multicast; use {@link isMacBroadcast} to distinguish it. The IPv4 limited
 * broadcast address `255.255.255.255` is not multicast.
 *
 * The default type argument remains `IpAddress`; specify `MacAddress` or an
 * explicit IP/MAC union when accepting those wider address families.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MulticastAddress<A extends IpAddress | MacAddress = IpAddress> = Brand.Branded<
  A,
  typeof MulticastTypeId
>

/**
 * An IP or MAC address proven to be syntactically unicast.
 *
 * **Details**
 *
 * For IP addresses this excludes multicast, unspecified, and the IPv4 limited
 * broadcast address. Reserved and special-purpose addresses may still satisfy
 * this refinement, as may an IPv4 directed broadcast whose network prefix is
 * unknown. It does not promise reachability or destination usability. For MAC
 * addresses it means that the IEEE individual/group bit is clear.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type UnicastAddress<A extends IpAddress | MacAddress = IpAddress | MacAddress> = Brand.Branded<
  A,
  typeof UnicastTypeId
>

/**
 * An IPv4 limited-broadcast or MAC all-ones broadcast address.
 *
 * **Details**
 *
 * MAC broadcast is also multicast because its IEEE group bit is set. IPv4
 * limited broadcast is not multicast. Directed IPv4 broadcast requires network
 * prefix context and is intentionally not represented by this refinement.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type BroadcastAddress<A extends Ipv4Address | MacAddress = Ipv4Address | MacAddress> = A extends MacAddress
  ? Brand.Branded<MulticastAddress<A>, typeof BroadcastTypeId>
  : Brand.Branded<A, typeof BroadcastTypeId>

/**
 * An IP address proven to be loopback.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type LoopbackAddress<A extends IpAddress = IpAddress> = Brand.Branded<A, typeof LoopbackTypeId>

/**
 * An IP address proven to be link-local.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type LinkLocalAddress<A extends IpAddress = IpAddress> = Brand.Branded<A, typeof LinkLocalTypeId>

/**
 * An all-zero IPv4 or IPv6 address.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type UnspecifiedAddress<A extends IpAddress = IpAddress> = Brand.Branded<A, typeof UnspecifiedTypeId>

/**
 * An IPv4 private-use address in an RFC 1918 range.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PrivateAddress<A extends Ipv4Address = Ipv4Address> = Brand.Branded<A, typeof PrivateTypeId>

/**
 * An IPv6 unique-local address in `fc00::/7`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type UniqueLocalAddress<A extends Ipv6Address = Ipv6Address> = Brand.Branded<A, typeof UniqueLocalTypeId>

/**
 * A MAC address whose IEEE universal/local bit marks it as locally administered.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type LocallyAdministeredAddress<A extends MacAddress = MacAddress> = Brand.Branded<
  A,
  typeof LocallyAdministeredTypeId
>

/**
 * A MAC address whose IEEE universal/local bit marks it as universally administered.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type UniversallyAdministeredAddress<A extends MacAddress = MacAddress> = Brand.Branded<
  A,
  typeof UniversallyAdministeredTypeId
>

// IPv4 addresses store one unsigned 32-bit number and IPv6 addresses store four
// unsigned 32-bit words, most significant first. Allocating a typed array per
// address is expensive on some runtimes, notably Deno.
const ipv4Value = (self: Ipv4Address): number => (self as any).value
interface Ipv6Words {
  readonly w0: number
  readonly w1: number
  readonly w2: number
  readonly w3: number
}
const ipv6Words = (self: Ipv6Address): Ipv6Words => self as any
const getMacBytes = (self: MacAddress): Uint8Array => (self as any).bytes

/**
 * A resolved IPv4 internet address and port.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface InetAddressV4 extends Equal.Equal, Hash.Hash {
  readonly _tag: "InetAddressV4"
  readonly address: Ipv4Address
  readonly port: number
  readonly [TypeId]: typeof TypeId
  toString(): string
  toJSON(): string
}

/**
 * A resolved IPv6 internet address, port, and scope identifier.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface InetAddressV6 extends Equal.Equal, Hash.Hash {
  readonly _tag: "InetAddressV6"
  readonly address: Ipv6Address
  readonly port: number
  readonly scopeId: number
  readonly [TypeId]: typeof TypeId
  toString(): string
  toJSON(): string
}

/**
 * A resolved IPv4 or IPv6 internet address and port.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type InetAddress = InetAddressV4 | InetAddressV6

/**
 * An opaque Unix-domain filesystem socket path.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UnixPathAddress extends Equal.Equal, Hash.Hash {
  readonly _tag: "UnixPathAddress"
  readonly path: string
  readonly [TypeId]: typeof TypeId
  toString(): string
  toJSON(): string
}

/**
 * A portable concrete internet or Unix-domain filesystem address.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type SocketAddress = InetAddress | UnixPathAddress

/**
 * Companion types for constructing socket addresses.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace SocketAddress {
  /**
   * Input that can be converted to a concrete `SocketAddress` without hostname
   * resolution.
   *
   * **Details**
   *
   * String inputs must use `IPv4:port` or `[IPv6]:port` notation. Address
   * properties must be numeric IPv4 or IPv6 literals.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Input =
    | SocketAddress
    | string
    | { readonly address: IpAddress | string; readonly port: number }
    | { readonly path: string }
}

/**
 * The IPv4 or IPv6 family of an IP address or internet address type.
 *
 * **Details**
 *
 * Refinements such as `MulticastAddress<A>` are dropped; the result is the
 * plain `Ipv4Address` or `Ipv6Address` for the family. Unions distribute, so
 * `Family<IpAddress>` and `Family<InetAddress>` are both `IpAddress`.
 *
 * **Example** (Deriving the family of an internet address)
 *
 * ```ts import.meta.vitest
 * import { NetAddress } from "effect/net"
 *
 * const family: NetAddress.Family<NetAddress.InetAddressV6> = NetAddress.ipv6Loopback
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Family<A extends IpAddress | InetAddress> = A extends Ipv4Address | InetAddressV4 ? Ipv4Address
  : Ipv6Address

/**
 * The internet address type for an IP address family.
 *
 * **Details**
 *
 * `Inet<Ipv4Address>` is `InetAddressV4` and `Inet<Ipv6Address>` is
 * `InetAddressV6`. Refinements on `A` are dropped because the port-carrying
 * types hold a plain family address. `Inet<IpAddress>` is `InetAddress`.
 *
 * **Example** (Selecting the internet address for a family)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 * import { NetAddress } from "effect/net"
 *
 * const endpoint: NetAddress.Inet<NetAddress.Ipv4Address> = Result.getOrThrow(
 *   NetAddress.inetAddressV4(NetAddress.ipv4Loopback, 8080)
 * )
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Inet<A extends IpAddress = IpAddress> = A extends Ipv4Address ? InetAddressV4 : InetAddressV6

/**
 * A native multicast interface selector for an IP address family: an interface
 * address for IPv4 or an interface index for IPv6. `ipv4Unspecified` and index
 * `0` select the operating system default.
 *
 * **Example** (Selecting multicast interfaces by family)
 *
 * ```ts import.meta.vitest
 * import { NetAddress } from "effect/net"
 *
 * const ipv4Interface: NetAddress.MulticastInterface<NetAddress.Ipv4Address> =
 *   NetAddress.ipv4Unspecified
 * const ipv6Interface: NetAddress.MulticastInterface<NetAddress.Ipv6Address> = 0
 * ```
 *
 * @see {@link formatMulticastInterface}
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MulticastInterface<A extends IpAddress = IpAddress> = A extends Ipv4Address ? Ipv4Address : number

/**
 * A checked network-address operation failure retaining the address or supplied input.
 *
 * **Details**
 *
 * Address-based operations retain the address value. Parsing and numeric
 * construction retain the supplied string or array. Composed operations forward
 * errors from the failing operation unchanged. Failures from external operations
 * retain the original exception in `cause` when available.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class NetAddressError extends Data.TaggedError("NetAddressError")<{
  readonly message: string
  readonly input: unknown
  readonly cause?: unknown
}> {}

const isAddress = (u: unknown): u is IpAddress | MacAddress | SocketAddress => hasProperty(u, TypeId)

/**
 * Returns `true` when a value is an IPv4 address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isIpv4Address = (u: unknown): u is Ipv4Address => isAddress(u) && u._tag === "Ipv4Address"

/**
 * Returns `true` when a value is an IPv6 address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isIpv6Address = (u: unknown): u is Ipv6Address => isAddress(u) && u._tag === "Ipv6Address"

/**
 * Returns `true` when a value is an IPv4 or IPv6 address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isIpAddress = (u: unknown): u is IpAddress => isIpv4Address(u) || isIpv6Address(u)

/**
 * Returns the bit width of an IP address.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const width = (address: IpAddress): 32 | 128 => isIpv4Address(address) ? 32 : 128

/**
 * Returns `true` when a value is a MAC address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isMacAddress = (u: unknown): u is MacAddress => isAddress(u) && u._tag === "MacAddress"

/**
 * Returns `true` when a value is a resolved IPv4 internet address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isInetAddressV4 = (u: unknown): u is InetAddressV4 => isAddress(u) && u._tag === "InetAddressV4"

/**
 * Returns `true` when a value is a resolved IPv6 internet address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isInetAddressV6 = (u: unknown): u is InetAddressV6 => isAddress(u) && u._tag === "InetAddressV6"

/**
 * Returns `true` when a value is a resolved internet address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isInetAddress = (u: unknown): u is InetAddress => isInetAddressV4(u) || isInetAddressV6(u)

/**
 * Returns `true` when a value is a Unix-domain filesystem address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isUnixPathAddress = (u: unknown): u is UnixPathAddress => isAddress(u) && u._tag === "UnixPathAddress"

/**
 * Returns `true` when a value is a portable concrete socket address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isSocketAddress = (u: unknown): u is SocketAddress => isInetAddress(u) || isUnixPathAddress(u)

const Ipv4Proto = {
  _tag: "Ipv4Address",
  [TypeId]: TypeId,
  [Equal.symbol](this: Ipv4Address, that: Equal.Equal): boolean {
    return isIpv4Address(that) && ipv4Value(this) === ipv4Value(that)
  },
  [Hash.symbol](this: Ipv4Address): number {
    return Hash.optimize(Hash.combine(ipv4HashSeed, ipv4Value(this) | 0))
  },
  toString(this: Ipv4Address): string {
    return formatIp(this)
  },
  toJSON(this: Ipv4Address): string {
    return this.toString()
  },
  [NodeInspectSymbol](this: Ipv4Address): string {
    return this.toJSON()
  }
}

const Ipv6Proto = {
  _tag: "Ipv6Address",
  [TypeId]: TypeId,
  [Equal.symbol](this: Ipv6Address, that: Equal.Equal): boolean {
    if (!isIpv6Address(that)) return false
    const self = ipv6Words(this)
    const other = ipv6Words(that)
    return self.w0 === other.w0 && self.w1 === other.w1 && self.w2 === other.w2 && self.w3 === other.w3
  },
  [Hash.symbol](this: Ipv6Address): number {
    const self = ipv6Words(this)
    let h = Hash.combine(ipv6HashSeed, self.w0 | 0)
    h = Hash.combine(h, self.w1 | 0)
    h = Hash.combine(h, self.w2 | 0)
    return Hash.optimize(Hash.combine(h, self.w3 | 0))
  },
  toString(this: Ipv6Address): string {
    return formatIp(this)
  },
  toJSON(this: Ipv6Address): string {
    return this.toString()
  },
  [NodeInspectSymbol](this: Ipv6Address): string {
    return this.toJSON()
  }
}

const MacProto = {
  _tag: "MacAddress",
  [TypeId]: TypeId,
  [Equal.symbol](this: MacAddress, that: Equal.Equal): boolean {
    return isMacAddress(that) && bytesEqual(getMacBytes(this), getMacBytes(that))
  },
  [Hash.symbol](this: MacAddress): number {
    return Hash.combine(macHashSeed, Hash.array(getMacBytes(this)))
  },
  toString(this: MacAddress): string {
    return formatMacAddress(this)
  },
  toJSON(this: MacAddress): string {
    return this.toString()
  },
  [NodeInspectSymbol](this: MacAddress): string {
    return this.toJSON()
  }
}

const bytesEqual = (self: Uint8Array, that: Uint8Array): boolean => {
  if (self.length !== that.length) return false
  for (let index = 0; index < self.length; index++) {
    if (self[index] !== that[index]) return false
  }
  return true
}

const ipv4HashSeed = Hash.string("Ipv4Address")
const ipv6HashSeed = Hash.string("Ipv6Address")
const macHashSeed = Hash.string("MacAddress")

const makeIpv4 = (value: number): Ipv4Address => {
  const self = Object.create(Ipv4Proto)
  self.value = value >>> 0
  return Object.freeze(self)
}

const makeIpv6 = (w0: number, w1: number, w2: number, w3: number): Ipv6Address => {
  const self = Object.create(Ipv6Proto)
  self.w0 = w0 >>> 0
  self.w1 = w1 >>> 0
  self.w2 = w2 >>> 0
  self.w3 = w3 >>> 0
  return Object.freeze(self)
}

const packOctets = (a: number, b: number, c: number, d: number): number => ((a << 24) | (b << 16) | (c << 8) | d) >>> 0

const packBytes = (bytes: Uint8Array, offset: number): number =>
  packOctets(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])

const wordToOctets = (word: number): readonly [number, number, number, number] => [
  word >>> 24,
  (word >>> 16) & 0xff,
  (word >>> 8) & 0xff,
  word & 0xff
]

const makeMac = (bytes: Uint8Array): MacAddress => {
  const self = Object.assign(Object.create(MacProto), { bytes: new Uint8Array(bytes) })
  return Object.freeze(self)
}

/**
 * Creates an IPv4 address from trusted network-order bytes without validation.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const ipv4FromBytesUnsafe = (bytes: Uint8Array): Ipv4Address => makeIpv4(packBytes(bytes, 0))

/**
 * Creates an IPv6 address from trusted network-order bytes without validation.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const ipv6FromBytesUnsafe = (bytes: Uint8Array): Ipv6Address =>
  makeIpv6(packBytes(bytes, 0), packBytes(bytes, 4), packBytes(bytes, 8), packBytes(bytes, 12))

/**
 * The IPv4 loopback address `127.0.0.1`.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const ipv4Loopback: Ipv4Address = makeIpv4(0x7f000001)

/**
 * The IPv6 loopback address `::1`.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const ipv6Loopback: Ipv6Address = makeIpv6(0, 0, 0, 1)

/**
 * The unspecified IPv4 address `0.0.0.0`.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const ipv4Unspecified: Ipv4Address = makeIpv4(0)

/**
 * The unspecified IPv6 address `::`.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const ipv6Unspecified: Ipv6Address = makeIpv6(0, 0, 0, 0)

/**
 * The IPv4 broadcast address `255.255.255.255`.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const ipv4Broadcast: Ipv4Address = makeIpv4(0xffffffff)

const addressError = (input: unknown, message: string): Result.Result<never, NetAddressError> =>
  Result.fail(new NetAddressError({ input, message }))

/**
 * Creates an IPv4 address from four checked octets.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const ipv4FromOctets = (
  octets: readonly [number, number, number, number]
): Result.Result<Ipv4Address, NetAddressError> => {
  if (!octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return addressError(octets, "octets must be integers from 0 through 255")
  }
  return Result.succeed(makeIpv4(packOctets(octets[0], octets[1], octets[2], octets[3])))
}

/**
 * Creates an IPv6 address from eight checked 16-bit segments.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const ipv6FromSegments = (
  segments: readonly [number, number, number, number, number, number, number, number]
): Result.Result<Ipv6Address, NetAddressError> => {
  if (!segments.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff)) {
    return addressError(segments, "segments must be integers from 0 through 65535")
  }
  return Result.succeed(makeIpv6(
    segments[0] * 0x10000 + segments[1],
    segments[2] * 0x10000 + segments[3],
    segments[4] * 0x10000 + segments[5],
    segments[6] * 0x10000 + segments[7]
  ))
}

/**
 * Creates a MAC address from six checked octets.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const macAddressFromOctets = (
  octets: readonly [number, number, number, number, number, number]
): Result.Result<MacAddress, NetAddressError> => {
  if (!octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return addressError(octets, "octets must be integers from 0 through 255")
  }
  return Result.succeed(makeMac(new Uint8Array(octets)))
}

/**
 * Parses a colon-separated MAC address containing six two-digit hexadecimal octets.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const macAddressFromString = (input: string): Result.Result<MacAddress, NetAddressError> => {
  if (!/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(input)) {
    return addressError(input, "expected six two-digit hexadecimal octets separated by colons")
  }
  return Result.succeed(makeMac(new Uint8Array(input.split(":").map((part) => Number.parseInt(part, 16)))))
}

/**
 * Parses a trusted colon-separated MAC address, throwing on failure.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const macAddressFromStringUnsafe = (input: string): MacAddress => Result.getOrThrow(macAddressFromString(input))

/**
 * Parses a strict dotted-decimal IPv4 address.
 *
 * **Details**
 *
 * Multi-digit octets with a leading zero are rejected to avoid octal ambiguity.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const ipv4FromString = (input: string): Result.Result<Ipv4Address, NetAddressError> => {
  const parts = input.split(".")
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return addressError(input, "expected exactly four decimal octets")
  }
  if (parts.some((part) => part.length > 1 && part[0] === "0")) {
    return addressError(input, "leading zeroes are not allowed")
  }
  const octets = parts.map(Number)
  if (octets.some((part) => part > 255)) {
    return addressError(input, "octets must be at most 255")
  }
  return ipv4FromOctets([octets[0], octets[1], octets[2], octets[3]])
}

const parseIpv6Segments = (input: string): Result.Result<ReadonlyArray<number>, NetAddressError> => {
  if (input.includes("[") || input.includes("]") || input.includes("%")) {
    return addressError(input, "brackets and zone identifiers are not valid in a bare IPv6 address")
  }
  const halves = input.split("::")
  if (halves.length > 2) return addressError(input, "only one compression marker is allowed")
  const head = halves[0] === "" ? [] : halves[0].split(":")
  const tail = halves.length === 2 && halves[1] !== "" ? halves[1].split(":") : []
  if (head.some((part) => part === "") || tail.some((part) => part === "")) {
    return addressError(input, "empty segments are only valid in the compression marker")
  }
  const trailing = tail.length > 0 ? tail[tail.length - 1] : head.length > 0 ? head[head.length - 1] : ""
  let embedded: ReadonlyArray<number> | undefined
  if (trailing.includes(".")) {
    if (halves.length === 2 && tail.length === 0) {
      return addressError(input, "embedded IPv4 syntax must be trailing")
    }
    const parsed = Result.map(ipv4FromString(trailing), (address) => {
      const value = ipv4Value(address)
      return [value >>> 16, value & 0xffff]
    })
    if (Result.isFailure(parsed)) return parsed
    embedded = parsed.success
    if (tail.length > 0) tail.pop()
    else head.pop()
  }
  const explicit = head.length + tail.length + (embedded ? 2 : 0)
  if (halves.length === 1 ? explicit !== 8 : explicit >= 8) {
    return addressError(
      input,
      halves.length === 1 ? "expected eight segments" : "compression must replace at least one segment"
    )
  }
  const parse = (part: string): number | undefined =>
    /^[0-9a-fA-F]{1,4}$/.test(part) ? Number.parseInt(part, 16) : undefined
  const parsedHead = head.map(parse)
  const parsedTail = tail.map(parse)
  if (parsedHead.some((part) => part === undefined) || parsedTail.some((part) => part === undefined)) {
    return addressError(input, "segments must contain one through four hexadecimal digits")
  }
  return Result.succeed([
    ...parsedHead as ReadonlyArray<number>,
    ...Array(8 - explicit).fill(0),
    ...parsedTail as ReadonlyArray<number>,
    ...(embedded ?? [])
  ])
}

/**
 * Parses an IPv6 address with optional compression and trailing embedded IPv4.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const ipv6FromString = (input: string): Result.Result<Ipv6Address, NetAddressError> => {
  return Result.flatMap(
    parseIpv6Segments(input),
    (segments) =>
      ipv6FromSegments(
        segments as unknown as readonly [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number
        ]
      )
  )
}

/**
 * Parses a bare numeric IPv4 or IPv6 address.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const ipFromString = (input: string): Result.Result<IpAddress, NetAddressError> => {
  const result: Result.Result<IpAddress, NetAddressError> = input.includes(":")
    ? ipv6FromString(input)
    : ipv4FromString(input)
  return result
}

/**
 * Parses a trusted bare numeric IPv4 or IPv6 address, throwing on failure.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const ipFromStringUnsafe = (input: string): IpAddress => Result.getOrThrow(ipFromString(input))

/**
 * Returns the four numeric octets of an IPv4 address in a fresh tuple.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const ipv4ToOctets = (self: Ipv4Address): readonly [number, number, number, number] =>
  wordToOctets(ipv4Value(self))

/**
 * Returns the eight numeric segments of an IPv6 address in a fresh tuple.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const ipv6ToSegments = (
  self: Ipv6Address
): readonly [number, number, number, number, number, number, number, number] => {
  const { w0, w1, w2, w3 } = ipv6Words(self)
  return [w0 >>> 16, w0 & 0xffff, w1 >>> 16, w1 & 0xffff, w2 >>> 16, w2 & 0xffff, w3 >>> 16, w3 & 0xffff]
}

/**
 * Returns the sixteen numeric octets of an IPv6 address in a fresh array.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const ipv6ToOctets = (
  self: Ipv6Address
): ReadonlyArray<number> => {
  const { w0, w1, w2, w3 } = ipv6Words(self)
  return [...wordToOctets(w0), ...wordToOctets(w1), ...wordToOctets(w2), ...wordToOctets(w3)]
}

/**
 * Returns the six numeric octets of a MAC address in a fresh tuple.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const macAddressToOctets = (
  self: MacAddress
): readonly [number, number, number, number, number, number] => {
  const bytes = getMacBytes(self)
  return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]]
}

/**
 * Formats a MAC address as six lowercase hexadecimal octets separated by colons.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const formatMacAddress = (self: MacAddress): string =>
  Array.from(getMacBytes(self), (byte) => byte.toString(16).padStart(2, "0")).join(":")

/**
 * Returns `true` when the MAC address is the all-ones broadcast address.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isMacBroadcast = <A extends MacAddress>(self: A): self is BroadcastAddress<A> =>
  getMacBytes(self).every((byte) => byte === 0xff)

/**
 * Returns `true` when the MAC address has the IEEE group-address bit set.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isMacMulticast = <A extends MacAddress>(self: A): self is MulticastAddress<A> =>
  (getMacBytes(self)[0] & 1) !== 0

/**
 * Returns `true` when the MAC address has the IEEE group-address bit clear.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isMacUnicast = <A extends MacAddress>(self: A): self is UnicastAddress<A> =>
  (getMacBytes(self)[0] & 1) === 0

/**
 * Returns `true` when the MAC address has the IEEE local-administration bit set.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isMacLocallyAdministered = <A extends MacAddress>(
  self: A
): self is LocallyAdministeredAddress<A> => (getMacBytes(self)[0] & 2) !== 0

/**
 * Returns `true` when the MAC address has the IEEE local-administration bit clear.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isMacUniversallyAdministered = <A extends MacAddress>(
  self: A
): self is UniversallyAdministeredAddress<A> => (getMacBytes(self)[0] & 2) === 0

/**
 * Folds an IP address by its numeric version.
 *
 * @stability unstable
 * @category pattern matching
 * @since 4.0.0
 */
export const match: {
  <A, B>(options: {
    readonly onIpv4: (address: Ipv4Address) => A
    readonly onIpv6: (address: Ipv6Address) => B
  }): (self: IpAddress) => A | B
  <A, B>(self: IpAddress, options: {
    readonly onIpv4: (address: Ipv4Address) => A
    readonly onIpv6: (address: Ipv6Address) => B
  }): A | B
} = dual(2, <A, B>(self: IpAddress, options: {
  readonly onIpv4: (address: Ipv4Address) => A
  readonly onIpv6: (address: Ipv6Address) => B
}): A | B => isIpv4Address(self) ? options.onIpv4(self) : options.onIpv6(self))

/**
 * Formats an IP address in canonical numeric form.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const formatIp = (self: IpAddress): string => {
  if (isIpv4Address(self)) return ipv4ToOctets(self).join(".")
  const segments = ipv6ToSegments(self)
  if (isIpv4Mapped(self)) {
    return `::ffff:${segments[6] >> 8}.${segments[6] & 0xff}.${segments[7] >> 8}.${segments[7] & 0xff}`
  }
  let bestStart = -1
  let bestLength = 0
  let start = -1
  for (let index = 0; index <= 8; index++) {
    if (index < 8 && segments[index] === 0) {
      if (start === -1) start = index
    } else if (start !== -1) {
      if (index - start > bestLength) {
        bestStart = start
        bestLength = index - start
      }
      start = -1
    }
  }
  if (bestLength < 2) return segments.map((segment) => segment.toString(16)).join(":")
  const head = segments.slice(0, bestStart).map((segment) => segment.toString(16)).join(":")
  const tail = segments.slice(bestStart + bestLength).map((segment) => segment.toString(16)).join(":")
  return `${head}::${tail}`
}

/**
 * Returns `true` for the all-zero address of either IP version.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isUnspecified = <A extends IpAddress>(self: A): self is UnspecifiedAddress<A> => {
  if (isIpv4Address(self)) return ipv4Value(self) === 0
  const { w0, w1, w2, w3 } = ipv6Words(self)
  return w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0
}

/**
 * Returns `true` for IPv4 `127.0.0.0/8` or IPv6 `::1`.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isLoopback = <A extends IpAddress>(self: A): self is LoopbackAddress<A> => {
  if (isIpv4Address(self)) return (ipv4Value(self) >>> 24) === 127
  const { w0, w1, w2, w3 } = ipv6Words(self)
  return w0 === 0 && w1 === 0 && w2 === 0 && w3 === 1
}

/**
 * Returns `true` for IPv4 `224.0.0.0/4`, IPv6 `ff00::/8`, or a MAC address with
 * the IEEE group bit set, refining the value while preserving its address type.
 *
 * **Details**
 *
 * The MAC all-ones broadcast address has the group bit set and is multicast;
 * the IPv4 limited broadcast address `255.255.255.255` is not. Use
 * {@link isMacBroadcast} or {@link isBroadcast} to distinguish broadcast.
 *
 * **Example** (Classifying IP and MAC group addresses)
 *
 * ```ts import.meta.vitest
 * import { assert } from "@effect/vitest"
 * import { NetAddress } from "effect/net"
 *
 * const ip = NetAddress.ipFromStringUnsafe("239.255.0.1")
 * const mac = NetAddress.macAddressFromStringUnsafe("ff:ff:ff:ff:ff:ff")
 *
 * assert.isTrue(NetAddress.isMulticast(ip))
 * assert.isTrue(NetAddress.isMulticast(mac))
 * assert.isTrue(NetAddress.isBroadcast(mac))
 * assert.isFalse(NetAddress.isMulticast(NetAddress.ipv4Broadcast))
 * ```
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isMulticast = <A extends IpAddress | MacAddress>(self: A): self is MulticastAddress<A> => {
  if (isMacAddress(self)) return isMacMulticast(self)
  if (isIpv4Address(self)) return (ipv4Value(self) >>> 28) === 0xe
  return (ipv6Words(self).w0 >>> 24) === 0xff
}

/**
 * Returns `true` for the IPv4 limited broadcast address `255.255.255.255` or
 * the MAC all-ones broadcast address.
 *
 * **Details**
 *
 * MAC broadcast is also multicast because its IEEE group bit is set. IPv4
 * limited broadcast is not multicast. Directed IPv4 broadcast cannot be
 * determined without a network prefix and is not classified here.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isBroadcast = <A extends Ipv4Address | MacAddress>(self: A): self is BroadcastAddress<A> =>
  isMacAddress(self) ? isMacBroadcast(self) : ipv4Value(self) === 0xffffffff

/**
 * Returns `true` when an address is syntactically unicast.
 *
 * **Details**
 *
 * IP addresses exclude multicast, unspecified, and IPv4 limited broadcast.
 * This does not exclude reserved ranges, prefix-relative directed broadcast,
 * or addresses that are unusable or unreachable in a particular deployment.
 * MAC addresses are unicast when their IEEE individual/group bit is clear.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isUnicast = <A extends IpAddress | MacAddress>(self: A): self is UnicastAddress<A> => {
  if (isMacAddress(self)) return isMacUnicast(self)
  return !isMulticast(self) && !isUnspecified(self) && (!isIpv4Address(self) || !isBroadcast(self))
}

/**
 * Returns `true` for IPv4 `169.254.0.0/16` or IPv6 `fe80::/10`.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isLinkLocal = <A extends IpAddress>(self: A): self is LinkLocalAddress<A> => {
  if (isIpv4Address(self)) return (ipv4Value(self) >>> 16) === 0xa9fe
  return ((ipv6Words(self).w0 >>> 16) & 0xffc0) === 0xfe80
}

/**
 * Returns `true` for IPv4 private-use ranges defined by RFC 1918.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isPrivate = <A extends Ipv4Address>(self: A): self is PrivateAddress<A> => {
  const value = ipv4Value(self)
  return (value >>> 24) === 10 || ((value >>> 16) & 0xfff0) === 0xac10 || (value >>> 16) === 0xc0a8
}

/**
 * Returns `true` for IPv6 unique-local addresses in `fc00::/7`.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isUniqueLocal = <A extends Ipv6Address>(self: A): self is UniqueLocalAddress<A> =>
  ((ipv6Words(self).w0 >>> 24) & 0xfe) === 0xfc

/**
 * Returns `true` when an IPv6 address is in the `::ffff:0:0/96` mapped range.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isIpv4Mapped = (self: Ipv6Address): boolean => {
  const { w0, w1, w2 } = ipv6Words(self)
  return w0 === 0 && w1 === 0 && w2 === 0xffff
}

/**
 * Converts an IPv4 address to its IPv4-mapped IPv6 representation.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toIpv4Mapped = (self: Ipv4Address): Ipv6Address => makeIpv6(0, 0, 0xffff, ipv4Value(self))

/**
 * Extracts the IPv4 value from an IPv4-mapped IPv6 address.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const fromIpv4Mapped = (self: Ipv6Address): Option.Option<Ipv4Address> =>
  isIpv4Mapped(self) ? Option.some(makeIpv4(ipv6Words(self).w3)) : Option.none()

/**
 * Converts IPv4-mapped IPv6 addresses to IPv4, including the IP component of internet addresses.
 *
 * **Details**
 *
 * Internet addresses retain their port. Addresses that need no conversion are
 * returned unchanged, preserving their identity and any IPv6 scope identifier.
 * Converted internet addresses are IPv4 values without IPv6 scope metadata.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export function toCanonical(self: IpAddress): IpAddress
/**
 * @stability unstable
 */
export function toCanonical(self: InetAddress): InetAddress
/**
 * @stability unstable
 */
export function toCanonical(self: IpAddress | InetAddress): IpAddress | InetAddress {
  if (isInetAddress(self)) {
    const address = toCanonical(self.address)
    return address === self.address ? self : inetAddressUnsafe(address, self.port)
  }
  return isIpv6Address(self) ? Option.getOrElse(fromIpv4Mapped(self), () => self) : self
}

const InetV4Proto = {
  _tag: "InetAddressV4",
  [TypeId]: TypeId,
  [Equal.symbol](this: InetAddressV4, that: Equal.Equal): boolean {
    return isInetAddressV4(that) && this.port === that.port && Equal.equals(this.address, that.address)
  },
  [Hash.symbol](this: InetAddressV4): number {
    return Hash.combine(Hash.hash(this.address), Hash.number(this.port))
  },
  toString(this: InetAddressV4): string {
    return formatInet(this)
  },
  toJSON(this: InetAddressV4): string {
    return this.toString()
  },
  [NodeInspectSymbol](this: InetAddressV4): string {
    return this.toJSON()
  }
}

const InetV6Proto = {
  _tag: "InetAddressV6",
  [TypeId]: TypeId,
  [Equal.symbol](this: InetAddressV6, that: Equal.Equal): boolean {
    return isInetAddressV6(that) && this.port === that.port && this.scopeId === that.scopeId &&
      Equal.equals(this.address, that.address)
  },
  [Hash.symbol](this: InetAddressV6): number {
    return Hash.combine(
      Hash.combine(Hash.hash(this.address), Hash.number(this.port)),
      Hash.number(this.scopeId)
    )
  },
  toString(this: InetAddressV6): string {
    return formatInet(this)
  },
  toJSON(this: InetAddressV6): string {
    return this.toString()
  },
  [NodeInspectSymbol](this: InetAddressV6): string {
    return this.toJSON()
  }
}

const checkPort = (port: number): boolean => Number.isInteger(port) && port >= 0 && port <= 0xffff

/**
 * Creates a checked IPv4 internet address.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const inetAddressV4 = (address: Ipv4Address, port: number): Result.Result<InetAddressV4, NetAddressError> => {
  if (!checkPort(port)) {
    return addressError(address, "port must be an integer from 0 through 65535")
  }
  const self = Object.create(InetV4Proto)
  self.address = address
  self.port = port
  return Result.succeed(Object.freeze(self))
}

/**
 * Creates a checked IPv6 internet address with an optional scope identifier.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const inetAddressV6 = (
  address: Ipv6Address,
  port: number,
  options?: { readonly scopeId?: number | undefined }
): Result.Result<InetAddressV6, NetAddressError> => {
  if (!checkPort(port)) {
    return addressError(address, "port must be an integer from 0 through 65535")
  }
  const scopeId = options?.scopeId ?? 0
  if (!Number.isInteger(scopeId) || scopeId < 0 || scopeId > 0xffffffff) {
    return addressError(address, "scopeId must be an unsigned 32-bit integer")
  }
  const self = Object.create(InetV6Proto)
  self.address = address
  self.port = port
  self.scopeId = scopeId
  return Result.succeed(Object.freeze(self))
}

/**
 * Creates a checked internet address for an IP address and port.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const inetAddress = (address: IpAddress, port: number): Result.Result<InetAddress, NetAddressError> =>
  isIpv4Address(address) ? inetAddressV4(address, port) : inetAddressV6(address, port)

/**
 * Creates an internet address from a trusted IP address and port, throwing on failure.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const inetAddressUnsafe = (address: IpAddress, port: number): InetAddress =>
  Result.getOrThrow(inetAddress(address, port))

/**
 * Creates a checked internet address from a numeric IP string and port.
 *
 * **Gotchas**
 *
 * The address must be a numeric IPv4 or IPv6 literal. This function does not
 * resolve hostnames or accept IPv6 brackets.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const inetAddressFromIpString = (
  address: string,
  port: number
): Result.Result<InetAddress, NetAddressError> => {
  return Result.flatMap(ipFromString(address), (address) => inetAddress(address, port))
}

/**
 * Creates an internet address from a trusted numeric IP string and port.
 *
 * **Gotchas**
 *
 * This function throws when either input is invalid. Use only when both values
 * are already known to satisfy the checked constructor's requirements.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const inetAddressFromIpStringUnsafe = (address: string, port: number): InetAddress =>
  Result.getOrThrow(inetAddressFromIpString(address, port))

/**
 * Parses an unbracketed numeric host and port, resolving named IPv6 zones using
 * a supplied map of interface names to numeric scope IDs.
 *
 * **Details**
 *
 * IPv4, unscoped IPv6, and numeric IPv6 zones need no map. Named zones must have
 * a matching map entry. This function performs no DNS or operating-system lookup.
 *
 * @see {@link formatHost} for formatting the host of an internet address
 * @see {@link scopeIdsFromInterfaces} for building a scope map from interface entries
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const inetAddressFromHostString = (
  host: string,
  port: number,
  scopeIds?: ReadonlyMap<string, number>
): Result.Result<InetAddress, NetAddressError> => {
  const separator = host.indexOf("%")
  if (separator !== -1) {
    const zone = host.slice(separator + 1)
    if (zone.length === 0 || zone.includes("%")) {
      return addressError(host, "invalid IPv6 scope identifier")
    }
    if (!/^\d+$/.test(zone)) {
      const scopeId = scopeIds?.get(zone)
      if (scopeId === undefined) {
        return addressError(host, `unknown IPv6 interface: ${zone}`)
      }
      host = `${host.slice(0, separator)}%${scopeId}`
    }
  }
  return inetAddressFromString(host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`)
}

/**
 * Network interface address metadata used to resolve IPv6 scope IDs.
 *
 * @see {@link scopeIdsFromInterfaces}
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface NetworkInterfaceAddress {
  readonly family: string
  readonly scopeid?: number | undefined
}

/**
 * Creates a map from interface names to IPv6 scope IDs using supplied interface
 * entries.
 *
 * **Details**
 *
 * Each entry pairs an interface name with its addresses. The first IPv6 address
 * with a positive scope ID supplies that interface's mapping. Accepts entries
 * such as `Object.entries(os.networkInterfaces())` without performing any
 * operating-system lookup itself. Later changes to the entries do not affect
 * the map.
 *
 * @see {@link inetAddressFromHostString} for resolving named IPv6 zones with the map
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const scopeIdsFromInterfaces = (
  interfaces: Iterable<readonly [name: string, addresses: ReadonlyArray<NetworkInterfaceAddress> | undefined]>
): Map<string, number> => {
  const scopeIds = new Map<string, number>()
  for (const [name, addresses] of interfaces) {
    const address = addresses?.find((address) => address.family === "IPv6" && (address.scopeid ?? 0) > 0)
    if (address?.scopeid !== undefined) scopeIds.set(name, address.scopeid)
  }
  return scopeIds
}

/**
 * Parses `IPv4:port` or `[IPv6]:port` without DNS resolution.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const inetAddressFromString = (input: string): Result.Result<InetAddress, NetAddressError> => {
  let host: string
  let portText: string
  let scopeId = 0
  const bracketed = input.startsWith("[")
  if (bracketed) {
    const end = input.indexOf("]")
    if (end < 0 || input[end + 1] !== ":" || input.indexOf("]", end + 1) !== -1) {
      return addressError(input, "expected [IPv6]:port")
    }
    host = input.slice(1, end)
    portText = input.slice(end + 2)
    const scopeSeparator = host.indexOf("%")
    if (scopeSeparator !== -1) {
      const scopeText = host.slice(scopeSeparator + 1)
      if (host.indexOf("%", scopeSeparator + 1) !== -1 || !/^\d+$/.test(scopeText)) {
        return addressError(input, "scope identifier must be decimal")
      }
      scopeId = Number(scopeText)
      if (!Number.isInteger(scopeId) || scopeId > 0xffffffff) {
        return addressError(input, "scope identifier must be an unsigned 32-bit integer")
      }
      host = host.slice(0, scopeSeparator)
    }
  } else {
    const separator = input.lastIndexOf(":")
    if (separator < 0) {
      return addressError(input, "expected host:port or [IPv6]:port")
    }
    if (input.indexOf(":") !== separator) {
      return addressError(input, "IPv6 addresses must be bracketed")
    }
    host = input.slice(0, separator)
    portText = input.slice(separator + 1)
  }
  if (!/^(0|[1-9]\d*)$/.test(portText)) {
    return addressError(input, "port must be an unpadded decimal integer")
  }
  return Result.flatMap(ipFromString(host), (address): Result.Result<InetAddress, NetAddressError> => {
    if (bracketed !== isIpv6Address(address)) {
      return addressError(input, "only IPv6 addresses use brackets")
    }
    return isIpv6Address(address)
      ? inetAddressV6(address, Number(portText), { scopeId })
      : inetAddressV4(address, Number(portText))
  })
}

/**
 * Parses a trusted numeric internet address and port, throwing on failure.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const inetAddressFromStringUnsafe = (input: string): InetAddress =>
  Result.getOrThrow(inetAddressFromString(input))

/**
 * Formats the numeric host of an internet address without brackets or a port,
 * preserving a nonzero IPv6 scope ID as a `%` suffix.
 *
 * **When to use**
 *
 * Use when the host and port are represented separately.
 *
 * @see {@link formatInet} for a complete socket address
 * @see {@link formatUrlHost} for a bracketed URL authority host
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const formatHost = (self: InetAddress): string =>
  formatIp(self.address) + (isInetAddressV6(self) && self.scopeId !== 0 ? `%${self.scopeId}` : "")

/**
 * Formats an internet address's host for a native socket API, without brackets
 * or a port.
 *
 * **Details**
 *
 * On `"win32"`, IPv6 zones remain numeric. On other platforms, the first
 * interface name matching the scope ID is used, falling back to the numeric ID
 * when no name matches. Unscoped IPv6 and IPv4 hosts are unchanged.
 *
 * Supply a scope map from {@link scopeIdsFromInterfaces} and optionally a platform
 * string. Omitting the platform uses non-Windows behavior. This function performs
 * no operating-system lookups.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const formatNativeHost = (
  self: InetAddress,
  scopeIds: ReadonlyMap<string, number>,
  platform?: string
): string => {
  if (platform !== "win32" && isInetAddressV6(self) && self.scopeId !== 0) {
    for (const [name, scopeId] of scopeIds) {
      if (scopeId === self.scopeId) return `${formatIp(self.address)}%${name}`
    }
  }
  return formatHost(self)
}

/**
 * Formats an IPv4 address or IPv6 interface index for a native multicast API.
 *
 * **Details**
 *
 * IPv4 addresses are formatted as numeric IPs. An IPv6 index of zero produces
 * `"::"`. Other indices produce `"::%index"` on `"win32"`, or `"::%name"` on
 * other platforms using the first matching interface name, falling back to the
 * numeric index when no name matches.
 *
 * Supply a scope map from {@link scopeIdsFromInterfaces} and optionally a platform
 * string. Omitting the platform uses non-Windows behavior. This function performs
 * no operating-system lookups.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const formatMulticastInterface = (
  networkInterface: MulticastInterface,
  scopeIds: ReadonlyMap<string, number>,
  platform?: string
): string => {
  if (typeof networkInterface !== "number") return formatIp(networkInterface)
  if (networkInterface === 0) return "::"
  if (platform !== "win32") {
    for (const [name, scopeId] of scopeIds) {
      if (scopeId === networkInterface) return `::%${name}`
    }
  }
  return `::%${networkInterface}`
}

/**
 * Formats a resolved internet address, bracketing IPv6 around its port.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const formatInet = (self: InetAddress): string => {
  const host = formatHost(self)
  return isInetAddressV4(self) ? `${host}:${self.port}` : `[${host}]:${self.port}`
}

/**
 * Formats an IP address for use as a URL authority host.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const formatUrlHost = (self: IpAddress): string => isIpv4Address(self) ? formatIp(self) : `[${formatIp(self)}]`

/**
 * Converts an IP address or internet socket address to a WHATWG `URL`.
 *
 * **Details**
 *
 * Defaults to the HTTP scheme and uses standard URL normalization, including
 * IPv6 brackets and omission of default ports. Bare IP addresses have no
 * explicit port; internet socket addresses retain their port, including zero.
 * Unspecified addresses are preserved.
 *
 * **Gotchas**
 *
 * Returns a `NetAddressError` for scoped IPv6 addresses or inputs that the URL
 * constructor rejects. Supply the scheme without a trailing colon, for example
 * `"https"`.
 *
 * @stability unstable
 * @category conversions
 * @since 4.0.0
 */
export const toUrl = (self: IpAddress | InetAddress, scheme: string = "http"): Result.Result<URL, NetAddressError> => {
  if (self._tag === "InetAddressV6" && self.scopeId !== 0) {
    return addressError(self, "scoped IPv6 addresses are not supported by WHATWG URLs")
  }
  return Result.try({
    try: () => new URL(`${scheme}://${isInetAddress(self) ? formatInet(self) : formatUrlHost(self)}`),
    catch: (cause) => new NetAddressError({ input: self, message: "failed to construct URL", cause })
  })
}

/**
 * Formats an IP or socket address as a URL display string.
 *
 * **Details**
 *
 * Defaults to HTTP, brackets IPv6 addresses, and omits default ports and the
 * trailing slash. Custom schemes such as `"tcp"` retain their scheme and host.
 * Unix socket addresses use {@link formatUnixPath}, preserving the raw path
 * with a `unix://` prefix regardless of the supplied scheme.
 *
 * **Gotchas**
 *
 * Returns a `NetAddressError` when URL conversion fails, including for scoped
 * IPv6 addresses.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const formatUrl = (
  self: IpAddress | SocketAddress,
  scheme: string = "http"
): Result.Result<string, NetAddressError> =>
  isUnixPathAddress(self)
    ? Result.succeed(formatUnixPath(self))
    : Result.map(toUrl(self, scheme), (url) => `${url.protocol}//${url.host}`)

/**
 * Formats an IP or socket address as a URL display string,
 * throwing a `NetAddressError` when conversion fails.
 *
 * @see {@link formatUrl} for the checked version and formatting behavior.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const formatUrlUnsafe = (self: IpAddress | SocketAddress, scheme: string = "http"): string =>
  Result.getOrThrow(formatUrl(self, scheme))

/**
 * Formats a hostname or numeric IP address for use as a URL authority host.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const formatUrlHostString = (host: string): string =>
  host.includes(":") && !host.startsWith("[") ? `[${host}]` : host

const UnixPathProto = {
  _tag: "UnixPathAddress",
  [TypeId]: TypeId,
  [Equal.symbol](this: UnixPathAddress, that: Equal.Equal): boolean {
    return isUnixPathAddress(that) && this.path === that.path
  },
  [Hash.symbol](this: UnixPathAddress): number {
    return Hash.combine(Hash.string("UnixPathAddress"), Hash.string(this.path))
  },
  toString(this: UnixPathAddress): string {
    return this.path
  },
  toJSON(this: UnixPathAddress): string {
    return this.toString()
  },
  [NodeInspectSymbol](this: UnixPathAddress): string {
    return this.toJSON()
  }
}

/**
 * Creates a Unix-domain filesystem address without normalizing its opaque path.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const unixPathAddress = (path: string): UnixPathAddress => {
  const self = Object.create(UnixPathProto)
  self.path = path
  return Object.freeze(self)
}

/**
 * Formats a Unix-domain socket path as a readable `unix://path` display string.
 *
 * **Details**
 *
 * Preserves the raw path without URL encoding or normalization. The resulting
 * string is intended for display.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const formatUnixPath = (self: UnixPathAddress): string => `unix://${self.path}`

/**
 * Converts a `SocketAddress.Input` to a concrete socket address.
 *
 * **Details**
 *
 * Numeric IP strings are parsed without hostname resolution. Invalid IP
 * literals, ports, and input shapes return a `NetAddressError`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const socketAddressFromInput = (
  input: SocketAddress.Input
): Result.Result<SocketAddress, NetAddressError> => {
  if (isSocketAddress(input)) return Result.succeed(input)
  if (typeof input === "string") return inetAddressFromString(input)
  if (hasProperty(input, "path")) {
    return typeof input.path === "string"
      ? Result.succeed(unixPathAddress(input.path))
      : addressError(input, "path must be a string")
  }
  if (!hasProperty(input, "address") || !hasProperty(input, "port")) {
    return addressError(input, "expected an address and port or a Unix path")
  }
  const address = typeof input.address === "string"
    ? ipFromString(input.address)
    : isIpAddress(input.address)
    ? Result.succeed(input.address)
    : addressError(input, "address must be an IP address or numeric IP string")
  return Result.flatMap(address, (address) => inetAddress(address, input.port as number))
}

/**
 * Converts a trusted `SocketAddress.Input` to a concrete socket address,
 * throwing on failure.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const socketAddressFromInputUnsafe = (input: SocketAddress.Input): SocketAddress =>
  Result.getOrThrow(socketAddressFromInput(input))

/**
 * Formats a portable socket address for human-readable output.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const formatSocketAddress = (self: SocketAddress): string =>
  self._tag === "UnixPathAddress" ? self.path : formatInet(self)
