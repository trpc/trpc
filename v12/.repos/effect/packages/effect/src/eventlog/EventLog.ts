/**
 * Runtime for writing typed events to an event journal.
 *
 * `EventLog` combines event groups, handlers, a journal, local identity,
 * optional remote replicas, and reactivity hooks. Writers send typed payloads
 * through a client; the matching handler runs first, and the journal entry is
 * committed only after the handler succeeds. This module also contains the
 * layers and helpers needed to assemble that runtime.
 *
 * **Remote compaction**
 *
 * An encrypted remote whose server sets `HelloResponse.compaction` can store a
 * compacted snapshot of its history, so a new device replays the snapshot and
 * a recent tail instead of every write. Clients build the snapshots because
 * only they can decrypt the entries.
 *
 * Only a client with a `remote: true` compactor, on a remote not built with
 * `compaction: false`, calls the compaction RPCs. It polls the status on
 * connect and about hourly. When the server wants compaction and the journal
 * has caught up, it starts a background run after a random delay of a few
 * minutes. The run reads the input, taking entries from the journal where it
 * can and fetching the rest, runs the opted-in compactors and uploads the
 * entries they keep. The server lets one run per store hold a stage and
 * answers the others `Busy`, so devices that start together download the
 * input once. `EventLog.compact` starts a run immediately, for example from
 * a worker holding the identity.
 *
 * An operator can roll back a bad snapshot on the server. The server then
 * re-appends the snapshot's input at the head, so every client, including
 * ones from before remote compaction, receives the dropped entries through
 * `changes` and skips the ones it already holds.
 *
 * Known limitations:
 *
 * - A run holds every kept entry in memory. A device with a large store can
 *   opt out with `compaction: false` and leave compaction to a device or
 *   worker with more memory.
 * - The library can't check that a compactor keeps the `remote` contract (see
 *   `groupCompaction`). The drop-only and idempotence checks catch common
 *   mistakes. A snapshot that drops too much can only be undone by a rollback
 *   before the server prunes the history.
 * - Changes to a field's meaning between schema versions aren't detected.
 *   Strict decoding only catches unknown fields.
 * - A new device still replays the newest day or so of writes, because the
 *   server only compacts data older than its lag.
 * - A client that stops partway through a run holds the server's busy claim
 *   until its stage expires.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as SchemaBinary from "../encoding/SchemaBinary.ts"
import * as Equal from "../Equal.ts"
import * as FiberHandle from "../FiberHandle.ts"
import * as FiberMap from "../FiberMap.ts"
import { constant, identity } from "../Function.ts"
import * as InternalRecord from "../internal/record.ts"
import * as Uuid from "../internal/uuid.ts"
import * as Layer from "../Layer.ts"
import type { Pipeable } from "../Pipeable.ts"
import { pipeArguments } from "../Pipeable.ts"
import * as Predicate from "../Predicate.ts"
import * as PubSub from "../PubSub.ts"
import * as Queue from "../Queue.ts"
import * as Random from "../Random.ts"
import { Reactivity } from "../reactivity/Reactivity.ts"
import * as ReactivityLayer from "../reactivity/Reactivity.ts"
import type * as Record from "../Record.ts"
import * as Redacted from "../Redacted.ts"
import { CurrentLogAnnotations } from "../References.ts"
import * as Result from "../Result.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import * as SchemaGetter from "../SchemaGetter.ts"
import type * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"
import type { Covariant } from "../Types.ts"
import type * as Event from "./Event.ts"
import type * as EventGroup from "./EventGroup.ts"
import { Entry, EventJournal, type EventJournalError, makeEntryIdUnsafe, type RemoteId } from "./EventJournal.ts"
import * as EventLogEncryption from "./EventLogEncryption.ts"
import { type CompactionInputHeader, EventLogProtocolError, StoreId } from "./EventLogMessage.ts"
import type {
  CompactionStage,
  EventLogRemote,
  EventLogRemoteCompaction,
  EventLogRemoteError
} from "./EventLogRemote.ts"
import { maxBatchEntries } from "./internal/batches.ts"
import { setAnchor } from "./internal/conflicts.ts"
import * as RemoteCompaction from "./internal/remoteCompaction.ts"

/**
 * Service for writing typed event-log events through registered handlers.
 *
 * **Details**
 *
 * `write` encodes the event payload, runs the matching handler, commits the entry
 * only when the handler succeeds, and exposes access to the underlying journal
 * entries and destroy operation.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class EventLog extends Context.Service<EventLog, {
  readonly write: <Groups extends EventGroup.Any, Tag extends Event.Tag<EventGroup.Events<Groups>>>(options: {
    readonly schema: EventLogSchema<Groups>
    readonly event: Tag
    readonly payload: Event.PayloadWithTag<EventGroup.Events<Groups>, Tag>
  }) => Effect.Effect<
    Event.SuccessWithTag<EventGroup.Events<Groups>, Tag>,
    Event.ErrorWithTag<EventGroup.Events<Groups>, Tag> | EventJournalError
  >
  /**
   * Write several events under one journal lock and one `HandlerTransaction`,
   * returning each handler's result in input order. If any handler fails,
   * none of the events are committed.
   */
  readonly writeMany: <
    Groups extends EventGroup.Any,
    // Pairs each event tag with its own payload.
    Item extends {
      readonly [Tag in Event.Tag<EventGroup.Events<Groups>>]: {
        readonly event: Tag
        readonly payload: Event.PayloadWithTag<EventGroup.Events<Groups>, Tag>
      }
    }[Event.Tag<EventGroup.Events<Groups>>]
  >(options: {
    readonly schema: EventLogSchema<Groups>
    readonly events: Arr.NonEmptyReadonlyArray<Item>
  }) => Effect.Effect<
    Arr.NonEmptyArray<Event.SuccessWithTag<EventGroup.Events<Groups>, Item["event"]>>,
    Event.ErrorWithTag<EventGroup.Events<Groups>, Item["event"]> | EventJournalError
  >
  readonly entries: Effect.Effect<ReadonlyArray<Entry>, EventJournalError>
  readonly destroy: Effect.Effect<void, EventJournalError>
  /**
   * Runs one remote compaction now, on every registered remote that offers
   * compaction or only on `remoteId`.
   *
   * Unlike the background trigger, it doesn't wait for the journal to catch
   * up, and it works from an empty journal. Remotes built with
   * `compaction: false` are skipped, and nothing runs when no compactor is
   * registered with `remote: true`.
   *
   * `Committed` and `Superseded` mean a snapshot was uploaded, `NoOp` that
   * nothing was dropped, and `NotWanted` and `Busy` come from the server.
   * `Aborted` means nothing was uploaded and the stage was released, because
   * a compactor died, the idempotence check failed, every entry was dropped
   * or the input was pruned during the run.
   */
  readonly compact: (options?: {
    readonly remoteId?: RemoteId | undefined
  }) => Effect.Effect<
    ReadonlyArray<{
      readonly remoteId: RemoteId
      readonly result: "Committed" | "Superseded" | "NoOp" | "NotWanted" | "Busy" | "Aborted"
    }>,
    EventJournalError | EventLogRemoteError
  >
}>()("effect/eventlog/EventLog") {}

