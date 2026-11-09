/**
 * Deno-backed implementation of Effect's `Dns` service.
 *
 * Address lookups use the operating system resolver through Deno's `node:dns`
 * compatibility layer, so they also read the hosts file. Record queries and
 * reverse lookups use `Deno.resolveDns` and can be cancelled by interruption.
 * Records whose data cannot be represented, such as names that are not valid
 * `Host.DomainName` values, are skipped, and a query fails with
 * `InvalidResponse` when every record is skipped.
 *
 * **Gotchas**
 *
 * `Deno.resolveDns` reports every error response from the name server with the
 * same error as a missing name, so refused queries and server failures
 * (`REFUSED`, `SERVFAIL`, `FORMERR`, `NOTIMP`) fail with `NotFound` instead of
 * `Refused`, `ServerFailure`, `InvalidResponse`, or `Unsupported`. Server
 * failures are therefore not reported as temporary. `Deno.resolveDns` cannot
 * query TLSA records, so TLSA queries fail with `Unsupported`. Queries require
 * the `--allow-net` permission.
 *
 * @stability experimental
 * @since 4.0.0
 */
import * as NodeDns from "@effect/platform-node-shared/NodeDns"
import type * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Dns from "effect/net/Dns"
import * as NetAddress from "effect/net/NetAddress"
import * as Result from "effect/Result"

