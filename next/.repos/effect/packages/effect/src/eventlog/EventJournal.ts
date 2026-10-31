/**
 * Stores event-log entries and replication state.
 *
 * `EventJournal` records committed entries, exposes them for replay, publishes
 * local changes, and tracks the remote metadata needed to exchange entries with
 * other journals. Higher-level event-log schemas and handlers use this service
 * to rebuild projections, sync offline clients, import remote changes, and
 * coordinate writes per store. This module also defines journal errors, entry
 * and remote identifiers, schemas, and in-memory or IndexedDB-backed journal
 * layers.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import type { Brand } from "../Brand.ts"
import * as Clock from "../Clock.ts"
import * as Context from "../Context.ts"
import * as SecureRandom from "../crypto/SecureRandom.ts"
import * as Data from "../Data.ts"
import * as DateTime from "../DateTime.ts"
import * as Effect from "../Effect.ts"
import * as SchemaBinary from "../encoding/SchemaBinary.ts"
import { constVoid } from "../Function.ts"
import * as Uuid from "../internal/uuid.ts"
import * as Layer from "../Layer.ts"
import type { Option } from "../Option.ts"
import * as Order from "../Order.ts"
import * as PubSub from "../PubSub.ts"
import * as Schema from "../Schema.ts"
import type * as SchemaAST from "../SchemaAST.ts"
import type { Scope } from "../Scope.ts"
import * as Semaphore from "../Semaphore.ts"
import type { StoreId } from "./EventLogMessage.ts"
import { ConflictIndex, entryIdOrder } from "./internal/conflicts.ts"

/**
 * Context service for storing and replaying event journal entries.
 *
 * **Details**
 *
 * The service writes local entries, imports entries from remote journals, exposes
 * a stream of local changes, and provides per-store locking.
 *
 * Entries written by `EventLog` carry payloads encoded with their event's
 * `payloadSchemaBinary`; see {@link Entry} for how to decode them.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class EventJournal extends Context.Service<EventJournal, {
  /**
   * Read all the entries in the journal.
   */
  readonly entries: Effect.Effect<ReadonlyArray<Entry>, EventJournalError>

  /**
   * Read the stored entries with the given ids. The result is aligned with
   * `ids`, with `undefined` for ids that are not in the journal.
   */
  readonly entriesById: (
    ids: ReadonlyArray<EntryId>
  ) => Effect.Effect<ReadonlyArray<Entry | undefined>, EventJournalError>

  /**
   * Write an event to the journal, performing an effect before committing the
   * event.
   */
  readonly write: <A, E, R>(options: {
    readonly event: string
    readonly primaryKey: string
    readonly payload: Uint8Array
    readonly effect: (entry: Entry) => Effect.Effect<A, E, R>
  }) => Effect.Effect<A, EventJournalError | E, R>

  /**
   * Write several events to the journal, performing an effect before
   * committing them.
   *
   * **Details**
   *
   * `effect` runs once with every entry, in input order and with ascending
   * ids. The entries are committed together and then published to `changes`
   * only after it succeeds. If it fails, nothing is committed or published.
   */
  readonly writeMany: <A, E, R>(options: {
    readonly entries: Arr.NonEmptyReadonlyArray<{
      readonly event: string
      readonly primaryKey: string
      readonly payload: Uint8Array
    }>
    readonly effect: (entries: Arr.NonEmptyReadonlyArray<Entry>) => Effect.Effect<A, E, R>
  }) => Effect.Effect<A, EventJournalError | E, R>

  /**
   * Write events from a remote source to the journal.
   *
   * **Details**
   *
   * `effect` runs once with every new entry after compaction, sorted by
   * `Entry.Order`. Each entry is paired with the stored entries for the same
   * event and primary key whose id is strictly greater, in id order. Entries
   * in the batch never conflict with each other: applying them in id order
   * gives the same result as delivering them one at a time. A compaction
   * replacement written by `EventLog` takes the place and conflicts of the
   * source entry it is anchored to, not of its own id.
   *
   * All conflicts are read before `effect` runs and the batch is committed
   * after it succeeds, with no journal I/O while it runs. It is not called
   * when the batch has no new entries. If `effect` fails, no entry from the
   * batch is committed.
   */
  readonly writeFromRemote: (
    options: {
      readonly remoteId: RemoteId
      readonly entries: ReadonlyArray<RemoteEntry>
      readonly compact?:
        | ((uncommitted: ReadonlyArray<RemoteEntry>) => Effect.Effect<ReadonlyArray<Entry>, EventJournalError>)
        | undefined
      readonly effect: (
        entries: ReadonlyArray<{
          readonly entry: Entry
          readonly conflicts: ReadonlyArray<Entry>
        }>
      ) => Effect.Effect<void, EventJournalError>
    }
  ) => Effect.Effect<{
    readonly duplicateEntries: ReadonlyArray<Entry>
  }, EventJournalError>

  /**
   * Run an effect with the uncommitted entries for a remote source.
   *
   * The effect is not run when there are no uncommitted entries, in which case
   * `Option.none()` is returned. Otherwise, its result is wrapped in
   * `Option.some()`.
   */
  readonly withRemoteUncommited: <A, E, R>(
    remoteId: RemoteId,
    f: (entries: Arr.NonEmptyReadonlyArray<Entry>) => Effect.Effect<A, E, R>
  ) => Effect.Effect<Option<A>, EventJournalError | E, R>

  /**
   * Records upload acknowledgements, advancing `nextRemoteSequence` only across
   * contiguous sequences from the current cursor or `firstSequence`.
   */
  readonly writeRemoteAcks: (options: {
    readonly remoteId: RemoteId
    readonly acks: ReadonlyArray<RemoteAck>
    readonly firstSequence?: number | undefined
  }) => Effect.Effect<void, EventJournalError>

  /**
   * Retrieve the first unused sequence number for a remote source.
   */
  readonly nextRemoteSequence: (remoteId: RemoteId) => Effect.Effect<number, EventJournalError>

  /**
   * The entries added to the local journal.
   */
  readonly changes: Effect.Effect<PubSub.Subscription<Entry>, never, Scope>

  /**
   * Remove all data
   */
  readonly destroy: Effect.Effect<void, EventJournalError>

  /**
   * Run an effect with a lock on the journal.
   */
  readonly withLock: (storeId: StoreId) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}>()("effect/eventlog/EventJournal") {}