/**
 * Service that collects event handlers, compaction handlers, remote replicas,
 * and reactivity invalidation keys.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Registry extends Context.Service<Registry, {
  readonly registerHandlerUnsafe: (options: {
    readonly event: string
    readonly handler: Handlers.Item<any>
  }) => void

  readonly handlers: ReadonlyMap<string, Handlers.Item<any>>

  readonly registerCompaction: (options: {
    readonly events: ReadonlyArray<string>
    /**
     * Also run this compactor over a remote's history to build snapshots. The
     * kept entries must depend only on the set of input entries and compose:
     * `drop(drop(a) ++ b)` keeps the same entries as `drop(a ++ b)`, even when
     * `b` holds entries older than `a`. A call that writes an entry it wasn't
     * given keeps its whole input.
     */
    readonly remote?: boolean | undefined
    readonly effect: (options: {
      readonly entries: ReadonlyArray<Entry>
      /** True during a remote compaction, which only drops entries. */
      readonly remote?: boolean | undefined
      // Pass an input entry as source to anchor replacements during remote replay.
      // Without it, matching IDs retain their position; new IDs use the group start.
      readonly write: (entry: Entry, source?: Entry) => Effect.Effect<void>
    }) => Effect.Effect<void>
  }) => Effect.Effect<void, never, Scope.Scope>

  readonly compactors: ReadonlyMap<string, {
    readonly events: ReadonlySet<string>
    readonly remote: boolean
    readonly effect: (options: {
      readonly entries: ReadonlyArray<Entry>
      readonly remote?: boolean | undefined
      readonly write: (entry: Entry, source?: Entry) => Effect.Effect<void>
    }) => Effect.Effect<void>
  }>

  readonly registerRemote: (remote: EventLogRemote["Service"]) => Effect.Effect<void, never, Scope.Scope>
  readonly remotes: ReadonlyMap<RemoteId, EventLogRemote["Service"]>
  readonly handleRemote: (handler: (remote: EventLogRemote["Service"]) => Effect.Effect<void>) => Effect.Effect<void>

  readonly registerReactivity: (keys: Record<string, ReadonlyArray<string>>) => Effect.Effect<void, never, Scope.Scope>

  readonly reactivityKeys: Record<string, ReadonlyArray<string>>
}>()("effect/eventlog/EventLog/Registry") {}

/**
 * Provides an in-memory `Registry` for event handlers, compactors, remote
 * replicas, and reactivity keys.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerRegistry = Layer.effect(
  Registry,
  Effect.gen(function*() {
    const handlers = new Map<string, Handlers.Item<any>>()
    const compactors = new Map<string, {
      readonly events: ReadonlySet<string>
      readonly remote: boolean
      readonly effect: (options: {
        readonly entries: ReadonlyArray<Entry>
        readonly remote?: boolean | undefined
        readonly write: (entry: Entry, source?: Entry) => Effect.Effect<void>
      }) => Effect.Effect<void>
    }>()

    const remoteFiberMap = yield* FiberMap.make<RemoteId>()
    const remotes = new Map<RemoteId, EventLogRemote["Service"]>()
    let remoteHandler: (remote: EventLogRemote["Service"]) => Effect.Effect<void> = (_) => Effect.void

    const reactivityKeys: Record<string, ReadonlyArray<string>> = {}
    return Registry.of({
      registerHandlerUnsafe(options) {
        handlers.set(options.event, options.handler)
      },
      handlers,
      registerCompaction: (options) =>
        Effect.sync(() => {
          const events = new Set(options.events)
          const compactor = {
            events,
            remote: options.remote ?? false,
            effect: options.effect
          }
          for (const event of options.events) {
            compactors.set(event, compactor)
          }
        }),
      compactors,
      registerRemote: (remote) =>
        Effect.acquireRelease(
          Effect.suspend(() => {
            remotes.set(remote.id, remote)
            return Effect.asVoid(FiberMap.run(remoteFiberMap, remote.id, remoteHandler(remote)))
          }),
          () => {
            remotes.delete(remote.id)
            return FiberMap.remove(remoteFiberMap, remote.id)
          }
        ),
      remotes,
      handleRemote(handler) {
        remoteHandler = handler
        return Effect.forEach(remotes, ([id, remote]) => FiberMap.run(remoteFiberMap, id, handler(remote)), {
          discard: true
        })
      },
      registerReactivity: (keys) =>
        Effect.sync(() => {
          for (const [key, value] of Object.entries(keys)) {
            InternalRecord.assignProperty(reactivityKeys, key, value)
          }
        }),
      reactivityKeys
    })
  })
)

/**
 * Context service for an event-log identity containing a public key and redacted
 * private key material.
 *
 * **Details**
 *
 * The identity is used by remote replication for authentication and by the
 * encryption service to derive signing and encryption keys.
 *
 * **Gotchas**
 *
 * `publicKey` identifies the identity but is not a secret, and nothing ties it
 * to the signing key derived from `privateKey`. A server binds the first
 * signing key that authenticates for a `publicKey`, unless its authorization
 * checks the presented signing key.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Identity extends Context.Service<Identity, {
  readonly publicKey: string
  readonly privateKey: Redacted.Redacted<Uint8Array<ArrayBuffer>>
}>()("effect/eventlog/EventLog/Identity") {}

/**
 * Type-level identifier used to brand `EventLogSchema` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type SchemaTypeId = "~effect/eventlog/EventLog/Schema"

/**
 * Runtime property key used to identify `EventLogSchema` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const SchemaTypeId: SchemaTypeId = "~effect/eventlog/EventLog/Schema"

/**
 * Returns `true` when a value carries the `EventLogSchema` marker.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isEventLogSchema = (u: unknown): u is EventLogSchema<EventGroup.Any> =>
  Predicate.hasProperty(u, SchemaTypeId)

/**
 * Schema describing the event groups that can be written through an `EventLog`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface EventLogSchema<Groups extends EventGroup.Any> {
  readonly [SchemaTypeId]: SchemaTypeId
  readonly groups: ReadonlyArray<Groups>
}

/**
 * Creates an `EventLogSchema` from one or more event groups.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schema = <Groups extends ReadonlyArray<EventGroup.Any>>(
  ...groups: Groups
): EventLogSchema<Groups[number]> => {
  const EventLog = Object.assign(function EventLog() {}, {
    [SchemaTypeId]: SchemaTypeId,
    groups
  }) satisfies EventLogSchema<Groups[number]>
  return EventLog
}

/**
 * Type-level identifier used to brand `Handlers` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type HandlersTypeId = "~effect/eventlog/EventLog/Handlers"

/**
 * Runtime property key used to identify `Handlers` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const HandlersTypeId: HandlersTypeId = "~effect/eventlog/EventLog/Handlers"

/**
 * Builder for the handlers associated with an `EventGroup`.
 *
 * **Details**
 *
 * The `Events` type parameter tracks the event tags that still need handlers, and
 * each call to `handle` records a handler while accumulating any required
 * services.
 *
 * @stability unstable
 * @category handlers
 * @since 4.0.0
 */
export interface Handlers<
  R,
  Events extends Event.Any = never
> extends Pipeable {
  readonly [HandlersTypeId]: {
    _Events: Covariant<Events>
  }
  readonly group: EventGroup.AnyWithProps
  readonly handlers: Record.ReadonlyRecord<string, Handlers.Item<R>>
  readonly context: Context.Context<R>

  /**
   * Add the implementation for an `Event` to a `Handlers` group.
   */
  handle<Tag extends Event.Tag<Events>, R1>(
    name: Tag,
    handler: (options: {
      readonly storeId: StoreId
      readonly payload: Event.PayloadWithTag<Events, Tag>
      readonly entry: Entry
      readonly conflicts: ReadonlyArray<{
        readonly entry: Entry
        readonly payload: Event.PayloadWithTag<Events, Tag>
      }>
    }) => Effect.Effect<Event.SuccessWithTag<Events, Tag>, Event.ErrorWithTag<Events, Tag>, R1>
  ): Handlers<
    R | R1,
    Event.ExcludeTag<Events, Tag>
  >
}

