import * as Effect from "../../Effect.ts"
import * as Equal from "../../Equal.ts"
import { format } from "../../Formatter.ts"
import { NodeInspectSymbol } from "../../Inspectable.ts"
import * as Predicate from "../../Predicate.ts"
import type * as CryptoError from "../CryptoError.ts"
import type * as WebCrypto from "../WebCrypto.ts"
import * as internal from "./webCrypto.ts"

/**
 * What a key holds: bytes, which every layer accepts, or a `CryptoKey` from a
 * `*FromCryptoKey` constructor.
 *
 * @internal
 */
export type Material =
  | { readonly _tag: "Bytes"; readonly bytes: Uint8Array }
  | { readonly _tag: "CryptoKey"; readonly cryptoKey: CryptoKey }

/**
 * The property holding a key's material. Only this package reads it: platform
 * layers pass primitives to a family's `layerWebCryptoWith` instead, and
 * third-party layers use the family's public `toBytes`.
 *
 * This is not a secrecy mechanism. Being non-enumerable keeps the material out
 * of `JSON.stringify` and `inspect`, but anyone holding a key can reach it
 * through `Object.getOwnPropertySymbols`.
 *
 * @internal
 */
export const MaterialId: unique symbol = Symbol("~effect/crypto/Key/material") as never

/**
 * Copies bytes into a plain `Uint8Array` with its own buffer. A subclass's
 * `slice` may not copy: a Node.js `Buffer`'s returns a view of the same memory.
 *
 * @internal
 */
export const copyBytes = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes)

/** @internal */
export const material = (key: object): Material => (key as { readonly [MaterialId]: Material })[MaterialId]

/**
 * Builds a key prototype that displays only its algorithm.
 *
 * @internal
 */
export const redactedProto = (typeId: string, label: string): object => ({
  [typeId]: typeId,
  toJSON(this: { readonly algorithm: { readonly name: string } }) {
    return { _id: label, algorithm: this.algorithm.name }
  },
  toString(this: { toJSON(): unknown }) {
    return format(this.toJSON())
  },
  [NodeInspectSymbol](this: { toJSON(): unknown }) {
    return this.toJSON()
  }
})

/**
 * Builds a key. Keys compare by reference: comparing key bytes is not constant
 * time, and structural equality would let secret keys act as `HashMap` keys.
 */
const make = <K>(proto: object, algorithm: unknown, material: Material): K =>
  Equal.byReferenceUnsafe(Object.create(proto, {
    algorithm: { value: algorithm, enumerable: true },
    [MaterialId]: { value: material }
  }))

/** @internal */
export const makeBytes = <K>(proto: object, algorithm: unknown, bytes: Uint8Array): K =>
  make(proto, algorithm, { _tag: "Bytes", bytes })

/**
 * Checks the length of a symmetric key against its algorithm.
 *
 * @internal
 */
export const checkKeyLength =
  (algorithm: { readonly name: string; readonly keyLength: number }) => (bytes: Uint8Array): string | undefined =>
    bytes.length === algorithm.keyLength
      ? undefined
      : `Expected a ${algorithm.keyLength}-byte key for ${algorithm.name}, not ${bytes.length} bytes`

/**
 * Copies raw key bytes into a byte-backed key, rejecting other values and
 * bytes that fail `check`.
 *
 * @internal
 */
export const fromBytes = <K>(
  module: string,
  method: string,
  proto: object,
  algorithm: unknown,
  bytes: Uint8Array,
  check: (bytes: Uint8Array) => string | undefined
): Effect.Effect<K, CryptoError.CryptoError> =>
  Effect.suspend(() => {
    if (!(bytes instanceof Uint8Array)) return internal.invalidKey(module, method, "Expected the key as a Uint8Array")
    const problem = check(bytes)
    return problem === undefined
      ? Effect.succeed(makeBytes<K>(proto, algorithm, copyBytes(bytes)))
      : internal.invalidKey(module, method, problem)
  })

/**
 * What a `CryptoKey` must match to back a typed key.
 *
 * `usagePolicy: "all"` requires every expected usage. `"any"` is for RSA-OAEP,
 * where the layer chooses an available usage for the key's role.
 *
 * @internal
 */
export interface ExpectedCryptoKey {
  readonly type: KeyType
  readonly name: string
  readonly usages: ReadonlyArray<KeyUsage>
  readonly usagePolicy: "all" | "any"
  readonly check?: ((algorithm: KeyAlgorithm) => string | undefined) | undefined
}

/**
 * Checks that an AES `CryptoKey` has the algorithm's length.
 *
 * @internal
 */
export const checkAesLength = (name: string, keyLength: number) => (algorithm: KeyAlgorithm): string | undefined => {
  const length = (algorithm as AesKeyAlgorithm).length
  return length === keyLength * 8 ? undefined : `Expected a ${keyLength * 8}-bit ${name} key, not ${length} bits`
}

