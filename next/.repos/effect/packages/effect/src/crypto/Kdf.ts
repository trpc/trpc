/**
 * Key derivation: HKDF, PBKDF2, and Argon2id.
 *
 * The {@link Kdf} service derives bytes from a secret with an algorithm value
 * such as {@link hkdfSha256}, {@link pbkdf2Sha256}, or `argon2id()`. The
 * output is plain bytes: turn it into a typed key with the target family's raw
 * constructor, such as `Mac.key`.
 *
 * **Gotchas**
 *
 * - The secret is bytes, with no string overload. Encode passwords yourself,
 *   and normalize their Unicode form first if users type them on different
 *   platforms.
 * - `layerWebCrypto` does not provide Argon2id, because WebCrypto has no
 *   Argon2. Deriving with it fails with an `Unsupported` reason, so programs
 *   can fall back to PBKDF2. `NodeCrypto.layerKdf` provides Argon2id on
 *   Node.js 24.7 or later and Bun 1.4.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as CryptoError from "./CryptoError.ts"
import * as Digest from "./Digest.ts"
import * as internal from "./internal/webCrypto.ts"
import { WebCrypto } from "./WebCrypto.ts"

/**
 * HKDF (RFC 5869) with a hash, from {@link hkdf}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Hkdf {
  readonly _tag: "Hkdf"
  readonly name: string
  readonly hash: Digest.Algorithm
}

/**
 * PBKDF2 (RFC 8018) with a hash and an iteration count, from {@link pbkdf2}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Pbkdf2 {
  readonly _tag: "Pbkdf2"
  readonly name: string
  readonly hash: Digest.Algorithm
  readonly iterations: number
}

/**
 * Argon2id (RFC 9106) with its cost parameters, from {@link argon2id}.
 *
 * **Details**
 *
 * `memory` is in KiB, `passes` is the number of passes over the memory, and
 * `parallelism` is the number of lanes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Argon2id {
  readonly _tag: "Argon2id"
  readonly name: string
  readonly memory: number
  readonly passes: number
  readonly parallelism: number
}

/**
 * A key derivation algorithm.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Algorithm = Hkdf | Pbkdf2 | Argon2id

/**
 * Builds the HKDF algorithm for a hash.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const hkdf = (hash: Digest.Algorithm): Hkdf => ({ _tag: "Hkdf", name: `hkdf${Digest.nameSuffix(hash)}`, hash })

/**
 * Builds a PBKDF2 algorithm for a hash and an iteration count.
 *
 * **Details**
 *
 * Deriving with an iteration count outside 1 to 2^31 - 1 fails with an
 * `InvalidArgument` reason.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const pbkdf2 = (options: { readonly hash: Digest.Algorithm; readonly iterations: number }): Pbkdf2 => ({
  _tag: "Pbkdf2",
  name: `pbkdf2${Digest.nameSuffix(options.hash)}`,
  hash: options.hash,
  iterations: options.iterations
})

/**
 * HKDF with SHA-1.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const hkdfSha1: Hkdf = hkdf(Digest.sha1)

/**
 * HKDF with SHA-256.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const hkdfSha256: Hkdf = hkdf(Digest.sha256)

/**
 * HKDF with SHA-384.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const hkdfSha384: Hkdf = hkdf(Digest.sha384)

/**
 * HKDF with SHA-512.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const hkdfSha512: Hkdf = hkdf(Digest.sha512)

/**
 * PBKDF2 with SHA-256 at 600,000 iterations, OWASP's current figure.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const pbkdf2Sha256: Pbkdf2 = pbkdf2({ hash: Digest.sha256, iterations: 600_000 })

/**
 * Builds an Argon2id algorithm, with `memory` in KiB.
 *
 * **Details**
 *
 * Omitted costs default to RFC 9106's second recommended setting: 64 MiB of
 * memory (`65_536`), 3 passes, and 4 lanes.
 *
 * **Gotchas**
 *
 * `Kdf.layerWebCrypto` does not provide Argon2id. Use `NodeCrypto.layerKdf`,
 * or fall back to PBKDF2 on the `Unsupported` reason.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const argon2id = (options?: {
  readonly memory?: number | undefined
  readonly passes?: number | undefined
  readonly parallelism?: number | undefined
}): Argon2id => ({
  _tag: "Argon2id",
  name: "argon2id",
  memory: options?.memory ?? 65_536,
  passes: options?.passes ?? 3,
  parallelism: options?.parallelism ?? 4
})

/**
 * Service that derives bytes from a secret.
 *
 * **Example** (Deriving a key with HKDF)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Kdf } from "effect/crypto"
 *
 * const program = Effect.gen(function*() {
 *   const kdf = yield* Kdf.Kdf
 *   return yield* kdf.derive(Kdf.hkdfSha256, new Uint8Array(32), {
 *     salt: new Uint8Array(16),
 *     info: new TextEncoder().encode("encryption"),
 *     length: 32
 *   })
 * })
 *
 * const bytes = await Effect.runPromise(program.pipe(Effect.provide(Kdf.layerWebCrypto)))
 * bytes.length // => 32
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Kdf extends Context.Service<Kdf, {
  /**
   * Derives `length` bytes from `secret`.
   *
   * `info` only applies to HKDF; passing it with PBKDF2 or Argon2id fails
   * with an `InvalidArgument` reason.
   */
  readonly derive: (
    algorithm: Algorithm,
    secret: Uint8Array,
    options: {
      readonly salt: Uint8Array
      readonly length: number
      readonly info?: Uint8Array | undefined
    }
  ) => Effect.Effect<Uint8Array, CryptoError.CryptoError>
}>()("effect/crypto/Kdf") {}

