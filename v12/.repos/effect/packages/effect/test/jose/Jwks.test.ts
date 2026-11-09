import { assert, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { Jwk, Jwks } from "effect/jose"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import { TestClock } from "effect/testing"
import { assertReason, es256PublicJwk, layer, rfc7515, rs256PublicJwk } from "./utils.ts"

const ec = { ...es256PublicJwk, kid: "ec" }
const rsa = { ...rs256PublicJwk, kid: "rsa", alg: "RS256" }
const url = "https://issuer.example/keys"

it.effect("selects a unique local key by algorithm, kid, and metadata", () =>
  Effect.gen(function*() {
    const { publicKey: p384 } = yield* Jwk.generateKeyPair({ algorithm: "ES384", kid: "ec" })
    const { alg: _alg384, ...ec384 } = p384
    const keySet: Jwks.KeySet = {
      keys: [
        ec,
        ec384,
        rsa,
        // Unsupported families and curves are tolerated but never selected.
        { kty: "EC", crv: "P-224", x: "x", y: "y", kid: "ec" },
        { kty: "OKP", crv: "X25519", x: "x" }
      ]
    }
    assert.isTrue(Schema.is(Jwks.KeySet)(keySet))
    const resolver = yield* Jwks.makeLocal(keySet)

    const key = yield* resolver.resolve({ algorithm: "ES256", kid: "ec" })
    assert.strictEqual(key.kid, "ec")
    assert.deepStrictEqual(key.jwk, ec)
    assert.deepStrictEqual((yield* resolver.resolve({ algorithm: "ES384", kid: "ec" })).jwk, ec384)
    assert.strictEqual((yield* resolver.resolve({ algorithm: "RS256" })).kid, "rsa")

    // Declared `alg` excludes the key from other algorithms of its family.
    assertReason(yield* resolver.resolve({ algorithm: "PS256", kid: "rsa" }).pipe(Effect.flip), "KeyNotFound")
    assertReason(yield* resolver.resolve({ algorithm: "EdDSA" }).pipe(Effect.flip), "KeyNotFound")
    assertReason(yield* resolver.resolve({ algorithm: "ES256", kid: "missing" }).pipe(Effect.flip), "KeyNotFound")

    const ambiguous = yield* Jwks.makeLocal({ keys: [ec, { ...ec, kid: "ec2" }] })
    assertReason(yield* ambiguous.resolve({ algorithm: "ES256" }).pipe(Effect.flip), "AmbiguousKey")
    assert.strictEqual((yield* ambiguous.resolve({ algorithm: "ES256", kid: "ec2" })).kid, "ec2")

    // Private or symmetric material is never a public key set.
    assert.isFalse(Schema.is(Jwks.KeySet)({ keys: [rfc7515.es256.jwk] }))
    assert.isFalse(Schema.is(Jwks.KeySet)({ keys: [rfc7515.hs256.jwk] }))
  }).pipe(Effect.provide(layer)))

const serve = (handler: () => Effect.Effect<Response>) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => Effect.map(handler(), (response) => HttpClientResponse.fromWeb(request, response)))
  )

