/**
 * The WebCrypto `Crypto` object that the `effect/crypto` modules run on.
 *
 * The `layerWebCrypto` layers of the family modules, such as
 * `Digest.layerWebCrypto`, and key functions that touch
 * `crypto.subtle`, such as `Mac.toBytes`, read the {@link WebCrypto}
 * reference. It defaults to `globalThis.crypto`. Provide {@link layer} to run
 * them on a polyfill, a worker's object, or a test double.
 *
 * **Gotchas**
 *
 * Browsers expose `crypto.subtle` only in secure contexts. Elsewhere, every
 * operation that needs it dies with "crypto.subtle is unavailable". Layers
 * still build, and `SecureRandom` and the pure TypeScript algorithms, such as
 * MD5, keep working.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Layer from "../Layer.ts"

// The type of `globalThis.crypto`, which, unlike the global `Crypto` type,
// every `@types/node` version declares.
type Crypto = typeof globalThis.crypto

/**
 * Reference to the WebCrypto `Crypto` object, defaulting to
 * `globalThis.crypto`.
 *
 * @see {@link layer} for replacing it
 *
 * @stability unstable
 * @category references
 * @since 4.0.0
 */
export const WebCrypto: Context.Reference<Crypto> = Context.Reference<Crypto>("effect/crypto/WebCrypto", {
  defaultValue: () => globalThis.crypto
})

/**
 * Layer that sets the {@link WebCrypto} reference.
 *
 * **When to use**
 *
 * Use to run the `effect/crypto` modules on a polyfill, a worker's `Crypto`
 * object, or a test double.
 *
 * **Example** (Using a `Crypto` polyfill)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Digest, WebCrypto } from "effect/crypto"
 *
 * const program = Effect.gen(function*() {
 *   const digest = yield* Digest.Digest
 *   return yield* digest.digestHex(Digest.sha256, new TextEncoder().encode("abc"))
 * }).pipe(Effect.provide(Digest.layerWebCrypto))
 *
 * const hex = await Effect.runPromise(program.pipe(Effect.provide(WebCrypto.layer(globalThis.crypto))))
 * hex.length // => 64
 * ```
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (crypto: Crypto): Layer.Layer<never> => Layer.succeed(WebCrypto, crypto)

/**
 * A WebCrypto `CryptoKey`, declared structurally so the `effect` declarations
 * type-check without the DOM library and with any `@types/node` version.
 * Keys from `crypto.subtle` and Node's `webcrypto` are assignable to it.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface CryptoKey {
  readonly algorithm: { readonly name: string }
  readonly extractable: boolean
  readonly type: "private" | "public" | "secret"
  readonly usages: ReadonlyArray<string>
}