/**
 * Namespace containing helper types for `Handlers` values and handler-producing
 * layers.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Handlers {
  /**
   * Type that matches any `Handlers` value regardless of its services or remaining
   * events.
   *
   * @stability unstable
   * @category handlers
   * @since 4.0.0
   */
  export interface Any {
    readonly [HandlersTypeId]: unknown
  }

  /**
   * Runtime representation of one registered event handler, including its event
   * metadata, captured context, and handler function.
   *
   * @stability unstable
   * @category handlers
   * @since 4.0.0
   */
  export type Item<R> = {
    readonly event: Event.AnyWithProps
    readonly context: Context.Context<R>
    readonly handler: (options: {
      readonly storeId: StoreId
      readonly payload: unknown
      readonly entry: Entry
      readonly conflicts: ReadonlyArray<{
        readonly entry: Entry
        readonly payload: unknown
      }>
    }) => Effect.Effect<unknown, unknown, R>
  }

  /**
   * Validates that a handler builder returned all required handlers.
   *
   * **Details**
   *
   * If any event tag remains unhandled, the type evaluates to an explanatory
   * compile-time error string.
   *
   * @stability unstable
   * @category handlers
   * @since 4.0.0
   */
  export type ValidateReturn<A> = A extends (
    | Handlers<
      infer _R,
      infer _Events
    >
    | Effect.Effect<
      Handlers<
        infer _R,
        infer _Events
      >,
      infer _EX,
      infer _RX
    >
  ) ? [_Events] extends [never] ? A
    : `Event not handled: ${Event.Tag<_Events>}` :
    `Must return the implemented handlers`

  /**
   * Extracts the error type from an effect that produces `Handlers`.
   *
   * @stability unstable
   * @category handlers
   * @since 4.0.0
   */
  export type Error<A> = A extends Effect.Effect<
    Handlers<
      infer _R,
      infer _Events
    >,
    infer _EX,
    infer _RX
  > ? _EX :
    never

  /**
   * Computes the services required by a `Handlers` value or by an effect that
   * produces one, including event schema services.
   *
   * @stability unstable
   * @category handlers
   * @since 4.0.0
   */
  export type Services<A> = A extends Handlers<
    infer _R,
    infer _Events
  > ? _R | Event.Services<_Events> :
    A extends Effect.Effect<
      Handlers<
        infer _R,
        infer _Events
      >,
      infer _EX,
      infer _RX
    > ? _R | _RX | Event.Services<_Events> :
    never
}

/**
 * Context reference for the store id used by event-log writes and remote
 * replication.
 *
 * **Details**
 *
 * Defaults to the branded store id `"default"`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class CurrentStoreId extends Context.Reference<StoreId>("effect/eventlog/EventLog/CurrentStoreId", {
  defaultValue: constant(StoreId.make("default"))
}) {}

/**
 * Context reference for a transaction that wraps the event handlers of each
 * batch replayed from a remote and of each local `write` or `writeMany`.
 *
 * **When to use**
 *
 * Use when handlers project into a store with transactions, such as
 * `sql.withTransaction` or an IndexedDB transaction over the projection
 * tables, so a batch of N events commits once instead of N times.
 *
 * **Details**
 *
 * The journal performs no I/O while the transaction is open: it reads replay
 * conflicts before the transaction starts and commits the batch after it
 * completes. Defaults to running the handlers without a transaction.
 *
 * If the transaction fails, the journal commits nothing from the batch. For a
 * replayed batch, the remote is subscribed again after a backoff of up to 10
 * seconds and the batch is delivered again, so later batches from that remote
 * wait until it succeeds; local writes and other remotes are not blocked. A
 * local write fails with the error and is not retried.
 *
 * **Gotchas**
 *
 * - A replayed entry that fails to decode, or whose handler fails or dies,
 *   fails the whole batch, which is retried as above. A failure that repeats
 *   on every attempt, such as a payload written by a newer schema, stops sync
 *   from that remote until the app is updated to handle it.
 * - In a local write, an error returned by a handler fails the transaction
 *   and the write, and the journal commits none of its events.
 * - Failures that abort the underlying transaction fail the whole batch, even
 *   when the handler recovers from them. In IndexedDB, any failed request that
 *   is not prevented aborts the whole transaction, and in PostgreSQL so does a
 *   failed statement outside a savepoint.
 * - Failing the batch does not undo side effects of handlers that already ran.
 *   Only changes made inside a transaction that rolls back are undone.
 * - Replay handlers must tolerate running more than once for the same entry.
 * - Unless the transaction and the journal share a database connection, the
 *   transaction commits before the journal does, and the two commits are not
 *   atomic. A crash between them replays a remote batch on restart, but a
 *   local write is lost from the journal while its projection changes remain.
 * - An IndexedDB transaction commits once it has no pending requests and
 *   control returns to the event loop. A custom wrapper must stop the fiber
 *   from yielding to the scheduler while it is open, by providing
 *   `References.PreventSchedulerYield` as `withTransaction` from
 *   `@effect/platform-browser` does. Otherwise it can commit partway through a
 *   batch, and the remaining handlers fail.
 * - The transaction stays open for the whole batch, so other read-write
 *   transactions on the same tables wait for it.
 * - The transaction must not change the error or success of the wrapped
 *   effect. Convert its own failures into defects.
 *
 * @stability unstable
 * @category services
 * @since 4.0.6
 */
export class HandlerTransaction extends Context.Reference<
  <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
>("effect/eventlog/EventLog/HandlerTransaction", {
  defaultValue: constant(identity)
}) {}

const RedactedUint8Array = Schema.Uint8ArrayFromBase64.pipe(
  Schema.decodeTo(Schema.Redacted(Schema.Uint8Array), {
    decode: SchemaGetter.transform((value) => Redacted.make(value)),
    encode: SchemaGetter.transform((value) => Redacted.value(value))
  })
)

/**
 * Schema for an event-log identity with a string public key and redacted
 * base64-encoded private key bytes.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IdentitySchema = Schema.Struct({
  publicKey: Schema.String,
  privateKey: RedactedUint8Array
})

const IdentityEncodedSchema = Schema.Struct({
  publicKey: Schema.String,
  privateKey: Schema.Uint8ArrayFromBase64
})

const IdentityStringSchema = Schema.StringFromBase64Url.pipe(
  Schema.decodeTo(Schema.fromJsonString(IdentityEncodedSchema))
)

/**
 * Decodes a base64url identity string produced by `encodeIdentityString`.
 *
 * **Gotchas**
 *
 * Invalid input throws a schema decoding error.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const decodeIdentityString = (value: string): Identity["Service"] => {
  const decoded = Schema.decodeUnknownSync(IdentityStringSchema)(value)
  return {
    publicKey: decoded.publicKey,
    privateKey: Redacted.make(decoded.privateKey as Uint8Array<ArrayBuffer>)
  }
}

/**
 * Encodes an event-log identity as a base64url string containing the public key
 * and private key bytes.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const encodeIdentityString = (identity: Identity["Service"]): string =>
  Schema.encodeSync(IdentityStringSchema)({
    publicKey: identity.publicKey,
    privateKey: Redacted.value(identity.privateKey)
  })

/**
 * Generates a new event-log identity using the configured
 * `EventLogEncryption` service.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeIdentity: Effect.Effect<Identity["Service"], never, EventLogEncryption.EventLogEncryption> =
  EventLogEncryption.EventLogEncryption.use((_) => _.generateIdentity)

const handlersProto = {
  [HandlersTypeId]: {
    _Events: identity
  },
  handle<Tag extends string, R1>(
    this: Handlers<any, any>,
    tag: Tag,
    handler: (payload: unknown) => Effect.Effect<unknown, unknown, R1>
  ): Handlers<any, any> {
    return makeHandlers({
      group: this.group,
      context: this.context,
      handlers: {
        ...this.handlers,
        [tag]: {
          event: Object.hasOwn(this.group.events, tag) ? this.group.events[tag] : undefined!,
          context: this.context,
          handler
        }
      }
    })
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const makeHandlers = (options: {
  readonly group: EventGroup.AnyWithProps
  readonly handlers: Record.ReadonlyRecord<string, Handlers.Item<any>>
  readonly context: Context.Context<any>
}): Handlers<any, any> => Object.assign(Object.create(handlersProto), options)

/**
 * Creates a layer that registers handlers for every event in an event group.
 *
 * **Details**
 *
 * The callback receives a `Handlers` builder; its return type is checked so every
 * event in the group is handled.
 *
 * @stability unstable
 * @category handlers
 * @since 4.0.0
 */
