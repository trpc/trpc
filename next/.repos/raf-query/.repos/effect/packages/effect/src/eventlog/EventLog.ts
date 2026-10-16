/**
 * Runtime for writing typed events to an event journal.
 *
 * `EventLog` combines event groups, handlers, a journal, local identity,
 * optional remote replicas, and reactivity hooks. Writers send typed payloads
 * through a client; the matching handler runs first, and the journal entry is
 * committed only after the handler succeeds. This module also contains the
 * layers and helpers needed to assemble that runtime.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as FiberMap from "../FiberMap.ts"
import { constant, identity } from "../Function.ts"
import * as InternalRecord from "../internal/record.ts"
import * as Layer from "../Layer.ts"
import type { Pipeable } from "../Pipeable.ts"
import { pipeArguments } from "../Pipeable.ts"
import * as Predicate from "../Predicate.ts"
import * as PubSub from "../PubSub.ts"
import * as Queue from "../Queue.ts"
import { Reactivity } from "../reactivity/Reactivity.ts"
import * as ReactivityLayer from "../reactivity/Reactivity.ts"
import type * as Record from "../Record.ts"
import * as Redacted from "../Redacted.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import * as SchemaGetter from "../SchemaGetter.ts"
import type * as Scope from "../Scope.ts"
import type { Covariant } from "../Types.ts"
import type * as Event from "./Event.ts"
import type * as EventGroup from "./EventGroup.ts"
import { Entry, EventJournal, type EventJournalError, makeEntryIdUnsafe, type RemoteId } from "./EventJournal.ts"
import * as EventLogEncryption from "./EventLogEncryption.ts"
import { StoreId } from "./EventLogMessage.ts"
import type { EventLogRemote } from "./EventLogRemote.ts"

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
  readonly entries: Effect.Effect<ReadonlyArray<Entry>, EventJournalError>
  readonly destroy: Effect.Effect<void, EventJournalError>
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
    readonly effect: (options: {
      readonly entries: ReadonlyArray<Entry>
      readonly write: (entry: Entry) => Effect.Effect<void>
    }) => Effect.Effect<void>
  }) => Effect.Effect<void, never, Scope.Scope>

  readonly compactors: ReadonlyMap<string, {
    readonly events: ReadonlySet<string>
    readonly effect: (options: {
      readonly entries: ReadonlyArray<Entry>
      readonly write: (entry: Entry) => Effect.Effect<void>
    }) => Effect.Effect<void>
  }>

  readonly registerRemote: (remote: EventLogRemote["Service"]) => Effect.Effect<void, never, Scope.Scope>
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
      readonly effect: (options: {
        readonly entries: ReadonlyArray<Entry>
        readonly write: (entry: Entry) => Effect.Effect<void>
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

/**
 * Registers a compaction handler for an event group.
 *
 * **Details**
 *
 * During remote replay, matching entries are decoded, grouped by primary key, and
 * passed to the compaction effect, which may write replacement entries.
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
  }) => Effect.Effect<void, never, R>
): Layer.Layer<never, never, R | Event.PayloadSchema<Events>["DecodingServices"] | Registry> =>
  Layer.effectDiscard(
    Effect.gen(function*() {
      const registry = yield* Registry
      const services = yield* Effect.context<R | Event.PayloadSchema<Events>["DecodingServices"]>()

      yield* registry.registerCompaction({
        events: Object.keys(group.events),
        effect: Effect.fnUntraced(function*({ entries, write }): Effect.fn.Return<void> {
          const isEventTag = (tag: string): tag is Event.Tag<Events> => Object.hasOwn(group.events, tag)
          const decodePayload = <Tag extends Event.Tag<Events>>(tag: Tag, payload: Uint8Array) =>
            Schema.decodeUnknownEffect(group.events[tag].payloadSchemaBinary)(payload).pipe(
              Effect.updateContext((input) => Context.merge(services, input)),
              Effect.orDie
            ) as unknown as Effect.Effect<Event.PayloadWithTag<Events, Tag>>
          const writePayload = Effect.fnUntraced(function*<Tag extends Event.Tag<Events>>(
            timestamp: number,
            tag: Tag,
            payload: Event.PayloadWithTag<Events, Tag>
          ): Effect.fn.Return<void, never, Event.PayloadSchemaWithTag<Events, Tag>["EncodingServices"]> {
            const event = Object.hasOwn(group.events, tag) ? group.events[tag] : undefined!
            const entry = new Entry({
              id: makeEntryIdUnsafe({ msecs: timestamp }),
              event: tag,
              payload: yield* Schema.encodeUnknownEffect(event.payloadSchemaBinary)(payload).pipe(
                Effect.orDie
              ) as any,
              primaryKey: event.primaryKey(payload)
            }, { disableChecks: true })
            yield* write(entry)
          })

          const byPrimaryKey = new Map<
            string,
            {
              readonly entries: Array<Entry>
              readonly taggedPayloads: Array<Event.TaggedPayload<Events>>
            }
          >()
          for (const entry of entries) {
            if (!isEventTag(entry.event)) {
              continue
            }
            const payload = yield* decodePayload(entry.event, entry.payload)
            const record = byPrimaryKey.get(entry.primaryKey)
            const taggedPayload = { _tag: entry.event, payload } as unknown as Event.TaggedPayload<Events>
            if (record) {
              record.entries.push(entry)
              record.taggedPayloads.push(taggedPayload)
            } else {
              byPrimaryKey.set(entry.primaryKey, {
                entries: [entry],
                taggedPayloads: [taggedPayload]
              })
            }
          }

          for (const [primaryKey, { entries, taggedPayloads }] of byPrimaryKey) {
            yield* Effect.orDie(
              effect({
                primaryKey,
                entries,
                events: taggedPayloads,
                write(tag, payload) {
                  return Effect.orDie(writePayload(entries[0].createdAtMillis, tag, payload))
                }
              }).pipe(
                Effect.updateContext((input) => Context.merge(services, input))
              )
            ) as any
          }
        })
      })
    })
  )

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
    | { readonly [Tag in Event.Tag<Events>]?: ReadonlyArray<string> }
    | ReadonlyArray<string>
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
 * schema, runs the matching handler with the supplied identity and store id, logs
 * failures, and invalidates configured reactivity keys.
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
}) =>
  Effect.fnUntraced(
    function*({ conflicts, entry }: {
      readonly entry: Entry
      readonly conflicts: ReadonlyArray<Entry>
    }): Effect.fn.Return<void, Schema.SchemaError> {
      const handler = options.handlers.get(entry.event) as Handlers.Item<any> | undefined
      if (!handler) {
        return yield* Effect.logDebug(`Event handler not found for: "${entry.event}"`)
      }

      const decodePayload = Schema.decodeUnknownEffect(handler.event.payloadSchemaBinary)
      const decodedConflicts: Array<{ entry: Entry; payload: unknown }> = new Array(conflicts.length)
      for (let i = 0; i < conflicts.length; i++) {
        decodedConflicts[i] = {
          entry: conflicts[i],
          payload: yield* decodePayload(conflicts[i].payload).pipe(
            Effect.updateContext((input) => Context.merge(handler.context, input))
          ) as any
        }
      }

      yield* decodePayload(entry.payload).pipe(
        Effect.flatMap((payload) =>
          handler.handler({
            storeId: options.storeId,
            payload,
            entry,
            conflicts: decodedConflicts
          })
        ),
        Effect.provideService(Identity, options.identity),
        Effect.updateContext((input) => Context.merge(handler.context, input)),
        Effect.asVoid
      ) as any

      const keys = Object.hasOwn(options.reactivityKeys, entry.event)
        ? options.reactivityKeys[entry.event]
        : undefined
      if (keys) {
        for (const key of keys) {
          options.reactivity.invalidateUnsafe({
            [key]: [entry.primaryKey]
          })
        }
      }
    },
    Effect.catchCause(Effect.logError),
    (effect, { entry }) =>
      Effect.annotateLogs(effect, {
        ...options.logAnnotations,
        entryId: entry.idString
      })
  )

const remoteRetrySchedule = Schedule.min([
  Schedule.exponential(200, 1.5),
  Schedule.spaced({ seconds: 10 })
])

const make = Effect.gen(function*() {
  const storeId = yield* CurrentStoreId
  const identity = yield* Identity
  const journal = yield* EventJournal
  const registry = yield* Registry

  const reactivity = yield* Reactivity
  const replayFromRemote = makeReplayFromRemote({
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
    Effect.sync(() => {
      for (const entry of entries) {
        const keys = Object.hasOwn(registry.reactivityKeys, entry.event)
          ? registry.reactivityKeys[entry.event]
          : undefined
        if (!keys) {
          continue
        }
        for (const key of keys) {
          reactivity.invalidateUnsafe({
            [key]: [entry.primaryKey]
          })
        }
      }
    })

  const runRemote = Effect.fnUntraced(
    function*(remote: EventLogRemote["Service"]) {
      const startSequence = yield* journal.nextRemoteSequence(remote.id)

      yield* Effect.gen(function*() {
        const changes = yield* remote.changes({ identity, startSequence, storeId })
        while (true) {
          const entries = yield* Queue.takeAll(changes)
          yield* journal.writeFromRemote({
            remoteId: remote.id,
            entries: entries.flat(),
            compact: registry.compactors.size > 0
              ? Effect.fnUntraced(function*(remoteEntries) {
                const finalEntries: Array<Entry> = []
                const compactable = new Map<
                  (options: {
                    readonly entries: ReadonlyArray<Entry>
                    readonly write: (entry: Entry) => Effect.Effect<void>
                  }) => Effect.Effect<void>,
                  Array<Entry>
                >()

                for (let i = 0; i < remoteEntries.length; i++) {
                  const remoteEntry = remoteEntries[i]
                  const entry = remoteEntry.entry
                  const compactor = registry.compactors.get(entry.event)
                  if (!compactor) {
                    finalEntries.push(entry)
                    continue
                  }
                  let arr = compactable.get(compactor.effect)
                  if (!arr) {
                    arr = []
                    compactable.set(compactor.effect, arr)
                  }
                  arr.push(entry)
                }

                for (const [compact, entries] of compactable) {
                  yield* compact({
                    entries,
                    write(entry) {
                      return Effect.sync(() => {
                        finalEntries.push(entry)
                      })
                    }
                  })
                }

                return finalEntries.sort(Entry.Order)
              })
              : undefined,
            effect: replayFromRemote
          }).pipe(
            Effect.tap(({ duplicateEntries }) => invalidateReactivityEntries(duplicateEntries)),
            journal.withLock(storeId)
          )
        }
      }).pipe(
        Effect.scoped,
        Effect.catchCause(Effect.logError),
        Effect.repeat(remoteRetrySchedule),
        Effect.annotateLogs({
          service: "EventLog",
          effect: "runRemote consume"
        }),
        Effect.forkScoped
      )

      const write = journal.withRemoteUncommited(remote.id, (entries) => remote.write({ identity, entries, storeId }))
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

  const writeHandler = Effect.fnUntraced(function*(handler: Handlers.Item<any>, options: {
    readonly schema: EventLogSchema<any>
    readonly event: string
    readonly payload: unknown
  }) {
    const payload = yield* Schema.encodeUnknownEffect(handler.event.payloadSchemaBinary)(options.payload).pipe(
      Effect.orDie
    )
    return yield* journal.withLock(storeId)(journal.write({
      event: options.event,
      primaryKey: handler.event.primaryKey(options.payload as never),
      payload,
      effect: (entry) =>
        handler.handler({
          storeId,
          payload: options.payload,
          entry,
          conflicts: []
        }).pipe(
          Effect.updateContext((input) => Context.merge(handler.context, input)),
          Effect.provideService(Identity, identity),
          Effect.tap(() => {
            const keys = Object.hasOwn(registry.reactivityKeys, entry.event)
              ? registry.reactivityKeys[entry.event]
              : undefined
            if (keys) {
              for (const key of keys) {
                reactivity.invalidateUnsafe({
                  [key]: [entry.primaryKey]
                })
              }
            }
            return Effect.void
          })
        )
    }))
  })

  const eventLogWrite = (options: {
    readonly schema: EventLogSchema<any>
    readonly event: string
    readonly payload: unknown
  }) => {
    const handler = registry.handlers.get(options.event) as Handlers.Item<any> | undefined
    if (handler === undefined) {
      return Effect.die(`Event handler not found for: "${options.event}"`)
    }
    return writeHandler(handler, options)
  }

  yield* registry.handleRemote(runRemote)

  return EventLog.of({
    write: eventLogWrite as EventLog["Service"]["write"],
    entries: journal.entries,
    destroy: journal.destroy
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
 * The returned function delegates to the `EventLog` service and preserves each
 * event's success and error types.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeClient = <Groups extends EventGroup.Any>(
  schema: EventLogSchema<Groups>
): Effect.Effect<
  (<Tag extends Event.Tag<EventGroup.Events<Groups>>>(
    event: Tag,
    payload: Event.PayloadWithTag<EventGroup.Events<Groups>, Tag>
  ) => Effect.Effect<
    Event.SuccessWithTag<EventGroup.Events<Groups>, Tag>,
    Event.ErrorWithTag<EventGroup.Events<Groups>, Tag> | EventJournalError
  >),
  never,
  EventLog
> =>
  Effect.gen(function*() {
    const log = yield* EventLog

    return <Tag extends Event.Tag<EventGroup.Events<Groups>>>(
      event: Tag,
      payload: Event.PayloadWithTag<EventGroup.Events<Groups>, Tag>
    ): Effect.Effect<
      Event.SuccessWithTag<EventGroup.Events<Groups>, Tag>,
      Event.ErrorWithTag<EventGroup.Events<Groups>, Tag> | EventJournalError
    > => log.write({ schema, event, payload })
  })
