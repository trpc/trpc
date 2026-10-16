/**
 * Spike C (decision react-use-package): a link cache that lets
 * `use(client.post.byId.query({ id }))` work.
 *
 * A link only sees Effect streams; the promise the caller holds is made by
 * `createTrpcClient`'s `request()`, a new one per call. So the cache owns
 * the outward promise, and `stablePromises()` stands in for the one-line core
 * hook (`request()` returning the cached promise) that shipping this needs.
 */
import { Effect, Option, Stream } from 'effect';
import {
  link,
  type AnyTrpcError,
  type Operation,
  type TrpcLink,
} from 'trpcdev/client';
import { createSerializer } from 'trpcdev/serializer';

/** Keys use danSON, so inputs with `Date`s and `Map`s key apart. */
const keySerializer = createSerializer();

export interface CacheContext {
  /** `true` skips the cache for this call: it neither reads nor fills it. */
  ignoreCache?: boolean;
}

interface Entry {
  readonly promise: Promise<unknown>;
  readonly expiresAt: number;
}

export interface QueryCache {
  /** The cached promise for a call, while fresh. */
  get(path: string, input: unknown): Promise<unknown> | undefined;
  /** The cached promise, or the one `start()` makes, kept until it expires or fails. */
  promise(
    path: string,
    input: unknown,
    start: () => Promise<unknown>,
  ): Promise<unknown>;
  /** Drops entries whose path matches (all when omitted) and tells subscribers. */
  invalidate(match?: (path: string) => boolean): void;
  /** Called after each invalidation; React needs this to re-render with a new promise. */
  subscribe(listener: () => void): () => void;
}

export interface QueryCacheOptions {
  /** @default 30_000 */
  ttlMs?: number;
  now?: () => number;
}

export const keyOf = (path: string, input: unknown): string =>
  `${path}\n${input === undefined ? '' : JSON.stringify(keySerializer.serialize(input))}`;

export function createQueryCache(opts: QueryCacheOptions = {}): QueryCache {
  const ttlMs = opts.ttlMs ?? 30_000;
  const now = opts.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const fresh = (key: string) => {
    const entry = entries.get(key);
    if (entry && entry.expiresAt > now()) return entry;
    entries.delete(key);
    return undefined;
  };
  return {
    get: (path, input) => fresh(keyOf(path, input))?.promise,
    promise(path, input, start) {
      const key = keyOf(path, input);
      const existing = fresh(key);
      if (existing) return existing.promise;
      const promise = start();
      const entry = { promise, expiresAt: now() + ttlMs };
      entries.set(key, entry);
      promise.catch(() => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      return promise;
    },
    invalidate(match) {
      for (const key of entries.keys()) {
        if (!match || match(key.slice(0, key.indexOf('\n'))))
          entries.delete(key);
      }
      for (const listener of listeners) listener();
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
  return link.effect<{ context: CacheContext }>(({ op, next }) => {
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