export const group = <Events extends Event.Any, Return>(
  group: EventGroup.EventGroup<Events>,
  f: (handlers: Handlers<never, Events>) => Handlers.ValidateReturn<Return>
): Layer.Layer<
  Event.ToService<Events>,
  Handlers.Error<Return>,
  Exclude<Handlers.Services<Return>, Scope.Scope | Identity> | Registry
> =>
  Layer.effectDiscard(
    Effect.gen(function*() {
      const registry = yield* Registry
      const context = yield* Effect.context<Exclude<Handlers.Services<Return>, Scope.Scope | Identity>>()
      const result = f(makeHandlers({
        group: group as EventGroup.AnyWithProps,
        handlers: {},
        context
      }) as unknown as Handlers<never, Events>)
      const handlers = Effect.isEffect(result)
        ? (yield* (result as unknown as Effect.Effect<Handlers<any>>))
        : (result as unknown as Handlers<any>)
      for (const tag of Object.keys(handlers.handlers)) {
        registry.registerHandlerUnsafe({ event: tag, handler: handlers.handlers[tag] })
      }
    })
  ) as any

const registerBatchCompaction = <Events extends Event.Any, R>(
  group: EventGroup.EventGroup<Events>,
  effect: (options: {
    readonly entries: ReadonlyArray<{
      readonly entry: Entry
      readonly event: Event.TaggedPayload<Events> | undefined
    }>
    readonly writeFrom: <Tag extends Event.Tag<Events>>(
      source: Entry,
      tag: Tag,
      payload: Event.PayloadWithTag<Events, Tag>
    ) => Effect.Effect<void, never, Event.PayloadSchemaWithTag<Events, Tag>["EncodingServices"]>
    readonly forward: (entry: Entry) => Effect.Effect<void>
  }) => Effect.Effect<void, never, R>,
  options: { readonly remote?: boolean | undefined } | undefined
): Layer.Layer<never, never, R | Event.PayloadSchema<Events>["DecodingServices"] | Registry> =>
  Layer.effectDiscard(
    Effect.gen(function*() {
      const registry = yield* Registry
      const services = yield* Effect.context<R | Event.PayloadSchema<Events>["DecodingServices"]>()

      yield* registry.registerCompaction({
        events: Object.keys(group.events),
        remote: options?.remote,
        effect: Effect.fnUntraced(function*({ entries, remote = false, write }): Effect.fn.Return<void> {
          // In a remote compaction, unknown fields make an entry undecodable,
          // and undecodable entries are always kept.
          const isEventTag = (tag: string): tag is Event.Tag<Events> => Object.hasOwn(group.events, tag)
          const decodePayload = <Tag extends Event.Tag<Events>>(tag: Tag, payload: Uint8Array) =>
            Schema.decodeUnknownEffect(
              remote ? SchemaBinary.toCodecStrict(group.events[tag].payload) : group.events[tag].payloadSchemaBinary
            )(payload).pipe(
              Effect.updateContext((input) => Context.merge(services, input))
            ) as unknown as Effect.Effect<Event.PayloadWithTag<Events, Tag>, Schema.SchemaError>
          const writeFrom = Effect.fnUntraced(function*<Tag extends Event.Tag<Events>>(
            source: Entry,
            tag: Tag,
            payload: Event.PayloadWithTag<Events, Tag>
          ): Effect.fn.Return<void, never, Event.PayloadSchemaWithTag<Events, Tag>["EncodingServices"]> {
            const event = Object.hasOwn(group.events, tag) ? group.events[tag] : undefined!
            const entry = new Entry({
              id: makeEntryIdUnsafe({ msecs: source.createdAtMillis }),
              event: tag,
              payload: yield* Schema.encodeUnknownEffect(event.payloadSchemaBinary)(payload).pipe(
                Effect.orDie
              ) as any,
              primaryKey: event.primaryKey(payload)
            }, { disableChecks: true })
            yield* write(entry, source)
          })
          const forward = (entry: Entry) => write(entry)

          const batch: Array<{
            readonly entry: Entry
            readonly event: Event.TaggedPayload<Events> | undefined
          }> = []
          for (const entry of entries) {
            if (!isEventTag(entry.event)) {
              continue
            }
            const payload = yield* Effect.result(decodePayload(entry.event, entry.payload))
            if (remote && Result.isFailure(payload)) yield* forward(entry)
            batch.push({
              entry,
              event: Result.isFailure(payload)
                ? undefined
                : { _tag: entry.event, payload: payload.success } as unknown as Event.TaggedPayload<Events>
            })
          }

          yield* Effect.orDie(
            effect({ entries: batch, writeFrom, forward }).pipe(
              Effect.updateContext((input) => Context.merge(services, input))
            )
          ) as any
        })
      })
    })
  )

/**
 * Registers a batch compaction handler for an event group.
 *
 * **When to use**
 *
 * Use when an event under one primary key affects entries under other keys.
 *
 * **Details**
 *
 * The compaction effect receives every entry for the group in batch order, with
 * its decoded event or `event: undefined` if the payload cannot be decoded.
 *
 * Only entries that the effect outputs are kept:
 *
 * - `forward(entry)` keeps an input entry unchanged, with the same id, payload,
 *   and primary key.
 * - `write(tag, payload)` encodes a replacement entry anchored to the first
 *   entry in the batch, with a fresh id in that entry's millisecond.
 *
 * Entries that are neither forwarded nor replaced are dropped, including entries
 * that could not be decoded. During remote replay, kept entries are replayed in
 * the id order of their anchors, then in write order, and a replacement's
 * conflicts are the stored entries newer than its anchor.
 *
 * **Gotchas**
 *
 * Compaction runs before conflicts are read, so it never sees stored entries.
 * Collapsing several entries into one is only safe when no stored entry for
 * the same event and primary key has an id between theirs. Otherwise that
 * stored entry should have applied between the collapsed ones, and replicas
 * that received the entries in separate batches end up different.
 *
 * @see {@link groupCompaction} for compaction grouped by primary key
 *
 * @stability unstable
 * @category compaction
 * @since 4.0.0
 */