it.effect("caches remote key sets, coalesces concurrent refreshes, and refreshes once for unknown kids", () =>
  Effect.gen(function*() {
    let requests = 0
    let document: unknown = { keys: [ec] }
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()

    const context = yield* Layer.build(
      Jwks.layerRemote({ url, timeToLive: 100, cooldown: 10 }).pipe(
        Layer.provide(serve(() =>
          Effect.gen(function*() {
            requests++
            yield* Deferred.succeed(entered, undefined)
            yield* Deferred.await(release)
            return new Response(JSON.stringify(document))
          })
        ))
      )
    )
    const keys = Context.get(context, Jwks.Jwks)

    // A cold cache admits one request for any number of concurrent callers.
    const concurrent = yield* Effect.forkChild(
      Effect.all(Array.from({ length: 12 }, () => keys.resolve({ algorithm: "ES256", kid: "ec" })), { concurrency: 12 })
    )
    yield* Deferred.await(entered)
    yield* Deferred.succeed(release, undefined)
    assert.lengthOf(yield* Fiber.join(concurrent), 12)
    assert.strictEqual(requests, 1)

    // An unknown kid refreshes at most once per cooldown, so a flood of
    // unknown kids cannot drive a request per token.
    assertReason(yield* keys.resolve({ algorithm: "ES256", kid: "rotated" }).pipe(Effect.flip), "KeyNotFound")
    assertReason(yield* keys.resolve({ algorithm: "ES256", kid: "rotated" }).pipe(Effect.flip), "KeyNotFound")
    assert.strictEqual(requests, 1)

    document = { keys: [{ ...ec, kid: "rotated" }] }
    yield* TestClock.adjust(11)
    assert.strictEqual((yield* keys.resolve({ algorithm: "ES256", kid: "rotated" })).kid, "rotated")
    assert.strictEqual(requests, 2)

    // Within the TTL the cache answers without a request.
    yield* TestClock.adjust(50)
    assert.strictEqual((yield* keys.resolve({ algorithm: "ES256", kid: "rotated" })).kid, "rotated")
    assert.strictEqual(requests, 2)

    // After the TTL a bad document fails every caller until the cooldown passes.
    document = { keys: [rfc7515.es256.jwk] }
    yield* TestClock.adjust(51)
    assertReason(yield* keys.resolve({ algorithm: "ES256", kid: "rotated" }).pipe(Effect.flip), "KeySetUnavailable")
    assertReason(yield* keys.resolve({ algorithm: "ES256", kid: "rotated" }).pipe(Effect.flip), "KeySetUnavailable")
    assert.strictEqual(requests, 3)

    // Once the cooldown passes, a good document recovers.
    document = { keys: [{ ...ec, kid: "rotated" }] }
    yield* TestClock.adjust(11)
    assert.strictEqual((yield* keys.resolve({ algorithm: "ES256", kid: "rotated" })).kid, "rotated")
    assert.strictEqual(requests, 4)
  }).pipe(Effect.provide(layer)))

it.effect("refetches an expired key set at once when timeToLive is shorter than cooldown", () =>
  Effect.gen(function*() {
    let requests = 0
    let status = 500
    const context = yield* Layer.build(
      Jwks.layerRemote({ url, timeToLive: "10 seconds", cooldown: "30 seconds" }).pipe(
        Layer.provide(serve(() =>
          Effect.sync(() => {
            requests++
            return new Response(JSON.stringify({ keys: [ec] }), { status })
          })
        ))
      )
    )
    const keys = Context.get(context, Jwks.Jwks)

    // A failed fetch still cools down.
    assertReason(yield* keys.resolve({ algorithm: "ES256", kid: "ec" }).pipe(Effect.flip), "KeySetUnavailable")
    status = 200
    yield* TestClock.adjust("5 seconds")
    assertReason(yield* keys.resolve({ algorithm: "ES256", kid: "ec" }).pipe(Effect.flip), "KeySetUnavailable")
    assert.strictEqual(requests, 1)
    yield* TestClock.adjust("30 seconds")
    yield* keys.resolve({ algorithm: "ES256", kid: "ec" })
    assert.strictEqual(requests, 2)

    // A set that expired after a successful fetch is refetched without waiting for the cooldown.
    yield* TestClock.adjust("15 seconds")
    assert.strictEqual((yield* keys.resolve({ algorithm: "ES256", kid: "ec" })).kid, "ec")
    assert.strictEqual(requests, 3)

    // Unknown kids still refetch at most once per cooldown.
    assertReason(yield* keys.resolve({ algorithm: "ES256", kid: "unknown" }).pipe(Effect.flip), "KeyNotFound")
    assert.strictEqual(requests, 3)
  }))