/**
 * Options for the Deno `Dns` service.
 *
 * **Details**
 *
 * `nameServer` replaces the system name server for record queries and reverse
 * lookups and is converted like `Dns.nameServerFromInput`. Address
 * lookups always use the operating system resolver.
 *
 * **Gotchas**
 *
 * Invalid name servers fail with a `NetAddress.NetAddressError` when the
 * service is created, and so do IPv6 name servers with a scope ID, such as
 * link-local addresses.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface Options {
  readonly nameServer?: NetAddress.IpAddressInput | NetAddress.InetAddressInput | undefined
}

const reasons: Record<string, Dns.DnsErrorReason> = {
  NotFound: "NotFound",
  TimedOut: "Timeout",
  ConnectionRefused: "Refused",
  InvalidData: "InvalidResponse",
  NotSupported: "Unsupported"
}

const toDnsError = (cause: unknown, name: string, type: Dns.RecordType): Dns.DnsError =>
  new Dns.DnsError({
    reason: (cause instanceof Error ? reasons[cause.name] : undefined) ?? "Unknown",
    method: "resolve",
    hostname: name,
    recordType: type,
    cause
  })

const queries: {
  readonly [K in Dns.RecordType]: (
    name: string,
    options: Deno.ResolveDnsOptions
  ) => Promise<Result.Result<Array<Dns.DnsRecord>, Dns.DnsError>>
} = {
  A: async (name, options) =>
    NodeDns.recordsFromResolver(name, "A", await Deno.resolveDns(name, "A", options), (address) => ({
      address: NetAddress.ipFromStringUnsafe(address) as NetAddress.Ipv4Address
    })),
  AAAA: async (name, options) =>
    NodeDns.recordsFromResolver(name, "AAAA", await Deno.resolveDns(name, "AAAA", options), (address) => ({
      address: NetAddress.ipFromStringUnsafe(address) as NetAddress.Ipv6Address
    })),
  CAA: async (name, options) =>
    NodeDns.recordsFromResolver(name, "CAA", await Deno.resolveDns(name, "CAA", options), (caa) => ({
      critical: caa.critical,
      tag: caa.tag,
      value: caa.value
    })),
  CNAME: async (name, options) =>
    NodeDns.recordsFromResolver(name, "CNAME", await Deno.resolveDns(name, "CNAME", options), (target) => ({
      target: NodeDns.domainNameFromResolverUnsafe(target)
    })),
  MX: async (name, options) =>
    NodeDns.recordsFromResolver(name, "MX", await Deno.resolveDns(name, "MX", options), (mx) => ({
      exchange: NodeDns.domainNameFromResolverUnsafe(mx.exchange),
      priority: mx.preference
    })),
  NAPTR: async (name, options) =>
    NodeDns.recordsFromResolver(name, "NAPTR", await Deno.resolveDns(name, "NAPTR", options), (naptr) => ({
      order: naptr.order,
      preference: naptr.preference,
      flags: naptr.flags,
      service: naptr.services,
      regexp: naptr.regexp,
      replacement: NodeDns.domainNameFromResolverUnsafe(naptr.replacement)
    })),
  NS: async (name, options) =>
    NodeDns.recordsFromResolver(name, "NS", await Deno.resolveDns(name, "NS", options), (host) => ({
      host: NodeDns.domainNameFromResolverUnsafe(host)
    })),
  PTR: async (name, options) =>
    NodeDns.recordsFromResolver(name, "PTR", await Deno.resolveDns(name, "PTR", options), (host) => ({
      host: NodeDns.nameTextFromResolver(host, 8)
    })),
  SOA: async (name, options) =>
    NodeDns.recordsFromResolver(name, "SOA", await Deno.resolveDns(name, "SOA", options), (soa) => ({
      primary: NodeDns.domainNameFromResolverUnsafe(soa.mname),
      admin: NodeDns.nameTextFromResolver(soa.rname, 8),
      serial: soa.serial,
      refresh: NodeDns.secondsFromInt32(soa.refresh),
      retry: NodeDns.secondsFromInt32(soa.retry),
      expire: NodeDns.secondsFromInt32(soa.expire),
      minimum: Duration.seconds(soa.minimum)
    })),
  SRV: async (name, options) =>
    NodeDns.recordsFromResolver(name, "SRV", await Deno.resolveDns(name, "SRV", options), (srv) => ({
      target: NodeDns.domainNameFromResolverUnsafe(srv.target),
      port: srv.port,
      priority: srv.priority,
      weight: srv.weight
    })),
  TLSA: async (name) =>
    Result.fail(new Dns.DnsError({ reason: "Unsupported", method: "resolve", hostname: name, recordType: "TLSA" })),
  TXT: async (name, options) =>
    NodeDns.recordsFromResolver(name, "TXT", await Deno.resolveDns(name, "TXT", options), (chunks) => ({
      chunks: chunks.map(NodeDns.utf8FromLatin1) as unknown as Arr.NonEmptyReadonlyArray<string>
    }))
}

/**
 * Creates a Deno `Dns` service.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*(options?: Options) {
  const input = options?.nameServer
  const server = input === undefined ? undefined : yield* Effect.fromResult(Dns.nameServerFromInput(input))
  if (server !== undefined && NetAddress.isInetAddressV6(server) && server.scopeId !== 0) {
    return yield* new NetAddress.NetAddressError({
      input: input!,
      message: "IPv6 name servers with a scope ID are not supported"
    })
  }
  const nameServer: Deno.ResolveDnsOptions["nameServer"] = server === undefined
    ? undefined
    : { ipAddr: NetAddress.formatHost(server), port: server.port }

  return Dns.make({
    lookup: NodeDns.lookup,
    resolve: (name, type) =>
      Effect.tryPromise({
        try: (signal) => queries[type](name, nameServer === undefined ? { signal } : { nameServer, signal }),
        catch: (cause) => toDnsError(cause, name, type)
      }).pipe(Effect.flatMap(Effect.fromResult))
  })
})

/**
 * Layer that provides the Deno `Dns` service using the system resolver
 * configuration.
 *
 * @stability experimental
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Dns.Dns> = Layer.effect(Dns.Dns, Effect.orDie(make()))

/**
 * Creates a layer that provides the Deno `Dns` service with options read
 * from configuration.
 *
 * @stability experimental
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  options: Config.Wrap<Options>
): Layer.Layer<Dns.Dns, Config.ConfigError | NetAddress.NetAddressError> =>
  Layer.effect(Dns.Dns, Effect.flatMap(Config.unwrap(options), make))