export const groupBatchCompaction = <Events extends Event.Any, R>(
  group: EventGroup.EventGroup<Events>,
  effect: (options: {
    readonly entries: ReadonlyArray<{
      readonly entry: Entry
      readonly event: Event.TaggedPayload<Events> | undefined
    }>
    readonly write: <Tag extends Event.Tag<Events>>(
      tag: Tag,
      payload: Event.PayloadWithTag<Events, Tag>
    ) => Effect.Effect<void, never, Event.PayloadSchemaWithTag<Events, Tag>["EncodingServices"]>
    readonly forward: (entry: Entry) => Effect.Effect<void>
  }) => Effect.Effect<void, never, R>,
  options?: {
    /**
     * Also run this compactor over a remote's history to build snapshots.
     *
     * Opting in promises a contract the library can't check. The kept entries
     * depend only on the set of input entries, never on services, the clock
     * or input order, and compaction composes: `drop(drop(a) ++ b)` keeps the
     * same entries as `drop(a ++ b)`, even when `b` holds entries older than
     * `a`.
     *
     * Remote compaction only drops entries. A call that uses `write` keeps its
     * whole input, and entries that fail to decode, including ones with fields
     * the schema doesn't know, are always kept. Before uploading, a run passes
     * the kept entries through the compactors again and uploads nothing if
     * that drops more or a compactor dies.
     *
     * A snapshot that drops too much can be rolled back on the server until
     * the history it replaced is pruned. The module docs cover when runs start
     * and other limitations.
     */
    readonly remote?: boolean | undefined
  }
): Layer.Layer<never, never, R | Event.PayloadSchema<Events>["DecodingServices"] | Registry> =>
  registerBatchCompaction(group, ({ entries, writeFrom, forward }) =>
    effect({
      entries,
      write: (tag, payload) => writeFrom(entries[0].entry, tag, payload),
      forward
    }), options)

/**
 * Registers a compaction handler for an event group.
 *
 * **Details**
 *
 * During remote replay, decoded entries are grouped by primary key and passed to
 * the compaction effect, which outputs the entries to keep:
 *
 * - `forward(entry)` keeps an input entry unchanged, with the same id, payload,
 *   and primary key.
 * - `write(tag, payload)` encodes a replacement entry anchored to the first
 *   decoded entry for the primary key, with a fresh id in that entry's
 *   millisecond.
 *
 * Entries that are neither forwarded nor replaced are dropped. Entries that
 * cannot be decoded are not passed to the effect and are kept unchanged.
 * During remote replay, kept entries are replayed in the id order of their
 * anchors, then in write order, and a replacement's conflicts are the stored
 * entries newer than its anchor.
 *
 * **Gotchas**
 *
 * Compaction runs before conflicts are read, so it never sees stored entries.
 * Collapsing several entries into one is only safe when no stored entry for
 * the same event and primary key has an id between theirs. Otherwise that
 * stored entry should have applied between the collapsed ones, and replicas
 * that received the entries in separate batches end up different.
 *
 * @see {@link groupBatchCompaction} for compaction across primary keys
 *
 * @stability unstable
 * @category compaction
 * @since 4.0.0
 */
export const groupCompaction = <Events extends Event.Any, R>(
  group: EventGroup.EventGroup<Events>,
  effect: (options: {
    readonly primaryKey: string
    readonly entries: ReadonlyArray<Entry>
    readonly events: ReadonlyArray<Event.TaggedPayload<Events>>
    readonly write: <Tag extends Event.Tag<Events>>(
      tag: Tag,
      payload: Event.PayloadWithTag<Events, Tag>
    ) => Effect.Effect<void, never, Event.PayloadSchemaWithTag<Events, Tag>["EncodingServices"]>
    readonly forward: (entry: Entry) => Effect.Effect<void>
  }) => Effect.Effect<void, never, R>,
  options?: {
    /**
     * Also run this compactor over a remote's history to build snapshots.
     *
     * Opting in promises a contract the library can't check. The kept entries
     * depend only on the set of input entries, never on services, the clock
     * or input order, and compaction composes: `drop(drop(a) ++ b)` keeps the
     * same entries as `drop(a ++ b)`, even when `b` holds entries older than
     * `a`.
     *
     * Remote compaction only drops entries. A call that uses `write` keeps its
     * whole input, and entries that fail to decode, including ones with fields
     * the schema doesn't know, are always kept. Before uploading, a run passes
     * the kept entries through the compactors again and uploads nothing if
     * that drops more or a compactor dies.
     *
     * A snapshot that drops too much can be rolled back on the server until
     * the history it replaced is pruned. The module docs cover when runs start
     * and other limitations.
     */
    readonly remote?: boolean | undefined
  }
): Layer.Layer<never, never, R | Event.PayloadSchema<Events>["DecodingServices"] | Registry> =>
  registerBatchCompaction(
    group,
    Effect.fnUntraced(function*({ entries, writeFrom, forward }) {
      const byPrimaryKey = new Map<
        string,
        {
          readonly entries: Array<Entry>
          readonly events: Array<Event.TaggedPayload<Events>>
        }
      >()
      for (const { entry, event } of entries) {
        if (event === undefined) {
          yield* forward(entry)
          continue
        }
        const record = byPrimaryKey.get(entry.primaryKey)
        if (record) {
          record.entries.push(entry)
          record.events.push(event)
        } else {
          byPrimaryKey.set(entry.primaryKey, { entries: [entry], events: [event] })
        }
      }

      for (const [primaryKey, { entries, events }] of byPrimaryKey) {
        yield* effect({
          primaryKey,
          entries,
          events,
          write: (tag, payload) => writeFrom(entries[0], tag, payload),
          forward
        })
      }
    }),
    options
  )

type ReactivityKeyName = [keyof ReactivityLayer.Keys] extends [never] ? string : keyof ReactivityLayer.Keys

/**
 * Registers reactivity keys to invalidate when events from a group are written or
 * replayed.
 *
 * **Details**
 *
 * Pass a single key list for all events or a mapping from event tag to key list.
 *
 * @stability unstable
 * @category reactivity
 * @since 4.0.0
 */
export const groupReactivity = <Events extends Event.Any>(
  group: EventGroup.EventGroup<Events>,
  keys:
    | { readonly [Tag in Event.Tag<Events>]?: ReadonlyArray<ReactivityKeyName> }
    | ReadonlyArray<ReactivityKeyName>
): Layer.Layer<never, never, Registry> =>
  Effect.gen(function*() {
    const registry = yield* Registry
    if (!Array.isArray(keys)) {
      yield* registry.registerReactivity(keys as Record.ReadonlyRecord<string, ReadonlyArray<string>>)
      return
    }
    const obj: Record<string, ReadonlyArray<string>> = Object.create(null)
    for (const tag of Object.keys(group.events)) {
      obj[tag] = keys
    }
    yield* registry.registerReactivity(obj)
  }).pipe(
    Layer.effectDiscard
  )

/**
 * Builds the effect used to replay entries received from a remote event log.
 *
 * **Details**
 *
 * The returned handler decodes the entry and conflicts with the registered event
 * schema, runs the matching handler with the supplied identity and store id, and
 * invalidates configured reactivity keys. Decode and handler failures are logged
 * and fail the effect. Invalidations are deferred until the end of an enclosing
 * `Reactivity.withBatch`.
 *
 * @stability unstable
 * @category handlers
 * @since 4.0.0
 */
