/**
 * TanStack DB collections synced by a tRPC subscription: a snapshot
 * replaces the rows, then each change writes one, and a mutation handler
 * waits until the feed brings the server's change. Every export is
 * experimental, as the package name says.
 *
 * @example
 * ```ts
 * import { createCollection } from '@tanstack/db';
 * import { liveCollectionOptions } from '@trpc12/experimental-tanstack-db';
 *
 * const posts = createCollection(
 *   liveCollectionOptions({
 *     getKey: (post) => post.id,
 *     subscribe: (opts) => client.post.live.subscribe(undefined, opts),
 *     onInsert: async (opts) => {
 *       const created = await client.post.create.mutate(opts.transaction.mutations[0].modified);
 *       await opts.collection.utils.awaitEventId(created.eventId);
 *     },
 *   }),
 * );
 * ```
 * @module
 */
import type {
  BaseCollectionConfig,
  CollectionConfig,
  SyncConfig,
  UtilsRecord,
} from '@tanstack/db';
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  identity,
  Match,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';

/**
 * An event of a live subscription. `snapshot` replaces every row, `upsert`
 * writes one whole row, `delete` removes one by key. Changes the collection
 * already has are harmless, so a server can resend them.
 * @since 0.1.0
 * @stability experimental
 */
export type LiveEvent<TRow, TKey extends string | number = string | number> =
  | { readonly type: 'snapshot'; readonly rows: ReadonlyArray<TRow> }
  | { readonly type: 'upsert'; readonly row: TRow }
  | { readonly type: 'delete'; readonly key: TKey };

/**
 * A {@link LiveEvent} yielded with `tracked(id, event)`, as a subscription
 * client receives it.
 * @since 0.1.0
 * @stability experimental
 */
export interface TrackedLiveEvent<
  TRow,
  TKey extends string | number = string | number,
> {
  readonly id: string;
  readonly data: LiveEvent<TRow, TKey>;
}

/**
 * Opens the live subscription:
 * `(opts) => client.post.live.subscribe(input, opts)`, an async iterable
 * that aborting `signal` closes, or an Effect `Stream` (an Effect client's
 * `subscribe()`), which is interrupted instead.
 * @since 0.1.0
 * @stability experimental
 */
export type LiveSubscribe<TRow, TKey extends string | number> = (opts: {
  signal: AbortSignal;
}) =>
  | AsyncIterable<LiveEvent<TRow, TKey> | TrackedLiveEvent<TRow, TKey>>
  | Stream.Stream<
      LiveEvent<TRow, TKey> | TrackedLiveEvent<TRow, TKey>,
      unknown
    >;

/**
 * `collection.utils` of a live collection.
 * @since 0.1.0
 * @stability experimental
 */
export interface LiveUtils extends UtilsRecord {
  /**
   * Resolves once the collection has applied the `tracked()` event with
   * this id, or a snapshot that arrived after the call. Await it in a
   * mutation handler with the id the mutation returns, so the optimistic
   * row stays until the server's arrives. Rejects after `timeout` ms.
   * @default timeout 10_000
   */
  readonly awaitEventId: (id: string, timeout?: number) => Promise<void>;
}

/**
 * Options for {@link liveCollectionOptions}: TanStack DB's collection
 * options, with `subscribe` instead of `sync`.
 * @since 0.1.0
 * @stability experimental
 */
export interface LiveCollectionConfig<
  TRow extends object,
  TKey extends string | number,
> extends Omit<
  BaseCollectionConfig<TRow, TKey, never, LiveUtils>,
  'utils' | 'syncMode'
> {
  readonly subscribe: LiveSubscribe<TRow, TKey>;
}

/** Ids of applied events kept for `awaitEventId` calls that come late. */
const SEEN_IDS = 1000;

interface Applied {
  /** Snapshots applied so far. */
  readonly snapshots: number;
  /** The latest tracked id applied. */
  readonly id: string | undefined;
}

const isTracked = <TRow, TKey extends string | number>(
  event: LiveEvent<TRow, TKey> | TrackedLiveEvent<TRow, TKey>,
): event is TrackedLiveEvent<TRow, TKey> => !('type' in event);