const checkCryptoKey = (cryptoKey: WebCrypto.CryptoKey, expected: ExpectedCryptoKey): string | undefined => {
  if (
    !Predicate.hasProperty(cryptoKey, "type") || !Predicate.hasProperty(cryptoKey, "algorithm") ||
    !Predicate.hasProperty(cryptoKey, "usages") || !Array.isArray(cryptoKey.usages)
  ) {
    return "Expected a CryptoKey"
  }
  if (cryptoKey.algorithm.name !== expected.name) {
    return `Expected a ${expected.name} key, not ${cryptoKey.algorithm.name}`
  }
  if (cryptoKey.type !== expected.type) return `Expected a ${expected.type} key, not ${cryptoKey.type}`
  const problem = expected.check?.(cryptoKey.algorithm)
  if (problem !== undefined) return problem
  const usages: ReadonlyArray<string> = cryptoKey.usages
  if (expected.usagePolicy === "all") {
    if (!expected.usages.every((usage) => usages.includes(usage))) {
      return `Expected a key with the usages ${expected.usages.join(" and ")}, not ${usages.join(", ") || "none"}`
    }
  } else if (!expected.usages.some((usage) => usages.includes(usage))) {
    return `Expected a key with one of the usages ${expected.usages.join(", ")}`
  }
  return undefined
}

/**
 * The algorithm of a key imported from `cryptoKey`. An RSA algorithm's
 * `modulusLength` is only read by key generation, so the key reports the real
 * size of `cryptoKey` instead.
 *
 * @internal
 */
export const importedAlgorithm = (algorithm: unknown, cryptoKey: WebCrypto.CryptoKey): unknown => {
  const modulusLength = (cryptoKey.algorithm as Partial<RsaKeyAlgorithm>).modulusLength
  return Predicate.hasProperty(algorithm, "modulusLength") && modulusLength !== undefined &&
      algorithm.modulusLength !== modulusLength
    ? { ...algorithm, modulusLength }
    : algorithm
}

/**
 * Synchronously validates and wraps a `CryptoKey`. The structural key only
 * becomes the native `CryptoKey` once it passes the check.
 *
 * @internal
 */
export const fromCryptoKey = <K>(
  module: string,
  method: string,
  proto: object,
  algorithm: unknown,
  cryptoKey: WebCrypto.CryptoKey,
  expected: ExpectedCryptoKey
): Effect.Effect<K, CryptoError.CryptoError> =>
  Effect.suspend(() => {
    const problem = checkCryptoKey(cryptoKey, expected)
    return problem === undefined
      ? Effect.succeed(
        make<K>(proto, importedAlgorithm(algorithm, cryptoKey), {
          _tag: "CryptoKey",
          cryptoKey: cryptoKey as CryptoKey
        })
      )
      : internal.invalidKey(module, method, problem)
  })

/** @internal */
export const exportRaw = async (subtle: SubtleCrypto, cryptoKey: CryptoKey): Promise<Uint8Array> =>
  new Uint8Array(await subtle.exportKey("raw", cryptoKey))

/**
 * Exports a key's stored representation as fresh bytes. `CryptoKey`-backed
 * keys are exported on the `WebCrypto` reference with `exportKey`.
 *
 * @internal
 */
export const toBytes = (
  module: string,
  key: { readonly algorithm: { readonly name: string } },
  exportKey: (subtle: SubtleCrypto, cryptoKey: CryptoKey) => Promise<Uint8Array>
): Effect.Effect<Uint8Array, CryptoError.CryptoError> =>
  Effect.suspend(() => {
    const stored = material(key)
    if (stored._tag === "Bytes") return Effect.succeed(copyBytes(stored.bytes))
    if (!stored.cryptoKey.extractable) return internal.notExtractable(module, "toBytes")
    return internal.runWithReference(module, "toBytes", key.algorithm.name, (subtle) =>
      exportKey(subtle, stored.cryptoKey))
  })

/**
 * A per-layer cache of the `CryptoKey`s imported from byte-backed keys.
 *
 * @internal
 */
export const makeCache = (
  importKey: (subtle: SubtleCrypto, bytes: Uint8Array, algorithm: any) => Promise<CryptoKey>
) => {
  const cache = new WeakMap<object, CryptoKey>()
  return async (subtle: SubtleCrypto, key: { readonly algorithm: unknown }): Promise<CryptoKey> => {
    const stored = material(key)
    if (stored._tag === "CryptoKey") return stored.cryptoKey
    let cryptoKey = cache.get(key)
    if (cryptoKey === undefined) {
      cryptoKey = await importKey(subtle, stored.bytes, key.algorithm)
      cache.set(key, cryptoKey)
    }
    return cryptoKey
  }
}
