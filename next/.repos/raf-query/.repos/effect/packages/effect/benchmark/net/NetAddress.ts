// Run from the repository root on each runtime:
//
//   node packages/effect/benchmark/net/NetAddress.ts
//   bun packages/effect/benchmark/net/NetAddress.ts
//   deno run -A packages/effect/benchmark/net/NetAddress.ts
import { Equal, Hash } from "effect"
import { NetAddress } from "effect/net"
import { Bench } from "tinybench"

const runtime = (globalThis as any).Deno !== undefined
  ? `deno ${(globalThis as any).Deno.version.deno}`
  : (globalThis as any).Bun !== undefined
  ? `bun ${(globalThis as any).Bun.version}`
  : `node ${process.versions.node}`

// Results are accumulated so the engine cannot drop the measured work.
let sink = 0
const consume = (value: unknown) => {
  if (value === undefined) sink++
}

const ipv4String = "192.168.1.42"
const ipv4Octets = [192, 168, 1, 42] as const
const ipv4Bytes = new Uint8Array(ipv4Octets)

const ipv6FullString = "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
const ipv6CompressedString = "2001:db8::8a2e:370:7334"
const ipv6MappedString = "::ffff:192.168.1.42"
const ipv6Segments = [0x2001, 0x0db8, 0x85a3, 0, 0, 0x8a2e, 0x0370, 0x7334] as const
const ipv6Bytes = new Uint8Array(ipv6Segments.flatMap((segment) => [segment >> 8, segment & 0xff]))

// Distinct objects with the same value, plus one differing only in the last
// byte so the comparison has to check the whole address.
const ipv4 = NetAddress.ipv4FromBytesUnsafe(ipv4Bytes)
const ipv4Same = NetAddress.ipv4FromBytesUnsafe(ipv4Bytes)
const ipv4Other = NetAddress.ipv4FromBytesUnsafe(new Uint8Array([192, 168, 1, 43]))
const ipv6 = NetAddress.ipv6FromBytesUnsafe(ipv6Bytes)
const ipv6Same = NetAddress.ipv6FromBytesUnsafe(ipv6Bytes)
const ipv6OtherBytes = new Uint8Array(ipv6Bytes)
ipv6OtherBytes[15] ^= 1
const ipv6Other = NetAddress.ipv6FromBytesUnsafe(ipv6OtherBytes)

// Equal.equals and Hash.hash cache results per object in WeakMaps, so calling
// them repeatedly on the same addresses only measures the cache. The "method"
// cases call the address implementations directly, which is the code the
// storage change affects. The "public" cases build a fresh address each
// iteration, so the first (uncached) call is measured; subtract the matching
// "ipvN fromBytesUnsafe" case to isolate the call itself.
const equalsMethod = (self: Equal.Equal, that: Equal.Equal) => self[Equal.symbol](that)
const hashMethod = (self: Hash.Hash) => self[Hash.symbol]()

const bench = new Bench({ name: `NetAddress (${runtime})` })

bench
  // Typed-array allocation cost, for comparison with Uint8Array-backed storage.
  .add("baseline new Uint8Array(4)", () => consume(new Uint8Array(4)))
  .add("baseline new Uint8Array(16)", () => consume(new Uint8Array(16)))
  // IPv4 construction
  .add("ipv4 fromString", () => consume(NetAddress.ipv4FromString(ipv4String)))
  .add("ipv4 fromOctets", () => consume(NetAddress.ipv4FromOctets(ipv4Octets)))
  .add("ipv4 fromBytesUnsafe", () => consume(NetAddress.ipv4FromBytesUnsafe(ipv4Bytes)))
  .add("ip fromString (ipv4)", () => consume(NetAddress.ipFromString(ipv4String)))
  // IPv6 construction
  .add("ipv6 fromString (full)", () => consume(NetAddress.ipv6FromString(ipv6FullString)))
  .add("ipv6 fromString (compressed)", () => consume(NetAddress.ipv6FromString(ipv6CompressedString)))
  .add("ipv6 fromString (ipv4-mapped)", () => consume(NetAddress.ipv6FromString(ipv6MappedString)))
  .add("ipv6 fromSegments", () => consume(NetAddress.ipv6FromSegments(ipv6Segments)))
  .add("ipv6 fromBytesUnsafe", () => consume(NetAddress.ipv6FromBytesUnsafe(ipv6Bytes)))
  .add("ip fromString (ipv6 compressed)", () => consume(NetAddress.ipFromString(ipv6CompressedString)))
  // Equality and hashing on the address implementations
  .add("ipv4 equals method (equal)", () => consume(equalsMethod(ipv4, ipv4Same)))
  .add("ipv4 equals method (different)", () => consume(equalsMethod(ipv4, ipv4Other)))
  .add("ipv4 hash method", () => consume(hashMethod(ipv4)))
  .add("ipv6 equals method (equal)", () => consume(equalsMethod(ipv6, ipv6Same)))
  .add("ipv6 equals method (different)", () => consume(equalsMethod(ipv6, ipv6Other)))
  .add("ipv6 hash method", () => consume(hashMethod(ipv6)))
  // Uncached public Equal.equals and Hash.hash, including construction
  .add(
    "ipv4 Equal.equals public (fresh)",
    () => consume(Equal.equals(NetAddress.ipv4FromBytesUnsafe(ipv4Bytes), ipv4Same))
  )
  .add("ipv4 Hash.hash public (fresh)", () => consume(Hash.hash(NetAddress.ipv4FromBytesUnsafe(ipv4Bytes))))
  .add(
    "ipv6 Equal.equals public (fresh)",
    () => consume(Equal.equals(NetAddress.ipv6FromBytesUnsafe(ipv6Bytes), ipv6Same))
  )
  .add("ipv6 Hash.hash public (fresh)", () => consume(Hash.hash(NetAddress.ipv6FromBytesUnsafe(ipv6Bytes))))

await bench.run()

console.log(bench.name)
console.table(bench.table())
if (sink !== 0) console.log(sink)
