/**
 * Spike (proposal 26): live queries in TanStack DB, the client half.
 *
 * `liveCollectionOptions` is a collection whose sync is a live feed: a
 * snapshot replaces the rows, changes write them, and every event's id is
 * the version the collection has reached. `utils.awaitVersion(v)` waits for
 * a version, so a mutation handler holds its optimistic state until the
 * feed brings the server's row (Electric's `awaitTxId`, with tRPC's
 * `onResponse` reading the version header).
 *
 * `createLivePool` shares one pooled subscription (`liveFeeds()` on the
 * server) between collections, and reopens it with every query's version
 * when the set changes.
 *
 * Nothing here is decided API.
 */
import type {
  BaseCollectionConfig,
  CollectionConfig,
  SyncConfig,
  UtilsRecord,
} from '@tanstack/db';
import type { ResponseMeta } from '@trpc12/trpc/client';
import { Effect, Fiber, Queue, Stream, SubscriptionRef } from 'effect';
import {
  parseCursor,
  type LiveEvent,
  type PooledEvent,
  type PooledInput,
  type Sub,
  VERSION_HEADER,
} from './live.ts';

/** Opens a feed, e.g. `(opts) => client.todo.live.subscribe(input, opts)`. */
export type OpenFeed<Row> = (opts: {
  signal: AbortSignal;
}) => AsyncIterable<LiveEvent<Row>>;

export interface LiveUtils extends UtilsRecord {
  /**
   * Resolves once the feed has brought the collection to `version`, a
   * mutation's `trpc-live-version`. Resolves when the collection accepts
   * the commit: its receipt waits for the optimistic transaction that is
   * awaiting this, so waiting for the receipt would deadlock.
   */
  readonly awaitVersion: (version: string | null | undefined) => Promise<void>;
}

export interface LiveCollectionConfig<Row extends object> extends Omit<
  BaseCollectionConfig<Row, string, never, LiveUtils>,
  'utils' | 'syncMode'
> {
  readonly feed: OpenFeed<Row>;
  /** Fails `awaitVersion` after this long. @default 10_000 */
  readonly awaitTimeoutMs?: number;
}

/** Call options that keep the version a mutation's response reports. */
export const versionOf = () => {
  let version: string | null = null;
  return {
    onResponse: (meta: ResponseMeta) => {
      version = meta.headers.get(VERSION_HEADER) ?? version;
    },
    get version() {
      return version;
    },
  };
};

export function liveCollectionOptions<Row extends object>(
  config: LiveCollectionConfig<Row>,
): CollectionConfig<Row, string, never, LiveUtils> & { utils: LiveUtils } {
  const { feed, awaitTimeoutMs = 10_000, ...rest } = config;
  const reached = Effect.runSync(SubscriptionRef.make(-1));

  const awaitVersion: LiveUtils['awaitVersion'] = (version) => {
    const target = version == null ? Number.NaN : Number(version);
    if (!Number.isFinite(target)) return Promise.resolve();
    return Effect.runPromise(
      SubscriptionRef.changes(reached).pipe(
        Stream.filter((v) => v >= target),
        Stream.runHead,
        Effect.timeoutOrElse({
          duration: awaitTimeoutMs,
          orElse: () =>
            Effect.fail(new Error(`Timed out waiting for version ${target}`)),
        }),
        Effect.asVoid,
      ),
    );
  };

  const sync: SyncConfig<Row, string>['sync'] = (params) => {
    let ready = false;
    const apply = (event: LiveEvent<Row>) => {
      const message = event.data;
      const changes = message.kind === 'changes' ? message.changes : [];
      if (message.kind === 'snapshot' || changes.length > 0) {
        params.begin();
        if (message.kind === 'snapshot') {
          params.truncate();
          for (const row of message.rows) {
            params.write({ type: 'insert', value: row });
          }
        }
        for (const change of changes) {
          params.write(
            change.type === 'delete'
              ? { type: 'delete', key: change.key }
              : { type: change.type, value: change.value },
          );
        }
        const receipt = params.commit();
        if (receipt !== true) receipt.catch(() => undefined);
      }
      if (!ready) {
        ready = true;
        params.markReady();
      }
      return SubscriptionRef.set(reached, Number(event.id));
    };

    const controller = new AbortController();
    const fiber = Effect.runFork(
      Stream.fromAsyncIterable(
        feed({ signal: controller.signal }),
        (cause) => cause,
      ).pipe(
        Stream.runForEach(apply),
        Effect.catch((cause) =>
          Effect.sync(() => {
            if (!ready) params.markError(cause);
          }),
        ),
      ),
    );
    return () => {
      controller.abort();
      Effect.runFork(
        Effect.andThen(
          Fiber.interrupt(fiber),
          SubscriptionRef.set(reached, -1),
        ),
      );
    };
  };

  return {
    ...rest,
    sync: { sync, rowUpdateMode: 'full' },
    utils: { awaitVersion },
  };
}

