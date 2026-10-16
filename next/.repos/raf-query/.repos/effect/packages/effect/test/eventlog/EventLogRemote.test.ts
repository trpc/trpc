import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Fiber, Queue, type Scope } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as EventLogSessionAuth from "effect/eventlog/EventLogSessionAuth"
import { makeGetIdentityRootSecretMaterial } from "effect/eventlog/internal/identityRootSecretDerivation"
import type * as Rpc from "effect/rpc/Rpc"
import type * as RpcGroup from "effect/rpc/RpcGroup"
import * as RpcTest from "effect/rpc/RpcTest"

describe("EventLogRemote", () => {
  it.effect("retries wrapped Forbidden authentication errors", () =>
    Effect.gen(function*() {
      const harness = yield* makeHarness(EventLogRemote.makeUnencrypted)
      const identity = yield* EventLog.makeIdentity
      let authenticationAttempts = 0

      yield* Effect.forever(Effect.gen(function*() {
        const request = yield* harness.take
        if (request._tag === "EventLog.Hello") {
          request.resume(Effect.succeed(new EventLogMessage.HelloResponse({ remoteId, challenge })))
        } else if (request._tag === "EventLog.Authenticate") {
          authenticationAttempts++
          request.resume(
            authenticationAttempts === 1
              ? Effect.fail(
                new EventLogMessage.EventLogProtocolError({
                  requestTag: "Authenticate",
                  publicKey: undefined,
                  code: "Forbidden",
                  message: "Session auth challenge has expired"
                })
              )
              : Effect.void
          )
        } else if (request._tag === "EventLog.WriteSingle") {
          request.resume(Effect.void)
        }
      })).pipe(Effect.forkChild)

      yield* harness.remote.write({
        identity,
        storeId: defaultStoreId,
        entries: [makeEntry()]
      })

      assert.strictEqual(authenticationAttempts, 2)
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("makeUnencrypted authenticates before writing plaintext entries", () =>
    Effect.gen(function*() {
      const harness = yield* makeHarness(EventLogRemote.makeUnencrypted)
      const identity = yield* EventLog.makeIdentity
      const entry = makeEntry()

      const writeFiber = yield* harness.remote.write({
        identity,
        storeId: defaultStoreId,
        entries: [entry]
      }).pipe(Effect.forkChild)
      yield* authenticate({ harness, identity })

      const request = yield* harness.take
      assert(request._tag === "EventLog.WriteSingle")
      const payload = request.request as Rpc.Payload<typeof EventLogMessage.WriteSingleRpc>
      const decoded = yield* EventLogMessage.WriteEntriesUnencrypted.decode(payload.data)

      assert.strictEqual(decoded.publicKey, identity.publicKey)
      assert.strictEqual(decoded.storeId, defaultStoreId)
      assert.strictEqual(decoded.entries.length, 1)
      assert.strictEqual(decoded.entries[0].idString, entry.idString)
      request.resume(Effect.void)

      yield* Fiber.join(writeFiber)
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("makeEncrypted authenticates before writing encrypted entries", () =>
    Effect.gen(function*() {
      const harness = yield* makeHarness(EventLogRemote.makeEncrypted)
      const identity = yield* EventLog.makeIdentity

      const writeFiber = yield* harness.remote.write({
        identity,
        storeId: defaultStoreId,
        entries: [makeEntry()]
      }).pipe(Effect.forkScoped)
      yield* authenticate({ harness, identity })

      const request = yield* harness.take
      assert(request._tag === "EventLog.WriteSingle")
      const payload = request.request as Rpc.Payload<typeof EventLogMessage.WriteSingleRpc>
      const decoded = yield* EventLogMessage.WriteEntries.decode(payload.data)

      assert.strictEqual(decoded.publicKey, identity.publicKey)
      assert.strictEqual(decoded.storeId, defaultStoreId)
      assert.strictEqual(decoded.encryptedEntries.length, 1)

      request.resume(Effect.void)
      yield* Fiber.join(writeFiber)
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))
})

class RemoteHarness extends Context.Service<RemoteHarness, {
  readonly remote: EventLogRemote.EventLogRemote["Service"]
  readonly take: Effect.Effect<{
    readonly _tag: Rpc.Tag<RpcGroup.Rpcs<typeof EventLogMessage.EventLogRemoteRpcs>>
    readonly request: Rpc.Payload<RpcGroup.Rpcs<typeof EventLogMessage.EventLogRemoteRpcs>>
    readonly resume: (response: Effect.Effect<unknown, unknown>) => void
  }>
}>()("RemoteHarness") {}

const makeHarness = Effect.fn(function*(
  makeClient: Effect.Effect<
    EventLogRemote.EventLogRemote["Service"],
    EventLogRemote.EventLogRemoteError,
    EventLogEncryption.EventLogEncryption | EventLogRemote.EventLogRemoteClient | EventLog.Registry | Scope.Scope
  >
): Effect.fn.Return<
  RemoteHarness["Service"],
  EventLogRemote.EventLogRemoteError,
  Scope.Scope
> {
  const requests = yield* Queue.make<{
    readonly _tag: Rpc.Tag<RpcGroup.Rpcs<typeof EventLogMessage.EventLogRemoteRpcs>>
    readonly request: Rpc.Payload<RpcGroup.Rpcs<typeof EventLogMessage.EventLogRemoteRpcs>>
    readonly resume: (response: Effect.Effect<unknown, unknown>) => void
  }>()

  const handleRequest = (tag: string) => <A, E>(request: any) =>
    Effect.callback<A, E>((resume) => {
      Queue.offerUnsafe(requests, {
        _tag: tag as any,
        request,
        resume: resume as any
      })
    })

  const client = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
    Effect.provide(EventLogMessage.EventLogRemoteRpcs.toLayer({
      "EventLog.Hello": handleRequest("EventLog.Hello"),
      "EventLog.Authenticate": handleRequest("EventLog.Authenticate"),
      "EventLog.WriteChunked": handleRequest("EventLog.WriteChunked"),
      "EventLog.WriteSingle": handleRequest("EventLog.WriteSingle"),
      "EventLog.Changes": handleRequest("EventLog.Changes")
    })),
    Effect.provideService(
      EventLogMessage.EventLogAuthentication,
      (effect) => Effect.provideService(effect, EventLog.Identity, {} as any)
    )
  )
  const remote = yield* makeClient.pipe(
    Effect.provideService(EventLogRemote.EventLogRemoteClient, client),
    Effect.provide([EventLogEncryption.layerSubtle, EventLog.layerRegistry]),
    Effect.forkChild
  )

  const hello = yield* Queue.take(requests)
  assert(hello._tag === "EventLog.Hello")
  hello.resume(Effect.succeed(
    new EventLogMessage.HelloResponse({
      remoteId,
      challenge
    })
  ))

  return RemoteHarness.of({
    remote: yield* Fiber.join(remote),
    take: Queue.take(requests)
  })
})

const makeEntry = (options?: {
  readonly primaryKey?: string | undefined
  readonly payloadSize?: number | undefined
}): EventJournal.Entry =>
  new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe(),
    event: "UserCreated",
    primaryKey: options?.primaryKey ?? "user-1",
    payload: new Uint8Array(options?.payloadSize ?? 4).fill(1)
  })

const defaultStoreId = EventLogMessage.StoreId.make("default")
const remoteId = EventJournal.makeRemoteIdUnsafe()
const challenge = new Uint8Array(16).fill(1)
const getIdentityRootSecretMaterial = makeGetIdentityRootSecretMaterial(globalThis.crypto)

const authenticate = Effect.fnUntraced(function*(options: {
  readonly harness: RemoteHarness["Service"]
  readonly identity: EventLog.Identity["Service"]
}) {
  const auth = yield* options.harness.take
  assert(auth._tag === "EventLog.Authenticate")
  const payload = auth.request as Rpc.Payload<typeof EventLogMessage.AuthenticateRpc>
  const rootSecretMaterial = yield* getIdentityRootSecretMaterial(options.identity)

  assert.strictEqual(payload.publicKey, options.identity.publicKey)
  assert.strictEqual(payload.algorithm, "Ed25519")
  assert.deepStrictEqual(payload.signingPublicKey, rootSecretMaterial.signingPublicKey)

  const verified = yield* EventLogSessionAuth.verifySessionAuthenticateRequest({
    remoteId,
    challenge,
    publicKey: payload.publicKey,
    signingPublicKey: payload.signingPublicKey,
    signature: payload.signature,
    algorithm: payload.algorithm
  })
  assert.isTrue(verified)
  auth.resume(Effect.void)
})
