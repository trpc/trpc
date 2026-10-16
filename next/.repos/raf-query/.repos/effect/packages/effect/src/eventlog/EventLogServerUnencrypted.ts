/**
 * Plaintext server implementation for the event-log remote protocol.
 *
 * This module accepts unencrypted event batches from remote clients, runs the
 * registered event handlers, stores journal entries, and streams backlog plus
 * live changes through the shared `EventLogServer` RPC protocol. It is intended
 * for trusted deployments, local development, and tests where event data does
 * not need a server-side encryption layer. The module also provides the
 * services and layers needed to authorize requests, map stores, persist entries,
 * and install the plaintext server.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as PubSub from "../PubSub.ts"
import * as RcMap from "../RcMap.ts"
import * as Redacted from "../Redacted.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import type * as RpcGroup from "../rpc/RpcGroup.ts"
import * as RpcServer from "../rpc/RpcServer.ts"
import * as Schema from "../Schema.ts"
import type * as Scope from "../Scope.ts"
import * as Semaphore from "../Semaphore.ts"
import * as Stream from "../Stream.ts"
import type * as Event from "./Event.ts"
import type * as EventGroup from "./EventGroup.ts"
import * as EventJournal from "./EventJournal.ts"
import { Entry, makeEntryIdUnsafe, makeRemoteIdUnsafe, RemoteEntry, type RemoteId } from "./EventJournal.ts"
import * as EventLog from "./EventLog.ts"
import {
  ChangesRpc,
  type EventLogAuthentication,
  EventLogProtocolError,
  EventLogRemoteRpcs,
  type StoreId,
  WriteEntriesUnencrypted
} from "./EventLogMessage.ts"
import * as EventLogServer from "./EventLogServer.ts"

/**
 * Service that writes plaintext event-log entries directly to
 * unencrypted storage through registered event handlers.
 *
 * **When to use**
 *
 * Use to access or provide the server service that handles plaintext
 * event-log writes.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class EventLogServerUnencrypted extends Context.Service<EventLogServerUnencrypted, {
  readonly makeWrite: <Groups extends EventGroup.Any>(
    schema: EventLog.EventLogSchema<Groups>
  ) => <
    Tag extends EventGroup.Events<Groups>["tag"],
    Event extends Event.Any = Event.WithTag<EventGroup.Events<Groups>, Tag>
  >(options: {
    readonly storeId: StoreId
    readonly event: Tag
    readonly payload: Event.Payload<Event>
  }) => Effect.Effect<
    Event.Success<Event>,
    EventLogServerStoreError | Event.Error<Event>
  >
}>()("effect/eventlog/EventLogServerUnencrypted") {}

/**
 * Creates a typed server-side write function for events in the supplied
 * `EventLogSchema`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeWrite = <Groups extends EventGroup.Any>(
  schema: EventLog.EventLogSchema<Groups>
): Effect.Effect<
  <
    Tag extends EventGroup.Events<Groups>["tag"],
    Event extends Event.Any = Event.WithTag<EventGroup.Events<Groups>, Tag>
  >(options: {
    readonly storeId: StoreId
    readonly event: Tag
    readonly payload: Event.Payload<Event>
  }) => Effect.Effect<
    Event.Success<Event>,
    EventLogServerStoreError | Event.Error<Event>
  >,
  never,
  EventLogServerUnencrypted
> => EventLogServerUnencrypted.useSync((_) => _.makeWrite(schema))

/**
 * Provides RPC handlers for the unencrypted event-log server.
 *
 * **Details**
 *
 * Incoming plaintext entries are authorized, mapped to a server store, checked
 * for conflicts, run through registered handlers, and persisted; change streams
 * include compacted backlog entries when compactors are registered.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerRpcHandlers: Layer.Layer<
  Rpc.ToHandler<RpcGroup.Rpcs<typeof EventLogRemoteRpcs>> | EventLogAuthentication,
  never,
  Storage | StoreMapping | EventLogServerAuthorization | EventLog.Registry
> = Layer.unwrap(Effect.gen(function*() {
  const storage = yield* Storage
  const mapping = yield* StoreMapping
  const auth = yield* EventLogServerAuthorization
  const registry = yield* EventLog.Registry
  const handler = yield* makeServerHandler
  const remoteId = yield* storage.getId

  const processEntries = Effect.fnUntraced(function*(options: {
    readonly publicKey: string
    readonly storeId: StoreId
    readonly entries: Arr.NonEmptyReadonlyArray<Entry>
  }) {
    const entries = Arr.sort(options.entries, Entry.Order)
    let history = yield* storage.entriesAfter(options.storeId, entries[0])
    const persistedEntries = Arr.empty<Entry>()
    for (const entry of entries) {
      const [duplicate, conflicts, newHistory] = toConflicts(history, entry)
      if (duplicate) continue
      history = newHistory
      yield* handler({
        publicKey: options.publicKey,
        storeId: options.storeId,
        entry,
        conflicts
      })
      persistedEntries.push(entry)
    }
    yield* storage.write(options.storeId, persistedEntries)
  }, storage.withTransaction)

  return EventLogServer.layerRpcHandlers({
    remoteId,
    authorizeIdentity: (publicKey) =>
      auth.authorizeIdentity({ publicKey }).pipe(
        Effect.mapError((error) =>
          new EventLogProtocolError({
            requestTag: "Authenticate",
            publicKey,
            code: error.reason === "Forbidden" ? "Forbidden" : "Unauthorized",
            message: error.message
          })
        )
      ),
    getOrCreateSessionAuthBinding: (publicKey, signingPublicKey) =>
      storage.getOrCreateSessionAuthBinding(publicKey, signingPublicKey),
    onWrite: Effect.fnUntraced(function*(data, authenticatedPublicKeys) {
      const request = yield* WriteEntriesUnencrypted.decode(data).pipe(
        Effect.mapError((_) =>
          new EventLogProtocolError({
            requestTag: "WriteEntries",
            publicKey: undefined,
            code: "InternalServerError",
            message: "Decoding failure"
          })
        )
      )
      if (!authenticatedPublicKeys.has(request.publicKey)) {
        return yield* new EventLogProtocolError({
          requestTag: "WriteEntries",
          publicKey: request.publicKey,
          code: "Forbidden",
          message: "Identity is not authenticated"
        })
      }
      if (!Arr.isReadonlyArrayNonEmpty(request.entries)) return

      const resolvedStoreId = yield* mapping.resolve({
        publicKey: request.publicKey,
        storeId: request.storeId
      }).pipe(
        Effect.mapError((_) =>
          new EventLogProtocolError({
            requestTag: "WriteEntries",
            publicKey: request.publicKey,
            storeId: request.storeId,
            code: "Unauthorized",
            message: _.message
          })
        )
      )
      yield* auth.authorizeWrite({
        publicKey: request.publicKey,
        storeId: resolvedStoreId,
        entries: request.entries
      }).pipe(
        Effect.mapError((_) =>
          new EventLogProtocolError({
            requestTag: "WriteEntries",
            publicKey: request.publicKey,
            storeId: request.storeId,
            code: "Unauthorized",
            message: _.message
          })
        )
      )
      yield* processEntries({
        publicKey: request.publicKey,
        storeId: resolvedStoreId,
        entries: request.entries
      }).pipe(
        Effect.catchCause((_) =>
          Effect.fail(
            new EventLogProtocolError({
              requestTag: "WriteEntries",
              publicKey: request.publicKey,
              code: "InternalServerError",
              message: "Persistence failure"
            })
          )
        ),
        Effect.provideService(EventLog.Identity, makeClientIdentity(request.publicKey))
      )
    }),
    changes: Effect.fnUntraced(function*(request) {
      const storeId = yield* mapping.resolve({
        publicKey: request.publicKey,
        storeId: request.storeId
      })
      yield* auth.authorizeRead({
        publicKey: request.publicKey,
        storeId
      })
      return storage.changes({
        storeId,
        startSequence: request.startSequence,
        compactors: registry.compactors
      }).pipe(
        Stream.mapArrayEffect((entries) => Effect.map(ChangesRpc.encodeUnencrypted(entries), Arr.of))
      )
    }, Stream.unwrap)
  })
}))

/**
 * Error raised by unencrypted server storage and store mapping operations.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class EventLogServerStoreError extends Data.TaggedError("EventLogServerStoreError")<{
  readonly reason: "NotFound" | "PersistenceFailure"
  readonly publicKey?: string | undefined
  readonly storeId?: StoreId | undefined
  readonly message?: string | undefined
}> {}

/**
 * Error raised when unencrypted server authorization rejects an identity or store
 * operation.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class EventLogServerAuthError extends Data.TaggedError("EventLogServerAuthError")<{
  readonly reason: "Unauthorized" | "Forbidden"
  readonly publicKey: string
  readonly storeId?: StoreId | undefined
  readonly message?: string | undefined
}> {}

/**
 * Service that validates unencrypted event-log server
 * write access, read access, and identities.
 *
 * **When to use**
 *
 * Use to provide authorization checks for plaintext event-log writes, reads,
 * and identity authentication.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class EventLogServerAuthorization extends Context.Service<EventLogServerAuthorization, {
  readonly authorizeWrite: (options: {
    readonly publicKey: string
    readonly storeId: StoreId
    readonly entries: ReadonlyArray<Entry>
  }) => Effect.Effect<void, EventLogServerAuthError>
  readonly authorizeRead: (options: {
    readonly publicKey: string
    readonly storeId: StoreId
  }) => Effect.Effect<void, EventLogServerAuthError>
  readonly authorizeIdentity: (options: {
    readonly publicKey: string
  }) => Effect.Effect<void, EventLogServerAuthError>
}>()("effect/eventlog/EventLogServerUnencrypted/EventLogServerAuthorization") {}

/**
 * Service that resolves client-requested store ids to server store ids and checks
 * whether a store exists.
 *
 * **When to use**
 *
 * Use to map client-visible store identifiers to server storage identifiers
 * before authorizing or serving unencrypted event-log requests.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class StoreMapping extends Context.Service<StoreMapping, {
  readonly resolve: (
    options: {
      readonly publicKey: string
      readonly storeId: StoreId
    }
  ) => Effect.Effect<StoreId, EventLogServerStoreError>
  readonly hasStore: (options: {
    readonly publicKey: string
    readonly storeId: StoreId
  }) => Effect.Effect<boolean, EventLogServerStoreError>
}>()("effect/eventlog/EventLogServerUnencrypted/StoreMapping") {}

const toStoreNotFoundError = (options: {
  readonly storeId: StoreId
  readonly publicKey?: string | undefined
}) =>
  new EventLogServerStoreError({
    reason: "NotFound",
    publicKey: options.publicKey,
    storeId: options.storeId,
    message: options.publicKey === undefined
      ? `No provisioned store found for store id: ${options.storeId}`
      : `No provisioned store found for public key: ${options.publicKey} and store id: ${options.storeId}`
  })

/**
 * Provides a `StoreMapping` that accepts only one configured store id and fails
 * all other store ids as not found.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStoreMappingStatic = (options: {
  readonly storeId: StoreId
}): Layer.Layer<StoreMapping> =>
  Layer.succeed(StoreMapping, {
    resolve(request) {
      if (request.storeId === options.storeId) {
        return Effect.succeed(options.storeId)
      }
      return Effect.fail(toStoreNotFoundError(request))
    },
    hasStore: ({ storeId }) => Effect.succeed(storeId === options.storeId)
  })

/**
 * Defines the backing store service used by the unencrypted event-log server.
 *
 * **When to use**
 *
 * Use to provide durable event-log persistence for an unencrypted event-log
 * server layer.
 *
 * **Details**
 *
 * It provides the server remote id, stores session authentication bindings,
 * allocates remote sequence numbers, persists entries, streams changes, and
 * exposes a transaction boundary.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Storage extends Context.Service<Storage, {
  readonly getId: Effect.Effect<RemoteId>
  readonly getOrCreateSessionAuthBinding: (
    publicKey: string,
    signingPublicKey: Uint8Array<ArrayBuffer>
  ) => Effect.Effect<Uint8Array<ArrayBuffer>>
  readonly entriesAfter: (storeId: StoreId, entry: Entry) => Effect.Effect<Array<Entry>>
  readonly write: (
    storeId: StoreId,
    entries: ReadonlyArray<Entry>
  ) => Effect.Effect<ReadonlyArray<RemoteEntry>>
  readonly changes: (options: {
    readonly storeId: StoreId
    readonly startSequence: number
    readonly compactors: ReadonlyMap<string, RegisteredCompactor>
  }) => Stream.Stream<RemoteEntry>
  readonly withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}>()("effect/eventlog/EventLogServerUnencrypted/Storage") {}

const makeClientIdentity = (publicKey: string): EventLog.Identity["Service"] => ({
  publicKey,
  privateKey: constEmptyPrivateKey
})
const constEmptyPrivateKey = Redacted.make(new Uint8Array(32))

const makeServerWriteIdentityPublicKey = (storeId: StoreId): string => `effect-eventlog-server-write:${storeId}`

const entriesAfter = (journal: Array<RemoteEntry>, startSequence: number): ReadonlyArray<RemoteEntry> =>
  journal.filter((entry) => entry.remoteSequence >= startSequence)

const toConflicts = (
  history: ReadonlyArray<Entry>,
  originEntry: Entry
): [duplicate: boolean, conflicts: Array<Entry>, newHistory: Array<Entry>] => {
  let duplicate = false

  for (let i = 0; i < history.length; i++) {
    const entry = history[i]
    if (entry.createdAtMillis < originEntry.createdAtMillis) {
      continue
    } else if (entry.idString === originEntry.idString) {
      duplicate = true
      continue
    }

    const newHistory = history.slice(i)
    let conflicts: Array<Entry> = []
    for (let j = 0; j < newHistory.length; j++) {
      const scannedEntry = newHistory[j]!
      if (scannedEntry.event === originEntry.event && scannedEntry.primaryKey === originEntry.primaryKey) {
        conflicts.push(scannedEntry)
      }
    }
    return [duplicate, conflicts, newHistory]
  }

  return [duplicate, [], []]
}

type RegisteredCompactor = {
  readonly events: ReadonlySet<string>
  readonly effect: (options: {
    readonly entries: ReadonlyArray<Entry>
    readonly write: (entry: Entry) => Effect.Effect<void>
  }) => Effect.Effect<void>
}

const representativeSequences = (options: {
  readonly remoteEntries: ReadonlyArray<RemoteEntry>
  readonly compactedCount: number
}): ReadonlyArray<number> | undefined => {
  if (options.compactedCount === 0) {
    return []
  }
  if (options.compactedCount > options.remoteEntries.length) {
    return undefined
  }

  const maxSequence = options.remoteEntries[options.remoteEntries.length - 1]!.remoteSequence
  if (options.compactedCount === 1) {
    return [maxSequence]
  }

  const selected = options.remoteEntries
    .slice(0, options.compactedCount - 1)
    .map((entry) => entry.remoteSequence)
  selected.push(maxSequence)
  for (let i = 1; i < selected.length; i++) {
    if (selected[i]! <= selected[i - 1]!) {
      return undefined
    }
  }
  return selected
}

const toCompactedRemoteEntries = (options: {
  readonly compacted: ReadonlyArray<Entry>
  readonly remoteEntries: ReadonlyArray<RemoteEntry>
}): ReadonlyArray<RemoteEntry> | undefined => {
  const sequences = representativeSequences({
    remoteEntries: options.remoteEntries,
    compactedCount: options.compacted.length
  })
  if (sequences === undefined) {
    return undefined
  }

  return options.compacted.map((entry, index) =>
    new RemoteEntry({
      remoteSequence: sequences[index]!,
      entry
    }, { disableChecks: true })
  )
}

/**
 * Runs the registered compactors over a backlog of remote entries.
 *
 * **When to use**
 *
 * Use to reduce stored remote entries before replaying them to an unencrypted
 * event-log client.
 *
 * **Details**
 *
 * Contiguous entries handled by the same compactor may be replaced with compacted
 * entries when the replacement count can be mapped back to increasing remote
 * sequence numbers; otherwise the original entries are kept.
 *
 * @stability unstable
 * @category compaction
 * @since 4.0.0
 */