// --- pooling ---------------------------------------------------------------

type RowOfFeed<Feeds, K extends keyof Feeds & string> = Extract<
  PooledEvent<Feeds>,
  { feed: K }
>['message'] extends {
  kind: 'snapshot';
  rows: ReadonlyArray<infer Row>;
}
  ? Row
  : never;

/** Opens the pooled subscription, e.g. `client.live.subscribe`. */
export type OpenPool<Feeds> = (
  input: PooledInput<Feeds>,
  opts: { lastEventId: string | undefined; signal: AbortSignal },
) => AsyncIterable<{ readonly id: string; readonly data: PooledEvent<Feeds> }>;

interface Slot<Feeds> {
  readonly query: Sub<Feeds>;
  version: string | undefined;
  readonly queue: Queue.Queue<LiveEvent<any>, unknown>;
}

/**
 * Collections that read through `pool.feed(name, input)` share one
 * subscription. Registering or dropping a query reopens it on the next
 * macrotask, with every remaining query's version as the cursor, so they
 * resume with changes rather than a new snapshot.
 */
export function createLivePool<Feeds>(open: OpenPool<Feeds>) {
  const slots = new Map<string, Slot<Feeds>>();
  let ids = 0;
  let current: { fiber: Fiber.Fiber<void>; abort: () => void } | undefined;
  let scheduled = false;
  const stats = { opens: 0 };

  const reopen = Effect.gen(function* () {
    scheduled = false;
    if (current) {
      current.abort();
      yield* Fiber.interrupt(current.fiber);
      current = undefined;
    }
    if (slots.size === 0) return;
    const subs: Record<string, Sub<Feeds>> = {};
    const cursor: Record<string, string> = {};
    for (const [id, slot] of slots) {
      subs[id] = slot.query;
      if (slot.version !== undefined) cursor[id] = slot.version;
    }
    stats.opens++;
    const controller = new AbortController();
    const events = Stream.fromAsyncIterable(
      open(
        { subs },
        {
          lastEventId: Object.keys(cursor).length
            ? JSON.stringify(cursor)
            : undefined,
          signal: controller.signal,
        },
      ),
      (cause) => cause,
    );
    const fiber = yield* events.pipe(
      Stream.runForEach((event) => {
        const slot = slots.get(event.data.sub);
        if (!slot) return Effect.void;
        slot.version = parseCursor(event.id)[event.data.sub] ?? slot.version;
        return Queue.offer(slot.queue, {
          id: slot.version!,
          data: event.data.message,
        });
      }),
      Effect.catch((cause) =>
        Effect.forEach(slots.values(), (slot) => Queue.fail(slot.queue, cause)),
      ),
      Effect.asVoid,
      Effect.forkDetach,
    );
    current = { fiber, abort: () => controller.abort() };
  });

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    Effect.runFork(Effect.andThen(Effect.sleep(0), reopen));
  };

  return {
    stats,
    feed<K extends keyof Feeds & string>(
      feed: K,
      input: Extract<Sub<Feeds>, { feed: K }>['input'],
    ): OpenFeed<RowOfFeed<Feeds, K>> {
      return () =>
        Stream.toAsyncIterable(
          Stream.unwrap(
            Effect.gen(function* () {
              const id = `q${ids++}`;
              const queue = yield* Queue.unbounded<LiveEvent<any>, unknown>();
              slots.set(id, {
                query: { feed, input } as Sub<Feeds>,
                version: undefined,
                queue,
              });
              schedule();
              return Stream.fromQueue(queue).pipe(
                Stream.ensuring(
                  Effect.sync(() => {
                    slots.delete(id);
                    schedule();
                  }),
                ),
              );
            }),
          ),
        );
    },
  };
}