const TypeId = "effect/eventlog/EventJournal/EventJournalError" as const

/**
 * Error raised by event journal operations.
 *
 * **Details**
 *
 * The error records the journal method that failed and the underlying cause.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class EventJournalError extends Data.TaggedError("EventJournalError")<{
  readonly method: string
  readonly cause: unknown
}> {
  /**
   * Marks this value as an event journal error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId
}

/**
 * Brand identifier used for `RemoteId` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type RemoteIdTypeId = "effect/eventlog/EventJournal/RemoteId"

/**
 * Runtime brand identifier used for `RemoteId` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const RemoteIdTypeId: RemoteIdTypeId = "effect/eventlog/EventJournal/RemoteId"

/**
 * Branded byte identifier for a remote event journal source.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type RemoteId = Uint8Array & Brand<RemoteIdTypeId>

/**
 * Schema for branded remote event journal identifiers.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const RemoteId = Schema.Uint8Array.pipe(Schema.brand(RemoteIdTypeId))

/**
 * Generates a new random `RemoteId`.
 *
 * **When to use**
 *
 * Use when generating a fresh event-log remote id internally and the UUID bytes
 * are trusted to satisfy the brand.
 *
 * **Gotchas**
 *
 * This is unsafe because the generated UUID bytes are cast to the brand without
 * schema validation.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const makeRemoteIdUnsafe = (): RemoteId => SecureRandom.uuidV4Unsafe({ format: "bytes" }) as RemoteId

/**
 * Runtime brand identifier used for `EntryId` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const EntryIdTypeId: EntryIdTypeId = "effect/eventlog/EventJournal/EntryId"

/**
 * Brand identifier used for `EntryId` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type EntryIdTypeId = "effect/eventlog/EventJournal/EntryId"

/**
 * Branded byte identifier for an event journal entry.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type EntryId = Uint8Array<ArrayBuffer> & Brand<EntryIdTypeId>

/**
 * Schema for branded event journal entry identifiers.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const EntryId = (Schema.Uint8Array as Schema.instanceOf<Uint8Array<ArrayBuffer>>).pipe(
  Schema.brand(EntryIdTypeId)
)

/**
 * Provides an Ordering instance for entry identifiers based on their raw UUID bytes.
 *
 * @stability unstable
 * @category ordering
 * @since 4.0.0
 */
export const EntryIdOrder: Order.Order<EntryId> = entryIdOrder

const maxEntryIdMillis = 2 ** 48 - 1

// The millisecond and 12-bit counter of the last id in a sequence of local ids.
interface EntryIdSequence {
  millis: number
  counter: number
}

const processEntryIds: EntryIdSequence = { millis: 0, counter: 0 }

const nextEntryId = (sequence: EntryIdSequence, now: number): EntryId => {
  if (now > sequence.millis) {
    sequence.millis = now
    sequence.counter = 0
  } else if (++sequence.counter > 0xfff) {
    sequence.millis++
    sequence.counter = 0
  }
  // The sequence only moves forward, so once exhausted it stays exhausted.
  if (sequence.millis > maxEntryIdMillis) {
    throw new RangeError("The entry id sequence has passed the last UUID v7 millisecond")
  }
  const bytes = Uuid.v7Bytes(sequence.millis, SecureRandom.randomBytesUnsafe(16))
  // The counter replaces the 12 random `rand_a` bits after the version.
  bytes[6] = 0x70 | (sequence.counter >> 8)
  bytes[7] = sequence.counter & 0xff
  return bytes as EntryId
}

// The process sequence, or a copy advanced to `floor` when that is later. The
// copy is never written back, so a floor read from uncommitted rows leaves the
// process sequence alone.
const sequenceAfter = (floor: EntryId | undefined): EntryIdSequence => {
  if (floor === undefined) return processEntryIds
  const millis = entryIdMillis(floor)
  // Continuing from the floor's `rand_a` sorts the next id after it.
  const counter = ((floor[6] & 0x0f) << 8) | floor[7]
  return millis > processEntryIds.millis || (millis === processEntryIds.millis && counter > processEntryIds.counter)
    ? { millis, counter }
    : processEntryIds
}

