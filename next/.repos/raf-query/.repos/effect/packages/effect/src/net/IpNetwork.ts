/**
 * Pure, canonical IPv4 and IPv6 network prefixes using CIDR notation.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Equal from "../Equal.ts"
import { dual } from "../Function.ts"
import * as Hash from "../Hash.ts"
import { NodeInspectSymbol } from "../Inspectable.ts"
import { hasProperty } from "../Predicate.ts"
import * as Result from "../Result.ts"
import * as IpInterface from "./IpInterface.ts"
import * as NetAddress from "./NetAddress.ts"

const TypeId = "~effect/net/IpNetwork" as const

/**
 * An immutable canonical IP network prefix. Constructors that retain the exact
 * input address also retain its verified refinements. Operations that derive a
 * different address return only its IPv4 or IPv6 family; revalidate the result
 * before treating it as refined.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpNetwork<out A extends NetAddress.IpAddress = NetAddress.IpAddress> extends Equal.Equal, Hash.Hash {
  readonly _tag: "IpNetwork"
  readonly address: A
  readonly prefixLength: number
  readonly [TypeId]: typeof TypeId
  toString(): string
  toJSON(): string
}

/**
 * An immutable canonical IPv4 network prefix.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Ipv4Network = IpNetwork<NetAddress.Ipv4Address>

/**
 * An immutable canonical IPv6 network prefix.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Ipv6Network = IpNetwork<NetAddress.Ipv6Address>

/**
 * Returns `true` when a value is an IPv4 network prefix.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isIpv4Network = (u: unknown): u is Ipv4Network => isIpNetwork(u) && NetAddress.isIpv4Address(u.address)

/**
 * Returns `true` when a value is an IPv6 network prefix.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isIpv6Network = (u: unknown): u is Ipv6Network => isIpNetwork(u) && NetAddress.isIpv6Address(u.address)

/**
 * Returns `true` when a value is an IPv4 or IPv6 network prefix.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isIpNetwork = (u: unknown): u is IpNetwork => hasProperty(u, TypeId)

const IpNetworkProto = {
  _tag: "IpNetwork",
  [TypeId]: TypeId,
  [Equal.symbol](this: IpNetwork, that: Equal.Equal): boolean {
    return isIpNetwork(that) && this.prefixLength === that.prefixLength && Equal.equals(this.address, that.address)
  },
  [Hash.symbol](this: IpNetwork): number {
    return Hash.combine(Hash.hash(this.address), Hash.number(this.prefixLength))
  },
  toString(this: IpNetwork): string {
    return format(this)
  },
  toJSON(this: IpNetwork): string {
    return this.toString()
  },
  [NodeInspectSymbol](this: IpNetwork): string {
    return this.toJSON()
  }
}

const fromInterfaceValue = <A extends NetAddress.IpAddress>(value: IpInterface.IpInterface<A>): IpNetwork<A> => {
  const self = Object.assign(Object.create(IpNetworkProto), {
    address: value.address,
    prefixLength: value.prefixLength
  })
  return Object.freeze(self)
}

const toBytes = (address: NetAddress.IpAddress): ReadonlyArray<number> =>
  NetAddress.isIpv4Address(address) ? NetAddress.ipv4ToOctets(address) : NetAddress.ipv6ToOctets(address)

type IpAddressFamily<A extends NetAddress.IpAddress> = A extends NetAddress.Ipv4Address ? NetAddress.Ipv4Address
  : A extends NetAddress.Ipv6Address ? NetAddress.Ipv6Address
  : never

const fromBytes = <A extends NetAddress.IpAddress>(
  address: A,
  bytes: ReadonlyArray<number>
): IpAddressFamily<A> => {
  const array = new Uint8Array(bytes)
  return (NetAddress.isIpv4Address(address)
    ? NetAddress.ipv4FromBytesUnsafe(array)
    : NetAddress.ipv6FromBytesUnsafe(array)) as IpAddressFamily<A>
}

const maskBytes = (bytes: ReadonlyArray<number>, prefixLength: number): Array<number> => {
  const wholeBytes = Math.floor(prefixLength / 8)
  const partialBits = prefixLength % 8
  return bytes.map((byte, index) => {
    if (index < wholeBytes) return byte
    if (index === wholeBytes && partialBits !== 0) return byte & ((0xff << (8 - partialBits)) & 0xff)
    return 0
  })
}

/**
 * Creates a network prefix when the address has no host bits set.
 *
 * **Gotchas**
 *
 * Use {@link fromAddress} when a host address should be truncated to its containing network.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <A extends NetAddress.IpAddress>(
  address: A,
  prefixLength: number
): Result.Result<IpNetwork<A>, NetAddress.NetAddressError> => {
  return Result.flatMap(IpInterface.make(address, prefixLength), (value) => {
    const bytes = toBytes(address)
    const masked = maskBytes(bytes, prefixLength)
    if (bytes.some((byte, index) => byte !== masked[index])) {
      return Result.fail(
        new NetAddress.NetAddressError({ input: address, message: "address has non-zero host bits" })
      )
    }
    return Result.succeed(fromInterfaceValue(value))
  })
}

/**
 * Creates the canonical network containing an address by clearing its host bits.
 *
 * **Gotchas**
 *
 * The returned network's address can differ from the input address.
 * Its type therefore retains the IPv4 or IPv6 family but not refinements on
 * the input address. Revalidate the derived address to recover a refinement.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromAddress = <A extends NetAddress.IpAddress>(
  address: A,
  prefixLength: number
): Result.Result<IpNetwork<IpAddressFamily<A>>, NetAddress.NetAddressError> => {
  return Result.map(IpInterface.make(address, prefixLength), (value) => {
    const masked = fromBytes(address, maskBytes(toBytes(address), prefixLength))
    return fromInterfaceValue(IpInterface.makeUnsafe(masked, value.prefixLength))
  })
}

/**
 * Returns the canonical network containing an interface address. The derived
 * address retains its IPv4 or IPv6 family but not refinements on the input.
 *
 * @stability unstable
 * @category conversions
 * @since 4.0.0
 */
