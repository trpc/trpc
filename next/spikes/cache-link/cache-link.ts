/**
 * Spike C (decision react-use-package): a link cache that lets
 * `use(client.post.byId.query({ id }))` work.
 *
 * A link only sees Effect streams; the promise the caller holds is made by
 * `createTrpcClient`'s `request()`, a new one per call. So the cache owns
 * the outward promise, and `stablePromises()` stands in for the one-line core
 * hook (`request()` returning the cached promise) that shipping this needs.
 *
 * Like TanStack Query, the cache hands out thenables React reads without
 * suspending once settled, sorts input keys before hashing them, and shares
 * the parts of a refetched value that didn't change (`./share.ts`).
 */
import { Effect, Option, Stream } from 'effect';
import {
  link,
  type AnyTrpcError,
  type Operation,
  type TrpcLink,
} from 'trpcdev/client';
import { createSerializer } from 'trpcdev/serializer';
import {
  fulfilled,
  replaceEqualDeep,
  sortKeys,
  track,
  type Thenable,
} from './share.ts';

/** Keys use danSON, so inputs with `Date`s and `Map`s key apart. */
const keySerializer = createSerializer();

export interface CacheContext {
  /** `true` skips the cache for this call: it neither reads nor fills it. */
  ignoreCache?: boolean;
}

interface Entry {
  readonly thenable: Thenable<unknown>;
  readonly expiresAt: number;
  stale: boolean;
  refetching?: Promise<void>;
}

export interface QueryCache {
  /** The cached thenable for a call, stale or not. */
  get(path: string, input: unknown): Thenable<unknown> | undefined;
  /**
   * The cached thenable, or one for `start()`'s promise. A stale or expired
   * one is still returned while `start()` refetches in the background; the
   * refetched value shares every part equal to the old one, and when it is
   * all equal the thenable stays the same object and nobody is told.
   */
  promise(
    path: string,
    input: unknown,
    start: () => Promise<unknown>,
  ): Thenable<unknown>;
  /** Marks entries whose path matches (all when omitted) stale and tells subscribers. */
  invalidate(match?: (path: string) => boolean): void;
  /** Called after an invalidation and after a refetch that changed a value. */
  subscribe(listener: () => void): () => void;
}

export interface QueryCacheOptions {
  /** @default 30_000 */
  ttlMs?: number;
  now?: () => number;
}

/** Plain objects' keys are sorted first, so `{ a, b }` and `{ b, a }` share an entry. */
export const keyOf = (path: string, input: unknown): string =>
  `${path}\n${input === undefined ? '' : JSON.stringify(keySerializer.serialize(sortKeys(input)))}`;

export function createQueryCache(opts: QueryCacheOptions = {}): QueryCache {
  const ttlMs = opts.ttlMs ?? 30_000;
  const now = opts.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const load = (key: string, start: () => Promise<unknown>) => {
    const entry: Entry = {
      thenable: track(start()),
      expiresAt: now() + ttlMs,
      stale: false,
    };
    entries.set(key, entry);
    entry.thenable.catch(() => {
      if (entries.get(key) === entry) entries.delete(key);
    });
    return entry.thenable;
  };
  const revalidate = (
    key: string,
    entry: Entry,
    start: () => Promise<unknown>,
  ) => {
    if (entry.refetching || entry.thenable.status !== 'fulfilled') return;
    const prev = entry.thenable.value;
    entry.refetching = start().then(
      (value) => {
        if (entries.get(key) !== entry) return;
        const shared = replaceEqualDeep(prev, value);
        entries.set(key, {
          thenable: shared === prev ? entry.thenable : fulfilled(shared),
          expiresAt: now() + ttlMs,
          stale: false,
        });
        if (shared !== prev) notify();
      },
      // A failed refetch keeps the old value; the next read tries again.
      () => {
        entry.refetching = undefined;
      },
    );
  };
  return {
    get: (path, input) => entries.get(keyOf(path, input))?.thenable,
    promise(path, input, start) {
      const key = keyOf(path, input);
      const entry = entries.get(key);
      if (!entry) return load(key, start);
      if (entry.stale || entry.expiresAt <= now())
        revalidate(key, entry, start);
      return entry.thenable;
    },
    invalidate(match) {
      for (const [key, entry] of entries) {
        if (!match || match(key.slice(0, key.indexOf('\n'))))
          entry.stale = true;
      }
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface CacheLinkOptions {
  cache: QueryCache;
  /**
   * Which paths a successful mutation invalidates.
   * @default every path
   */
  invalidates?: (op: Operation) => ((path: string) => boolean) | undefined;
}

/**
 * Serves queries from the cache, so plain `await client.x.query()` calls
 * share results too, and invalidates after mutations.
 */
export function cacheLink(
  opts: CacheLinkOptions,
): TrpcLink<{ context: CacheContext }> {
  const { cache } = opts;
  const invalidates = opts.invalidates ?? (() => undefined);
  return link<{ context: CacheContext }>(({ op, next }) => {
    if (op.type === 'mutation') {
      return next(op).pipe(
        Stream.tap(() => Effect.sync(() => cache.invalidate(invalidates(op)))),
      );
    }
    if (op.type !== 'query' || op.context.ignoreCache) return next(op);
    // The shared request is not aborted with one caller's signal: other
    // callers may hold the same promise.
    const start = () =>
      Effect.runPromise(
        Stream.runHead(next({ ...op, signal: undefined })).pipe(
          Effect.map(Option.getOrUndefined),
        ),
      );
    return Stream.fromEffect(
      Effect.tryPromise({
        try: () => cache.promise(op.path, op.input, start),
        catch: (error) => error as AnyTrpcError,
      }),
    );
  });
}

/**
 * What the core hook would do: `.query()` returns the cached promise, the
 * same object while it is fresh, which is what `use()` needs.
 */
export function stablePromises<T extends object>(
  client: T,
  cache: QueryCache,
): T {
  const wrap = (target: any, path: string[]): any =>
    new Proxy(target, {
      get(obj, key) {
        if (typeof key !== 'string') return obj[key];
        if (key === 'query') {
          return (input: unknown, callOpts?: CacheContext) =>
            callOpts?.ignoreCache
              ? obj.query(input, callOpts)
              : cache.promise(path.join('.'), input, () =>
                  obj.query(input, { ...callOpts, ignoreCache: true }),
                );
        }
        return wrap(obj[key], [...path, key]);
      },
    });
  return wrap(client, []);
}