export const makeReplayFromRemote = (options: {
  readonly handlers: ReadonlyMap<string, Handlers.Item<any>>
  readonly storeId: StoreId
  readonly identity: Identity["Service"]
  readonly reactivity: Reactivity
  readonly reactivityKeys: Record<string, ReadonlyArray<string>>
  readonly logAnnotations: {
    readonly service: string
    readonly effect: string
  }
}) => {
  const replayBatch = makeReplayBatchFromRemote(options)
  return (input: ReplayInput) => replayBatch([input])
}

type ReplayInput = {
  readonly entry: Entry
  readonly conflicts: ReadonlyArray<Entry>
}

type DecodedConflict = { entry: Entry; payload: unknown }

type ReplayBatch = {
  readonly context: Context.Context<never>
  readonly handlerContexts: Map<Handlers.Item<any>, Context.Context<any>>
  readonly decodedConflicts: Map<Entry, DecodedConflict>
}

/**
 * Replays a batch, merging each handler's context with the batch context once
 * and decoding each conflict entry shared by several entries once. The batch
 * state is created per execution, so transaction retries start fresh.
 */
const makeReplayBatchFromRemote = (options: Parameters<typeof makeReplayFromRemote>[0]) => {
  const replayEntry = makeReplayEntryFromRemote(options)
  return (batch: ReadonlyArray<ReplayInput>) =>
    Effect.contextWith((context: Context.Context<never>) => {
      const state: ReplayBatch = { context, handlerContexts: new Map(), decodedConflicts: new Map() }
      return Effect.forEach(batch, (input) => replayEntry(input, state), { discard: true })
    })
}

// An entry's context is the batch context plus its log annotations, so only
// the annotations need to be copied into the merged handler context.
const withEntryAnnotations = (context: Context.Context<any>, entryContext: Context.Context<any>) =>
  Context.add(context, CurrentLogAnnotations, Context.get(entryContext, CurrentLogAnnotations))

const makeReplayEntryFromRemote = (options: Parameters<typeof makeReplayFromRemote>[0]) => {
  // Decoders depend only on the event schema, so they are shared across batches.
  const decoders = new WeakMap<
    Handlers.Item<any>,
    (input: unknown) => Effect.Effect<unknown, Schema.SchemaError, unknown>
  >()
  const decoderFor = (handler: Handlers.Item<any>) => {
    let decoder = decoders.get(handler)
    if (decoder === undefined) {
      decoder = Schema.decodeUnknownEffect(handler.event.payloadSchemaBinary)
      decoders.set(handler, decoder)
    }
    return decoder
  }
  const contextFor = (batch: ReplayBatch, handler: Handlers.Item<any>) => {
    let context = batch.handlerContexts.get(handler)
    if (context === undefined) {
      context = Context.merge(handler.context, batch.context)
      batch.handlerContexts.set(handler, context)
    }
    return context
  }

  return Effect.fnUntraced(
    function*(
      { conflicts, entry }: ReplayInput,
      batch: ReplayBatch
    ): Effect.fn.Return<void, unknown> {
      const handler = options.handlers.get(entry.event) as Handlers.Item<any> | undefined
      if (!handler) {
        return yield* Effect.logDebug(`Event handler not found for: "${entry.event}"`)
      }

      const decodePayload = decoderFor(handler)
      const context = contextFor(batch, handler)
      const conflictPayloads: Array<DecodedConflict> = new Array(conflicts.length)
      for (let i = 0; i < conflicts.length; i++) {
        const conflict = conflicts[i]
        let decoded = batch.decodedConflicts.get(conflict)
        if (!decoded) {
          decoded = {
            entry: conflict,
            payload: yield* decodePayload(conflict.payload).pipe(
              Effect.updateContext((input) => withEntryAnnotations(context, input))
            ) as any
          }
          batch.decodedConflicts.set(conflict, decoded)
        }
        conflictPayloads[i] = decoded
      }

      // Conflicts decode with the caller's Identity; the payload and handler use the log's.
      yield* decodePayload(entry.payload).pipe(
        Effect.flatMap((payload) =>
          handler.handler({
            storeId: options.storeId,
            payload,
            entry,
            conflicts: conflictPayloads
          })
        ),
        Effect.updateContext((input) => Context.add(withEntryAnnotations(context, input), Identity, options.identity)),
        Effect.asVoid
      ) as any

      yield* invalidateEntry(options.reactivity, options.reactivityKeys, entry)
    },
    Effect.tapCauseIf((cause) => !Cause.hasInterruptsOnly(cause), Effect.logError),
    (effect, { entry }) =>
      Effect.annotateLogs(effect, {
        ...options.logAnnotations,
        entryId: entry.idString
      })
  )
}

const invalidateEntry = (
  reactivity: Reactivity,
  reactivityKeys: Record<string, ReadonlyArray<string>>,
  entry: Entry
): Effect.Effect<void> => {
  const keys = Object.hasOwn(reactivityKeys, entry.event) ? reactivityKeys[entry.event] : undefined
  if (!keys) return Effect.void
  return Effect.forEach(keys, (key) => reactivity.invalidate({ [key]: [entry.primaryKey] }), { discard: true })
}

const remoteRetrySchedule = Schedule.min([
  Schedule.exponential(200, 1.5),
  Schedule.spaced({ seconds: 10 })
])

type CompactionResult = Effect.Success<ReturnType<EventLog["Service"]["compact"]>>[number]["result"]

// Status is polled on each connect and then hourly, jittered.
const compactionPollMillis = 60 * 60 * 1000

// Spreads out devices that see `wanted` at the same time.
const compactionDelayMillis = { min: 60 * 1000, max: 5 * 60 * 1000 }

// How many input batch headers share one journal lookup and one fetch.
const compactionLookupBatches = 16

const isNotFound = (error: EventLogRemoteError): boolean =>
  EventLogProtocolError.is(error.cause) && error.cause.code === "NotFound"

