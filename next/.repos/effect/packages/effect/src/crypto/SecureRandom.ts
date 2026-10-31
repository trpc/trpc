/**
 * Cryptographically secure randomness: random bytes, uniform integers,
 * shuffles, UUIDv4, UUIDv7, and ULIDs.
 *
 * The {@link SecureRandom} service is built from one `randomBytes` primitive
 * with {@link make}. {@link layerWebCrypto} draws from `getRandomValues` on
 * the `WebCrypto` reference. The `*Unsafe` functions draw synchronously from
 * `globalThis.crypto` for code that cannot use a service, such as constructors
 * and model defaults.
 *
 * Every operation has a `never` error channel. A bad size or an empty range is
 * a defect.
 *
 * **Gotchas**
 *
 * There are no float, boolean, or full-range integer helpers. Insecure random
 * numbers belong to `effect/Random`, and a secure bit is `randomBytes(1)`.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Ulid from "../internal/ulid.ts"
import * as Uuid from "../internal/uuid.ts"
import * as Layer from "../Layer.ts"
import { WebCrypto } from "./WebCrypto.ts"

/**
 * Generates a UUID as a lowercase, hyphenated string or, with
 * `format: "bytes"`, the 16 UUID bytes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UuidGenerator {
  (options?: { readonly format?: "string" | undefined }): Effect.Effect<string>
  <Format extends "string" | "bytes">(options: {
    readonly format: Format
  }): Effect.Effect<Format extends "bytes" ? Uint8Array : string>
}

/**
 * Service that generates cryptographically secure random values.
 *
 * **Details**
 *
 * Every operation is derived from `randomBytes`. See {@link make}.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class SecureRandom extends Context.Service<SecureRandom, {
  /**
   * Generates `size` cryptographically secure random bytes.
   *
   * A negative or non-integer size dies with a `RangeError`.
   */
  readonly randomBytes: (size: number) => Effect.Effect<Uint8Array>

  /**
   * Generates an integer between `min` and `max`, both inclusive unless
   * `halfOpen` excludes `max`.
   *
   * **Details**
   *
   * The result is exactly uniform: draws that would bias it are rejected.
   * `min` is rounded up and `max` down. An empty range, or bounds that do not
   * round to safe integers, die with a `RangeError`.
   */
  readonly intBetween: (min: number, max: number, options?: {
    readonly halfOpen?: boolean | undefined
  }) => Effect.Effect<number>

  /**
   * Returns a uniformly shuffled copy of the elements, using Fisher-Yates over
   * `intBetween`.
   */
  readonly shuffle: <A>(elements: Iterable<A>) => Effect.Effect<Array<A>>

  /**
   * Generates a UUIDv4, as a lowercase hyphenated string or, with
   * `format: "bytes"`, the 16 UUID bytes.
   */
  readonly uuidV4: UuidGenerator

  /**
   * Generates a UUIDv7 from the `Clock` timestamp, as a lowercase hyphenated
   * string or, with `format: "bytes"`, the 16 UUID bytes.
   *
   * Every UUIDv7 from this service sorts after the previous one, as a string
   * and as bytes. Within a millisecond, a 42-bit counter seeded from random
   * bytes orders them. If the `Clock` moves back, the last timestamp is kept,
   * and if the counter overflows, the timestamp advances by 1 ms, so a
   * timestamp can run slightly ahead of the `Clock`. The ordering ends at the
   * maximum timestamp, 2^48 − 1 ms (in the year 10889), which overflow cannot
   * advance. There is no ordering between separate services, processes or
   * workers.
   *
   * Consecutive UUIDv7s reveal their generation order, so never use them as
   * secrets. Uniqueness between generators is probabilistic: each UUID has 32
   * fresh random bits, on top of a counter seeded from 41 random bits each
   * millisecond.
   */
  readonly uuidV7: UuidGenerator

  /**
   * Generates a ULID from the `Clock` timestamp: 26 uppercase Crockford
   * base32 characters.
   *
   * Every ULID from this service sorts after the previous one, using the ULID
   * spec's monotonic mode: within a millisecond, the 80-bit random part is
   * incremented. If the `Clock` moves back, the last timestamp is kept, and if
   * the random part overflows, the timestamp advances by 1 ms. The ordering
   * ends at the maximum timestamp, 2^48 − 1 ms (in the year 10889), which
   * overflow cannot advance. There is no ordering between separate services,
   * processes or workers. Consecutive ULIDs reveal their generation order, so
   * never use them as secrets.
   */
  readonly ulid: Effect.Effect<string>
}>()("effect/crypto/SecureRandom") {}

const checkSize = (size: number): void => {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new RangeError("size must be a non-negative safe integer")
  }
}

const readUint53 = (bytes: Uint8Array): number =>
  ((bytes[0] & 0x1f) * 2 ** 48) + (bytes[1] * 2 ** 40) + (bytes[2] * 2 ** 32) +
  (bytes[3] * 2 ** 24) + (bytes[4] * 2 ** 16) + (bytes[5] * 2 ** 8) + bytes[6]

