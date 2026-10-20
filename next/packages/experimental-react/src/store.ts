import { Effect, Exit, Fiber, FiberSet, identity, Scope } from 'effect';
import { TrpcError, type AnyLink } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import { sortKeys } from './share.ts';
import {
  fulfilled,
  pending,
  rejected,
  type Pending,
  type Thenable,
} from './thenable.ts';

/** Keys use danSON, so inputs with `Date`s and `Map`s key apart. */
const keySerializer = /* @__PURE__ */ createSerializer();

/**
 * The cache key of a query: its path and its input, with plain objects'
 * keys sorted so `{ a, b }` and `{ b, a }` share an entry.
 * @since 0.1.0
 * @stability experimental
 */
export const queryKey = (path: string, input: unknown): string =>
  `${path}\n${input === undefined ? '' : JSON.stringify(keySerializer.serialize(sortKeys(input)))}`;

/**
 * What a query link adds to the store. Each field is optional; links in
 * the array are merged in order, so a later one wins for numbers and
 * `share`, and every `onMount` and `attach` runs.
 * @since 0.1.0
 * @stability experimental
 */
export interface QueryFeature {
  /** How long data counts as fresh, in ms. Fresh data is never refetched. */
  readonly staleTime?: number;
  /** How long an unread, idle entry stays cached, in ms. */
  readonly gcTime?: number;
  /** Combines the old data with a refetched value. Returning `prev` keeps the promise. */
  readonly share?: (prev: unknown, next: unknown) => unknown;
  /** Called when a `useQuery` mounts on an entry. */
  readonly onMount?: (entry: QueryEntry, store: QueryStore) => void;
  /** Called once per store; the returned function runs on `dispose()`. */
  readonly attach?: (store: QueryStore) => (() => void) | void;
}

const features = new WeakMap<AnyLink, QueryFeature>();

/**
 * Registers what `target` adds to the stores of the React clients it is a
 * link of. In a plain client it is only its chain function.
 * @since 0.1.0
 * @stability experimental
 */
export function withQueryFeature<L extends AnyLink>(
  target: L,
  feature: QueryFeature,
): L {
  features.set(target, feature);
  return target;
}

/**
 * The read-only view of one query that `useQueryState` returns. A new
 * object whenever any field changes.
 * @since 0.1.0
 * @stability experimental
 */
export interface QuerySnapshot {
  /** A request is in flight: the first load or a background refetch. */
  readonly isFetching: boolean;
  /** The data was invalidated, or is older than `staleTime`, or there is none. */
  readonly isStale: boolean;
  /** The last failed request's error. Existing data stays readable. */
  readonly error: unknown;
  /** When the data arrived (ms since epoch); `0` before that. */
  readonly updatedAt: number;
}

/**
 * One cached query.
 * @since 0.1.0
 * @stability experimental
 */
export interface QueryEntry {
  readonly key: string;
  readonly path: string;
  readonly input: unknown;
  /** The current promise: the same object until the data changes. */
  readonly promise: Thenable<unknown>;
  readonly hasData: boolean;
  readonly data: unknown;
  readonly snapshot: QuerySnapshot;
  /** Mounted `useQuery`s. */
  readonly observers: number;
  /**
   * `true` from a `.query()` call that started or joined a request until
   * the next mount, so the component a loader fetched for doesn't refetch.
   */
  readonly requested: boolean;
}

type MutableEntry = {
  -readonly [K in keyof QueryEntry]: QueryEntry[K];
};

interface Entry extends MutableEntry {
  readonly callOptions: object | undefined;
  deferred: Pending<unknown> | undefined;
  invalidated: boolean;
  error: unknown;
  updatedAt: number;
  fetching: Fiber.Fiber<void> | undefined;
  listeners: Set<() => void>;
  gc: Fiber.Fiber<void> | undefined;
}

/**
 * Picks entries: all of them, those under a path (`'post'` matches
 * `post.byId`), or those a predicate accepts.
 * @since 0.1.0
 * @stability experimental
 */
export type QueryFilter = string | ((entry: QueryEntry) => boolean) | undefined;

/**
 * The cache behind a React client. Links and integrations use it; apps use
 * the client's methods.
 * @since 0.1.0
 * @stability experimental
 */