const make = Effect.gen(function*() {
  const storeId = yield* CurrentStoreId
  const identity = yield* Identity
  const journal = yield* EventJournal
  const registry = yield* Registry

  const reactivity = yield* Reactivity
  const handlerTransaction = yield* HandlerTransaction
  const replayFromRemote = makeReplayBatchFromRemote({
    handlers: registry.handlers,
    storeId,
    identity,
    reactivity,
    reactivityKeys: registry.reactivityKeys,
    logAnnotations: {
      service: "EventLog",
      effect: "writeFromRemote"
    }
  })

  const invalidateReactivityEntries = (entries: ReadonlyArray<Entry>) =>
    Effect.forEach(entries, (entry) => invalidateEntry(reactivity, registry.reactivityKeys, entry), { discard: true })

  const hasRemoteCompactor = () => {
    for (const compactor of registry.compactors.values()) {
      if (compactor.remote) return true
    }
    return false
  }

  // Resolves input headers to entries in input order, skipping ids seen at a
  // lower input sequence. Only batches with an id the journal lacks are
  // fetched.
  const resolveInput = Effect.fnUntraced(function*(
    compaction: EventLogRemoteCompaction,
    stage: CompactionStage,
    headers: ReadonlyArray<CompactionInputHeader>,
    seen: Set<string>
  ) {
    const known = yield* journal.entriesById(headers.flatMap((header) => header.entryIds)).pipe(
      journal.withLock(storeId)
    )
    const missing: Array<number> = []
    let offset = 0
    for (const header of headers) {
      for (let i = 0; i < header.entryIds.length; i++) {
        if (known[offset + i] === undefined) {
          missing.push(header.sequence)
          break
        }
      }
      offset += header.entryIds.length
    }
    const fetched = new Map<number, Entry>()
    if (missing.length > 0) {
      yield* Stream.runForEach(compaction.fetch(stage, missing), (remoteEntry) =>
        Effect.sync(() => {
          fetched.set(remoteEntry.remoteSequence, remoteEntry.entry)
        }))
    }
    const entries: Array<Entry> = []
    offset = 0
    for (const header of headers) {
      for (let i = 0; i < header.entryIds.length; i++) {
        const entry = known[offset + i] ?? fetched.get(header.sequence + i)
        if (entry === undefined) {
          return yield* Effect.die(new Error(`Compaction input sequence ${header.sequence + i} was not fetched`))
        }
        if (seen.has(entry.idString)) continue
        seen.add(entry.idString)
        entries.push(entry)
      }
      offset += header.entryIds.length
    }
    return entries
  })

  const runStage = Effect.fnUntraced(function*(compaction: EventLogRemoteCompaction, stage: CompactionStage) {
    const seen = new Set<string>()
    const kept = yield* RemoteCompaction.run({
      compactors: registry.compactors,
      entries: compaction.input(stage).pipe(
        Stream.grouped(compactionLookupBatches),
        Stream.mapEffect((headers) => resolveInput(compaction, stage, headers, seen)),
        Stream.flattenIterable
      ),
      chunkSize: maxBatchEntries
    })
    if (kept.length === seen.size) {
      const result = yield* compaction.commit(stage, { _tag: "NoOp" })
      return result === "Committed" ? "NoOp" : result
    }
    if (kept.length === 0) {
      yield* Effect.logWarning("Remote compaction dropped every entry, so nothing is uploaded")
      yield* compaction.abort(stage)
      return "Aborted"
    }
    const { segmentCount } = yield* compaction.upload(stage, kept)
    const result = yield* compaction.commit(stage, { _tag: "Snapshot", segmentCount })
    yield* Effect.logDebug(`Remote compaction kept ${kept.length} of ${seen.size} entries: ${result}`)
    return result
  })

  // Shared by the background trigger and `compact`. The server's busy claim
  // keeps runs on a store apart, so the journal lock is held only for id
  // lookups.
  const runCompaction = (
    remote: EventLogRemote["Service"],
    compaction: EventLogRemoteCompaction
  ): Effect.Effect<CompactionResult, EventJournalError | EventLogRemoteError> =>
    Effect.gen(function*() {
      const begin = yield* compaction.begin({ identity, storeId })
      if (begin._tag !== "Started") return begin._tag
      const stage: CompactionStage = { identity, storeId, stageId: begin.stageId }
      return yield* runStage(compaction, stage).pipe(
        Effect.onError(() => compaction.abort(stage)),
        Effect.catchTag("IdempotenceError", (error) =>
          Effect.as(
            Effect.logError(
              `A remote compactor dropped ${error.entries.length} more entries from its own output, so nothing is uploaded`
            ),
            "Aborted" as const
          )),
        Effect.catchIf(
          (error): error is EventLogRemoteError => error._tag === "EventLogRemoteError" && isNotFound(error),
          (error) =>
            Effect.as(
              Effect.logWarning("The compaction input was pruned during the run", error),
              "Aborted" as const
            )
        ),
        Effect.catchDefect((defect) =>
          Effect.as(Effect.logError("Remote compaction died, so nothing is uploaded", defect), "Aborted" as const)
        )
      )
    }).pipe(
      Effect.annotateLogs({
        service: "EventLog",
        effect: "compact",
        remoteId: Uuid.stringify(remote.id)
      })
    )

  const runRemote = Effect.fnUntraced(
    function*(remote: EventLogRemote["Service"]) {
      const compaction = remote.compaction
      const trigger = yield* FiberHandle.make()

      // Caught up means the journal holds the remote up to the status head.
      const pollStatus = Effect.fnUntraced(
        function*(compaction: EventLogRemoteCompaction) {
          if (!hasRemoteCompactor()) return
          const status = yield* compaction.status({ identity, storeId })
          if (!status.wanted || (yield* journal.nextRemoteSequence(remote.id)) <= status.head) return
          yield* FiberHandle.run(
            trigger,
            Random.nextIntBetween(compactionDelayMillis.min, compactionDelayMillis.max).pipe(
              Effect.flatMap((millis) => Effect.sleep(millis)),
              Effect.andThen(runCompaction(remote, compaction)),
              Effect.flatMap((result) => Effect.logDebug(`Remote compaction finished: ${result}`)),
              Effect.catchCause(Effect.logWarning)
            ),
            { onlyIfMissing: true }
          )
        },
        Effect.catchCause(Effect.logWarning),
        Effect.annotateLogs({
          service: "EventLog",
          effect: "runRemote compaction status"
        })
      )

      const consume: Effect.Effect<unknown> = Effect.gen(function*() {
        if (compaction !== undefined) yield* pollStatus(compaction)
        const changes = yield* remote.changes({
          identity,
          startSequence: yield* journal.nextRemoteSequence(remote.id),
          storeId,
          knownEntries: journal.entriesById
        })
        while (true) {
          const entries = yield* Queue.takeAll(changes)
          yield* journal.writeFromRemote({
            remoteId: remote.id,
            entries,
            compact: registry.compactors.size > 0
              ? Effect.fnUntraced(function*(remoteEntries) {
                // The journal sorts the batch by anchor, so output order is irrelevant.
                const output: Array<Entry> = []
                const inputs = new Map<string, Entry>()
                const outputCounts = new Map<Entry, number>()
                const compactable = new Map<
                  (options: {
                    readonly entries: ReadonlyArray<Entry>
                    readonly write: (entry: Entry, source?: Entry) => Effect.Effect<void>
                  }) => Effect.Effect<void>,
                  Array<Entry>
                >()

                for (const { entry } of remoteEntries) {
                  inputs.set(entry.idString, entry)
                  const compactor = registry.compactors.get(entry.event)
                  if (!compactor) {
                    output.push(entry)
                    continue
                  }
                  let group = compactable.get(compactor.effect)
                  if (!group) {
                    group = []
                    compactable.set(compactor.effect, group)
                  }
                  group.push(entry)
                }

                for (const [compact, entries] of compactable) {
                  yield* compact({
                    entries,
                    write(entry, source) {
                      return Effect.sync(() => {
                        // Each output is ordered and conflict-checked by its source,
                        // then by write order, not by its own fresh id. An output
                        // without a known source stands for the group's first entry.
                        const anchor = inputs.get((source ?? entry).idString) ?? entries[0]
                        const index = outputCounts.get(anchor) ?? 0
                        outputCounts.set(anchor, index + 1)
                        setAnchor(entry, anchor, index)
                        output.push(entry)
                      })
                    }
                  })
                }

                return output
              })
              : undefined,
            // A failed batch is not committed, so the remote redelivers it on retry.
            effect: (batch) => handlerTransaction(replayFromRemote(batch)).pipe(Effect.orDie)
          }).pipe(
            Effect.tap(({ duplicateEntries }) => invalidateReactivityEntries(duplicateEntries)),
            journal.withLock(storeId),
            // Outside the lock, so queries re-run after the journal transaction commits.
            reactivity.withBatch
          )
        }
      }).pipe(
        Effect.scoped,
        Effect.catchCause(Effect.logError),
        Effect.repeat(remoteRetrySchedule),
        Effect.annotateLogs({
          service: "EventLog",
          effect: "runRemote consume"
        })
      )
      yield* Effect.forkScoped(consume)

      if (compaction !== undefined) {
        yield* pollStatus(compaction).pipe(
          Effect.schedule(Schedule.jittered(Schedule.spaced(compactionPollMillis))),
          Effect.forkScoped
        )
      }

      const write = journal.withRemoteUncommited(
        remote.id,
        (entries) =>
          remote.write({ identity, entries, storeId }).pipe(
            Effect.flatMap((acks) =>
              acks === undefined || acks.length === 0
                ? Effect.void
                : journal.writeRemoteAcks({ remoteId: remote.id, acks, firstSequence: remote.firstSequence }).pipe(
                  journal.withLock(storeId)
                )
            )
          )
      )
      const writeUntilSuccess = write.pipe(
        Effect.tapCause(Effect.logDebug),
        Effect.retry(remoteRetrySchedule)
      )
      yield* Effect.addFinalizer(() => Effect.ignore(write))
      const changesSub = yield* journal.changes
      const changes = yield* Queue.dropping<void>(1)
      yield* PubSub.takeAll(changesSub).pipe(
        Effect.andThen(Queue.offer(changes, undefined)),
        Effect.forever,
        Effect.forkScoped
      )
      yield* writeUntilSuccess
      return yield* Queue.take(changes).pipe(
        Effect.andThen(writeUntilSuccess),
        Effect.catchCause(Effect.logError),
        Effect.forever
      )
    },
    Effect.scoped,
    Effect.provideService(Identity, identity),
    Effect.orDie
  )

  const writeEvents = (
    events: Arr.NonEmptyReadonlyArray<{ readonly event: string; readonly payload: unknown }>
  ): Effect.Effect<Arr.NonEmptyArray<unknown>, unknown> =>
    Effect.forEach(events, ({ event, payload }) => {
      const handler = registry.handlers.get(event) as Handlers.Item<any> | undefined
      if (handler === undefined) {
        return Effect.die(`Event handler not found for: "${event}"`)
      }
      return Schema.encodeUnknownEffect(handler.event.payloadSchemaBinary)(payload).pipe(
        Effect.orDie,
        Effect.map((encoded) => ({
          handler,
          payload,
          entry: { event, primaryKey: handler.event.primaryKey(payload as never), payload: encoded as Uint8Array }
        }))
      )
    }).pipe(
      Effect.flatMap((writes) =>
        journal.withLock(storeId)(journal.writeMany({
          entries: Arr.map(writes, (write) => write.entry),
          effect: (written) =>
            handlerTransaction(Effect.forEach(written, (entry, i) => {
              const { handler, payload } = writes[i]
              return handler.handler({ storeId, payload, entry, conflicts: [] }).pipe(
                Effect.updateContext((input) => Context.merge(handler.context, input)),
                Effect.provideService(Identity, identity),
                Effect.tap(() => invalidateEntry(reactivity, registry.reactivityKeys, entry))
              )
            }))
        }))
      ),
      // Outside the lock, so queries re-run after the handler transaction and
      // the journal commit.
      reactivity.withBatch
    ) as Effect.Effect<Arr.NonEmptyArray<unknown>, unknown>

  yield* registry.handleRemote(runRemote)

  return EventLog.of({
    write: ((options: { readonly event: string; readonly payload: unknown }) =>
      Effect.map(writeEvents([options]), Arr.headNonEmpty)) as EventLog["Service"]["write"],
    writeMany: ((options: { readonly events: Arr.NonEmptyReadonlyArray<any> }) =>
      writeEvents(options.events)) as EventLog["Service"]["writeMany"],
    entries: journal.entries,
    destroy: journal.destroy,
    compact: (options) =>
      Effect.suspend(() => {
        if (!hasRemoteCompactor()) {
          return Effect.succeed([])
        }
        const remoteId = options?.remoteId
        const remotes = Array.from(registry.remotes.values()).filter((remote) =>
          remote.compaction !== undefined && (remoteId === undefined || Equal.equals(remote.id, remoteId))
        )
        return Effect.forEach(remotes, (remote) =>
          Effect.map(runCompaction(remote, remote.compaction!), (result) => ({ remoteId: remote.id, result })))
      })
  })
})

