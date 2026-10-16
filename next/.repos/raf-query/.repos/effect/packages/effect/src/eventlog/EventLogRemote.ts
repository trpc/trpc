/**
 * Connects a local event log to a remote replica.
 *
 * `EventLogRemote` writes local entries to another journal, receives remote
 * change streams from a sequence number, and can wait until the current
 * event-log identity has completed remote authentication. The encrypted
 * constructor is the default for browser, edge, or service replicas crossing an
 * untrusted network. The unencrypted constructor is intended for trusted
 * transports or tests.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cache from "../Cache.ts"
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as Predicate from "../Predicate.ts"
import * as Queue from "../Queue.ts"
import * as Redacted from "../Redacted.ts"
import * as RpcClient from "../rpc/RpcClient.ts"
import type { RpcClientError } from "../rpc/RpcClientError.ts"
import type * as RpcGroup from "../rpc/RpcGroup.ts"
import type * as Schema from "../Schema.ts"
import type * as Scope from "../Scope.ts"
import type { Entry, RemoteEntry, RemoteId } from "./EventJournal.ts"
import { type Identity, Registry } from "./EventLog.ts"
import { EventLogEncryption, layerSubtle } from "./EventLogEncryption.ts"
import {
  Authenticate,
  ChangesRpc,
  ChunkedMessage,
  EventLogProtocolError,
  EventLogRemoteRpcs,
  type HelloResponse,
  type StoreId,
  WriteEntries,
  WriteEntriesUnencrypted
} from "./EventLogMessage.ts"
import { encodeSessionAuthPayload, signSessionAuthPayloadBytes } from "./EventLogSessionAuth.ts"
import { makeGetIdentityRootSecretMaterial } from "./internal/identityRootSecretDerivation.ts"

/**
 * Service that represents a remote event-log replica.
 *
 * **When to use**
 *
 * Use to access or provide a remote event-log replica that can write local
 * entries and stream remote changes.
 *
 * **Details**
 *
 * It can write local entries to the remote, stream remote changes from a sequence
 * number, and run effects only after the supplied identity has authenticated.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class EventLogRemote extends Context.Service<EventLogRemote, {
  readonly id: RemoteId
  readonly changes: (options: {
    readonly identity: Identity["Service"]
    readonly storeId: StoreId
    readonly startSequence: number
  }) => Effect.Effect<Queue.Dequeue<RemoteEntry, EventLogRemoteError>, never, Scope.Scope>
  readonly write: (options: {
    readonly identity: Identity["Service"]
    readonly storeId: StoreId
    readonly entries: ReadonlyArray<Entry>
  }) => Effect.Effect<void, EventLogRemoteError>
  readonly whenAuthenticated: <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | EventLogRemoteError, R | Identity>
}>()("effect/eventlog/EventLogRemote") {}

/**
 * Error raised by `EventLogRemote` operations, recording the failed method and
 * underlying cause.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class EventLogRemoteError extends Data.TaggedError("EventLogRemoteError")<{
  readonly method: string
  readonly cause: unknown
}> {
  /**
   * Returns `true` when the value is an `EventLogRemoteError`.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static is(u: unknown): u is EventLogRemoteError {
    return Predicate.isTagged(u, "EventLogRemoteError")
  }
}

const getIdentityRootSecretMaterial = makeGetIdentityRootSecretMaterial(globalThis.crypto)

const makeAuthenticate = Effect.fnUntraced(function*(options: {
  readonly identity: Identity["Service"]
  readonly hello: HelloResponse
}) {
  const rootSecretMaterial = yield* getIdentityRootSecretMaterial(options.identity)
  const payload = yield* encodeSessionAuthPayload({
    remoteId: options.hello.remoteId,
    challenge: options.hello.challenge,
    publicKey: options.identity.publicKey,
    signingPublicKey: rootSecretMaterial.signingPublicKey
  })
  const signature = yield* signSessionAuthPayloadBytes({
    payload,
    signingPrivateKey: Redacted.value(rootSecretMaterial.signingPrivateKey)
  })

  return new Authenticate({
    publicKey: options.identity.publicKey,
    signingPublicKey: rootSecretMaterial.signingPublicKey,
    signature,
    algorithm: "Ed25519"
  })
})

/**
 * Service that provides a typed RPC client for the `EventLogRemoteRpcs` protocol.
 *
 * **When to use**
 *
 * Use to provide the RPC client used by remote event-log replicas to
 * authenticate, write entries, and subscribe to changes.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class EventLogRemoteClient extends Context.Service<
  EventLogRemoteClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof EventLogRemoteRpcs>, RpcClientError>
>()(
  "effect/eventlog/EventLogRemote/EventLogRemoteClient"
) {
  static readonly layer = Layer.effect(
    EventLogRemoteClient,
    RpcClient.make(EventLogRemoteRpcs, {
      disableTracing: true
    })
  )
}

/**
 * Creates an `EventLogRemote` from custom write encoding and change decoding
 * functions.
 *
 * **Details**
 *
 * The remote performs the hello/authentication handshake, retries after forbidden
 * responses by re-authenticating, chunks large writes, and registers itself with
 * the `Registry` for the current scope.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeWith = Effect.fnUntraced(function*({ encodeWrite, decodeChanges }: {
  readonly encodeWrite: (options: {
    readonly identity: Identity["Service"]
    readonly entries: ReadonlyArray<Entry>
    readonly storeId: StoreId
  }) => Effect.Effect<Uint8Array<ArrayBuffer>, Schema.SchemaError>
  readonly decodeChanges: (
    identity: Identity["Service"],
    data: Uint8Array<ArrayBuffer>
  ) => Effect.Effect<ReadonlyArray<RemoteEntry>, Schema.SchemaError>
}): Effect.fn.Return<EventLogRemote["Service"], EventLogRemoteError, Scope.Scope | EventLogRemoteClient | Registry> {
  const client = yield* EventLogRemoteClient
  const registry = yield* Registry

  let hello: HelloResponse | null = yield* client["EventLog.Hello"]().pipe(
    Effect.mapError((cause) => new EventLogRemoteError({ method: "hello", cause }))
  )

  const identities = new Map<string, Identity["Service"]>()
  const ensureIdentity = (identity: Identity["Service"]) => {
    let entry = identities.get(identity.publicKey)
    if (!entry) {
      entry = identity
      identities.set(identity.publicKey, entry)
    }
    return entry
  }

  const authCache = yield* Cache.make({
    lookup: Effect.fnUntraced(function*(publicKey: string) {
      const identity = identities.get(publicKey)!
      hello ??= yield* client["EventLog.Hello"]().pipe(
        Effect.mapError((cause) => new EventLogRemoteError({ method: "hello", cause }))
      )
      const authenticate = yield* makeAuthenticate({
        identity,
        hello
      })
      yield* client["EventLog.Authenticate"](authenticate)
    }, Effect.mapError((cause) => new EventLogRemoteError({ method: "authenticate", cause }))),
    capacity: Number.MAX_SAFE_INTEGER
  })

  const ensureAuthenticated = (identity: Identity["Service"]) => {
    ensureIdentity(identity)
    return Cache.get(authCache, identity.publicKey)
  }

  const retryForbidden = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: {
      readonly identity: Identity["Service"]
    }
  ) =>
    Effect.retry(effect, {
      while(e) {
        hello = null
        const error = EventLogRemoteError.is(e) && e.method === "authenticate"
          ? e.cause
          : e
        const isForbidden = EventLogProtocolError.is(error) && error.code === "Forbidden"
        return Cache.invalidate(authCache, options.identity.publicKey).pipe(
          Effect.as(isForbidden)
        )
      },
      times: 5
    })

  let chunkedIdCounter = 0

  const remote = EventLogRemote.of({
    id: hello.remoteId,
    write: Effect.fnUntraced(
      function*(options) {
        yield* ensureAuthenticated(options.identity)
        const encoded = yield* encodeWrite(options)
        if (encoded.byteLength <= ChunkedMessage.chunkSize) {
          return yield* client["EventLog.WriteSingle"]({ data: encoded })
        }
        for (const part of ChunkedMessage.split(chunkedIdCounter++, encoded)) {
          yield* client["EventLog.WriteChunked"](part)
        }
      },
      retryForbidden,
      Effect.mapError((cause) => new EventLogRemoteError({ method: "write", cause }))
    ),
    changes: Effect.fnUntraced(function*(options) {
      const outgoing = yield* Queue.make<RemoteEntry, EventLogRemoteError>()

      yield* Effect.gen(function*() {
        yield* ensureAuthenticated(options.identity)

        const chunkedState = ChunkedMessage.initialJoinState()
        const incoming = yield* client["EventLog.Changes"]({
          publicKey: options.identity.publicKey,
          storeId: options.storeId,
          startSequence: options.startSequence
        }, { asQueue: true })

        while (true) {
          const parts = yield* Queue.takeAll(incoming)
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i]
            if (part._tag === "Single") {
              yield* Queue.offerAll(outgoing, yield* decodeChanges(options.identity, part.data))
              continue
            }
            const data = ChunkedMessage.join(chunkedState, part)
            if (!data) continue
            yield* Queue.offerAll(outgoing, yield* decodeChanges(options.identity, data))
          }
        }
      }).pipe(
        (effect) => retryForbidden(effect, options),
        Effect.mapError((cause) => {
          if (cause._tag === "EventLogRemoteError") {
            return cause
          }
          return new EventLogRemoteError({
            method: "changes",
            cause
          })
        }),
        Effect.catchCause((cause) => Queue.failCause(outgoing, cause)),
        Effect.forkScoped
      )

      return outgoing
    }),
    whenAuthenticated: (effect) =>
      IdentityService.use((identity) => Effect.flatMap(ensureAuthenticated(identity), () => effect))
  })

  yield* registry.registerRemote(remote)

  return remote
})

/** @effect-diagnostics-next-line classSelfMismatch:off */
class IdentityService extends Context.Service<Identity, Identity["Service"]>()(
  "effect/eventlog/EventLog/Identity" satisfies Identity["key"]
) {}

