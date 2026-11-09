/**
 * Spike (proposal 26): live queries on the `experimental_Publisher`, the server half.
 *
 * A live table keeps rows, a version and a bounded log of commits, and
 * publishes each commit on a `LiveCommits` channel. A feed is what a
 * subscription returns: a snapshot, or the logged commits after
 * `lastEventId`, then each commit that follows, as `tracked()` events whose
 * id is the table version the event brings the client to. A mutation sends
 * its version back in a `trpc-live-version` header, so a client can wait
 * until its feed has passed it.
 *
 * `liveFeeds()` pools several feeds into one subscription with one cursor,
 * so many live queries share one SSE connection.
 *
 * Nothing here is decided API.
 */
import { Effect, Semaphore, Stream } from 'effect';
import {
  experimental_Publisher,
  tracked,
  type TrackedEnvelope,
} from '@trpc12/trpc/server';

/** A row change, in the shape TanStack DB's sync `write()` takes. */
export type Change<Row> =
  | { readonly type: 'insert' | 'update'; readonly value: Row }
  | { readonly type: 'delete'; readonly key: string };

export type LiveMessage<Row> =
  | { readonly kind: 'snapshot'; readonly rows: ReadonlyArray<Row> }
  | { readonly kind: 'changes'; readonly changes: ReadonlyArray<Change<Row>> };

/** A feed event; its id is the table version after it. */
export type LiveEvent<Row> = TrackedEnvelope<LiveMessage<Row>>;

/** What one commit did to one row. */
export interface RowWrite<Row = unknown> {
  readonly key: string;
  readonly before: Row | undefined;
  readonly after: Row | undefined;
}

export interface Commit<Row = unknown> {
  readonly version: number;
  readonly writes: ReadonlyArray<RowWrite<Row>>;
}

/** The fan-out between processes: one channel per table. */
export class LiveCommits extends experimental_Publisher.Service<
  LiveCommits,
  { [table: `table:${string}`]: Commit }
>()('LiveCommits') {}

/** The response header a mutation's version travels in. */
export const VERSION_HEADER = 'trpc-live-version';

export interface Draft<Row> {
  get(key: string): Row | undefined;
  set(row: Row): void;
  delete(key: string): void;
}

export interface LiveTableOptions<Row> {
  readonly name: string;
  readonly getKey: (row: Row) => string;
  readonly rows?: ReadonlyArray<Row>;
  /**
   * Commits kept for feeds that resume with `lastEventId`; an older resume
   * gets a snapshot.
   * @default 100
   */
  readonly history?: number;
}

export interface FeedOptions<Row> {
  readonly lastEventId?: string | undefined;
  /** The feed's shape: rows that enter it are inserts, rows that leave are deletes. */
  readonly where?: ((row: Row) => boolean) | undefined;
}

export interface LiveTable<Row> {
  readonly mutate: (f: (draft: Draft<Row>) => void) => Effect.Effect<number>;
  readonly feed: (opts?: FeedOptions<Row>) => Stream.Stream<LiveEvent<Row>>;
  /** What feeds have sent, for tests. */
  readonly stats: { feeds: number; snapshots: number; gaps: number };
}

const parseVersion = (id: string | undefined) => {
  const n = id === undefined ? Number.NaN : Number(id);
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
};

/** A commit as one feed sees it: rows outside its shape drop out. */
const visible = <Row>(
  commit: Commit<Row>,
  where: ((row: Row) => boolean) | undefined,
): Change<Row>[] =>
  commit.writes.flatMap((write): Change<Row>[] => {
    const inShape = (row: Row | undefined): row is Row =>
      row !== undefined && (where?.(row) ?? true);
    if (inShape(write.after)) {
      const type = inShape(write.before) ? 'update' : 'insert';
      return [{ type, value: write.after }];
    }
    return inShape(write.before) ? [{ type: 'delete', key: write.key }] : [];
  });

const changesEvent = <Row>(
  commit: Commit<Row>,
  where: ((row: Row) => boolean) | undefined,
): LiveEvent<Row> =>
  tracked(String(commit.version), {
    kind: 'changes',
    changes: visible(commit, where),
  });