/**
 * Provides `EventLog` and `Registry` using the configured `EventJournal` and
 * `Identity`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerEventLog: Layer.Layer<EventLog | Registry, never, EventJournal | Identity> = Layer.effect(
  EventLog,
  make
).pipe(
  Layer.provide(ReactivityLayer.layer),
  Layer.provideMerge(layerRegistry)
)

/**
 * Combines event-group handler layers with the `EventLog` runtime for a schema.
 *
 * **When to use**
 *
 * Use when you need one layer that installs the shared `EventLog` runtime for
 * an `EventLogSchema` and registers an event-group handler layer for typed
 * writes.
 *
 * **Details**
 *
 * The supplied handler layer is provided with `layerEventLog`. The returned
 * layer provides `EventLog | Registry`, preserves the handler layer's error
 * type, and still requires its remaining services plus `EventJournal` and
 * `Identity`.
 *
 * **Gotchas**
 *
 * The schema argument does not register handlers by itself. Handler registration
 * comes from the supplied layer, and writing an event without a registered
 * handler dies with `Event handler not found for: "<tag>"`.
 *
 * @see {@link schema} for creating the schema argument from event groups
 * @see {@link group} for building the handler layer consumed by this layer
 * @see {@link layerEventLog} for installing the runtime and registry without combining a handler layer
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = <Groups extends EventGroup.Any, E, R>(
  _schema: EventLogSchema<Groups>,
  layer: Layer.Layer<EventGroup.ToService<Groups>, E, R>
): Layer.Layer<
  EventLog | Registry,
  E,
  Exclude<R, EventLog | Registry> | EventJournal | Identity
> =>
  layer.pipe(
    Layer.provideMerge(layerEventLog)
  )

/**
 * Creates a typed client function for writing events defined by an
 * `EventLogSchema`.
 *
 * **Details**
 *
 * The returned function takes one `{ event, payload }` object, typed so the
 * payload matches the event, as `writeMany` items are. It delegates to the
 * `EventLog` service and preserves each event's success and error types.
 *
 * **Example** (Writing events with a client)
 *
 * ```ts
 * import { Effect, Schema } from "effect"
 * import { EventGroup, EventLog } from "effect/eventlog"
 *
 * const Users = EventGroup.empty.add({
 *   tag: "UserCreated",
 *   primaryKey: (payload) => payload.id,
 *   payload: Schema.Struct({ id: Schema.String })
 * })
 *
 * export const createUser = Effect.gen(function*() {
 *   const client = yield* EventLog.makeClient(EventLog.schema(Users))
 *   yield* client({ event: "UserCreated", payload: { id: "user-1" } })
 * })
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeClient = <Groups extends EventGroup.Any>(
  schema: EventLogSchema<Groups>
): Effect.Effect<
  <
    // Pairs each event tag with its own payload.
    Item extends {
      readonly [Tag in Event.Tag<EventGroup.Events<Groups>>]: {
        readonly event: Tag
        readonly payload: Event.PayloadWithTag<EventGroup.Events<Groups>, Tag>
      }
    }[Event.Tag<EventGroup.Events<Groups>>]
  >(item: Item) => Effect.Effect<
    Event.SuccessWithTag<EventGroup.Events<Groups>, Item["event"]>,
    Event.ErrorWithTag<EventGroup.Events<Groups>, Item["event"]> | EventJournalError
  >,
  never,
  EventLog
> =>
  Effect.gen(function*() {
    const log = yield* EventLog
    return (item: { readonly event: string; readonly payload: unknown }) =>
      log.write({ schema, event: item.event, payload: item.payload } as any)
  }) as any