// Draws an integer by rejection sampling over 53-bit (or, for ranges wider than
// 2^53, 54-bit) draws, so every integer in the range has the same probability.
const intBetweenUnsafe = (
  min: number,
  max: number,
  halfOpen: boolean,
  draw: () => Uint8Array
): number => {
  const minInt = Math.ceil(min)
  const maxInt = Math.floor(max)
  if (!Number.isSafeInteger(minInt) || !Number.isSafeInteger(maxInt)) {
    throw new RangeError("bounds must round to safe integers")
  }
  if (maxInt - minInt < Number.MAX_SAFE_INTEGER) {
    // Every intermediate stays below 2^53, and `%` is exact, so the divisions
    // below are exact without BigInt.
    const count = maxInt - minInt + (halfOpen ? 0 : 1)
    if (count <= 0) {
      throw new RangeError("range must contain at least one integer")
    }
    // `+ 0` turns `Math.ceil` of a value in (-1, 0) into 0 instead of -0.
    if (count === 1) return minInt + 0
    const bucketSize = (2 ** 53 - (2 ** 53 % count)) / count
    const limit = bucketSize * count
    while (true) {
      const value = readUint53(draw())
      if (value < limit) return minInt + (value - (value % bucketSize)) / bucketSize
    }
  }
  // BigInt keeps every integer distinct when the range is wider than 2^53.
  const lower = BigInt(minInt)
  const count = BigInt(maxInt) - lower + (halfOpen ? BigInt(0) : BigInt(1))
  const wide = count > BigInt(1) << BigInt(53)
  const bucketSize = (wide ? BigInt(1) << BigInt(54) : BigInt(1) << BigInt(53)) / count
  const limit = bucketSize * count
  while (true) {
    const bytes = draw()
    const value = BigInt(readUint53(bytes)) + (wide && (bytes[0] & 0x20) !== 0 ? BigInt(1) << BigInt(53) : BigInt(0))
    if (value < limit) return Number(lower + value / bucketSize)
  }
}

const makeUuid = (
  bytes: (randomBytes: Uint8Array) => Uint8Array,
  randomBytes: (size: number) => Uint8Array,
  format: "string" | "bytes" | undefined
): string | Uint8Array => {
  const uuid = bytes(randomBytes(16))
  return format === "bytes" ? uuid : Uuid.stringify(uuid)
}

