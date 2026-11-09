/**
 * Builds server-side handlers for the event-log remote protocol.
 *
 * Transport modules use these handlers to expose an event journal to remote
 * replicas. The handlers run the hello/authenticate challenge flow, attach the
 * authenticated `EventLog.Identity` to later requests, accept single or chunked
 * writes, and stream changes back as single or chunked messages.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "../Array.ts"
import * as Arr from "../Array.ts"
import * as Cache from "../Cache.ts"
import * as Context from "../Context.ts"
import * as Mac from "../crypto/Mac.ts"
import * as Data from "../Data.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Equal from "../Equal.ts"
import * as Exit from "../Exit.ts"
import * as Hash from "../Hash.ts"
import * as Uuid from "../internal/uuid.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Redacted from "../Redacted.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import type * as RpcGroup from "../rpc/RpcGroup.ts"
import * as Stream from "../Stream.ts"
import type { EntryId, RemoteId } from "./EventJournal.ts"
import * as EventLog from "./EventLog.ts"
import {
  ChunkedMessage,
  EventLogAuthentication,
  EventLogProtocolError,
  EventLogRemoteRpcs,
  HelloResponse,
  SingleMessage,
  type StoreId,
  type WriteAck
} from "./EventLogMessage.ts"
import * as EventLogSessionAuth from "./EventLogSessionAuth.ts"

/**
 * Provides RPC authentication middleware that reads the authenticated
 * `EventLog.Identity` from client annotations.
 *
 * **Details**
 *
 * Requests without an identity fail with a forbidden `EventLogProtocolError`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerAuthMiddleware: Layer.Layer<
  EventLogAuthentication
> = Layer.succeed(EventLogAuthentication, (effect, { client, rpc }) => {
  const identity = Context.getOrUndefined(client.annotations, EventLog.Identity)
  if (identity) return Effect.provideService(effect, EventLog.Identity, identity)
  return Effect.fail(
    new EventLogProtocolError({
      requestTag: rpc._tag,
      publicKey: undefined,
      code: "Forbidden",
      message: "Unauthenticated request"
    })
  )
})

/**
 * Creates the shared RPC handlers for the event-log remote protocol.
 *
 * **Details**
 *
 * The layer manages hello challenges, verifies session authentication, reassembles
 * chunked writes, delegates write and change handling to the supplied callbacks,
 * and frames large change payloads into chunks.
 *
 * `Authenticate` calls `authorizeIdentity` with the claimed public key and the
 * presented signing public key, then verifies the signature against the
 * presented key. Only a verified key is passed to
 * `getOrCreateSessionAuthBinding`, and a key that differs from the identity's
 * existing binding is rejected.
 *
 * Use the connection's `ConnectionWrites.track` in `onWrite` and
 * `ConnectionWrites.filter` in `changes` to suppress its own write echoes.
 * `compaction` sets `HelloResponse.compaction`, advertising that the server
 * also serves `EventLogCompactionRpcs`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerRpcHandlers = (options: {
  readonly remoteId: RemoteId
  readonly firstSequence?: number | undefined
  readonly compaction?: boolean | undefined
  readonly authorizeIdentity?: (
    publicKey: string,
    signingPublicKey: Uint8Array<ArrayBuffer>
  ) => Effect.Effect<void, EventLogProtocolError>
  readonly getOrCreateSessionAuthBinding: (
    publicKey: string,
    signingPublicKey: Uint8Array<ArrayBuffer>
  ) => Effect.Effect<Uint8Array<ArrayBuffer>>
  readonly onWrite: (
    data: Uint8Array<ArrayBuffer>,
    authenticatedPublicKeys: ReadonlySet<string>,
    writes: ConnectionWrites
  ) => Effect.Effect<ReadonlyArray<WriteAck>, EventLogProtocolError>
  readonly changes: (options: {
    readonly publicKey: string
    readonly storeId: StoreId
    readonly startSequence: number
    readonly writes: ConnectionWrites
  }) => Stream.Stream<Uint8Array<ArrayBuffer>, unknown>
}): Layer.Layer<
  Rpc.ToHandler<RpcGroup.Rpcs<typeof EventLogRemoteRpcs>> | EventLogAuthentication
> =>
  EventLogRemoteRpcs.toLayer(Effect.gen(function*() {
    const clientChallenges = yield* Cache.make({
      lookup: (_clientId: number) => Effect.orDie(EventLogSessionAuth.makeSessionAuthChallenge),
      capacity: Number.MAX_SAFE_INTEGER,
      timeToLive: EventLogSessionAuth.SessionAuthChallengeTimeToLiveMillis
    })
    const toFrames = makeFramer()

    const persistedSigningPublicKeys = yield* Cache.makeWith(
      (key: SessionAuthCacheKey) =>
        options.getOrCreateSessionAuthBinding(key.publicKey, key.signingPublicKey).pipe(
          Effect.catchCause((_) =>
            Effect.fail(
              new EventLogProtocolError({
                requestTag: "Authenticate",
                publicKey: key.publicKey,
                code: "Forbidden",
                message: "Session auth binding lookup failed"
              })
            )
          )
        ),
      {
        capacity: 4096,
        timeToLive: (exit) => Exit.isSuccess(exit) ? Duration.infinity : Duration.zero
      }
    )

    return EventLogRemoteRpcs.of({
      "EventLog.Hello": Effect.fnUntraced(function*(_, { client }) {
        const challenge = yield* Cache.get(clientChallenges, client.id)
        return new HelloResponse({
          remoteId: options.remoteId,
          challenge,
          firstSequence: options.firstSequence,
          compaction: options.compaction === true ? true : undefined
        })
      }),
      "EventLog.Authenticate": Effect.fnUntraced(function*(request, { client }) {
        const challenge = Option.getOrNull(yield* Cache.getOption(clientChallenges, client.id))
        if (!challenge) {
          return yield* new EventLogProtocolError({
            requestTag: "Authenticate",
            publicKey: request.publicKey,
            code: "Forbidden",
            message: "Session auth challenge has expired"
          })
        }
        yield* Cache.invalidate(clientChallenges, client.id)
        if (options.authorizeIdentity) {
          yield* options.authorizeIdentity(request.publicKey, request.signingPublicKey)
        }
        const verified = yield* EventLogSessionAuth.verifySessionAuthenticateRequest({
          remoteId: options.remoteId,
          challenge,
          publicKey: request.publicKey,
          signingPublicKey: request.signingPublicKey,
          signature: request.signature,
          algorithm: request.algorithm
        }).pipe(
          Effect.catch(() => Effect.succeed(false))
        )

        const verificationFailed = () =>
          new EventLogProtocolError({
            requestTag: "Authenticate",
            publicKey: request.publicKey,
            code: "Forbidden",
            message: "Session auth signature verification failed"
          })
        if (!verified) {
          return yield* verificationFailed()
        }
        // Only a verified key reaches the binding. A key other than the
        // identity's bound key is rejected like a bad signature.
        const boundSigningPublicKey = yield* Cache.get(
          persistedSigningPublicKeys,
          new SessionAuthCacheKey({
            publicKey: request.publicKey,
            signingPublicKey: request.signingPublicKey
          })
        )
        if (!Mac.timingSafeEqual(boundSigningPublicKey, request.signingPublicKey)) {
          return yield* verificationFailed()
        }

        const authenticatedIdentities = new Set(
          Context.getOrUndefined(client.annotations, AuthenticatedIdentities)
        )
        authenticatedIdentities.add(request.publicKey)
        void client
          .annotate(EventLog.Identity, {
            publicKey: request.publicKey,
            privateKey: constEmptyPrivateKey
          })
          .annotate(AuthenticatedIdentities, authenticatedIdentities)
          .annotate(ChunkedMessageState, new Map())
      }),
      "EventLog.WriteSingle": (request, { client }) =>
        options.onWrite(
          request.data,
          Context.getOrUndefined(client.annotations, AuthenticatedIdentities) ?? new Set(),
          getConnectionWrites(client)
        ),
      "EventLog.WriteChunked": (request, { client }) => {
        const state = Context.get(client.annotations, ChunkedMessageState)
        const data = ChunkedMessage.join(state, request)
        if (!data) return Effect.succeed([])
        return options.onWrite(
          data,
          Context.getOrUndefined(client.annotations, AuthenticatedIdentities) ?? new Set(),
          getConnectionWrites(client)
        )
      },
      "EventLog.Changes": (request, { client }) => {
        const authenticatedIdentities = Context.getOrUndefined(client.annotations, AuthenticatedIdentities)
        if (!authenticatedIdentities?.has(request.publicKey)) {
          return Stream.fail(
            new EventLogProtocolError({
              requestTag: "Changes",
              publicKey: request.publicKey,
              code: "Forbidden",
              message: "Identity is not authenticated"
            })
          )
        }
        return options.changes({
          publicKey: request.publicKey,
          storeId: request.storeId,
          startSequence: request.startSequence,
          writes: getConnectionWrites(client)
        }).pipe(
          Stream.mapArray(Arr.flatMap(toFrames)),
          Stream.catchCause((_) =>
            Stream.fail(
              new EventLogProtocolError({
                requestTag: "Changes",
                publicKey: request.publicKey,
                code: "InternalServerError",
                message: "Decoding failure"
              })
            )
          )
        )
      }
    })
  })).pipe(
    Layer.merge(layerAuthMiddleware)
  )

/**
 * Annotation that stores partial `ChunkedMessage` data while chunked writes are
 * being reassembled.
 *
 * **When to use**
 *
 * Use to keep per-client chunk assembly state while handling chunked event-log
 * writes.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class ChunkedMessageState extends Context.Reference<
  Map<number, {
    readonly parts: Array<Uint8Array>
    count: number
    bytes: number
  }>
>("effect/eventlog/EventLogServer/ChunkedMessageState", {
  defaultValue: () => new Map()
}) {}

/**
 * Tracks writes to suppress their echoes on the same RPC connection.
 *
 * **Details**
 *
 * Only tracks entries for stores with an open change stream.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export class ConnectionWrites {
  private readonly streams = new Map<string, Set<ConnectionStream>>()

  /**
   * Runs a storage write while suppressing its entries on this connection's streams.
   *
   * @stability unstable
   * @since 4.0.6
   */
  track<E, R>(
    options: {
      readonly publicKey: string
      readonly storeId: StoreId
      readonly entryIds: ReadonlyArray<EntryId>
    },
    write: Effect.Effect<ReadonlyArray<WriteAck>, E, R>
  ): Effect.Effect<ReadonlyArray<WriteAck>, E, R> {
    const open = this.streams.get(makeStreamKey(options.publicKey, options.storeId))
    if (open === undefined || options.entryIds.length === 0) return write
    const streams = Array.from(open)
    const started = streams.map((stream) => stream.position)
    const ids = options.entryIds.map(Uuid.stringify)
    // Track before writing: storage can publish an entry before the write
    // returns. Each occurrence is counted, as an id can be stored more than once.
    for (const stream of streams) {
      for (const id of ids) stream.ids.set(id, (stream.ids.get(id) ?? 0) + 1)
    }
    return Effect.onExit(write, (exit) =>
      Effect.sync(() => {
        for (let i = 0; i < streams.length; i++) {
          const stream = streams[i]
          if (exit._tag === "Failure") {
            for (const id of ids) release(stream.ids, id)
            continue
          }
          // Release occurrences the stream had already passed when the write began.
          for (const ack of exit.value) {
            if (ack.sequence <= started[i]) release(stream.ids, Uuid.stringify(ack.entryId))
          }
        }
      }))
  }

  /**
   * Filters this connection's writes from a store's change stream. An item can
   * hold several entries; `sequence` returns its highest one.
   *
   * @stability unstable
   * @since 4.0.6
   */
  filter<A, E, R>(
    options: {
      readonly publicKey: string
      readonly storeId: StoreId
      readonly entryIds: (item: A) => ReadonlyArray<EntryId>
      readonly sequence: (item: A) => number
    },
    stream: Stream.Stream<A, E, R>
  ): Stream.Stream<A, E, R> {
    return Stream.suspend(() => {
      const key = makeStreamKey(options.publicKey, options.storeId)
      const state: ConnectionStream = { ids: new Map(), position: -1 }
      let open = this.streams.get(key)
      if (open === undefined) {
        open = new Set()
        this.streams.set(key, open)
      }
      open.add(state)
      return stream.pipe(
        Stream.filter((item) => {
          const sequence = options.sequence(item)
          if (sequence > state.position) state.position = sequence
          if (state.ids.size === 0) return true
          // An item is written by one request, so it is either all or none of ours.
          const ids = options.entryIds(item).map(Uuid.stringify)
          if (!ids.every((id) => state.ids.has(id))) return true
          for (const id of ids) release(state.ids, id)
          return false
        }),
        Stream.ensuring(Effect.sync(() => {
          open.delete(state)
          if (open.size === 0) this.streams.delete(key)
        }))
      )
    })
  }
}