const maxEntryId = (ids: Iterable<EntryId>): EntryId | undefined => {
  let latest: EntryId | undefined
  for (const id of ids) {
    if (latest === undefined || EntryIdOrder(id, latest) === 1) latest = id
  }
  return latest
}

/**
 * Generates a UUID v7 `EntryId`, optionally using the supplied millisecond
 * timestamp.
 *
 * **When to use**
 *
 * Use when generating an event-log entry id internally and the UUID v7 bytes
 * are trusted to satisfy the brand.
 *
 * **Details**
 *
 * Ids taken from the clock are strictly ascending within the current process.
 * Ids created in the same millisecond carry an incrementing 12-bit counter. If
 * the clock stalls or moves backwards, ids keep the last millisecond, and
 * after 4096 ids in one millisecond they move to the next one.
 *
 * The journals generate local ids from this sequence, or from a copy of it
 * advanced past the latest id in their store, so a local id sorts after every
 * entry committed to that store, even when the local clock is behind.
 *
 * **Gotchas**
 *
 * This is unsafe because the generated UUID bytes are cast to the brand without
 * schema validation.
 *
 * Throws a `RangeError` once the sequence passes the last UUID v7 millisecond.
 * Every later call throws too, because any id it could return would sort before
 * one already generated.
 *
 * Ids created with an explicit `msecs` are not part of the sequence, and clamp
 * to the UUID v7 range.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const makeEntryIdUnsafe = (options: { msecs?: number } = {}): EntryId =>
  options.msecs !== undefined
    ? Uuid.v7Bytes(options.msecs, SecureRandom.randomBytesUnsafe(16)) as EntryId
    : nextEntryId(processEntryIds, Date.now())

// Imported ids further ahead of the local clock than this are logged.
const maxClockSkewMillis = 24 * 60 * 60 * 1000

/**
 * Logs a warning when the latest of the imported `ids` is more than 24 hours
 * ahead of the supplied `clock`. Memory and IndexedDB journals call this after
 * commit; SQL calls it at the end of its transaction body, so a later rollback
 * (including an enclosing transaction rollback) can still leave a warning.
 *
 * @internal
 */
export const warnIfAhead = (clock: Clock.Clock, ids: Iterable<EntryId>): Effect.Effect<void> => {
  const latest = maxEntryId(ids)
  if (latest === undefined) return Effect.void
  const ahead = entryIdMillis(latest) - clock.currentTimeMillisUnsafe()
  if (ahead <= maxClockSkewMillis) return Effect.void
  return Effect.logWarning(
    `Imported an entry id ${Math.round(ahead / 3_600_000)} hours ahead of the local clock`
  ).pipe(Effect.annotateLogs({ service: "EventJournal", entryId: Uuid.stringify(latest) }))
}

/**
 * Extracts the millisecond timestamp encoded in a UUID v7 `EntryId`.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const entryIdMillis = (entryId: EntryId): number =>
  // Multiply instead of shifting: bitwise operators are signed 32-bit.
  ((((entryId[0] * 256 + entryId[1]) * 256 + entryId[2]) * 256 + entryId[3]) * 256 + entryId[4]) * 256 +
  entryId[5]

/**
 * Schema for a committed event journal entry.
 *
 * **Details**
 *
 * An entry records its ID, event tag, primary key, and SchemaBinary-encoded
 * payload, with helpers for array SchemaBinary encoding and creation timestamps.
 *
 * **Gotchas**
 *
 * `EventLog` encodes `payload` with the `payloadSchemaBinary` of the event whose
 * tag is `entry.event`, so decode it with that event's codec. A codec with an
 * incompatible wire layout, such as a union of a group's tagged payload schemas,
 * cannot read it. Entries from remote journals can carry tags the local schema
 * does not define.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class Entry extends Schema.Class<Entry>("effect/eventlog/EventJournal/Entry")({
  id: EntryId,
  event: Schema.String,
  primaryKey: Schema.String,
  payload: Schema.Uint8Array
}) {
  /**
   * SchemaBinary codec for arrays of committed event journal entries.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static arraySchemaBinary = Schema.Array(SchemaBinary.toCodec(Entry))

  /**
   * Encodes arrays of committed entries with the SchemaBinary entry codec.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static encodeArray = Schema.encodeUnknownEffect(Entry.arraySchemaBinary)

  /**
   * Decodes arrays of committed entries with the SchemaBinary entry codec.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static decodeArray = (
    input: unknown,
    options?: SchemaAST.ParseOptions
  ): Effect.Effect<Array<Entry>, Schema.SchemaError> =>
    Effect.map(decodeEntryFieldsArray(input, options), Arr.map(entryFromFields))

  /**
   * Ordering for committed entries by their event journal entry id.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static Order = Order.make<Entry>((a, b) => EntryIdOrder(a.id, b.id))

  #idString: string | undefined

  /**
   * String representation of the entry id.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get idString(): string {
    return this.#idString ??= Uuid.stringify(this.id)
  }

  /**
   * Creation timestamp encoded in the UUID v7 entry id, in epoch milliseconds.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get createdAtMillis(): number {
    return entryIdMillis(this.id)
  }

  /**
   * Creation timestamp encoded in the UUID v7 entry id, as a UTC date-time.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get createdAt(): DateTime.Utc {
    return DateTime.makeUnsafe(this.createdAtMillis)
  }
}

/**
 * A local entry's remote-assigned sequence.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export interface RemoteAck {
  readonly entryId: EntryId
  readonly sequence: number
}

/**
 * Schema for an event journal entry received from a remote source.
 *
 * **Details**
 *
 * It pairs the remote sequence number with the journal entry payload.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class RemoteEntry extends Schema.Class<RemoteEntry>("effect/eventlog/EventJournal/RemoteEntry")({
  remoteSequence: Schema.Natural,
  entry: Entry
}) {}

// Decoding frames into the plain field structs and then constructing the
// classes from the already validated fields skips the per-instance class
// decode, which costs more than reading the frame. The wire format is the same.

/** @internal */
export const EntryFields = Schema.Struct(Entry.fields)

