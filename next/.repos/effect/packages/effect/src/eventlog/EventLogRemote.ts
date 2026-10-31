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
import * as Arr from "../Array.ts"
import * as Cache from "../Cache.ts"
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as Predicate from "../Predicate.ts"
import * as Queue from "../Queue.ts"
import * as Redacted from "../Redacted.ts"
import * as Result from "../Result.ts"
import * as RpcClient from "../rpc/RpcClient.ts"
import type { RpcClientError } from "../rpc/RpcClientError.ts"
import type * as RpcGroup from "../rpc/RpcGroup.ts"
import type * as Schema from "../Schema.ts"
import type * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"
import { type Entry, type EventJournal, type EventJournalError, RemoteEntry, type RemoteId } from "./EventJournal.ts"
import { type Identity, Registry } from "./EventLog.ts"
import { type EncryptedBatch, EventLogEncryption, layerSubtle } from "./EventLogEncryption.ts"
import {
  Authenticate,
  ChangesRpc,
  ChunkedMessage,
  type CompactionBeginResult,
  type CompactionInputHeader,
  CompactionInputRpc,
  CompactionPartRpc,
  type CompactionResult,
  type CompactionStatus,
  EventLogCompactionRpcs,
  EventLogProtocolError,
  EventLogRemoteRpcs,
  type HelloResponse,
  type SingleMessage,
  type StoreId,
  type WriteAck,
  WriteEntries,
  WriteEntriesUnencrypted
} from "./EventLogMessage.ts"
import { encodeSessionAuthPayload, signSessionAuthPayloadBytes } from "./EventLogSessionAuth.ts"
import { toBatches } from "./internal/batches.ts"
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
 * Built-in remotes acknowledge writes instead of echoing them through `changes`.
 * Custom remotes may return `void` from `write` to confirm uploads through
 * `changes` instead.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class EventLogRemote extends Context.Service<EventLogRemote, {
  readonly id: RemoteId
  /**
   * The lowest sequence the remote assigns, or 0 when omitted.
   */
  readonly firstSequence?: number | undefined
  readonly changes: (options: {
    readonly identity: Identity["Service"]
    readonly storeId: StoreId
    readonly startSequence: number
    /**
     * Looks up locally stored entries by id, so the remote can reuse them
     * instead of decoding the matching changes.
     */
    readonly knownEntries?: EventJournal["Service"]["entriesById"] | undefined
  }) => Effect.Effect<Queue.Dequeue<RemoteEntry, EventLogRemoteError>, never, Scope.Scope>
  readonly write: (options: {
    readonly identity: Identity["Service"]
    readonly storeId: StoreId
    readonly entries: ReadonlyArray<Entry>
  }) => Effect.Effect<ReadonlyArray<WriteAck> | void, EventLogRemoteError>
  readonly whenAuthenticated: <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | EventLogRemoteError, R | Identity>
  /**
   * Encrypted remote compaction. Present when the remote advertises
   * `HelloResponse.compaction` and the RPC client includes
   * `EventLogCompactionRpcs`.
   */
  readonly compaction?: EventLogRemoteCompaction | undefined
}>()("effect/eventlog/EventLogRemote") {}

/**
 * A stage opened by `EventLogRemoteCompaction.begin`, with the identity and
 * store it belongs to.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface CompactionStage {
  readonly identity: Identity["Service"]
  readonly storeId: StoreId
  readonly stageId: string
}

/**
 * Client side of encrypted remote compaction.
 *
 * **Details**
 *
 * A run opens a stage with `begin`, reads its input headers with `input`,
 * fetches the batches it needs with `fetch`, uploads the kept entries with
 * `upload` and calls `commit`. `abort` releases a stage that won't be
 * committed.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EventLogRemoteCompaction {
  readonly status: (options: {
    readonly identity: Identity["Service"]
    readonly storeId: StoreId
  }) => Effect.Effect<CompactionStatus, EventLogRemoteError>
  readonly begin: (options: {
    readonly identity: Identity["Service"]
    readonly storeId: StoreId
  }) => Effect.Effect<CompactionBeginResult, EventLogRemoteError>
  /**
   * Streams the stage's input batch headers in input order.
   */
  readonly input: (stage: CompactionStage) => Stream.Stream<CompactionInputHeader, EventLogRemoteError>
  /**
   * Fetches and decrypts the input batches at the given input sequences.
   */
  readonly fetch: (
    stage: CompactionStage,
    sequences: ReadonlyArray<number>
  ) => Stream.Stream<RemoteEntry, EventLogRemoteError>
  /**
   * Encrypts the kept entries, in input-sequence order, and uploads them in
   * segments of about `ChunkedMessage.chunkSize`. An oversized segment is
   * split into pieces, and a segment is resent in full after a dropped
   * connection.
   */
  readonly upload: (
    stage: CompactionStage,
    entries: ReadonlyArray<Entry>
  ) => Effect.Effect<{ readonly segmentCount: number }, EventLogRemoteError>
  readonly commit: (
    stage: CompactionStage,
    result: CompactionResult
  ) => Effect.Effect<"Committed" | "Superseded", EventLogRemoteError>
  /**
   * Releases the stage. Failures are ignored.
   */
  readonly abort: (stage: CompactionStage) => Effect.Effect<void>
}

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

