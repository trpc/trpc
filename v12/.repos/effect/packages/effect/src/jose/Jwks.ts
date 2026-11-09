/**
 * JSON Web Key Sets and the `Jwks` service that resolves verification keys
 * from them.
 *
 * A key is selected by algorithm and optional `kid`. It must fit the
 * algorithm's key family and curve, and its `alg`, `use`, and `key_ops`
 * members must allow verification with that algorithm. No match fails with
 * `KeyNotFound` and several matches with `AmbiguousKey`.
 *
 * {@link layerLocal} serves a fixed key set. {@link makeRemote} and
 * {@link layerRemote} fetch one from an HTTPS endpoint and cache it.
 *
 * @stability unstable
 * @since 4.1.1
 */
import * as Cause from "../Cause.ts"
import * as Clock from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Deferred from "../Deferred.ts"
import type * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as HttpClient from "../http/HttpClient.ts"
import * as Layer from "../Layer.ts"
import * as Schema from "../Schema.ts"
import type * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"
import { fail, invalidArgument, millis, noPrivateMembers, parseJsonObject } from "./internal/compact.ts"
import * as JoseError from "./JoseError.ts"
import { type AsymmetricAlgorithm, importPublic, PublicJwk, type PublicKey } from "./Jwk.ts"
import type * as Jws from "./Jws.ts"