export const compactBacklog = Effect.fnUntraced(function*(options: {
  readonly remoteEntries: ReadonlyArray<RemoteEntry>
  readonly compactors: ReadonlyMap<string, RegisteredCompactor>
}) {
  if (options.compactors.size === 0 || options.remoteEntries.length === 0) {
    return options.remoteEntries
  }

  const compactedRemoteEntries: Array<RemoteEntry> = []
  let index = 0

  while (index < options.remoteEntries.length) {
    const remoteEntry = options.remoteEntries[index]!
    const compactor = options.compactors.get(remoteEntry.entry.event)
    if (compactor === undefined) {
      compactedRemoteEntries.push(remoteEntry)
      index++
      continue
    }

    const entries: Array<Entry> = [remoteEntry.entry]
    const remoteGroup: Array<RemoteEntry> = [remoteEntry]
    const compacted: Array<Entry> = []
    index++

    while (index < options.remoteEntries.length) {
      const nextRemoteEntry = options.remoteEntries[index]!
      const nextCompactor = options.compactors.get(nextRemoteEntry.entry.event)
      if (nextCompactor !== compactor) {
        break
      }
      entries.push(nextRemoteEntry.entry)
      remoteGroup.push(nextRemoteEntry)
      index++
    }

    yield* compactor.effect({
      entries,
      write(entry) {
        return Effect.sync(() => {
          compacted.push(entry)
        })
      }
    }).pipe(Effect.orDie)

    const projected = toCompactedRemoteEntries({
      compacted,
      remoteEntries: remoteGroup
    })

    if (projected === undefined) {
      compactedRemoteEntries.push(...remoteGroup)
      continue
    }
    compactedRemoteEntries.push(...projected)
  }

  return compactedRemoteEntries
})

