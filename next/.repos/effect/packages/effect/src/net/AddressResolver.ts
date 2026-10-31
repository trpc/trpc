/**
 * Resolves host and port endpoints to socket addresses.
 *
 * The `AddressResolver` service turns a `Host.HostPort` or `host:port` string
 * into socket addresses. Numeric hosts are converted without a lookup. IPv6
 * literals with a named zone such as `fe80::1%eth0` get their scope ID from the host's
 * network interfaces, and domain names are looked up with the `Dns` service.
 * Runtime layers look up network interfaces; this module's layer requires
 * only `Dns` and supports numeric zones only.
 *
 * @stability experimental
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Dns from "./Dns.ts"
import * as Host from "./Host.ts"
import * as NetAddress from "./NetAddress.ts"

/**
 * Service that resolves endpoints to internet and socket addresses.
 *
 * **Details**
 *
 * Every operation either returns at least one address or fails. Lookups fail
 * with a `Dns.DnsError`, and hosts that cannot be converted, such as IPv6
 * literals with an unknown zone or numeric addresses outside the requested
 * family, fail with a `NetAddress.NetAddressError`.
 *
 * @stability experimental
 * @category services
 * @since 4.0.0
 */
export class AddressResolver extends Context.Service<AddressResolver, {
  /**
   * Resolves an endpoint to every matching socket address.
   *
   * **Details**
   *
   * - Socket addresses are returned as-is.
   * - `host:port` strings and `{ host, port }` objects are converted like
   *   `Host.hostPortFromInput`, failing with `NetAddressError` when invalid.
   * - A `Host.HostPort` with a numeric host is converted without a lookup.
   * - A `Host.HostPort` with a domain name is looked up with `Dns.lookup`, and
   *   the port is attached to every address.
   *
   * Results keep the resolver's order and are filtered by the requested
   * family, which does not apply to Unix-domain addresses.
   *
   * **Gotchas**
   *
   * Looked-up IPv6 link-local addresses (`fe80::/10`) are skipped, because
   * lookups do not report the interface they belong to and they cannot be
   * connected to without it. Names that resolve only to such addresses, such
   * as some `.local` names, fail with a `NetAddress.NetAddressError`; use an
   * address with a zone such as `fe80::1%en0` instead.
   */
  resolve<F extends NetAddress.IpFamily>(
    target: NetAddress.InetAddress | Host.HostPortInput,
    options: ResolveOptions & { readonly family: F }
  ): Effect.Effect<
    Arr.NonEmptyReadonlyArray<NetAddress.Inet<NetAddress.FamilyAddress<F>>>,
    Dns.DnsError | NetAddress.NetAddressError
  >
  resolve(
    target: NetAddress.InetAddress | Host.HostPortInput,
    options?: ResolveOptions
  ): Effect.Effect<Arr.NonEmptyReadonlyArray<NetAddress.InetAddress>, Dns.DnsError | NetAddress.NetAddressError>
  resolve(
    target: NetAddress.SocketAddress | Host.HostPortInput,
    options?: ResolveOptions
  ): Effect.Effect<Arr.NonEmptyReadonlyArray<NetAddress.SocketAddress>, Dns.DnsError | NetAddress.NetAddressError>
}>()("effect/net/AddressResolver") {}