type DeriveOptions = Parameters<Kdf["Service"]["derive"]>[2]

const invalidArgument = (description: string) =>
  internal.fail("Kdf", "derive", new CryptoError.InvalidArgument({ description }))

const isIntegerIn = (n: number, min: number, max: number): boolean => Number.isSafeInteger(n) && n >= min && n <= max

// Checks the arguments before they reach Web Crypto, which takes a 32-bit bit
// length that some backends wrap instead of rejecting. Node.js aborts the
// process on PBKDF2 iteration counts above 2^31 - 1.
const checkArguments = (
  algorithm: Algorithm,
  options: DeriveOptions
): Effect.Effect<never, CryptoError.CryptoError> | undefined => {
  if (algorithm._tag !== "Hkdf" && options.info !== undefined) return invalidArgument("info only applies to HKDF")
  if (algorithm._tag === "Argon2id") return undefined
  if (algorithm.hash.name === "MD5") return invalidArgument(`${algorithm._tag} needs a SHA hash, not MD5`)
  if (algorithm._tag === "Hkdf") {
    const maxLength = 255 * algorithm.hash.outputLength
    return isIntegerIn(options.length, 1, maxLength)
      ? undefined
      : invalidArgument(`length must be between 1 and ${maxLength} bytes for ${algorithm.name}`)
  }
  if (!isIntegerIn(algorithm.iterations, 1, 0x7fff_ffff)) {
    return invalidArgument("iterations must be between 1 and 2^31 - 1")
  }
  return isIntegerIn(options.length, 1, 0x1fff_ffff)
    ? undefined
    : invalidArgument("length must be between 1 and 2^29 - 1 bytes")
}

const webCryptoParams = (algorithm: Hkdf | Pbkdf2, options: DeriveOptions): HkdfParams | Pbkdf2Params =>
  algorithm._tag === "Hkdf"
    ? {
      name: "HKDF",
      hash: algorithm.hash.name,
      salt: options.salt as BufferSource,
      info: (options.info ?? new Uint8Array()) as BufferSource
    }
    : {
      name: "PBKDF2",
      hash: algorithm.hash.name,
      salt: options.salt as BufferSource,
      iterations: algorithm.iterations
    }

/**
 * Layer that provides `Kdf` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * HKDF and PBKDF2 run on `crypto.subtle`, off the event loop where the runtime
 * supports it. Argon2id fails with an `Unsupported` reason.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebCrypto: Layer.Layer<Kdf> = Layer.effect(
  Kdf,
  WebCrypto.use((crypto) =>
    Effect.succeed(Kdf.of({
      derive: (algorithm, secret, options) =>
        Effect.suspend(() => {
          const failure = checkArguments(algorithm, options)
          if (failure !== undefined) return failure
          if (algorithm._tag === "Argon2id") {
            return internal.fail(
              "Kdf",
              "derive",
              new CryptoError.Unsupported({ description: "Kdf.layerWebCrypto does not provide argon2id" })
            )
          }
          const name = algorithm._tag === "Hkdf" ? "HKDF" : "PBKDF2"
          return internal.run("Kdf", "derive", algorithm.name, crypto, async (subtle) => {
            const handle = await subtle.importKey("raw", secret as BufferSource, name, false, ["deriveBits"])
            return new Uint8Array(
              await subtle.deriveBits(webCryptoParams(algorithm, options), handle, options.length * 8)
            )
          })
        })
    }))
  )
)
