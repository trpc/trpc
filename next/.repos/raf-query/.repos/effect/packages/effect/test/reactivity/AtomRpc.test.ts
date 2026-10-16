import { assert, describe, expectTypeOf, it } from "@effect/vitest"
import { type Cause, Deferred, Effect, Layer, Schema } from "effect"
import { AsyncResult, Atom, AtomRegistry, AtomRpc, Hydration } from "effect/reactivity"
import { Rpc, RpcClient, type RpcClientError, RpcGroup, RpcMiddleware, type RpcSerialization } from "effect/rpc"

const Group = RpcGroup.make(
  Rpc.make("getUser", {
    payload: Schema.Struct({
      id: Schema.FiniteFromString
    }),
    success: Schema.Struct({
      id: Schema.Number,
      name: Schema.String
    })
  })
)

class ClientFailure extends Schema.Error<ClientFailure>("ClientFailure")({
  _tag: Schema.tag("ClientFailure")
}) {}

class ClientMiddleware extends RpcMiddleware.Service<ClientMiddleware, {
  clientError: ClientFailure
}>()("ClientMiddleware", {
  requiredForClient: true
}) {}

const ClientMiddlewareGroup = RpcGroup.make(
  Rpc.make("getUser", {
    success: Schema.String
  }).middleware(ClientMiddleware),
  Rpc.make("stream", {
    success: Schema.String,
    stream: true
  }).middleware(ClientMiddleware)
)

const makeClientMiddlewareProtocol = (
  middleware: RpcMiddleware.RpcMiddlewareClient<never, ClientFailure, never>
) =>
  Layer.mergeAll(
    Layer.effect(
      RpcClient.Protocol,
      RpcClient.Protocol.make(() =>
        Effect.succeed({
          send: () => Effect.die("unexpected request"),
          supportsAck: false,
          supportsTransferables: false,
          codecFor: Schema.toCodecJson as RpcSerialization.CodecFor
        })
      )
    ),
    RpcMiddleware.layerClient(ClientMiddleware, middleware)
  )