export const fromInterface = <A extends NetAddress.IpAddress>(
  self: IpInterface.IpInterface<A>
): IpNetwork<IpAddressFamily<A>> => fromAddressUnsafe(self.address, self.prefixLength)

/**
 * Parses a strict IPv4 network prefix in CIDR notation.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const ipv4FromString = (input: string): Result.Result<Ipv4Network, NetAddress.NetAddressError> => {
  return Result.flatMap(
    IpInterface.ipv4FromString(input, { prefix: "required" }),
    (value) => make(value.address, value.prefixLength)
  )
}

/**
 * Parses a strict IPv6 network prefix in CIDR notation.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const ipv6FromString = (input: string): Result.Result<Ipv6Network, NetAddress.NetAddressError> => {
  return Result.flatMap(
    IpInterface.ipv6FromString(input, { prefix: "required" }),
    (value) => make(value.address, value.prefixLength)
  )
}

/**
 * Parses a strict IPv4 or IPv6 network prefix in CIDR notation.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const fromString = (input: string): Result.Result<IpNetwork, NetAddress.NetAddressError> => {
  return Result.flatMap(
    IpInterface.fromString(input, { prefix: "required" }),
    (value) => make(value.address, value.prefixLength)
  )
}

/**
 * Creates a trusted network prefix, throwing when its address or prefix is invalid.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const makeUnsafe = <A extends NetAddress.IpAddress>(address: A, prefixLength: number): IpNetwork<A> =>
  Result.getOrThrow(make(address, prefixLength))

/**
 * Creates the network containing a trusted address, throwing when its prefix is invalid.
 * The derived address retains its IPv4 or IPv6 family but not refinements on
 * the input address.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const fromAddressUnsafe = <A extends NetAddress.IpAddress>(
  address: A,
  prefixLength: number
): IpNetwork<IpAddressFamily<A>> => Result.getOrThrow(fromAddress(address, prefixLength))

/**
 * Parses a trusted network prefix in CIDR notation, throwing on failure.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const fromStringUnsafe = (input: string): IpNetwork => Result.getOrThrow(fromString(input))

/**
 * Formats a network prefix using canonical address text and its decimal prefix length.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const format = (self: IpNetwork): string => `${NetAddress.formatIp(self.address)}/${self.prefixLength}`

/**
 * Returns the lowest address in a network prefix.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const firstAddress = <A extends NetAddress.IpAddress>(self: IpNetwork<A>): A => self.address

/**
 * Returns the numerically greatest address in a network prefix. The derived
 * address retains its IPv4 or IPv6 family but not refinements on the network
 * address.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const lastAddress = <A extends NetAddress.IpAddress>(self: IpNetwork<A>): IpAddressFamily<A> => {
  const bytes = toBytes(self.address)
  const networkMask = maskBytes(bytes.map(() => 0xff), self.prefixLength)
  return fromBytes(self.address, bytes.map((byte, index) => byte | (networkMask[index] ^ 0xff)))
}

/**
 * Returns the exact number of addresses in a network prefix.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const addressCount = (self: IpNetwork): bigint =>
  BigInt(1) << BigInt(NetAddress.width(self.address) - self.prefixLength)

const containsBytes = (self: IpNetwork, address: NetAddress.IpAddress): boolean => {
  if (NetAddress.isIpv4Address(self.address) !== NetAddress.isIpv4Address(address)) return false
  const expected = toBytes(self.address)
  const actual = maskBytes(toBytes(address), self.prefixLength)
  return expected.every((byte, index) => byte === actual[index])
}

/**
 * Returns `true` when a network prefix contains an IP address.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const contains: {
  (address: NetAddress.IpAddress): (self: IpNetwork) => boolean
  (self: IpNetwork, address: NetAddress.IpAddress): boolean
} = dual(2, containsBytes)

/**
 * Returns `true` when a network prefix contains every address in another network prefix.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const containsNetwork: {
  (other: IpNetwork): (self: IpNetwork) => boolean
  (self: IpNetwork, other: IpNetwork): boolean
} = dual(2, (self: IpNetwork, other: IpNetwork): boolean => {
  return self.prefixLength <= other.prefixLength && containsBytes(self, other.address)
})

/**
 * Returns `true` when two network prefixes contain at least one common address.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const overlaps: {
  (other: IpNetwork): (self: IpNetwork) => boolean
  (self: IpNetwork, other: IpNetwork): boolean
} = dual(2, (self: IpNetwork, other: IpNetwork): boolean => {
  return self.prefixLength <= other.prefixLength
    ? containsBytes(self, other.address)
    : containsBytes(other, self.address)
})