export const makeLiveTable = <Row>(
  opts: LiveTableOptions<Row>,
): Effect.Effect<LiveTable<Row>, never, LiveCommits> =>
  Effect.gen(function* () {
    const commits = yield* LiveCommits;
    const channel = `table:${opts.name}` as const;
    const history = opts.history ?? 100;
    const lock = yield* Semaphore.make(1);
    const rows = new Map((opts.rows ?? []).map((r) => [opts.getKey(r), r]));
    const log: Commit<Row>[] = [];
    let version = 0;
    // The publisher id of the last commit: a feed subscribes after it, so
    // commits published while it sends its first event are replayed.
    let published: string | undefined;
    const stats = { feeds: 0, snapshots: 0, gaps: 0 };

    const mutate = (f: (draft: Draft<Row>) => void) =>
      lock.withPermits(1)(
        Effect.gen(function* () {
          const writes = new Map<string, { before: Row | undefined }>();
          const touch = (key: string) => {
            if (!writes.has(key)) writes.set(key, { before: rows.get(key) });
          };
          f({
            get: (key) => rows.get(key),
            set: (row) => {
              const key = opts.getKey(row);
              touch(key);
              rows.set(key, row);
            },
            delete: (key) => {
              touch(key);
              rows.delete(key);
            },
          });
          const changed = [...writes]
            .map(([key, w]) => ({
              key,
              before: w.before,
              after: rows.get(key),
            }))
            .filter((w) => w.before !== w.after);
          if (changed.length === 0) return version;
          const commit: Commit<Row> = { version: version + 1, writes: changed };
          version = commit.version;
          log.push(commit);
          if (log.length > history) log.splice(0, log.length - history);
          published = yield* commits.publish(channel, commit);
          return version;
        }),
      );

    /** Events from `since` to now: the logged commits, or a snapshot. */
    const catchUp = (
      since: number | undefined,
      where: FeedOptions<Row>['where'],
    ): LiveEvent<Row>[] => {
      const oldest = log[0]?.version ?? version + 1;
      if (since !== undefined && since <= version && since >= oldest - 1) {
        return log
          .filter((c) => c.version > since)
          .map((c) => changesEvent(c, where));
      }
      stats.snapshots++;
      const shaped = [...rows.values()].filter((r) => where?.(r) ?? true);
      return [tracked(String(version), { kind: 'snapshot', rows: shaped })];
    };

    const feed = (feedOpts: FeedOptions<Row> = {}) =>
      Stream.unwrap(
        lock.withPermits(1)(
          Effect.sync(() => {
            stats.feeds++;
            const where = feedOpts.where;
            const first = catchUp(parseVersion(feedOpts.lastEventId), where);
            let cursor = version;
            // `'0'` is the memory publisher's "before the first event".
            const after = published ?? '0';
            const next = (
              commit: Commit<Row>,
            ): Stream.Stream<LiveEvent<Row>> => {
              if (commit.version <= cursor) return Stream.empty;
              if (commit.version === cursor + 1) {
                cursor = commit.version;
                return Stream.make(changesEvent(commit, where));
              }
              // The backend dropped commits: read them from the log.
              return Stream.unwrap(
                lock.withPermits(1)(
                  Effect.sync(() => {
                    stats.gaps++;
                    const events = catchUp(cursor, where);
                    cursor = version;
                    return Stream.fromIterable(events);
                  }),
                ),
              );
            };
            return Stream.concat(
              Stream.fromIterable(first),
              commits
                .subscribe(channel, { lastEventId: after })
                .pipe(Stream.flatMap((e) => next(e.data as Commit<Row>))),
            );
          }),
        ),
      );

    return { mutate, feed, stats };
  });

// --- pooling ---------------------------------------------------------------

/** A feed by name: its input and its last version give its events. */
export type FeedFn<Input = any, Row = any, R = any> = (
  input: Input,
  lastEventId: string | undefined,
) => Stream.Stream<LiveEvent<Row>, never, R>;

type InputOf<F> = F extends FeedFn<infer I, any, any> ? I : never;
type RowOf<F> = F extends FeedFn<any, infer Row, any> ? Row : never;
type ServicesOf<F> = F extends FeedFn<any, any, infer R> ? R : never;

/** One live query in a pooled subscription. */
export type Sub<Feeds> = {
  [K in keyof Feeds & string]: {
    readonly feed: K;
    readonly input: InputOf<Feeds[K]>;
  };
}[keyof Feeds & string];

export interface PooledInput<Feeds> {
  readonly subs: Readonly<Record<string, Sub<Feeds>>>;
}

/** An event of one live query, by the client's id for it. */
export type PooledEvent<Feeds> = {
  [K in keyof Feeds & string]: {
    readonly sub: string;
    readonly feed: K;
    readonly message: LiveMessage<RowOf<Feeds[K]>>;
  };
}[keyof Feeds & string];

/**
 * One subscription for many live queries. Its event ids are a JSON cursor,
 * `{ [sub]: version }`, so a reconnect, or a reopen with another set of
 * queries, resumes each query from its own version.
 */
export const liveFeeds =
  <const Feeds extends Record<string, FeedFn>>(feeds: Feeds) =>
  (opts: {
    readonly input: PooledInput<Feeds>;
    readonly lastEventId?: string | undefined;
  }): Stream.Stream<
    TrackedEnvelope<PooledEvent<Feeds>>,
    never,
    ServicesOf<Feeds[keyof Feeds]>
  > => {
    const resumed = parseCursor(opts.lastEventId);
    const streams = Object.entries(opts.input.subs).map(([sub, query]) =>
      (feeds[query.feed] as FeedFn)(query.input, resumed[sub]).pipe(
        Stream.map((event) => ({ sub, feed: query.feed, event })),
      ),
    );
    const cursor: Record<string, string> = {};
    for (const sub of Object.keys(opts.input.subs)) {
      if (resumed[sub] !== undefined) cursor[sub] = resumed[sub];
    }
    return Stream.mergeAll(streams, { concurrency: 'unbounded' }).pipe(
      Stream.map((opts) => {
        cursor[opts.sub] = opts.event.id;
        return tracked(JSON.stringify(cursor), {
          sub: opts.sub,
          feed: opts.feed,
          message: opts.event.data,
        } as PooledEvent<Feeds>);
      }),
    );
  };

export const parseCursor = (
  id: string | undefined,
): Readonly<Record<string, string>> => {
  if (!id) return {};
  try {
    const value: unknown = JSON.parse(id);
    return typeof value === 'object' && value !== null
      ? (value as Record<string, string>)
      : {};
  } catch {
    return {};
  }
};