// Any other key family or curve, with any other members. Private and
// symmetric members, including RSA factors, are still rejected.
const UnsupportedJwk = Schema.StructWithRest(
  Schema.Struct({
    kty: Schema.String,
    crv: Schema.optionalKey(Schema.String),
    ...noPrivateMembers
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
).check(Schema.makeFilter((jwk) =>
  jwk.kty !== "oct" && jwk.kty !== "RSA" &&
  (jwk.kty !== "EC" ||
    (jwk.crv !== undefined && jwk.crv !== "P-256" && jwk.crv !== "P-384" && jwk.crv !== "P-521")) &&
  (jwk.kty !== "OKP" || (jwk.crv !== undefined && jwk.crv !== "Ed25519"))
))

/**
 * Schema for a set of public JWKs.
 *
 * **Details**
 *
 * Keys of other families or curves are kept but never selected. Private or
 * symmetric members anywhere in the set fail decoding.
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.1
 */
export const KeySet = Schema.Struct({
  keys: Schema.Array(Schema.Union([PublicJwk, UnsupportedJwk]))
})

/**
 * A set of public JWKs.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type KeySet = typeof KeySet.Type

/**
 * The algorithm, and optionally the key id, of the key to resolve.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface Selection {
  readonly algorithm: AsymmetricAlgorithm
  readonly kid?: string | undefined
  /**
   * The unauthenticated header when resolving a token's key. Use it only for
   * key selection; it is authenticated only after verification succeeds.
   */
  readonly protectedHeader?: Jws.ProtectedHeader | undefined
}

/**
 * Service that resolves the verification key for a selection.
 *
 * @stability unstable
 * @category services
 * @since 4.1.1
 */
export class Jwks extends Context.Service<Jwks, {
  readonly resolve: (selection: Selection) => Effect.Effect<PublicKey, JoseError.JoseError>
}>()("effect/jose/Jwks") {}

const isPublicJwk = Schema.is(PublicJwk)

const keyTypes: Record<AsymmetricAlgorithm, { readonly kty: string; readonly crv?: string }> = {
  RS256: { kty: "RSA" },
  RS384: { kty: "RSA" },
  RS512: { kty: "RSA" },
  PS256: { kty: "RSA" },
  PS384: { kty: "RSA" },
  PS512: { kty: "RSA" },
  ES256: { kty: "EC", crv: "P-256" },
  ES384: { kty: "EC", crv: "P-384" },
  ES512: { kty: "EC", crv: "P-521" },
  EdDSA: { kty: "OKP", crv: "Ed25519" }
}

// The keys that can ever be selected, computed once per key set rather than
// on every lookup.
const supportedKeys = (keySet: KeySet): ReadonlyArray<PublicJwk> => keySet.keys.filter(isPublicJwk)

const candidates = (keys: ReadonlyArray<PublicJwk>, selection: Selection): ReadonlyArray<PublicJwk> => {
  const { crv, kty } = keyTypes[selection.algorithm]
  return keys.filter((key) =>
    key.kty === kty &&
    ("crv" in key ? key.crv : undefined) === crv &&
    (selection.kid === undefined || key.kid === selection.kid) &&
    (key.alg === undefined || key.alg === selection.algorithm) &&
    (key.use === undefined || key.use === "sig") &&
    (key.key_ops === undefined || key.key_ops.includes("verify"))
  )
}

// Imports each JWK once per algorithm. Keyed weakly so replaced key sets can be collected.
const makeImporter = () => {
  const imported = new WeakMap<PublicJwk, Map<AsymmetricAlgorithm, PublicKey>>()
  return (
    found: ReadonlyArray<PublicJwk>,
    algorithm: AsymmetricAlgorithm
  ): Effect.Effect<PublicKey, JoseError.JoseError> => {
    if (found.length === 0) return fail(new JoseError.KeyNotFound())
    if (found.length > 1) return fail(new JoseError.AmbiguousKey())
    const jwk = found[0]
    const cached = imported.get(jwk)?.get(algorithm)
    if (cached !== undefined) return Effect.succeed(cached)
    return Effect.tap(importPublic(jwk, algorithm), (key) =>
      Effect.sync(() => {
        let byAlgorithm = imported.get(jwk)
        if (byAlgorithm === undefined) imported.set(jwk, byAlgorithm = new Map())
        byAlgorithm.set(algorithm, key)
      }))
  }
}

/**
 * Builds a `Jwks` service for a fixed key set.
 *
 * **Example** (Resolving a key by `kid`)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 * import { SecureRandom, Signature } from "effect/crypto"
 * import { Jwk, Jwks } from "effect/jose"
 *
 * const layer = Signature.layerWebCrypto.pipe(Layer.provide(SecureRandom.layerWebCrypto))
 *
 * const kid = await Effect.runPromise(Effect.gen(function*() {
 *   const pair = yield* Jwk.generateKeyPair({ algorithm: "ES256", kid: "signing-1" })
 *   const jwks = yield* Jwks.makeLocal({ keys: [pair.publicKey] })
 *   const key = yield* jwks.resolve({ algorithm: "ES256", kid: "signing-1" })
 *   return key.kid
 * }).pipe(Effect.provide(layer)))
 * kid // => "signing-1"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.1.1
 */
export const makeLocal = (keySet: KeySet): Effect.Effect<Jwks["Service"]> =>
  Effect.sync(() => {
    const keys = supportedKeys(keySet)
    const importKey = makeImporter()
    return Jwks.of({
      resolve: (selection) => importKey(candidates(keys, selection), selection.algorithm)
    })
  })

/**
 * Layer that provides `Jwks` for a fixed key set.
 *
 * @stability unstable
 * @category layers
 * @since 4.1.1
 */
export const layerLocal = (keySet: KeySet): Layer.Layer<Jwks> => Layer.effect(Jwks, makeLocal(keySet))

/**
 * Options for {@link makeRemote} and {@link layerRemote}.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface RemoteOptions {
  /**
   * The HTTPS key-set URL, without credentials or a fragment. Take it from
   * configuration, never from a token.
   */
  readonly url: string
  /**
   * How long a fetched key set is used. Defaults to 10 minutes.
   */
  readonly timeToLive?: Duration.Input | undefined
  /**
   * Minimum time before retrying after a failed fetch, or refetching for an
   * unknown key. Defaults to 30 seconds.
   */
  readonly cooldown?: Duration.Input | undefined
  /**
   * Timeout for the request and reading its body. Defaults to 5 seconds.
   */
  readonly timeout?: Duration.Input | undefined
  /**
   * Maximum response body size. Defaults to 131072 bytes.
   */
  readonly maxResponseBytes?: number | undefined
  /**
   * Maximum number of keys in the set. Defaults to 64.
   */
  readonly maxKeys?: number | undefined
}