/**
 * Creates a `SecureRandom` service from a secure byte source.
 *
 * **When to use**
 *
 * Use to build the service for a platform integration, a custom runtime, or a
 * seeded test double.
 *
 * **Details**
 *
 * Every operation is derived from `randomBytes`. Sizes are checked before it
 * is called, and an exception it throws is a defect. Each service orders its
 * own UUIDv7s and ULIDs, independently of other services and of the
 * `*Unsafe` functions.
 *
 * **Gotchas**
 *
 * `randomBytes` must return a fresh array of exactly `size` secure random
 * bytes. UUID formatting mutates the returned array.
 *
 * **Example** (Creating a SecureRandom service)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { SecureRandom } from "effect/crypto"
 *
 * const random = SecureRandom.make((size) => globalThis.crypto.getRandomValues(new Uint8Array(size)))
 *
 * const bytes = await Effect.runPromise(random.randomBytes(4))
 * bytes.length // => 4
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (randomBytes: (size: number) => Uint8Array): SecureRandom["Service"] => {
  const randomBytesChecked = (size: number): Uint8Array => {
    checkSize(size)
    return randomBytes(size)
  }
  const draw = () => randomBytes(7)
  const uuidV7 = Uuid.makeV7Monotonic()
  const ulid = Ulid.makeMonotonic()
  const ulidRandomBytes = () => randomBytes(10)
  return {
    randomBytes: (size) => Effect.sync(() => randomBytesChecked(size)),
    intBetween: (min, max, options) => Effect.sync(() => intBetweenUnsafe(min, max, options?.halfOpen ?? false, draw)),
    shuffle: <A>(elements: Iterable<A>) =>
      Effect.sync(() => {
        const buffer = Array.from(elements)
        for (let i = buffer.length - 1; i >= 1; i--) {
          const index = intBetweenUnsafe(0, i, false, draw)
          const value = buffer[i]!
          buffer[i] = buffer[index]!
          buffer[index] = value
        }
        return buffer
      }),
    uuidV4:
      ((options?: { readonly format?: "string" | "bytes" | undefined }) =>
        Effect.sync(() => makeUuid(Uuid.v4Bytes, randomBytes, options?.format))) as UuidGenerator,
    uuidV7:
      ((options?: { readonly format?: "string" | "bytes" | undefined }) =>
        Effect.clockWith((clock) =>
          Effect.sync(() =>
            makeUuid((bytes) => uuidV7(clock.currentTimeMillisUnsafe(), bytes), randomBytes, options?.format)
          )
        )) as UuidGenerator,
    ulid: Effect.clockWith((clock) => Effect.sync(() => ulid(clock.currentTimeMillisUnsafe(), ulidRandomBytes)))
  }
}

// `getRandomValues` throws a `QuotaExceededError` above 65,536 bytes.
const fillRandom = (crypto: Crypto, size: number): Uint8Array => {
  const bytes = new Uint8Array(size)
  for (let offset = 0; offset < size; offset += 65_536) {
    crypto.getRandomValues(bytes.subarray(offset, offset + 65_536))
  }
  return bytes
}

/**
 * Layer that provides `SecureRandom` from `getRandomValues` on the `WebCrypto`
 * reference.
 *
 * **Details**
 *
 * Requests above the 65,536-byte `getRandomValues` limit are filled in chunks.
 * Only `getRandomValues` is needed, so the layer also works in insecure browser
 * contexts, which have no `crypto.subtle`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebCrypto: Layer.Layer<SecureRandom> = Layer.effect(
  SecureRandom,
  WebCrypto.use((crypto) => Effect.succeed(make((size) => fillRandom(crypto, size))))
)

/**
 * Synchronously generates `size` cryptographically secure random bytes from
 * `globalThis.crypto`.
 *
 * **When to use**
 *
 * Use when a service cannot be read, as in constructors and model defaults.
 * Elsewhere, use the `SecureRandom` service.
 *
 * **Gotchas**
 *
 * Reads `globalThis.crypto` directly, so neither the `WebCrypto` reference nor
 * a mocked `SecureRandom` service affects it. A negative or non-integer size
 * throws a `RangeError`.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const randomBytesUnsafe = (size: number): Uint8Array => {
  checkSize(size)
  return fillRandom(globalThis.crypto, size)
}

/**
 * Synchronously generates a UUIDv4 from `globalThis.crypto`, as a lowercase
 * hyphenated string or, with `format: "bytes"`, the 16 UUID bytes.
 *
 * **Gotchas**
 *
 * Reads `globalThis.crypto` directly, so neither the `WebCrypto` reference nor
 * a mocked `SecureRandom` service affects it.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const uuidV4Unsafe: {
  (options?: { readonly format?: "string" | undefined }): string
  <Format extends "string" | "bytes">(
    options: { readonly format: Format }
  ): Format extends "bytes" ? Uint8Array : string
} =
  ((options?: { readonly format?: "string" | "bytes" | undefined }) =>
    makeUuid(Uuid.v4Bytes, randomBytesUnsafe, options?.format)) as any

/**
 * Synchronously generates a UUIDv7 from `Date.now()` and `globalThis.crypto`,
 * as a lowercase hyphenated string or, with `format: "bytes"`, the 16 UUID
 * bytes.
 *
 * **Details**
 *
 * Below the maximum timestamp, every UUIDv7 generated in this JS realm
 * (process or worker) sorts after the previous one, as a string and as bytes,
 * using the counter described on the `SecureRandom` service's `uuidV7`. The
 * ordering is shared with `Model.UuidV7WithGenerate`, and does not hold across
 * processes or workers. Consecutive UUIDv7s reveal their
 * generation order, so never use them as secrets.
 *
 * **Gotchas**
 *
 * Reads `Date.now()` rather than the `Clock`, and `globalThis.crypto` rather
 * than the `WebCrypto` reference. A timestamp can run slightly ahead of
 * `Date.now()` when the clock moves back or the counter overflows.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const uuidV7Unsafe: {
  (options?: { readonly format?: "string" | undefined }): string
  <Format extends "string" | "bytes">(
    options: { readonly format: Format }
  ): Format extends "bytes" ? Uint8Array : string
} =
  ((options?: { readonly format?: "string" | "bytes" | undefined }) =>
    makeUuid((bytes) => Uuid.v7Monotonic(Date.now(), bytes), randomBytesUnsafe, options?.format)) as any

/**
 * Synchronously generates a ULID from `Date.now()` and `globalThis.crypto`.
 *
 * **Details**
 *
 * Below the maximum timestamp, every ULID generated in this JS realm (process
 * or worker) sorts after the previous one, using the monotonic mode described
 * on the `SecureRandom` service's `ulid`. The ordering does not hold across
 * processes or workers. Consecutive ULIDs reveal their generation order, so
 * never use them as secrets.
 *
 * **Gotchas**
 *
 * Reads `Date.now()` rather than the `Clock`, and `globalThis.crypto` rather
 * than the `WebCrypto` reference. A timestamp can run slightly ahead of
 * `Date.now()` when the clock moves back or the random part overflows.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const ulidUnsafe = (): string => Ulid.monotonic(Date.now(), ulidRandomBytesUnsafe)

const ulidRandomBytesUnsafe = () => randomBytesUnsafe(10)
