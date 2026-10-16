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
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Equal from "../Equal.ts"
import * as Hash from "../Hash.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Redacted from "../Redacted.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import type * as RpcGroup from "../rpc/RpcGroup.ts"
import * as Stream from "../Stream.ts"
import type { RemoteId } from "./EventJournal.ts"
import * as EventLog from "./EventLog.ts"
import {
  ChunkedMessage,
  EventLogAuthentication,
  EventLogProtocolError,
  EventLogRemoteRpcs,
  HelloResponse,
  SingleMessage,
  type StoreId
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
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerRpcHandlers = (options: {
  readonly remoteId: RemoteId
  readonly authorizeIdentity?: (publicKey: string) => Effect.Effect<void, EventLogProtocolError>
  readonly getOrCreateSessionAuthBinding: (
    publicKey: string,
    signingPublicKey: Uint8Array<ArrayBuffer>
  ) => Effect.Effect<Uint8Array<ArrayBuffer>>
  readonly onWrite: (
    data: Uint8Array<ArrayBuffer>,
    authenticatedPublicKeys: ReadonlySet<string>
  ) => Effect.Effect<void, EventLogProtocolError>
  readonly changes: (options: {
    readonly publicKey: string
    readonly storeId: StoreId
    readonly startSequence: number
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
    let chunkedIdCounter = 0

    const persistedSigningPublicKeys = yield* Cache.make({
      lookup: (key: SessionAuthCacheKey) =>
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
      capacity: 4096
    })

    return EventLogRemoteRpcs.of({
      "EventLog.Hello": Effect.fnUntraced(function*(_, { client }) {
        const challenge = yield* Cache.get(clientChallenges, client.id)
        return new HelloResponse({
          remoteId: options.remoteId,
          challenge
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
          yield* options.authorizeIdentity(request.publicKey)
        }
        const signingPublicKey = yield* Cache.get(
          persistedSigningPublicKeys,
          new SessionAuthCacheKey({
            publicKey: request.publicKey,
            signingPublicKey: request.signingPublicKey
          })
        )
        const verified = yield* EventLogSessionAuth.verifySessionAuthenticateRequest({
          remoteId: options.remoteId,
          challenge,
          publicKey: request.publicKey,
          signingPublicKey,
          signature: request.signature,
          algorithm: request.algorithm
        }).pipe(
          Effect.catch(() => Effect.succeed(false))
        )

        if (!verified) {
          return yield* new EventLogProtocolError({
            requestTag: "Authenticate",
            publicKey: request.publicKey,
            code: "Forbidden",
            message: "Session auth signature verification failed"
          })
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
      "EventLog.WriteSingle": Effect.fnUntraced(function*(request, { client }) {
        yield* options.onWrite(
          request.data,
          Context.getOrUndefined(client.annotations, AuthenticatedIdentities) ?? new Set()
        )
      }),
      "EventLog.WriteChunked": Effect.fnUntraced(function*(request, { client }) {
        const state = Context.get(client.annotations, ChunkedMessageState)
        const data = ChunkedMessage.join(state, request)
        if (!data) return
        yield* options.onWrite(
          data,
          Context.getOrUndefined(client.annotations, AuthenticatedIdentities) ?? new Set()
        )
      }),
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
          startSequence: request.startSequence
        }).pipe(
          Stream.mapArray(Arr.flatMap((data): NonEmptyReadonlyArray<SingleMessage | ChunkedMessage> => {
            if (data.byteLength <= ChunkedMessage.chunkSize) {
              return [new SingleMessage({ data })]
            }
            return ChunkedMessage.split(chunkedIdCounter++, data)
          })),
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
 * Annotation containing the public keys authenticated on an RPC connection.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class AuthenticatedIdentities extends Context.Service<AuthenticatedIdentities, Set<string>>()(
  "effect/eventlog/EventLogServer/AuthenticatedIdentities"
) {}

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

const constEmptyPrivateKey = Redacted.make(new Uint8Array(32))