describe("AtomRpc", () => {
  it("includes client middleware errors in atom failure types", () => {
    const Client = AtomRpc.Service()("MiddlewareClient", {
      group: ClientMiddlewareGroup,
      protocol: Layer.empty,
      makeEffect: Effect.die("unused")
    })

    const mutation = Client.mutation("getUser")
    const query = Client.query("getUser", undefined)
    const stream = Client.query("stream", undefined)

    expectTypeOf<Atom.Failure<typeof mutation>>().toEqualTypeOf<RpcClientError.RpcClientError | ClientFailure>()
    expectTypeOf<Atom.Failure<typeof query>>().toEqualTypeOf<RpcClientError.RpcClientError | ClientFailure>()
    expectTypeOf<Atom.Failure<typeof stream>>().toEqualTypeOf<
      RpcClientError.RpcClientError | ClientFailure | Cause.NoSuchElementError
    >()
  })

  it.effect("query creates a serializable atom with reactivity and retention", () =>
    Effect.gen(function*() {
      const Client = AtomRpc.Service()("Client", {
        group: Group,
        protocol: Layer.empty,
        makeEffect: Effect.succeed(
          ((tag: string, payload: { readonly id: number }) => {
            if (tag !== "getUser") {
              return Effect.die(`unexpected tag: ${tag}`)
            }
            return Effect.succeed({
              id: payload.id,
              name: `user-${payload.id}`
            })
          }) as any
        )
      })

      const atom = Client.query("getUser", { id: 1 }, {
        headers: {
          "x-id": "abc"
        },
        reactivityKeys: ["users"],
        timeToLive: "1 minute",
        serializationKey: "1"
      })

      assert.deepStrictEqual(
        {
          idleTTL: atom.idleTTL,
          serializable: Atom.isSerializable(atom)
        },
        {
          idleTTL: 60_000,
          serializable: true
        }
      )
      assert.strictEqual(Client.query("getUser", { id: 2 }, { timeToLive: 0 }).idleTTL, 0)
      assert.strictEqual(Client.query("getUser", { id: 3 }, { timeToLive: 0n }).idleTTL, 0)
      const keepAliveAtom = Client.query("getUser", { id: 2 }, {
        reactivityKeys: ["users"],
        timeToLive: "Infinity",
        serializationKey: "keep-alive"
      })
      assert.deepStrictEqual(
        {
          keepAlive: keepAliveAtom.keepAlive,
          serializable: Atom.isSerializable(keepAliveAtom)
        },
        {
          keepAlive: true,
          serializable: true
        }
      )
      if (!Atom.isSerializable(atom)) {
        assert.fail("expected query atom to be serializable")
      }
      const key = atom[Atom.SerializableTypeId].key

      const atomFromEncodedPayload = Client.query("getUser", { id: 1 }, {
        headers: {
          "x-id": "abc"
        },
        reactivityKeys: ["users"],
        timeToLive: "1 minute",
        serializationKey: "1"
      })
      assert(Atom.isSerializable(atomFromEncodedPayload), "expected query atom from encoded payload to be serializable")
      assert(atom === atomFromEncodedPayload)
      assert.strictEqual(atomFromEncodedPayload[Atom.SerializableTypeId].key, key)

      const registry = AtomRegistry.make()
      const unmount = registry.mount(atom)
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      const dehydrated = Hydration.toValues(Hydration.dehydrate(registry))
      assert.lengthOf(dehydrated, 1)
      assert.strictEqual(dehydrated[0]!.key, key)

      unmount()
    }))

  it.effect("dehydrates the rest of the registry when client middleware fails", () =>
    Effect.gen(function*() {
      const Client = AtomRpc.Service()("ClientWithMiddleware", {
        group: ClientMiddlewareGroup,
        protocol: makeClientMiddlewareProtocol(() => Effect.fail(new ClientFailure({})))
      })
      const failedAtom = Client.query("getUser", undefined, {
        serializationKey: "failed"
      })
      const unaffectedAtom = Atom.make(42).pipe(
        Atom.serializable({
          key: "unaffected",
          schema: Schema.Number
        })
      )
      const registry = AtomRegistry.make()
      const unmountFailed = registry.mount(failedAtom)
      const unmountUnaffected = registry.mount(unaffectedAtom)
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      assert(AsyncResult.isFailure(registry.get(failedAtom)))
      const dehydrated = Hydration.toValues(Hydration.dehydrate(registry))
      assert.isUndefined(dehydrated.find((entry) => entry.key === "AtomRpc:getUser:failed"))
      assert.strictEqual(dehydrated.find((entry) => entry.key === "unaffected")?.value, 42)

      unmountUnaffected()
      unmountFailed()
    }))

  it.effect("settles promise dehydration when client middleware later fails", () =>
    Effect.gen(function*() {
      const failMiddleware = yield* Deferred.make<void>()
      const Client = AtomRpc.Service()("ClientWithDeferredMiddleware", {
        group: ClientMiddlewareGroup,
        protocol: makeClientMiddlewareProtocol(() =>
          Deferred.await(failMiddleware).pipe(
            Effect.andThen(Effect.fail(new ClientFailure({})))
          )
        )
      })
      const failedAtom = Client.query("getUser", undefined, {
        serializationKey: "deferred-failure"
      })
      const registry = AtomRegistry.make()
      const unmountFailed = registry.mount(failedAtom)

      assert(AsyncResult.isInitial(registry.get(failedAtom)))
      const dehydrated = Hydration.toValues(Hydration.dehydrate(registry, {
        encodeInitialAs: "promise"
      }))
      const resultPromise = dehydrated.find((entry) => entry.key === "AtomRpc:getUser:deferred-failure")
        ?.resultPromise
      assert.isDefined(resultPromise)

      let notifications = 0
      const unsubscribe = registry.subscribe(failedAtom, () => notifications++)
      const hydratedRegistry = AtomRegistry.make()
      Hydration.hydrate(hydratedRegistry, dehydrated)

      yield* Deferred.succeed(failMiddleware, undefined)
      yield* Effect.promise(() => resultPromise).pipe(Effect.timeout("1 second"))

      assert.strictEqual(notifications, 1)
      const unmountHydrated = hydratedRegistry.mount(failedAtom)

      unmountHydrated()
      unsubscribe()
      unmountFailed()
    }))
})