interface Snapshot {
  readonly keys: ReadonlyArray<PublicJwk>
  readonly expiresAt: number
}

const unavailable = (description: string, cause?: unknown) =>
  new JoseError.JoseError({ reason: new JoseError.KeySetUnavailable({ description, cause }) })

const positiveInteger = (name: string, value: number) =>
  Number.isSafeInteger(value) && value > 0
    ? Effect.succeed(value)
    : invalidArgument(`${name} must be a positive integer`)

const positiveMillis = (name: string, input: Duration.Input) =>
  Effect.flatMap(
    millis(name, input),
    (value) => value > 0 ? Effect.succeed(value) : invalidArgument(`${name} must be positive`)
  )

const readUrl = (input: string) => {
  let url: URL | undefined
  try {
    url = new URL(input)
  } catch {
    url = undefined
  }
  return url !== undefined && url.protocol === "https:" && url.username === "" && url.password === "" && url.hash === ""
    ? Effect.succeed(url)
    : invalidArgument("url must be an HTTPS URL without credentials or a fragment")
}

/**
 * Builds a `Jwks` service for a remote key set, using the `HttpClient`
 * service. Use it when the URL is only known at runtime, for example from
 * OpenID Connect discovery.
 *
 * **Details**
 *
 * The key set is fetched on first use and reused until `timeToLive` passes.
 * Concurrent callers share one request. A selection that finds no key fetches
 * the set again, at most once per `cooldown`, so rotated keys are picked up
 * without letting unknown `kid`s drive a request per token. A failed fetch
 * fails every caller until `cooldown` passes; there is no fallback to an
 * expired set.
 *
 * Only a 200 response from the configured URL is accepted, so a redirected
 * key set is rejected. The check runs on the response, so it cannot stop a
 * client from sending the redirected request.
 *
 * **Gotchas**
 *
 * Supply a client that does not follow redirects. `FetchHttpClient` follows
 * them by default: provide `FetchHttpClient.RequestInit` with
 * `{ redirect: "manual" }` on its layer so a redirect fails before any further
 * request. Clients wrapped with `HttpClient.followRedirects` also follow them.
 *
 * Closing the scope interrupts any request in flight, and later resolutions
 * fail with `KeySetUnavailable`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.1.1
 */
