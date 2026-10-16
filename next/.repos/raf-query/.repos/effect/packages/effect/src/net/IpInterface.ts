/**
 * IPv4 and IPv6 interface addresses that preserve host bits alongside a prefix length.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Equal from "../Equal.ts"
import * as Hash from "../Hash.ts"
import { NodeInspectSymbol } from "../Inspectable.ts"
import { hasProperty } from "../Predicate.ts"
import * as Result from "../Result.ts"
import * as NetAddress from "./NetAddress.ts"

const TypeId = "~effect/net/IpInterface" as const

/**
 * An IP host address and prefix length. Host bits and any verified address
 * refinements are preserved because the address is retained unchanged. Code
 * that computes different address bits must widen to the IPv4 or IPv6 family,
 * or validate the resulting address before treating it as refined.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpInterface<out A extends NetAddress.IpAddress = NetAddress.IpAddress> extends Equal.Equal, Hash.Hash {
  readonly _tag: "IpInterface"
  readonly address: A
  readonly prefixLength: number
  readonly [TypeId]: typeof TypeId
  toString(): string
  toJSON(): string
}

/**
 * An IPv4 host address and prefix length.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Ipv4Interface = IpInterface<NetAddress.Ipv4Address>

/**
 * An IPv6 host address and prefix length.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Ipv6Interface = IpInterface<NetAddress.Ipv6Address>

/**
 * Companion types for parsing IP interface addresses.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace IpInterface {
  /**
   * Controls whether the input must contain an explicit prefix. Prefixes are
   * optional by default and use the address width when omitted.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ParseOptions {
    readonly prefix?: "required" | "optional"
  }
}

/**
 * Returns `true` when a value is an IPv4 interface address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isIpv4Interface = (u: unknown): u is Ipv4Interface =>
  isIpInterface(u) && NetAddress.isIpv4Address(u.address)

/**
 * Returns `true` when a value is an IPv6 interface address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isIpv6Interface = (u: unknown): u is Ipv6Interface =>
  isIpInterface(u) && NetAddress.isIpv6Address(u.address)

/**
 * Returns `true` when a value is an IP interface address.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isIpInterface = (u: unknown): u is IpInterface => hasProperty(u, TypeId)

const IpInterfaceProto = {
  _tag: "IpInterface",
  [TypeId]: TypeId,
  [Equal.symbol](this: IpInterface, that: Equal.Equal): boolean {
    return isIpInterface(that) &&
      this.prefixLength === that.prefixLength &&
      Equal.equals(this.address, that.address)
  },
  [Hash.symbol](this: IpInterface): number {
    return Hash.combine(Hash.hash(this.address), Hash.number(this.prefixLength))
  },
  toString(this: IpInterface): string {
    return format(this)
  },
  toJSON(this: IpInterface): string {
    return this.toString()
  },
  [NodeInspectSymbol](this: IpInterface): string {
    return this.toJSON()
  }
}

const interfaceError = (input: unknown, message: string): Result.Result<never, NetAddress.NetAddressError> =>
  Result.fail(new NetAddress.NetAddressError({ input, message }))

/**
 * Creates an interface address while preserving all address bits.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <A extends NetAddress.IpAddress>(
  address: A,
  prefixLength: number
): Result.Result<IpInterface<A>, NetAddress.NetAddressError> => {
  const max = NetAddress.width(address)
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > max) {
    return interfaceError(address, `prefix length must be an integer from 0 through ${max}`)
  }
  const self = Object.assign(Object.create(IpInterfaceProto), { address, prefixLength })
  return Result.succeed(Object.freeze(self))
}

const parseAddressWithPrefix = (
  input: string,
  options?: IpInterface.ParseOptions
): Result.Result<
  { readonly address: string; readonly prefixLength: number | undefined },
  NetAddress.NetAddressError
> => {
  const slash = input.indexOf("/")
  if (slash === -1 && options?.prefix !== "required") {
    return Result.succeed({ address: input, prefixLength: undefined })
  }
  if (slash <= 0 || slash !== input.lastIndexOf("/") || slash === input.length - 1) {
    return interfaceError(input, "expected an address and prefix length separated by one slash")
  }
  const prefix = input.slice(slash + 1)
  if (!/^(0|[1-9][0-9]*)$/.test(prefix)) {
    return interfaceError(input, "prefix length must be an unpadded ASCII decimal integer")
  }
  return Result.succeed({ address: input.slice(0, slash), prefixLength: Number(prefix) })
}

/**
 * Parses an IPv4 interface address while preserving host bits.
 *
 * **Details**
 *
 * A missing prefix defaults to 32. Use `prefix: "required"` to require one.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const ipv4FromString = (
  input: string,
  options?: IpInterface.ParseOptions
): Result.Result<Ipv4Interface, NetAddress.NetAddressError> =>
  Result.flatMap(
    parseAddressWithPrefix(input, options),
    (parts) =>
      Result.flatMap(NetAddress.ipv4FromString(parts.address), (address) =>
        make(address, parts.prefixLength ?? NetAddress.width(address)))
  )

/**
 * Parses an IPv6 interface address while preserving host bits.
 *
 * **Details**
 *
 * A missing prefix defaults to 128. Use `prefix: "required"` to require one.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const ipv6FromString = (
  input: string,
  options?: IpInterface.ParseOptions
): Result.Result<Ipv6Interface, NetAddress.NetAddressError> =>
  Result.flatMap(
    parseAddressWithPrefix(input, options),
    (parts) =>
      Result.flatMap(NetAddress.ipv6FromString(parts.address), (address) =>
        make(address, parts.prefixLength ?? NetAddress.width(address)))
  )

/**
 * Parses an IP interface address while preserving host bits.
 *
 * **Details**
 *
 * A missing prefix defaults to the address width. Use `prefix: "required"` to
 * require one.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const fromString = (
  input: string,
  options?: IpInterface.ParseOptions
): Result.Result<IpInterface, NetAddress.NetAddressError> =>
  Result.flatMap(
    parseAddressWithPrefix(input, options),
    (parts) =>
      Result.flatMap(NetAddress.ipFromString(parts.address), (address) =>
        make(address, parts.prefixLength ?? NetAddress.width(address)))
  )

/**
 * Creates a trusted interface address, throwing when its prefix length is invalid.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const makeUnsafe = <A extends NetAddress.IpAddress>(address: A, prefixLength: number): IpInterface<A> =>
  Result.getOrThrow(make(address, prefixLength))

/**
 * Parses a trusted interface address, throwing on failure.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const fromStringUnsafe = (input: string, options?: IpInterface.ParseOptions): IpInterface =>
  Result.getOrThrow(fromString(input, options))

/**
 * Formats an interface address using canonical address text and its decimal prefix length.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const format = (self: IpInterface): string => `${NetAddress.formatIp(self.address)}/${self.prefixLength}`