export interface QueryStore {
  readonly isServer: boolean;
  /**
   * `.query()`: the entry's promise, starting a request when needed. After
   * `dispose()`, a query without data rejects with `CLIENT_CLOSED_REQUEST`.
   */
  read(path: string, input: unknown, callOptions?: object): Thenable<unknown>;
  /** The entry a promise from `read()` belongs to: the current one for its key. */
  entryOf(promise: Promise<unknown>): QueryEntry | undefined;
  /** The cached entry for a query, if there is one. */
  get(path: string, input: unknown): QueryEntry | undefined;
  /** Every cached entry. */
  entries(): ReadonlyArray<QueryEntry>;
  /** Whether the entry's data should be refetched. */
  isStale(entry: QueryEntry): boolean;
  /** Starts a request for the entry, or joins the one in flight. Never rejects. */
  refetch(entry: QueryEntry): Promise<void>;
  /** Marks entries stale and refetches the observed ones; resolves when those settle. */
  invalidate(filter?: QueryFilter): Promise<void>;
  /** Writes data. Readers re-render without suspending. */
  setData(path: string, input: unknown, data: unknown): void;
  /** Drops entries and aborts their requests. */
  remove(filter?: QueryFilter): void;
  /** Called on every change to the entry. */
  subscribe(entry: QueryEntry, listener: () => void): () => void;
  /** A mounted reader. Returns the unmount. */
  mount(entry: QueryEntry): () => void;
  /**
   * Refetches the entry `interval` ms after each request settles, until the
   * returned stop is called. While the page is hidden it waits, and
   * refetches once the page is visible again. Does nothing on a server
   * store, after `dispose()`, or for an interval that isn't positive and
   * finite.
   */
  poll(entry: QueryEntry, interval: number): () => void;
  /** Writes an entry from another store (hydration); only newer data wins. */
  seed(path: string, input: unknown, data: unknown, updatedAt: number): void;
  /**
   * Detaches the links' listeners, ends the store's requests and timers, and
   * drops every entry. The store starts no requests after it: first loads in
   * flight and later reads without data reject with `CLIENT_CLOSED_REQUEST`.
   */
  dispose(): void;
}

/** Waits until every fiber has ended, however each ended. */
const awaitAll = (
  fibers: Iterable<Fiber.Fiber<void> | undefined>,
): Effect.Effect<void> =>
  Effect.asVoid(
    Fiber.awaitAll([...fibers].filter((fiber) => fiber !== undefined)),
  );

const settled = (
  fibers: Iterable<Fiber.Fiber<void> | undefined>,
): Promise<void> => Effect.runPromise(awaitAll(fibers));

const disposedError = () =>
  new TrpcError({
    code: 'CLIENT_CLOSED_REQUEST',
    message:
      "The query's store was disposed: after dispose() it starts no requests",
  });

const hidden = () =>
  typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** Resumes at once while the page is visible, else once it's visible again. */
const visible: Effect.Effect<void> = Effect.callback<void>((resume) => {
  if (!hidden()) {
    resume(Effect.void);
    return;
  }
  const onChange = () => {
    if (hidden()) return;
    document.removeEventListener('visibilitychange', onChange);
    resume(Effect.void);
  };
  document.addEventListener('visibilitychange', onChange);
  return Effect.sync(() =>
    document.removeEventListener('visibilitychange', onChange),
  );
});

const noop = () => {};

const owners = new WeakMap<Promise<unknown>, { store: Store; entry: Entry }>();

/** The store and entry a query promise belongs to. @internal */
export const ownerOf = (
  promise: Promise<unknown>,
): { store: QueryStore; entry: QueryEntry } | undefined => owners.get(promise);

const matches = (filter: QueryFilter, entry: QueryEntry): boolean =>
  filter === undefined
    ? true
    : typeof filter === 'string'
      ? entry.path === filter || entry.path.startsWith(`${filter}.`)
      : filter(entry);

export interface StoreOptions {
  readonly links: ReadonlyArray<AnyLink>;
  /** Runs a query through the client's links. Interruption aborts `signal`. */
  readonly request: (
    path: string,
    input: unknown,
    callOptions: object | undefined,
    signal: AbortSignal,
  ) => Promise<unknown>;
  readonly isServer: boolean;
  readonly now?: (() => number) | undefined;
  /** Disposes the store when it closes. */
  readonly scope?: Scope.Scope | undefined;
}