/**
 * Options for resolving an endpoint. Without a `family`, addresses of both
 * families are returned.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface ResolveOptions {
  readonly family?: NetAddress.IpFamily | undefined
}

/**
 * Looks up the IPv6 scope ID of a network interface by name.
 *
 * **Details**
 *
 * Returns `None` for interfaces that do not exist or have no IPv6 scope ID, and
 * fails when the interfaces cannot be listed.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export type ScopeIdLookup = (name: string) => Effect.Effect<Option.Option<number>, NetAddress.NetAddressError>

/**
 * Options for creating an `AddressResolver`.
 *
 * **Details**
 *
 * `scopeId` is called whenever an IPv6 literal with a named zone such as
 * `fe80::1%eth0` is resolved, so interfaces added or recreated while the
 * program runs are found. Without it, only numeric zones such as `fe80::1%2`
 * are supported.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface MakeOptions {
  readonly scopeId?: ScopeIdLookup | undefined
}

const inFamily = (
  address: NetAddress.InetAddress,
  family: NetAddress.IpFamily | undefined
): Effect.Effect<Arr.NonEmptyReadonlyArray<NetAddress.InetAddress>, NetAddress.NetAddressError> =>
  family === undefined || NetAddress.isFamily(address, family)
    ? Effect.succeed(Arr.of(address))
    : Effect.fail(new NetAddress.NetAddressError({ input: address, message: `expected an ${family} address` }))

/**
 * Creates an `AddressResolver` that looks up domain names with a `Dns`
 * service.
 *
 * **Example** (Resolving an endpoint with a static resolver)
 *
 * ```ts import.meta.vitest
 * import { Effect, Result } from "effect"
 * import { AddressResolver, Dns, NetAddress } from "effect/net"
 *
 * const dns = Result.getOrThrow(Dns.makeStatic({
 *   hosts: { "db.internal": ["10.0.0.5"] }
 * }))
 * const resolver = AddressResolver.make(dns)
 *
 * const program = resolver.resolve("db.internal:5432").pipe(
 *   Effect.map((addresses) => addresses.map(NetAddress.formatInet))
 * )
 *
 * await Effect.runPromise(program) // => ["10.0.0.5:5432"]
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const make = (dns: Dns.Dns["Service"], options?: MakeOptions): AddressResolver["Service"] => {
  const scopeId = options?.scopeId

  const fromLiteral = (
    host: NetAddress.IpAddress | NetAddress.ScopedIpv6Literal,
    port: number
  ): Effect.Effect<NetAddress.InetAddress, NetAddress.NetAddressError> => {
    if (NetAddress.isIpAddress(host)) return Effect.fromResult(NetAddress.inetAddress(host, port))
    const zone = host.slice(host.indexOf("%") + 1)
    if (scopeId === undefined || /^\d+$/.test(zone)) {
      return Effect.fromResult(NetAddress.inetAddressFromHostString(host, port))
    }

    return Effect.flatMap(scopeId(zone), (id) =>
      Effect.fromResult(
        NetAddress.inetAddressFromHostString(host, port, Option.isSome(id) ? new Map([[zone, id.value]]) : undefined)
      ))
  }

  const resolve = (
    target: NetAddress.SocketAddress | Host.HostPortInput,
    options?: ResolveOptions
  ): Effect.Effect<Arr.NonEmptyReadonlyArray<NetAddress.SocketAddress>, Dns.DnsError | NetAddress.NetAddressError> => {
    const family = options?.family
    if (NetAddress.isUnixPathAddress(target)) return Effect.succeed(Arr.of(target))
    if (NetAddress.isInetAddress(target)) return inFamily(target, family)
    if (!Host.isHostPort(target)) {
      return Effect.flatMap(
        Effect.fromResult(Host.hostPortFromInput(target)),
        (endpoint) => resolve(endpoint, options)
      )
    }

    const { host, port } = target
    if (NetAddress.isIpAddress(host) || NetAddress.isScopedIpv6Literal(host)) {
      return Effect.flatMap(fromLiteral(host, port), (address) => inFamily(address, family))
    }

    return Effect.flatMap(dns.lookup(host, { family }), (addresses) => {
      // Lookups do not report the scope that a link-local IPv6 address needs.
      const usable = addresses.filter((address) =>
        !(NetAddress.isIpv6Address(address) && NetAddress.isLinkLocal(address))
      )

      return Arr.isReadonlyArrayNonEmpty(usable)
        ? Effect.succeed(Arr.map(usable, (address) => NetAddress.inetAddressUnsafe(address, port)))
        : Effect.fail(
          new NetAddress.NetAddressError({
            input: host,
            message: "only link-local IPv6 addresses were found, and lookups do not report their scope"
          })
        )
    })
  }

  return AddressResolver.of({ resolve: resolve as AddressResolver["Service"]["resolve"] })
}

/**
 * Creates a layer that provides an `AddressResolver` using the `Dns` service.
 *
 * @stability experimental
 * @category layers
 * @since 4.0.0
 */
export const layer = (options?: MakeOptions): Layer.Layer<AddressResolver, never, Dns.Dns> =>
  Layer.effect(AddressResolver, Effect.map(Effect.service(Dns.Dns), (dns) => make(dns, options)))