/** @internal */
export const entryFromFields = (fields: typeof EntryFields.Type): Entry => Schema.makeClassTrusted(Entry, fields)

const decodeEntryFieldsArray = Schema.decodeUnknownEffect(Schema.Array(SchemaBinary.toCodec(EntryFields)))

/**
 * Creates local entries with ids after every id in `after`, normally the
 * latest id in the journal's store.
 *
 * @internal
 */
export const makeEntries = (
  entries: Arr.NonEmptyReadonlyArray<
    { readonly event: string; readonly primaryKey: string; readonly payload: Uint8Array }
  >,
  after: Iterable<EntryId>
): Effect.Effect<Arr.NonEmptyArray<Entry>, EventJournalError> =>
  Effect.try({
    try: () => {
      const sequence = sequenceAfter(maxEntryId(after))
      return Arr.map(entries, ({ event, payload, primaryKey }) =>
        new Entry({
          id: nextEntryId(sequence, Date.now()),
          event,
          primaryKey,
          payload
        }, { disableChecks: true }))
    },
    catch: (cause) => new EventJournalError({ method: "writeMany", cause })
  })

/**
 * Creates an in-memory `EventJournal` service.
 *
 * **Gotchas**
 *
 * Entries, remote tracking state, and locks live only in the current process and
 * are lost when the service is discarded.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeMemory: Effect.Effect<EventJournal["Service"]> = Effect.gen(function*() {
  const journal: Array<Entry> = []
  // Local writes append in commit order, which unserialized direct callers can
  // make differ from id order, leaving the journal unordered until the next
  // import re-sorts it. Remote backlogs are subsequences of the journal, so one
  // flag covers them too.
  let journalSorted = true
  // The latest committed id, the floor for local ids.
  let latestId: EntryId | undefined
  const commitLatest = (ids: Iterable<EntryId>) => {
    latestId = maxEntryId(latestId === undefined ? ids : [latestId, ...ids])
  }
  const clock = yield* Clock.Clock
  const byId = new Map<string, Entry>()
  const remotes = new Map<string, { sequence: number; missing: Array<Entry> }>()
  const pubsub = yield* PubSub.unbounded<Entry>()
  const storeSemaphores = new Map<StoreId, Semaphore.Semaphore>()
  const withLock = (storeId: StoreId) => {
    let semaphore = storeSemaphores.get(storeId)
    if (!semaphore) {
      semaphore = Semaphore.makeUnsafe(1)
      storeSemaphores.set(storeId, semaphore)
    }
    return semaphore.withPermit
  }

  const ensureRemote = (remoteId: RemoteId) => {
    const remoteIdString = Uuid.stringify(remoteId)
    const remote = remotes.get(remoteIdString)
    if (remote) return remote
    const created = { sequence: 0, missing: journal.slice() }
    remotes.set(remoteIdString, created)
    return created
  }

  const writeMany: EventJournal["Service"]["writeMany"] = ({ effect, entries }) =>
    Effect.acquireUseRelease(
      Effect.suspend(() => makeEntries(entries, latestId === undefined ? [] : [latestId])),
      effect,
      (entries, exit) =>
        Effect.suspend(() => {
          if (exit._tag === "Failure") return Effect.void
          for (const entry of entries) {
            const last = journal[journal.length - 1]
            if (last !== undefined && Entry.Order(last, entry) > 0) {
              journalSorted = false
            }
            journal.push(entry)
            byId.set(entry.idString, entry)
            remotes.forEach((remote) => {
              remote.missing.push(entry)
            })
          }
          commitLatest(entries.map((entry) => entry.id))
          return PubSub.publishAll(pubsub, entries)
        })
    )

  return EventJournal.of({
    entries: Effect.sync(() => journal.slice()),
    write: ({ effect, ...entry }) => writeMany({ entries: [entry], effect: (entries) => effect(entries[0]) }),
    writeMany,
    writeFromRemote: Effect.fnUntraced(function*(options) {
      const remote = ensureRemote(options.remoteId)
      const uncommittedRemotes: Array<RemoteEntry> = []
      const duplicateEntries: Array<Entry> = []
      // Overlapping batches can repeat an entry; the first copy wins.
      const incomingIds = new Set<string>()
      for (const remoteEntry of options.entries) {
        const idString = remoteEntry.entry.idString
        if (byId.has(idString)) {
          duplicateEntries.push(remoteEntry.entry)
        } else if (!incomingIds.has(idString)) {
          incomingIds.add(idString)
          uncommittedRemotes.push(remoteEntry)
        }
      }

      const compacted = options.compact
        ? yield* options.compact(uncommittedRemotes)
        : uncommittedRemotes.map((remoteEntry) => remoteEntry.entry)

      if (Arr.isReadonlyArrayNonEmpty(compacted)) {
        const index = new ConflictIndex(compacted)
        const oldest = index.oldest
        // Only the suffix with greater ids can conflict, unless local writes
        // left the journal unordered.
        let i = journalSorted ? journal.length : 0
        while (i > 0 && Entry.Order(journal[i - 1], oldest) > 0) i--
        for (; i < journal.length; i++) {
          index.add(journal[i])
        }
        yield* options.effect(index.toBatch())
      }
      for (const remoteEntry of uncommittedRemotes) {
        byId.set(remoteEntry.entry.idString, remoteEntry.entry)
      }
      // Sequences advance with the commit, so a failed batch is redelivered.
      remote.sequence = nextSequenceAfter(options.entries, remote.sequence)
      const imported = uncommittedRemotes.map((remoteEntry) => remoteEntry.entry).sort(Entry.Order)
      insertOrdered(journal, journalSorted, imported)
      remotes.forEach((target) => {
        if (target !== remote) {
          insertOrdered(target.missing, journalSorted, imported)
        } else if (!journalSorted) {
          target.missing.sort(Entry.Order)
        }
      })
      journalSorted = true
      commitLatest(imported.map((entry) => entry.id))
      yield* warnIfAhead(clock, imported.map((entry) => entry.id))
      return {
        duplicateEntries
      }
    }),
    withRemoteUncommited: (remoteId, f) =>
      Effect.acquireUseRelease(
        Effect.sync(() => ensureRemote(remoteId).missing.slice()),
        (entries) => Arr.isReadonlyArrayNonEmpty(entries) ? Effect.asSome(f(entries)) : Effect.succeedNone,
        (entries, exit) =>
          Effect.sync(() => {
            if (exit._tag === "Failure") return
            const last = entries[entries.length - 1]
            if (!last) return
            const remote = ensureRemote(remoteId)
            for (let i = remote.missing.length - 1; i >= 0; i--) {
              if (remote.missing[i].id === last.id) {
                remote.missing = remote.missing.slice(i + 1)
                break
              }
            }
          })
      ),
    writeRemoteAcks: ({ acks, firstSequence, remoteId }) =>
      Effect.sync(() => {
        const remote = ensureRemote(remoteId)
        remote.sequence = advanceSequence(remote.sequence, acks, firstSequence)
      }),
    nextRemoteSequence: (remoteId) => Effect.sync(() => ensureRemote(remoteId).sequence),
    entriesById: (ids) => Effect.sync(() => ids.map((id) => byId.get(Uuid.stringify(id)))),
    changes: PubSub.subscribe(pubsub),
    destroy: Effect.sync(() => {
      journal.length = 0
      journalSorted = true
      latestId = undefined
      byId.clear()
      remotes.clear()
    }),
    withLock
  })
})

// Same result as appending `additions` and sorting by id.
const insertOrdered = (entries: Array<Entry>, sorted: boolean, additions: ReadonlyArray<Entry>): void => {
  let i = entries.length - 1
  for (let n = 0; n < additions.length; n++) {
    entries.push(additions[n])
  }
  if (!sorted) {
    entries.sort(Entry.Order)
    return
  }
  // Merge from the back, so additions sorting after the whole array cost O(additions).
  let j = additions.length - 1
  let k = entries.length - 1
  while (j >= 0) {
    if (i >= 0 && Entry.Order(entries[i], additions[j]) > 0) {
      entries[k--] = entries[i--]
    } else {
      entries[k--] = additions[j--]
    }
  }
}

/**
 * Layer that provides an in-memory `EventJournal`.
 *
 * **Gotchas**
 *
 * All journal data is stored in process memory and is not persisted across layer
 * lifetimes.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerMemory: Layer.Layer<EventJournal> = Layer.effect(EventJournal, makeMemory)

/**
 * Creates an `EventJournal` backed by IndexedDB.
 *
 * **Details**
 *
 * The journal stores entries and remote replication metadata in the configured
 * browser database, publishes local changes, and requires `Scope` so the database
 * connection can be closed when the scope ends.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeIndexedDb = (options?: {
  readonly database?: string
}): Effect.Effect<EventJournal["Service"], EventJournalError, Scope> =>
  Effect.gen(function*() {
    const database = options?.database ?? "effect_event_journal"
    const openRequest = indexedDB.open(database, 2)
    openRequest.onupgradeneeded = (event) => {
      const db = openRequest.result
      const tx = openRequest.transaction!

      if (event.oldVersion < 1) {
        const entries = db.createObjectStore("entries", { keyPath: "id" })
        entries.createIndex("id", "id", { unique: true })
        entries.createIndex("event", "event")
        db.createObjectStore("remoteEntryId", { keyPath: ["remoteId"] }).createIndex("id", "remoteId", { unique: true })
      }

      const entries = tx.objectStore("entries")
      // Bounds conflict reads to one event and primary key.
      entries.createIndex("conflict", ["event", "primaryKey", "id"])
      // Entry ids order creation, not insertion, so uploads checkpoint an
      // insertion sequence instead.
      const sequence = db.createObjectStore("entrySequence", { autoIncrement: true })
      // The remote each imported entry came from, so uploads skip it.
      const sources = db.createObjectStore("entrySource")
      if (event.oldVersion < 1) return

      // Number the existing entries in creation order.
      const entryIds = entries.openKeyCursor()
      entryIds.onsuccess = () => {
        const cursor = entryIds.result
        if (!cursor) return
        sequence.add(cursor.primaryKey)
        cursor.continue()
      }

      // Version 1 kept a `remotes` row per entry per remote and recorded upload
      // progress as an entry id, which cannot become a checkpoint. Keep one
      // source per entry and, walking each remote's rows in sequence order, its
      // download cursor; then drop the store.
      const progress = tx.objectStore("remoteEntryId")
      progress.clear()
      const remotes = tx.objectStore("remotes").index("sequence").openCursor()
      remotes.onsuccess = () => {
        const cursor = remotes.result
        if (!cursor) {
          db.deleteObjectStore("remotes")
          return
        }
        const row = cursor.value as { remoteId: IDBValidKey; entryId: IDBValidKey; sequence: number }
        sources.put(row.remoteId, row.entryId)
        progress.put({ remoteId: row.remoteId, nextSequence: row.sequence + 1 })
        cursor.continue()
      }
    }

    const db = yield* Effect.acquireRelease(
      idbReq("open", () => openRequest),
      (db) => Effect.sync(() => db.close())
    )

    const pubsub = yield* PubSub.unbounded<Entry>()
    const clock = yield* Clock.Clock

    // Other tabs share the database but not the entry id sequence.
    const latestEntryId = Effect.callback<ReadonlyArray<EntryId>, EventJournalError>((resume) => {
      const tx = db.transaction("entries", "readonly")
      const request = tx.objectStore("entries").openKeyCursor(null, "prev")
      onTransactionDone(tx, "writeMany", resume, () => {
        const key = request.result?.primaryKey as ArrayBuffer | ArrayBufferView | undefined
        if (key === undefined) return []
        return [
          (ArrayBuffer.isView(key)
            ? new Uint8Array(key.buffer, key.byteOffset, key.byteLength)
            : new Uint8Array(key)) as EntryId
        ]
      })
      return Effect.sync(() => tx.abort())
    })

    const writeMany: EventJournal["Service"]["writeMany"] = ({ effect, entries }) =>
      Effect.uninterruptibleMask((restore) =>
        latestEntryId.pipe(
          Effect.flatMap((latest) => makeEntries(entries, latest)),
          Effect.flatMap((committed) =>
            restore(effect(committed)).pipe(
              Effect.tap(Effect.callback<void, EventJournalError>((resume) => {
                const tx = db.transaction(["entries", "entrySequence"], "readwrite")
                const store = tx.objectStore("entries")
                const sequence = tx.objectStore("entrySequence")
                for (const entry of committed) {
                  store.put(encodeEntryIdb(entry))
                  sequence.add(entry.id as IDBValidKey)
                }
                onTransactionDone(tx, "writeMany", resume, constVoid)
              })),
              Effect.tap(PubSub.publishAll(pubsub, committed))
            )
          )
        )
      )

    return EventJournal.of({
      entries: idbReq("entries", () =>
        db.transaction("entries", "readonly")
          .objectStore("entries")
          .index("id")
          .getAll()).pipe(
          Effect.map((rows) => rows.map(entryFromIdb))
        ),
      entriesById: (ids) =>
        Effect.callback<Array<Entry | undefined>, EventJournalError>((resume) => {
          const entries: Array<Entry | undefined> = ids.map(() => undefined)
          const tx = db.transaction("entries", "readonly")
          const store = tx.objectStore("entries")
          for (let i = 0; i < ids.length; i++) {
            const request = store.get(ids[i] as IDBValidKey)
            request.onsuccess = () => {
              if (request.result !== undefined) entries[i] = entryFromIdb(request.result)
            }
          }
          onTransactionDone(tx, "entriesById", resume, () => entries)
          return Effect.sync(() => tx.abort())
        }),
      write: ({ effect, ...entry }) => writeMany({ entries: [entry], effect: (entries) => effect(entries[0]) }),
      writeMany,
      writeFromRemote: Effect.fnUntraced(function*(options) {
        const uncommittedRemotes: Array<RemoteEntry> = []
        const duplicateEntries: Array<Entry> = []
        // Overlapping batches can repeat an entry; the first copy wins.
        const incomingIds = new Set<string>()

        yield* Effect.callback<void, EventJournalError>((resume) => {
          const tx = db.transaction("entries", "readonly")
          const entries = tx.objectStore("entries")
          // Requests in a transaction complete in the order they were issued.
          for (const remoteEntry of options.entries) {
            const request = entries.getKey(remoteEntry.entry.id as IDBValidKey)
            request.onsuccess = () => {
              const idString = remoteEntry.entry.idString
              if (request.result !== undefined) {
                duplicateEntries.push(remoteEntry.entry)
              } else if (!incomingIds.has(idString)) {
                incomingIds.add(idString)
                uncommittedRemotes.push(remoteEntry)
              }
            }
          }
          onTransactionDone(tx, "writeFromRemote", resume, constVoid)
          return Effect.sync(() => tx.abort())
        })

        const compacted = options.compact
          ? yield* options.compact(uncommittedRemotes)
          : uncommittedRemotes.map((remoteEntry) => remoteEntry.entry)

        if (Arr.isReadonlyArrayNonEmpty(compacted)) {
          const index = new ConflictIndex(compacted)
          yield* Effect.callback<void, EventJournalError>((resume) => {
            const tx = db.transaction("entries", "readonly")
            const conflicts = tx.objectStore("entries").index("conflict")
            // One read per group of the entries with a greater id than its
            // oldest, in id order.
            for (const group of index.groups()) {
              const request = conflicts.getAll(IDBKeyRange.bound(
                [group.event, group.primaryKey, group.oldest.id as IDBValidKey],
                [group.event, group.primaryKey, entryIdUpperBound],
                true
              ))
              request.onsuccess = () => {
                for (const row of request.result) index.add(entryFromIdb(row))
              }
            }
            onTransactionDone(tx, "writeFromRemote", resume, constVoid)
            return Effect.sync(() => tx.abort())
          })
          yield* options.effect(index.toBatch())
        }

        yield* Effect.callback<void, EventJournalError>((resume) => {
          const tx = db.transaction(["entries", "entrySource", "entrySequence", "remoteEntryId"], "readwrite")
          const entries = tx.objectStore("entries")
          const sources = tx.objectStore("entrySource")
          const sequence = tx.objectStore("entrySequence")
          for (const remoteEntry of uncommittedRemotes) {
            entries.add(encodeEntryIdb(remoteEntry.entry))
            sequence.add(remoteEntry.entry.id as IDBValidKey)
            sources.put(options.remoteId, remoteEntry.entry.id as IDBValidKey)
          }
          // Sequences advance with the commit, so a failed batch is redelivered.
          advanceProgress(
            tx.objectStore("remoteEntryId"),
            options.remoteId,
            "nextSequence",
            () => nextSequenceAfter(options.entries)
          )
          onTransactionDone(tx, "writeFromRemote", resume, constVoid)
          return Effect.sync(() => tx.abort())
        })
        yield* warnIfAhead(clock, uncommittedRemotes.map((remoteEntry) => remoteEntry.entry.id))
        return {
          duplicateEntries
        }
      }),
      withRemoteUncommited: (remoteId, f) => {
        const remoteIdKey = remoteId as IDBValidKey
        return Effect.callback<{ readonly entries: Array<Entry>; readonly sequence: number }, EventJournalError>(
          (resume) => {
            const entries: Array<Entry> = []
            // The last insertion sequence visited, or 0 when nothing follows the checkpoint.
            let sequence = 0
            const tx = db.transaction(["entries", "entrySource", "remoteEntryId", "entrySequence"], "readonly")
            const entriesStore = tx.objectStore("entries")
            const sourcesStore = tx.objectStore("entrySource")
            const checkpoint = tx.objectStore("remoteEntryId").get([remoteIdKey]) as IDBRequest<
              RemoteProgress | undefined
            >
            checkpoint.onsuccess = () => {
              const cursorRequest = tx.objectStore("entrySequence").openCursor(
                IDBKeyRange.lowerBound(checkpoint.result?.sequence ?? 0, true)
              )
              cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result
                if (!cursor) return
                sequence = cursor.key as number
                const entryId = cursor.value as IDBValidKey
                const source = sourcesStore.get(entryId)
                source.onsuccess = () => {
                  if (source.result !== undefined && indexedDB.cmp(source.result, remoteIdKey) === 0) return
                  const entry = entriesStore.get(entryId)
                  entry.onsuccess = () => {
                    entries.push(entryFromIdb(entry.result))
                  }
                }
                cursor.continue()
              }
            }
            onTransactionDone(tx, "withRemoteUncommited", resume, () => ({ entries, sequence }))
            return Effect.sync(() => tx.abort())
          }
        ).pipe(
          Effect.flatMap(({ entries, sequence }) => {
            if (sequence === 0) return Effect.succeedNone
            entries.sort(byEntryId)
            return Effect.uninterruptibleMask((restore) =>
              restore(Arr.isReadonlyArrayNonEmpty(entries) ? Effect.asSome(f(entries)) : Effect.succeedNone).pipe(
                Effect.tap(Effect.callback<void, EventJournalError>((resume) => {
                  // Uploads can complete out of order; the checkpoint only moves forward.
                  const tx = db.transaction("remoteEntryId", "readwrite")
                  advanceProgress(tx.objectStore("remoteEntryId"), remoteId, "sequence", () => sequence)
                  onTransactionDone(tx, "withRemoteUncommited", resume, constVoid)
                }))
              )
            )
          })
        )
      },
      writeRemoteAcks: ({ acks, firstSequence, remoteId }) =>
        Effect.callback<void, EventJournalError>((resume) => {
          const tx = db.transaction("remoteEntryId", "readwrite")
          advanceProgress(
            tx.objectStore("remoteEntryId"),
            remoteId,
            "nextSequence",
            (next) => advanceSequence(next, acks, firstSequence)
          )
          onTransactionDone(tx, "writeRemoteAcks", resume, constVoid)
          return Effect.sync(() => tx.abort())
        }),
      nextRemoteSequence: (remoteId) =>
        Effect.callback<number, EventJournalError>((resume) => {
          const tx = db.transaction("remoteEntryId", "readonly")
          const progress = tx.objectStore("remoteEntryId").get([remoteId as IDBValidKey]) as IDBRequest<
            RemoteProgress | undefined
          >
          onTransactionDone(tx, "nextRemoteSequence", resume, () => progress.result?.nextSequence ?? 0)
          return Effect.sync(() => tx.abort())
        }),
      changes: PubSub.subscribe(pubsub),
      destroy: Effect.sync(() => {
        indexedDB.deleteDatabase(database)
      }),
      withLock: yield* makeBrowserWithLock(database)
    })
  })

/**
 * The sequence following every entry in a delivered batch.
 *
 * @internal
 */