type Store = QueryStore & { readonly '~entries': Map<string, Entry> };

export function createStore(opts: StoreOptions): QueryStore {
  const now = opts.now ?? Date.now;
  const merged = opts.links.flatMap((current) => {
    const feature = features.get(current);
    return feature ? [feature] : [];
  });
  let staleTime = 0;
  let gcTime = 0;
  let share = (_prev: unknown, next: unknown) => next;
  for (const feature of merged) {
    if (feature.staleTime !== undefined) staleTime = feature.staleTime;
    if (feature.gcTime !== undefined) gcTime = feature.gcTime;
    if (feature.share) share = feature.share;
  }
  const onMount = merged.flatMap((f) => (f.onMount ? [f.onMount] : []));
  const entries = new Map<string, Entry>();
  // Link listeners, GC timers and requests end with it, on `dispose()` or
  // when the caller's scope closes.
  const scope = opts.scope ? Scope.forkUnsafe(opts.scope) : Scope.makeUnsafe();
  const run = Effect.runSync(
    Scope.provide(FiberSet.makeRuntime<never, void, never>(), scope),
  );
  let disposed = false;
  const end = () => {
    if (disposed) return;
    disposed = true;
    const error = disposedError();
    for (const entry of entries.values()) entry.deferred?.reject(error);
    store.remove();
  };
  Effect.runSync(Scope.addFinalizer(scope, Effect.sync(end)));

  const isStale = (entry: QueryEntry) => {
    const e = entry as Entry;
    return e.invalidated || !e.hasData || now() - e.updatedAt >= staleTime;
  };

  const notify = (entry: Entry) => {
    entry.snapshot = {
      isFetching: entry.fetching !== undefined,
      isStale: isStale(entry),
      error: entry.error,
      updatedAt: entry.updatedAt,
    };
    for (const listener of entry.listeners) listener();
  };

  const own = (entry: Entry, promise: Thenable<unknown>) => {
    owners.set(promise, { store, entry });
    entry.promise = promise;
  };

  const scheduleGc = (entry: Entry) => {
    entry.gc?.interruptUnsafe();
    entry.gc = undefined;
    if (opts.isServer || entry.observers > 0 || entry.fetching) return;
    if (entries.get(entry.key) !== entry) return;
    // Removing an entry cancels its timer, so the entry is still the key's.
    if (gcTime <= 0) entries.delete(entry.key);
    else if (Number.isFinite(gcTime)) {
      entry.gc = run(
        Effect.sleep(gcTime).pipe(
          Effect.andThen(Effect.sync(() => entries.delete(entry.key))),
        ),
      );
    }
  };

  const create = (
    path: string,
    input: unknown,
    callOptions: object | undefined,
  ): Entry => {
    const deferred = pending<unknown>();
    const entry: Entry = {
      key: queryKey(path, input),
      path,
      input,
      callOptions,
      promise: deferred.promise,
      deferred,
      hasData: false,
      data: undefined,
      invalidated: false,
      error: undefined,
      updatedAt: 0,
      fetching: undefined,
      observers: 0,
      requested: false,
      listeners: new Set(),
      gc: undefined,
      snapshot: {
        isFetching: false,
        isStale: true,
        error: undefined,
        updatedAt: 0,
      },
    };
    own(entry, deferred.promise);
    entries.set(entry.key, entry);
    return entry;
  };

  /**
   * Writes data and returns what resolves a pending first load. Callers
   * finish their bookkeeping before calling it, so whoever awaits the
   * promise sees the entry settled.
   */
  const write = (entry: Entry, value: unknown): (() => void) => {
    const next = entry.hasData ? share(entry.data, value) : value;
    const deferred = entry.deferred;
    entry.deferred = undefined;
    if (!deferred && (!entry.hasData || next !== entry.data)) {
      own(entry, fulfilled(next));
    }
    entry.data = next;
    entry.hasData = true;
    entry.updatedAt = now();
    entry.invalidated = false;
    entry.error = undefined;
    return () => deferred?.resolve(next);
  };

  const finish = (entry: Entry) => {
    entry.fetching = undefined;
    notify(entry);
    scheduleGc(entry);
  };

  const load = (entry: Entry): Effect.Effect<void> =>
    Effect.tryPromise({
      try: (signal) =>
        opts.request(entry.path, entry.input, entry.callOptions, signal),
      catch: identity,
    }).pipe(
      Effect.match({
        onSuccess: (value) => {
          const release = write(entry, value);
          finish(entry);
          release();
        },
        onFailure: (error) => {
          entry.error = error;
          const deferred = entry.deferred;
          entry.deferred = undefined;
          finish(entry);
          deferred?.reject(error);
        },
      }),
    );

  const fetch = (entry: Entry): Fiber.Fiber<void> | undefined => {
    if (entry.fetching || disposed) return entry.fetching;
    if (!entry.hasData && !entry.deferred) {
      const deferred = pending<unknown>();
      entry.deferred = deferred;
      own(entry, deferred.promise);
    }
    const fiber = run(load(entry));
    entry.fetching = fiber;
    notify(entry);
    return fiber;
  };

  const drop = (entry: Entry) => {
    entry.gc?.interruptUnsafe();
    entry.fetching?.interruptUnsafe();
    entry.fetching = undefined;
    entries.delete(entry.key);
  };

  const store: Store = {
    '~entries': entries,
    isServer: opts.isServer,
    read(path, input, callOptions) {
      const key = queryKey(path, input);
      const cached = entries.get(key);
      if (disposed && !cached?.hasData) return rejected(disposedError());
      const entry = cached ?? create(path, input, callOptions);
      if (entry.fetching || isStale(entry)) {
        entry.requested = true;
        fetch(entry);
      }
      return entry.promise;
    },
    entryOf(promise) {
      const owner = owners.get(promise);
      if (!owner || owner.store !== store) return undefined;
      return entries.get(owner.entry.key) ?? owner.entry;
    },
    get: (path, input) => entries.get(queryKey(path, input)),
    entries: () => [...entries.values()],
    isStale,
    refetch: (entry) => settled([fetch(entry as Entry)]),
    invalidate(filter) {
      const refetches: Array<Fiber.Fiber<void> | undefined> = [];
      for (const entry of entries.values()) {
        if (!matches(filter, entry)) continue;
        entry.invalidated = true;
        if (entry.observers > 0) refetches.push(fetch(entry));
        else notify(entry);
      }
      return settled(refetches);
    },
    setData(path, input, data) {
      const key = queryKey(path, input);
      const entry = entries.get(key) ?? create(path, input, undefined);
      const release = write(entry, data);
      notify(entry);
      scheduleGc(entry);
      release();
    },
    remove(filter) {
      for (const entry of entries.values()) {
        if (matches(filter, entry)) drop(entry);
      }
    },
    subscribe(entry, listener) {
      const e = entry as Entry;
      e.listeners.add(listener);
      return () => {
        e.listeners.delete(listener);
      };
    },
    mount(entry) {
      const e = entry as Entry;
      if (!entries.has(e.key)) entries.set(e.key, e);
      e.observers++;
      e.gc?.interruptUnsafe();
      e.gc = undefined;
      for (const hook of onMount) hook(e, store);
      e.requested = false;
      let mounted = true;
      return () => {
        if (!mounted) return;
        mounted = false;
        e.observers--;
        scheduleGc(e);
      };
    },
    poll(entry, interval) {
      if (
        opts.isServer ||
        disposed ||
        !(interval > 0) ||
        !Number.isFinite(interval)
      )
        return noop;
      const refetch = Effect.suspend(() => awaitAll([fetch(entry as Entry)]));
      const fiber = run(
        Effect.forever(
          Effect.sleep(interval).pipe(
            Effect.andThen(visible),
            Effect.andThen(refetch),
          ),
        ),
      );
      return () => fiber.interruptUnsafe();
    },
    seed(path, input, data, updatedAt) {
      const key = queryKey(path, input);
      const existing = entries.get(key);
      if (existing?.hasData && existing.updatedAt >= updatedAt) return;
      const entry = existing ?? create(path, input, undefined);
      const release = write(entry, data);
      entry.updatedAt = updatedAt;
      notify(entry);
      scheduleGc(entry);
      release();
    },
    dispose() {
      end();
      Effect.runFork(Scope.close(scope, Exit.void));
    },
  };
  for (const feature of merged) {
    const cleanup = feature.attach?.(store);
    if (cleanup)
      Effect.runSync(Scope.addFinalizer(scope, Effect.sync(cleanup)));
  }
  return store;
}