it.effect("accepts only a 200 document from the configured HTTPS URL", () =>
  Effect.gen(function*() {
    const resolve = (client: Layer.Layer<HttpClient.HttpClient>, options?: Partial<Jwks.RemoteOptions>) =>
      Layer.build(Jwks.layerRemote({ url, ...options }).pipe(Layer.provide(client))).pipe(
        Effect.flatMap((context) => Context.get(context, Jwks.Jwks).resolve({ algorithm: "ES256" })),
        Effect.flip
      )

    for (
      const bad of [
        "http://issuer.example/keys",
        "https://user:pw@issuer.example/keys",
        "https://issuer.example/keys#frag"
      ]
    ) {
      assertReason(yield* resolve(serve(() => Effect.succeed(new Response("{}"))), { url: bad }), "InvalidArgument")
    }

    // A client that follows redirects answers from another origin; the body is discarded.
    let followed = 0
    const redirected = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.sync(() => {
          followed++
          return HttpClientResponse.fromWeb(
            { ...request, url: "https://attacker.example/keys" },
            new Response(JSON.stringify({ keys: [ec] }))
          )
        })
      )
    )
    assertReason(yield* resolve(redirected), "KeySetUnavailable")
    assert.strictEqual(followed, 1)

    // A fetch client configured with `redirect: "manual"` sends no request past
    // the first hop and keeps its other options. This fake follows like `fetch`
    // unless the request asks for manual redirects.
    const destinations: Array<string> = []
    const inits: Array<RequestInit | undefined> = []
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      destinations.push(String(input))
      inits.push(init)
      if (init?.redirect === "manual") {
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } })
      }
      destinations.push("http://127.0.0.1/admin", url)
      return new Response(JSON.stringify({ keys: [ec] }))
    }) as typeof globalThis.fetch
    const configured = FetchHttpClient.layer.pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, {
        redirect: "manual",
        credentials: "include",
        cache: "no-store",
        integrity: "sha256-configured",
        headers: { authorization: "Bearer configured" }
      }))
    )
    assertReason(
      yield* resolve(configured).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
      "KeySetUnavailable"
    )
    assert.deepStrictEqual(destinations, [url])
    assert.deepInclude(inits[0], {
      redirect: "manual",
      credentials: "include",
      cache: "no-store",
      integrity: "sha256-configured"
    })
    assert.strictEqual(new Headers(inits[0]?.headers).get("authorization"), "Bearer configured")

    // A redirect status is a failed response, not a hop.
    assertReason(
      yield* resolve(serve(() =>
        Effect.succeed(new Response(null, { status: 302, headers: { location: "https://attacker.example/keys" } }))
      )),
      "KeySetUnavailable"
    )
    assertReason(
      yield* resolve(serve(() =>
        Effect.succeed(new Response("{}", { status: 500 }))
      )),
      "KeySetUnavailable"
    )

    // Response bounds.
    const two = serve(() => Effect.succeed(new Response(JSON.stringify({ keys: [ec, { ...ec, kid: "ec2" }] }))))
    assertReason(yield* resolve(two, { maxResponseBytes: 40 }), "KeySetUnavailable")
    assertReason(yield* resolve(two, { maxKeys: 1 }), "KeySetUnavailable")
    assertReason(yield* resolve(serve(() => Effect.succeed(new Response("not json")))), "KeySetUnavailable")
  }).pipe(Effect.provide(layer)))

it.effect("times out refreshes and interrupts in-flight requests when the layer scope closes", () =>
  Effect.gen(function*() {
    let interrupted = 0
    let started = yield* Deferred.make<void>()
    const client = serve(() =>
      Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            interrupted++
          })
        )
      )
    )

    const scope = yield* Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void))
    const context = yield* Layer.buildWithScope(
      Jwks.layerRemote({ url, timeout: 10, cooldown: 1 }).pipe(Layer.provide(client)),
      scope
    )
    const keys = Context.get(context, Jwks.Jwks)

    const first = yield* Effect.forkChild(keys.resolve({ algorithm: "ES256" }).pipe(Effect.flip))
    yield* Deferred.await(started)
    yield* TestClock.adjust(10)
    assertReason(yield* Fiber.join(first), "KeySetUnavailable")
    assert.strictEqual(interrupted, 1)

    yield* TestClock.adjust(2)
    started = yield* Deferred.make<void>()
    const second = yield* Effect.forkChild(keys.resolve({ algorithm: "ES256" }))
    yield* Deferred.await(started)
    yield* Scope.close(scope, Exit.void)
    assert.isTrue(Exit.isFailure(yield* Fiber.await(second)))
    assert.strictEqual(interrupted, 2)
    assertReason(yield* keys.resolve({ algorithm: "ES256" }).pipe(Effect.flip), "KeySetUnavailable")
  }).pipe(Effect.provide(layer)))

it.effect("imports each resolved key for the selected algorithm", () =>
  Effect.gen(function*() {
    const resolver = yield* Jwks.makeLocal({ keys: [{ ...rs256PublicJwk, kid: "rsa" }] })
    const rs = yield* resolver.resolve({ algorithm: "RS256", kid: "rsa" })
    const ps = yield* resolver.resolve({ algorithm: "PS256", kid: "rsa" })
    assert.strictEqual(rs.algorithm, "RS256")
    assert.strictEqual(ps.algorithm, "PS256")
    assert.deepStrictEqual(ps.jwk, { ...rs256PublicJwk, kid: "rsa" })
  }))