export const nextSequenceAfter = (entries: ReadonlyArray<RemoteEntry>, next = 0): number => {
  for (const remoteEntry of entries) {
    if (remoteEntry.remoteSequence >= next) next = remoteEntry.remoteSequence + 1
  }
  return next
}

/**
 * Advances across contiguous acknowledgements without skipping unseen entries.
 *
 * @internal
 */
export const advanceSequence = (
  next: number,
  acks: ReadonlyArray<RemoteAck>,
  firstSequence = 0
): number => {
  next = Math.max(next, firstSequence)
  const sequences = acks.map((ack) => ack.sequence).sort((a, b) => a - b)
  for (const sequence of sequences) {
    if (sequence === next) next++
    else if (sequence > next) break
  }
  return next
}

const makeBrowserWithLock = Effect.fnUntraced(function*(key: string) {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return (storeId: StoreId) => <A, E, R>(self: Effect.Effect<A, E, R>) =>
      Effect.callback<A, E, R>((resume, signal) => {
        navigator.locks.request(`${key}/${storeId}`, { signal }, () =>
          new Promise<void>((resolve) => {
            resume(Effect.onExit(self, () => {
              resolve()
              return Effect.void
            }))
          })).catch((defect) => resume(Effect.die(defect)))
      })
  }
  const semaphores = new Map<StoreId, Semaphore.Semaphore>()
  return (storeId: StoreId) => {
    let semaphore = semaphores.get(storeId)
    if (!semaphore) {
      semaphore = Semaphore.makeUnsafe(1)
      semaphores.set(storeId, semaphore)
    }
    return semaphore.withPermit
  }
})