const getIdentityRootSecretMaterial = makeGetIdentityRootSecretMaterial()

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
 * **Details**
 *
 * The `EventLogCompactionRpcs` methods are optional. The encrypted remote
 * offers compaction only when the client has them. `layer` builds the client
 * from both groups.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class EventLogRemoteClient extends Context.Service<
  EventLogRemoteClient,
  & RpcClient.RpcClient<RpcGroup.Rpcs<typeof EventLogRemoteRpcs>, RpcClientError>
  & Partial<CompactionClient>
>()(
  "effect/eventlog/EventLogRemote/EventLogRemoteClient"
) {
  static readonly layer = Layer.effect(
    EventLogRemoteClient,
    RpcClient.make(EventLogRemoteRpcs.merge(EventLogCompactionRpcs), {
      disableTracing: true
    })
  )
}

type CompactionClient = RpcClient.RpcClient<RpcGroup.Rpcs<typeof EventLogCompactionRpcs>, RpcClientError>

const getCompactionClient = (client: EventLogRemoteClient["Service"]): CompactionClient | undefined =>
  client["EventLog.CompactionStatus"] === undefined ? undefined : client as CompactionClient

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
export const makeWith = (options: {
  readonly encodeWrite: (options: {
    readonly identity: Identity["Service"]
    readonly entries: ReadonlyArray<Entry>
    readonly storeId: StoreId
  }) => Effect.Effect<Uint8Array<ArrayBuffer>, Schema.SchemaError>
  readonly decodeChanges: (
    identity: Identity["Service"],
    storeId: StoreId,
    data: Uint8Array<ArrayBuffer>,
    knownEntries?: EventJournal["Service"]["entriesById"]
  ) => Effect.Effect<ReadonlyArray<RemoteEntry>, Schema.SchemaError | EventJournalError>
}): Effect.Effect<EventLogRemote["Service"], EventLogRemoteError, Scope.Scope | EventLogRemoteClient | Registry> =>
  makeRemote(options)

interface RemoteSession {
  readonly client: EventLogRemoteClient["Service"]
  /** Authenticates, runs the request, and authenticates again after a refusal. */
  readonly request: <A, E>(
    method: string,
    identity: Identity["Service"],
    effect: Effect.Effect<A, E>
  ) => Effect.Effect<A, EventLogRemoteError>
  /** Authenticates, then joins and decodes a framed response stream. */
  readonly framed: <A, E, E2>(
    method: string,
    identity: Identity["Service"],
    frames: () => Stream.Stream<SingleMessage | ChunkedMessage, E>,
    decode: (data: Uint8Array<ArrayBuffer>) => Effect.Effect<Iterable<A>, E2>
  ) => Stream.Stream<A, EventLogRemoteError>
}