export const makeRemote = Effect.fnUntraced(function*(
  options: RemoteOptions
): Effect.fn.Return<Jwks["Service"], JoseError.JoseError, HttpClient.HttpClient | Scope.Scope> {
  const url = yield* readUrl(options.url)
  const timeToLive = yield* positiveMillis("timeToLive", options.timeToLive ?? "10 minutes")
  const cooldown = yield* millis("cooldown", options.cooldown ?? "30 seconds")
  const timeout = yield* positiveMillis("timeout", options.timeout ?? "5 seconds")
  const maxResponseBytes = yield* positiveInteger("maxResponseBytes", options.maxResponseBytes ?? 131072)
  const maxKeys = yield* positiveInteger("maxKeys", options.maxKeys ?? 64)

  const client = HttpClient.withScope(yield* HttpClient.HttpClient)
  const scope = yield* Effect.scope
  const importKey = makeImporter()

  let cache: Snapshot | undefined
  let pending: Deferred.Deferred<Snapshot, JoseError.JoseError> | undefined
  let lastAttempt = -Infinity
  let lastFailed = false
  let closed = false

  const closedExit = Exit.fail(unavailable("The key set scope is closed"))
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      closed = true
      if (pending !== undefined) Deferred.doneUnsafe(pending, closedExit)
    })
  )

  const fetch = Effect.gen(function*() {
    const response = yield* client.get(url.href, { headers: { accept: "application/json" } })
    if (response.status !== 200) {
      return yield* unavailable(`The key set endpoint responded with status ${response.status}`)
    }
    if (response.url !== url.href) {
      return yield* unavailable("The key set response came from another URL")
    }
    const body = new Uint8Array(maxResponseBytes)
    const length = yield* Stream.runFoldEffect(response.stream, () => 0, (length, chunk) => {
      if (chunk.length > body.length - length) {
        return Effect.fail(unavailable(`The key set response exceeds ${maxResponseBytes} bytes`))
      }
      body.set(chunk, length)
      return Effect.succeed(length + chunk.length)
    })
    const keySet = yield* Schema.decodeUnknownEffect(KeySet)(parseJsonObject(body.subarray(0, length))).pipe(
      Effect.mapError((cause) => unavailable("The key set document is invalid", cause))
    )
    if (keySet.keys.length > maxKeys) {
      return yield* unavailable(`The key set has more than ${maxKeys} keys`)
    }
    return { keys: supportedKeys(keySet), expiresAt: (yield* Clock.currentTimeMillis) + timeToLive }
  }).pipe(
    Effect.scoped,
    Effect.catchTag("HttpClientError", (cause) => Effect.fail(unavailable("The key set request failed", cause))),
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () => Effect.fail(unavailable("The key set request timed out"))
    })
  )

  // Returns `undefined` while cooling down, which applies only to unknown-key
  // refetches (`stale` lacked the key) and retries after a failure.
  const refresh = (now: number, stale?: Snapshot) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.suspend((): Effect.Effect<Snapshot | undefined, JoseError.JoseError> => {
        if (closed) return closedExit
        if (cache !== undefined && cache !== stale && cache.expiresAt > now) return Effect.succeed(cache)
        if (pending !== undefined) return restore(Deferred.await(pending))
        if ((stale !== undefined || lastFailed) && now - lastAttempt < cooldown) return Effect.succeed(undefined)
        lastAttempt = now
        const result = pending = Deferred.makeUnsafe<Snapshot, JoseError.JoseError>()
        return fetch.pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              pending = undefined
              lastFailed = Exit.isFailure(exit)
              if (Exit.isSuccess(exit)) cache = exit.value
              Deferred.doneUnsafe(
                result,
                Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause) ? closedExit : exit
              )
            })
          ),
          Effect.forkIn(scope, { uninterruptible: false }),
          Effect.andThen(restore(Deferred.await(result)))
        )
      })
    )

  const resolve = (selection: Selection) =>
    Effect.flatMap(Clock.currentTimeMillis, (now): Effect.Effect<PublicKey, JoseError.JoseError> => {
      if (closed) return closedExit
      const lookup = (snapshot: Snapshot) => importKey(candidates(snapshot.keys, selection), selection.algorithm)
      const current = cache
      if (current !== undefined && current.expiresAt > now) {
        const found = candidates(current.keys, selection)
        if (found.length > 0) return importKey(found, selection.algorithm)
        // An unknown key may have been rotated in. Refetch, unless cooling down.
        return Effect.flatMap(
          refresh(now, current),
          (snapshot) => snapshot === undefined ? fail(new JoseError.KeyNotFound()) : lookup(snapshot)
        )
      }
      return Effect.flatMap(refresh(now), (snapshot) =>
        snapshot === undefined
          ? Effect.fail(unavailable("The key set is cooling down after a failed fetch"))
          : lookup(snapshot))
    })

  return Jwks.of({ resolve })
})

/**
 * Layer that provides `Jwks` from a remote key set built by {@link makeRemote}.
 * Closing the layer interrupts any request in flight.
 *
 * @stability unstable
 * @category layers
 * @since 4.1.1
 */
export const layerRemote = (
  options: RemoteOptions
): Layer.Layer<Jwks, JoseError.JoseError, HttpClient.HttpClient> => Layer.effect(Jwks, makeRemote(options))