// Progress for a remote: `sequence` is the upload checkpoint and `nextSequence`
// the download cursor.
interface RemoteProgress {
  readonly sequence?: number
  readonly nextSequence?: number
}

// Raises one progress field within the store's transaction; progress only moves forward.
const advanceProgress = (
  store: IDBObjectStore,
  remoteId: RemoteId,
  field: keyof RemoteProgress,
  next: (current: number) => number
): void => {
  const request = store.get([remoteId as IDBValidKey]) as IDBRequest<RemoteProgress | undefined>
  request.onsuccess = () => {
    const current = request.result?.[field] ?? 0
    const value = next(current)
    if (value > current) store.put({ ...request.result, remoteId, [field]: value })
  }
}

const byEntryId = (a: Entry, b: Entry) => indexedDB.cmp(a.id as IDBValidKey, b.id as IDBValidKey)

// Greater than or equal to every entry id.
const entryIdUpperBound = new Uint8Array(16).fill(0xff)

interface EntryIdb {
  readonly id: EntryId
  readonly event: string
  readonly primaryKey: string
  readonly payload: Uint8Array
}

// Rows are written by `encodeEntryIdb`, so they are not validated again.
const entryFromIdb = (row: EntryIdb): Entry =>
  new Entry({
    id: row.id,
    event: row.event,
    primaryKey: row.primaryKey,
    payload: row.payload
  }, { disableChecks: true })