const makeRemote = Effect.fnUntraced(function*({ encodeWrite, decodeChanges, makeCompaction }: {
  readonly encodeWrite: (options: {
    readonly identity: Identity["Service"]
    readonly entries: ReadonlyArray<Entry>
    readonly storeId: StoreId
  }) => Effect.Effect<Uint8Array<ArrayBuffer>, Schema.SchemaError>
  readonly decodeChanges: (
    identity: Identity["Service"],
    storeId: StoreId,
    data: Uint8Array<ArrayBuffer>,
    knownEntries?: EventJournal["Service"]["entriesById"]
  ) => Effect.Effect<ReadonlyArray<RemoteEntry>, Schema.SchemaError | EventJournalError>
  readonly makeCompaction?: ((session: RemoteSession) => EventLogRemoteCompaction | undefined) | undefined
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

  // The next request says hello and authenticates again.
  const resetAuthentication = (identity: Identity["Service"]) => {
    hello = null
    return Cache.invalidate(authCache, identity.publicKey)
  }

  const retryForbidden = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: {
      readonly identity: Identity["Service"]
    }
  ) =>
    Effect.retry(effect, {
      while: (e) => Effect.as(resetAuthentication(options.identity), isForbidden(e)),
      times: 5
    })

  const toRemoteError = (method: string) => (cause: unknown) =>
    EventLogRemoteError.is(cause) ? cause : new EventLogRemoteError({ method, cause })

  const request = <A, E>(
    method: string,
    identity: Identity["Service"],
    effect: Effect.Effect<A, E>
  ): Effect.Effect<A, EventLogRemoteError> =>
    ensureAuthenticated(identity).pipe(
      Effect.andThen(effect),
      (effect) => retryForbidden(effect, { identity }),
      Effect.mapError(toRemoteError(method))
    )

  // Not retried like `request`; a refused identity authenticates again on the
  // next request.
  const framed = <A, E, E2>(
    method: string,
    identity: Identity["Service"],
    frames: () => Stream.Stream<SingleMessage | ChunkedMessage, E>,
    decode: (data: Uint8Array<ArrayBuffer>) => Effect.Effect<Iterable<A>, E2>
  ): Stream.Stream<A, EventLogRemoteError> =>
    Stream.unwrap(Effect.map(ensureAuthenticated(identity), () => {
      const state = ChunkedMessage.initialJoinState()
      return frames().pipe(
        Stream.filterMap((frame) => {
          const data = frame._tag === "Single" ? frame.data : ChunkedMessage.join(state, frame)
          return data === undefined ? Result.failVoid : Result.succeed(data)
        }),
        Stream.mapEffect(decode),
        Stream.flattenIterable
      )
    })).pipe(
      Stream.tapError((error) => isForbidden(error) ? resetAuthentication(identity) : Effect.void),
      Stream.mapError(toRemoteError(method))
    )

  let chunkedIdCounter = 0

  const remote = EventLogRemote.of({
    id: hello.remoteId,
    firstSequence: hello.firstSequence,
    write: Effect.fnUntraced(
      function*(options) {
        yield* ensureAuthenticated(options.identity)
        const encoded = yield* encodeWrite(options)
        if (encoded.byteLength <= ChunkedMessage.chunkSize) {
          return yield* client["EventLog.WriteSingle"]({ data: encoded })
        }
        // Only the part the server receives last carries acknowledgements.
        const acks = yield* Effect.forEach(
          ChunkedMessage.split(chunkedIdCounter++, encoded),
          (part) => client["EventLog.WriteChunked"](part),
          { concurrency: 4 }
        )
        return acks.flat()
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

        // A batch can start before `startSequence`; its earlier entries are dropped.
        const offer = Effect.fnUntraced(function*(data: Uint8Array<ArrayBuffer>) {
          const entries = yield* decodeChanges(options.identity, options.storeId, data, options.knownEntries)
          const first = entries.findIndex((entry) => entry.remoteSequence >= options.startSequence)
          if (first === -1) return
          yield* Queue.offerAll(outgoing, entries.slice(first))
        })

        while (true) {
          const parts = yield* Queue.takeAll(incoming)
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i]
            if (part._tag === "Single") {
              yield* offer(part.data)
              continue
            }
            const data = ChunkedMessage.join(chunkedState, part)
            if (!data) continue
            yield* offer(data)
          }
        }
      }).pipe(
        // Forbidden retries resubscribe with the same `startSequence`. Other failures
        // propagate to EventLog, which reconnects from the journal's committed sequence.
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
      IdentityService.use((identity) => Effect.flatMap(ensureAuthenticated(identity), () => effect)),
    compaction: hello.compaction === true ? makeCompaction?.({ client, request, framed }) : undefined
  })

  yield* registry.registerRemote(remote)

  return remote
})

const isForbidden = (e: unknown): boolean => {
  const error = EventLogRemoteError.is(e) && e.method === "authenticate" ? e.cause : e
  return EventLogProtocolError.is(error) && error.code === "Forbidden"
}