/** Applies the subscription's events until it ends, fails, or is interrupted. */
const feed = /* @__PURE__ */ Effect.fnUntraced(function* <TEvent>(
  subscribe: (opts: {
    signal: AbortSignal;
  }) => AsyncIterable<TEvent> | Stream.Stream<TEvent, unknown>,
  apply: (event: TEvent) => Effect.Effect<void>,
  fail: (cause: unknown) => void,
) {
  const signal = yield* Effect.abortSignal;
  const exit = yield* Stream.suspend(() => {
    const source = subscribe({ signal });
    return Stream.isStream(source)
      ? source
      : Stream.fromAsyncIterable(source, identity);
  }).pipe(Stream.runForEach(apply), Effect.exit);
  if (Exit.isFailure(exit) && !Cause.hasInterrupts(exit.cause)) {
    fail(Cause.squash(exit.cause));
  }
});

/**
 * A TanStack DB collection whose rows come from a live subscription. The
 * subscription starts with the collection's sync and closes with its
 * cleanup; reconnects are the link's, resuming from the last `tracked()` id.
 * A failed subscription puts the collection in its `error` status.
 *
 * @example
 * ```ts
 * const posts = createCollection(
 *   liveCollectionOptions({
 *     getKey: (post) => post.id,
 *     subscribe: (opts) => client.post.live.subscribe(undefined, opts),
 *   }),
 * );
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function liveCollectionOptions<
  TRow extends object,
  TKey extends string | number = string | number,
>(
  config: LiveCollectionConfig<TRow, TKey>,
): CollectionConfig<TRow, TKey, never, LiveUtils> & { utils: LiveUtils } {
  const { subscribe, ...rest } = config;
  const applied = Effect.runSync(
    SubscriptionRef.make<Applied>({ snapshots: 0, id: undefined }),
  );
  const seen = new Set<string>();

  const awaitEventId: LiveUtils['awaitEventId'] = (id, timeout = 10_000) =>
    Effect.runPromise(
      Effect.gen(function* () {
        if (seen.has(id)) return;
        const start = yield* SubscriptionRef.get(applied);
        yield* SubscriptionRef.changes(applied).pipe(
          Stream.filter(
            (now) => seen.has(id) || now.snapshots > start.snapshots,
          ),
          Stream.runHead,
          Effect.timeoutOrElse({
            duration: timeout,
            orElse: () =>
              Effect.fail(
                new Error(`Timed out after ${timeout}ms awaiting event ${id}`),
              ),
          }),
        );
      }),
    );

  const sync: SyncConfig<TRow, TKey>['sync'] = (params) => {
    let ready = false;
    const write = Match.type<LiveEvent<TRow, TKey>>().pipe(
      Match.discriminatorsExhaustive('type')({
        snapshot: (event) => {
          params.truncate();
          for (const row of event.rows) {
            params.write({ type: 'insert', value: row });
          }
        },
        // With full row updates, an update of a missing key inserts it.
        upsert: (event) => params.write({ type: 'update', value: event.row }),
        delete: (event) => params.write({ type: 'delete', key: event.key }),
      }),
    );

    const apply = (
      event: LiveEvent<TRow, TKey> | TrackedLiveEvent<TRow, TKey>,
    ) =>
      Effect.suspend(() => {
        const data = isTracked(event) ? event.data : event;
        params.begin();
        write(data);
        // The receipt settles with the optimistic transactions it waits for,
        // and a handler awaiting this event is one of them.
        const receipt = params.commit();
        if (receipt !== true) receipt.catch(() => undefined);
        if (!ready) {
          ready = true;
          params.markReady();
        }
        const id = isTracked(event) ? event.id : undefined;
        if (id !== undefined) {
          seen.add(id);
          if (seen.size > SEEN_IDS) seen.delete(seen.values().next().value!);
        }
        return SubscriptionRef.update(applied, (prev) => ({
          snapshots: prev.snapshots + (data.type === 'snapshot' ? 1 : 0),
          id: id ?? prev.id,
        }));
      });

    // Parallel finalizers, so cleanup aborts `signal` while the fiber is
    // still being interrupted: an async generator awaiting a source that
    // listens to the signal only settles `return()` once that source ends.
    const scope = Scope.makeUnsafe('parallel');
    Effect.runFork(
      Scope.provide(
        feed(subscribe, apply, (cause) => params.markError(cause)),
        scope,
      ),
    ).pipe(Fiber.runIn(scope));
    return () => {
      Effect.runFork(Scope.close(scope, Exit.void));
    };
  };

  return {
    ...rest,
    sync: { sync, rowUpdateMode: 'full' },
    utils: { awaitEventId },
  };
}