/**
 * Creates an `EventLogRemote` that encrypts outgoing entries and decrypts
 * incoming changes with `EventLogEncryption`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeEncrypted = Effect.gen(function*(): Effect.fn.Return<
  EventLogRemote["Service"],
  EventLogRemoteError,
  Scope.Scope | EventLogRemoteClient | EventLogEncryption | Registry
> {
  const encryption = yield* EventLogEncryption

  return yield* makeWith({
    encodeWrite: (options) =>
      encryption.encrypt(options.identity, options.entries).pipe(
        Effect.flatMap((encryptedEntries) =>
          new WriteEntries({
            publicKey: options.identity.publicKey,
            storeId: options.storeId,
            encryptedEntries: encryptedEntries.map((entry, i) => ({
              entryId: options.entries[i].id,
              iv: entry.iv,
              encryptedEntry: entry.encryptedEntry
            }))
          }).encoded
        )
      ),
    decodeChanges: (identity, data) =>
      ChangesRpc.decodeEncrypted(data).pipe(
        Effect.flatMap((entries) => encryption.decrypt(identity, entries))
      )
  })
})

/**
 * Creates an `EventLogRemote` that sends and receives plaintext entry payloads.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeUnencrypted: Effect.Effect<
  EventLogRemote["Service"],
  EventLogRemoteError,
  Scope.Scope | EventLogRemoteClient | Registry
> = makeWith({
  encodeWrite: (options) =>
    new WriteEntriesUnencrypted({
      publicKey: options.identity.publicKey,
      storeId: options.storeId,
      entries: options.entries
    }).encoded,
  decodeChanges: (_identity, data) => ChangesRpc.decodeUnencrypted(data)
})

/**
 * Provides an encrypted `EventLogRemote` using the remote RPC client and the
 * default Web Crypto encryption layer.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerEncrypted: Layer.Layer<
  EventLogRemote,
  EventLogRemoteError,
  RpcClient.Protocol | Registry
> = Layer.effect(EventLogRemote, makeEncrypted).pipe(
  Layer.provide(EventLogRemoteClient.layer),
  Layer.provide(layerSubtle)
)

/**
 * Provides an unencrypted `EventLogRemote` using the remote RPC client.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerUnencrypted: Layer.Layer<
  EventLogRemote,
  EventLogRemoteError,
  RpcClient.Protocol | Registry
> = Layer.effect(EventLogRemote, makeUnencrypted).pipe(
  Layer.provide(EventLogRemoteClient.layer)
)