/** @effect-diagnostics-next-line classSelfMismatch:off */
class IdentityService extends Context.Service<Identity, Identity["Service"]>()(
  "effect/eventlog/EventLog/Identity" satisfies Identity["key"]
) {}

/**
 * Creates an `EventLogRemote` that encrypts outgoing entries and decrypts
 * incoming changes with `EventLogEncryption`.
 *
 * **Details**
 *
 * The remote has a `compaction` member when the server advertises compaction
 * and the RPC client includes `EventLogCompactionRpcs`, unless built with
 * `compaction: false`. Without it the client never calls the compaction RPCs.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeEncryptedWith = Effect.fnUntraced(function*(options: {
  readonly compaction?: boolean | undefined
}): Effect.fn.Return<
  EventLogRemote["Service"],
  EventLogRemoteError,
  Scope.Scope | EventLogRemoteClient | EventLogEncryption | Registry
> {
  const encryption = yield* EventLogEncryption

  // Skip decryption only when every entry in a batch is already stored.
  const decodeChanges = Effect.fnUntraced(function*(
    identity: Identity["Service"],
    storeId: StoreId,
    data: Uint8Array<ArrayBuffer>,
    knownEntries?: EventJournal["Service"]["entriesById"]
  ) {
    const batches = yield* ChangesRpc.decodeEncrypted(data)
    if (knownEntries === undefined) return yield* encryption.decrypt(identity, storeId, batches)
    const stored = yield* knownEntries(batches.flatMap((batch) => batch.entryIds))
    let offset = 0
    const knownBatches = batches.map((batch) => {
      const entries = stored.slice(offset, offset + batch.entryIds.length)
      offset += batch.entryIds.length
      return entries.every((entry): entry is Entry => entry !== undefined) ? entries : undefined
    })
    const decrypted = yield* encryption.decrypt(
      identity,
      storeId,
      batches.filter((_, i) => knownBatches[i] === undefined)
    )
    let next = 0
    return batches.flatMap((batch, i) => {
      const entries = knownBatches[i]
      return entries === undefined
        ? batch.entryIds.map(() => decrypted[next++])
        : entries.map((entry, j) =>
          new RemoteEntry({ remoteSequence: batch.sequence + j, entry }, { disableChecks: true })
        )
    })
  })

  return yield* makeRemote({
    encodeWrite: (options) =>
      encryption.encrypt(options.identity, options.storeId, options.entries).pipe(
        Effect.flatMap((batches) =>
          new WriteEntries({
            publicKey: options.identity.publicKey,
            storeId: options.storeId,
            batches
          }).encoded
        )
      ),
    decodeChanges,
    makeCompaction: options.compaction === false ? undefined : (session) => {
      const client = getCompactionClient(session.client)
      return client === undefined ? undefined : makeEncryptedCompaction({ session, client, encryption })
    }
  })
})

/**
 * Creates an `EventLogRemote` that encrypts outgoing entries and decrypts
 * incoming changes with `EventLogEncryption`.
 *
 * @see {@link makeEncryptedWith} for opting out of running compaction
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeEncrypted: Effect.Effect<
  EventLogRemote["Service"],
  EventLogRemoteError,
  Scope.Scope | EventLogRemoteClient | EventLogEncryption | Registry
> = makeEncryptedWith({})

// How many times a segment is sent before a dropped connection, an
// `RpcClientError`, fails the upload.
const segmentAttempts = 3

const makeEncryptedCompaction = ({ client, encryption, session: { framed, request } }: {
  readonly session: RemoteSession
  readonly client: CompactionClient
  readonly encryption: EventLogEncryption["Service"]
}): EventLogRemoteCompaction => {
  const stageRequest = (stage: CompactionStage) => ({
    publicKey: stage.identity.publicKey,
    storeId: stage.storeId,
    stageId: stage.stageId
  })

  return {
    status: ({ identity, storeId }) =>
      request(
        "compactionStatus",
        identity,
        client["EventLog.CompactionStatus"]({ publicKey: identity.publicKey, storeId })
      ),
    begin: ({ identity, storeId }) =>
      request(
        "compactionBegin",
        identity,
        client["EventLog.CompactionBegin"]({ publicKey: identity.publicKey, storeId })
      ),
    input: (stage) =>
      framed(
        "compactionInput",
        stage.identity,
        () => client["EventLog.CompactionInput"](stageRequest(stage)),
        CompactionInputRpc.decodeHeaders
      ),
    fetch: (stage, sequences) =>
      framed(
        "compactionFetch",
        stage.identity,
        () => client["EventLog.CompactionFetch"]({ ...stageRequest(stage), batches: sequences }),
        (data) =>
          Effect.flatMap(
            ChangesRpc.decodeEncrypted(data),
            (batches) => encryption.decrypt(stage.identity, stage.storeId, batches)
          )
      ),
    upload: (stage, entries) =>
      Effect.suspend(() => {
        let segment: Array<EncryptedBatch> = []
        let segmentBytes = 0
        let segmentCount = 0

        // The server forgets a segment's pieces when the connection drops, so a
        // retry resends all of them.
        const sendSegment = Effect.suspend(() => {
          if (!Arr.isArrayNonEmpty(segment)) return Effect.void
          const batches = segment
          const id = segmentCount++
          segment = []
          segmentBytes = 0
          return Effect.flatMap(CompactionPartRpc.encodeSegment(batches), (data) => {
            const pieces = ChunkedMessage.split(id, data)
            return request(
              "compactionUpload",
              stage.identity,
              Effect.forEach(
                pieces,
                (chunk) => client["EventLog.CompactionPart"]({ ...stageRequest(stage), chunk }),
                { discard: true }
              ).pipe(
                Effect.retry({ while: (error) => error._tag === "RpcClientError", times: segmentAttempts - 1 })
              )
            )
          })
        })

        // Whole batches go into a segment until the next one would take it
        // past `ChunkedMessage.chunkSize`.
        const addBatch = (batch: Arr.NonEmptyArray<Entry>) =>
          Effect.flatMap(encryption.encrypt(stage.identity, stage.storeId, batch), (encrypted) =>
            Effect.forEach(encrypted, (batch) => {
              const size = encodedBatchSize(batch)
              const send = segment.length > 0 && segmentBytes + size > ChunkedMessage.chunkSize
                ? sendSegment
                : Effect.void
              return Effect.andThen(
                send,
                Effect.sync(() => {
                  segment.push(batch)
                  segmentBytes += size
                })
              )
            }, { discard: true }))

        return Effect.forEach(toBatches(entries), addBatch, { discard: true }).pipe(
          Effect.andThen(sendSegment),
          Effect.map(() => ({ segmentCount })),
          Effect.mapError((cause) =>
            EventLogRemoteError.is(cause) ? cause : new EventLogRemoteError({ method: "compactionUpload", cause })
          )
        )
      }),
    commit: (stage, result) =>
      request(
        "compactionCommit",
        stage.identity,
        client["EventLog.CompactionCommit"]({ ...stageRequest(stage), result })
      ),
    abort: (stage) =>
      request(
        "compactionAbort",
        stage.identity,
        client["EventLog.CompactionAbort"](stageRequest(stage))
      ).pipe(Effect.ignore)
  }
}

// Ignores the segment framing.
const encodedBatchSize = (batch: EncryptedBatch): number =>
  batch.encryptedBatch.byteLength + batch.iv.byteLength + batch.entryIds.length * 16

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
  decodeChanges: (_identity, _storeId, data) => ChangesRpc.decodeUnencrypted(data)
})

/**
 * Provides an encrypted `EventLogRemote` using the remote RPC client and the
 * default Web Crypto encryption layer.
 *
 * **Details**
 *
 * `compaction: false` leaves the remote without its `compaction` member, so
 * this client never calls the compaction RPCs.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerEncryptedWith = (options: {
  readonly compaction?: boolean | undefined
}): Layer.Layer<
  EventLogRemote,
  EventLogRemoteError,
  RpcClient.Protocol | Registry
> =>
  Layer.effect(EventLogRemote, makeEncryptedWith(options)).pipe(
    Layer.provide(EventLogRemoteClient.layer),
    Layer.provide(layerSubtle)
  )

/**
 * Provides an encrypted `EventLogRemote` using the remote RPC client and the
 * default Web Crypto encryption layer.
 *
 * @see {@link layerEncryptedWith} for opting out of running compaction
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerEncrypted: Layer.Layer<
  EventLogRemote,
  EventLogRemoteError,
  RpcClient.Protocol | Registry
> = layerEncryptedWith({})

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