interface ConnectionStream {
  // Outstanding occurrences of this connection's writes, by entry id.
  readonly ids: Map<string, number>
  position: number
}

const release = (ids: Map<string, number>, id: string): void => {
  const count = ids.get(id)
  if (count === undefined) return
  if (count <= 1) ids.delete(id)
  else ids.set(id, count - 1)
}

const makeStreamKey = (publicKey: string, storeId: StoreId): string => `${publicKey}/${storeId}`

class ConnectionWritesState extends Context.Service<ConnectionWritesState, ConnectionWrites>()(
  "effect/eventlog/EventLogServer/ConnectionWrites"
) {}

const getConnectionWrites = (client: Rpc.ServerClient): ConnectionWrites => {
  const existing = Context.getOrUndefined(client.annotations, ConnectionWritesState)
  if (existing !== undefined) return existing
  const writes = new ConnectionWrites()
  client.annotate(ConnectionWritesState, writes)
  return writes
}

/**
 * Annotation containing the public keys authenticated on an RPC connection.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class AuthenticatedIdentities extends Context.Service<AuthenticatedIdentities, Set<string>>()(
  "effect/eventlog/EventLogServer/AuthenticatedIdentities"
) {}

// Keyed by `publicKey` alone: the cache holds each identity's bound signing
// key, and `Authenticate` rejects any presented key that differs from it.
class SessionAuthCacheKey extends Data.Class<{
  readonly publicKey: string
  readonly signingPublicKey: Uint8Array<ArrayBuffer>
}> {
  [Equal.symbol](that: SessionAuthCacheKey) {
    return this.publicKey === that.publicKey
  }
  [Hash.symbol]() {
    return Hash.string(this.publicKey)
  }
}

/**
 * Frames one encoded message for a response stream: a `SingleMessage` when it
 * fits, or the pieces of a `ChunkedMessage` with the next id otherwise.
 *
 * @internal
 */
export const makeFramer = (): (
  data: Uint8Array<ArrayBuffer>
) => NonEmptyReadonlyArray<SingleMessage | ChunkedMessage> => {
  let chunkedIdCounter = 0
  return (data) =>
    data.byteLength <= ChunkedMessage.chunkSize
      ? [new SingleMessage({ data })]
      : ChunkedMessage.split(chunkedIdCounter++, data)
}

const constEmptyPrivateKey = Redacted.make(new Uint8Array(32))