const encodeEntryIdb = Schema.encodeSync(Entry)

/**
 * Provides `EventJournal` using the IndexedDB-backed implementation created by
 * `makeIndexedDb`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerIndexedDb = (options?: {
  readonly database?: string
}): Layer.Layer<EventJournal, EventJournalError> =>
  Layer.effect(
    EventJournal,
    makeIndexedDb(options)
  )

// Resumes when the transaction commits, and fails if it errors or aborts. An
// abort, such as a failed commit, does not always dispatch an error first.
const onTransactionDone = <A>(
  tx: IDBTransaction,
  method: string,
  resume: (effect: Effect.Effect<A, EventJournalError>) => void,
  onComplete: () => A
): void => {
  tx.oncomplete = () => resume(Effect.succeed(onComplete()))
  tx.onerror = tx.onabort = () => resume(Effect.fail(new EventJournalError({ method, cause: tx.error })))
}

const idbReq = <T>(method: string, evaluate: () => IDBRequest<T>) =>
  Effect.callback<T, EventJournalError>((resume) => {
    const request = evaluate()
    if (request.readyState === "done") {
      resume(Effect.succeed(request.result))
      return
    }
    request.onsuccess = () => resume(Effect.succeed(request.result))
    request.onerror = () => resume(Effect.fail(new EventJournalError({ method, cause: request.error })))
  })