/**
 * Creates an in-memory unencrypted server `Storage`.
 *
 * **Details**
 *
 * The implementation keeps per-store journals and session authentication bindings
 * in memory, publishes live changes, and serializes transactions with a
 * semaphore.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeStorageMemory: Effect.Effect<Storage["Service"], never, Scope.Scope> = Effect.gen(function*() {
  const knownIds = new Map<string, Map<string, number>>()
  const journals = new Map<string, Array<RemoteEntry>>()
  const sessionAuthBindings = new Map<string, Uint8Array<ArrayBuffer>>()
  const remoteId = makeRemoteIdUnsafe()

  const ensureKnownIds = (storeId: StoreId): Map<string, number> => {
    let storeKnownIds = knownIds.get(storeId)
    if (storeKnownIds) return storeKnownIds
    storeKnownIds = new Map()
    knownIds.set(storeId, storeKnownIds)
    return storeKnownIds
  }

  const ensureJournal = (storeId: StoreId): Array<RemoteEntry> => {
    let journal = journals.get(storeId)
    if (journal) return journal
    journal = []
    journals.set(storeId, journal)
    return journal
  }

  const pubsubs = yield* RcMap.make({
    lookup: (_storeId: string) =>
      Effect.acquireRelease(
        PubSub.unbounded<RemoteEntry>(),
        PubSub.shutdown
      ),
    idleTimeToLive: 60000
  })

  const write = Effect.fnUntraced(function*(storeId: StoreId, entries: ReadonlyArray<Entry>) {
    const sequenceNumbers: Array<number> = []
    const committed: Array<RemoteEntry> = []
    const storeKnownIds = ensureKnownIds(storeId)
    const journal = ensureJournal(storeId)
    let lastSequenceNumber = Arr.last(journal).pipe(
      Option.map((entry) => entry.remoteSequence),
      Option.getOrElse(() => 0)
    )
    if (entries.some((entry) => storeKnownIds.has(entry.idString))) {
      return yield* Effect.die("Duplicate entries")
    }

    for (const entry of entries) {
      const remoteEntry = new RemoteEntry({
        remoteSequence: ++lastSequenceNumber,
        entry
      }, { disableChecks: true })

      sequenceNumbers.push(remoteEntry.remoteSequence)
      committed.push(remoteEntry)
      journal.push(remoteEntry)
      storeKnownIds.set(entry.idString, remoteEntry.remoteSequence)
    }

    const pubsub = yield* RcMap.get(pubsubs, storeId)
    yield* PubSub.publishAll(pubsub, committed)

    return committed
  }, Effect.scoped)

  const transactionSemaphore = yield* Semaphore.make(1)

  return Storage.of({
    getId: Effect.succeed(remoteId),
    getOrCreateSessionAuthBinding: (publicKey, signingPublicKey) =>
      Effect.sync(() => {
        const existing = sessionAuthBindings.get(publicKey)
        if (existing) return existing
        sessionAuthBindings.set(publicKey, signingPublicKey)
        return signingPublicKey
      }),
    entriesAfter: (storeId, entry) =>
      Effect.sync(() => {
        const journal = ensureJournal(storeId)
        return journal.filter((e) => Entry.Order(e.entry, entry) >= 0).map((e) => e.entry)
      }),
    write,
    changes: Effect.fnUntraced(function*({ storeId, startSequence, compactors }) {
      const pubsub = yield* RcMap.get(pubsubs, storeId)
      const subscription = yield* PubSub.subscribe(pubsub)

      const backlog = yield* compactBacklog({
        remoteEntries: entriesAfter(ensureJournal(storeId), startSequence),
        compactors
      })
      const replayedUpTo = backlog.length > 0 ? backlog[backlog.length - 1].remoteSequence : startSequence - 1

      return Stream.fromArray(backlog).pipe(
        Stream.concat(
          Stream.fromSubscription(subscription).pipe(
            Stream.filter((entry) => entry.remoteSequence > replayedUpTo)
          )
        )
      )
    }, Stream.unwrap),
    withTransaction: transactionSemaphore.withPermits(1)
  })
})

/**
 * Provides unencrypted server `Storage` using the in-memory implementation.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStorageMemory: Layer.Layer<Storage> = Layer.effect(Storage)(makeStorageMemory)

/**
 * Creates the `EventLogServerUnencrypted` service from the configured storage and
 * registered event handlers.
 *
 * **When to use**
 *
 * Use when you need the unencrypted event-log server service from provided
 * `Storage` and an event-log `Registry`.
 *
 * **Details**
 *
 * The constructed service exposes `makeWrite`, which builds a typed server-side
 * write function from an `EventLogSchema`. Each write encodes the payload with
 * the event schema, runs the registered handler, and persists the generated
 * entry inside `Storage.withTransaction`.
 *
 * **Gotchas**
 *
 * The write function dies if the requested event tag is not present in the
 * schema passed to `makeWrite`; it does not report that case as a typed failure.
 *
 * @see {@link makeWrite} for the accessor that retrieves the typed server-side write function from the service environment
 * @see {@link layerServer} for the layer form that provides this service together with an event-log `Registry`
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.gen(function*() {
  const storage = yield* Storage
  const handler = yield* makeServerHandler

  return EventLogServerUnencrypted.of({
    makeWrite<Groups extends EventGroup.Any>(schema: EventLog.EventLogSchema<Groups>) {
      const events = new Map<string, Event.AnyWithProps>()
      for (const group of schema.groups as unknown as ReadonlyArray<EventGroup.EventGroup<Event.Any>>) {
        for (const [tag, event] of Object.entries(group.events)) {
          events.set(tag, event)
        }
      }
      return Effect.fnUntraced(function*(options: {
        readonly storeId: StoreId
        readonly event: string
        readonly payload: unknown
      }) {
        const publicKey = makeServerWriteIdentityPublicKey(options.storeId)
        const schemaEvent = events.get(options.event)
        if (schemaEvent === undefined) {
          return yield* Effect.die(`Event schema not found for: "${options.event}"`)
        }

        const entry = new EventJournal.Entry({
          id: makeEntryIdUnsafe(),
          event: options.event,
          primaryKey: schemaEvent.primaryKey(options.payload),
          payload: yield* Schema.encodeUnknownEffect(schemaEvent.payloadSchemaBinary)(options.payload).pipe(
            Effect.mapError((_) =>
              new EventLogServerStoreError({
                reason: "PersistenceFailure",
                publicKey: publicKey,
                storeId: options.storeId,
                message: "Failed to encode event"
              })
            )
          ) as Effect.Effect<any, EventLogServerStoreError>
        }, { disableChecks: true })

        const result = yield* handler({
          publicKey,
          storeId: options.storeId,
          entry,
          conflicts: []
        }).pipe(
          Effect.provideService(EventLog.Identity, makeClientIdentity(publicKey))
        )

        yield* storage.write(options.storeId, [entry])

        return result
      }, storage.withTransaction) as any
    }
  })
})

/**
 * Provides `EventLogServerUnencrypted` and an event-log `Registry` using the
 * configured unencrypted server `Storage`.
 *
 * **When to use**
 *
 * Use to provide the unencrypted event-log server service together with the
 * registry needed by event handlers.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerServer: Layer.Layer<
  EventLogServerUnencrypted | EventLog.Registry,
  never,
  Storage
> = Layer.effect(EventLogServerUnencrypted, make).pipe(
  Layer.provideMerge(EventLog.layerRegistry)
)

/**
 * Builds a full unencrypted event-log RPC server for the supplied schema and
 * event-group handler layer.
 *
 * **When to use**
 *
 * Use when you need the full unencrypted event-log RPC server layer with
 * storage, authorization, RPC protocol, and event-group handler dependencies
 * supplied externally.
 *
 * **Details**
 *
 * The layer installs `EventLogRemoteRpcs`, wires `layerRpcHandlers`, registers
 * the supplied event-group handler layer, and provides `layerServer`, leaving
 * only the required infrastructure services in the environment.
 *
 * **Gotchas**
 *
 * Entries are persisted and streamed in plaintext. Protect the backing
 * `Storage` with the surrounding infrastructure, and use durable storage that
 * preserves session authentication bindings when the server must survive
 * restarts.
 *
 * @see {@link layerNoRpcServer} for installing the same unencrypted handlers when an `RpcServer.Protocol` is provided elsewhere
 * @see {@link layerRpcHandlers} for wiring the unencrypted RPC handlers directly
 * @see {@link layerServer} for constructing the server service and event-log registry without RPC handlers
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = <Groups extends EventGroup.Any, E, R>(
  _schema: EventLog.EventLogSchema<Groups>,
  layer: Layer.Layer<EventGroup.ToService<Groups>, E, R>
): Layer.Layer<
  never,
  E,
  | Exclude<R, EventLogServerUnencrypted | EventLog.Registry>
  | EventLogServerAuthorization
  | RpcServer.Protocol
  | Storage
  | StoreMapping
> =>
  RpcServer.layer(EventLogRemoteRpcs).pipe(
    Layer.provide(layerRpcHandlers),
    Layer.provide(layer),
    Layer.provide(layerServer)
  )

/**
 * Builds the unencrypted event-log server handlers without installing an
 * `RpcServer.Protocol` implementation.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerNoRpcServer = <Groups extends EventGroup.Any, E, R>(
  _schema: EventLog.EventLogSchema<Groups>,
  layer: Layer.Layer<EventGroup.ToService<Groups>, E, R>
): Layer.Layer<
  Rpc.ToHandler<RpcGroup.Rpcs<typeof EventLogRemoteRpcs>> | EventLogAuthentication,
  E,
  | Exclude<R, EventLogServerUnencrypted | EventLog.Registry>
  | EventLogServerAuthorization
  | Storage
  | StoreMapping
> =>
  layerRpcHandlers.pipe(
    Layer.merge(layer),
    Layer.provide(layerServer)
  )

const makeServerHandler = Effect.gen(function*() {
  const registry = yield* EventLog.Registry

  return Effect.fnUntraced(
    function*(options: {
      readonly publicKey: string
      readonly storeId: StoreId
      readonly entry: Entry
      readonly conflicts: ReadonlyArray<Entry>
      readonly payload?: unknown
    }): Effect.fn.Return<any, any, EventLog.Identity> {
      const handler = registry.handlers.get(options.entry.event)
      if (handler === undefined) {
        return yield* Effect.logDebug(`Event handler not found for: "${options.entry.event}"`)
      }

      const decodePayload = Schema.decodeUnknownEffect(handler.event.payloadSchemaBinary)
      const decodedConflicts: Array<{ readonly entry: Entry; readonly payload: unknown }> = []

      for (const conflict of options.conflicts) {
        decodedConflicts.push({
          entry: conflict,
          payload: yield* decodePayload(conflict.payload).pipe(
            Effect.updateContext((input) => Context.merge(handler.context, input))
          ) as any
        })
      }

      const payloadEffect = "payload" in options
        ? Effect.succeed(options.payload)
        : decodePayload(options.entry.payload)

      return yield* payloadEffect.pipe(
        Effect.mapError((_) =>
          new EventLogServerStoreError({
            reason: "PersistenceFailure",
            publicKey: options.publicKey,
            storeId: options.storeId,
            message: "Failed to decode event"
          })
        ),
        Effect.flatMap((payload) =>
          handler.handler({
            storeId: options.storeId,
            payload,
            entry: options.entry,
            conflicts: decodedConflicts
          })
        ),
        Effect.updateContext((input) => Context.merge(handler.context, input))
      ) as Effect.Effect<any, unknown, EventLog.Identity>
    }
  )
})
