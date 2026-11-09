import {
  noop,
  type QueryClient,
  type QueryExecuteOptions,
} from '@tanstack/query-core';
import type { TrpcQueryKey } from './keys.ts';

declare const handleTypes: unique symbol;

/**
 * The types a {@link TrpcQueryHandle} carries: the procedure's input, the
 * data its query caches, its error and the context its links read.
 * @since 0.1.0
 * @stability stable
 */
export interface QueryHandleTypes {
  input: unknown;
  data: unknown;
  error: unknown;
  context: unknown;
}

/**
 * A serializable reference to a query a loader or a server component
 * started: its key and input, no data and no functions, so it can be a
 * loader's data or a client component's prop. Read it with
 * `trpc.$fromHandle(handle)`.
 * @since 0.1.0
 * @stability stable
 */
export interface TrpcQueryHandle<
  TTypes extends QueryHandleTypes = QueryHandleTypes,
> {
  /**
   * Type-only, never present at runtime. Required, so only `$prefetch()`,
   * `$ensure()` and `$fetch()` make handles.
   */
  readonly [handleTypes]: TTypes;
  /** The query's key, typed by the input so serializers can check it. */
  readonly queryKey: readonly [
    path: readonly string[],
    opts: { input?: TTypes['input']; type: 'query' },
  ];
  /** The input the query started with. Absent when it's `undefined`. */
  readonly input: TTypes['input'];
}

/**
 * TanStack's options the handle verbs take, next to `input` and `context`.
 * @since 0.1.0
 * @stability stable
 */
export type HandleOptions = Pick<
  QueryExecuteOptions,
  'staleTime' | 'gcTime' | 'retry' | 'retryDelay' | 'meta'
>;

/** @internal */
export type HandleVerb = '$prefetch' | '$ensure' | '$fetch';

/** @internal */
export type QueryClientOption = QueryClient | (() => QueryClient);

/**
 * Starts a query and returns its handle: right away for `$prefetch`, once
 * the cache has data for `$ensure`, and once the data is fresh for `$fetch`.
 * @internal
 */
export function startHandle(opts: {
  readonly queryClient: QueryClient;
  readonly verb: HandleVerb;
  readonly options: { queryKey: TrpcQueryKey };
}): TrpcQueryHandle | Promise<TrpcQueryHandle> {
  const queryKey = opts.options.queryKey;
  const input = queryKey[1]?.input;
  // Next.js rejects `undefined` in `getServerSideProps` and `getStaticProps` props
  const handle = {
    queryKey,
    ...(input !== undefined && { input }),
  } as unknown as TrpcQueryHandle;
  const queryClient = opts.queryClient;
  const options = opts.options as QueryExecuteOptions;
  switch (opts.verb) {
    case '$prefetch':
      queryClient.query(options).catch(noop);
      return handle;
    case '$ensure': {
      if (queryClient.getQueryData(queryKey) !== undefined) {
        // Cached data resolves now; `query()` refetches it only when stale.
        queryClient.query(options).catch(noop);
        return Promise.resolve(handle);
      }
      return queryClient.query(options).then(() => handle);
    }
    case '$fetch':
      return queryClient.query(options).then(() => handle);
  }
}

const notAHandle = (handle: unknown, why: string) =>
  new TypeError(
    `$fromHandle() expects a handle from $prefetch(), $ensure() or $fetch(), got ${why}: ${JSON.stringify(handle)}`,
  );

/**
 * The procedure path and input a handle refers to, checked against this
 * helper's `keyPrefix`.
 * @internal
 */
export function readHandle(
  handle: unknown,
  keyPrefix: string | undefined,
): { readonly path: readonly string[]; readonly input: unknown } {
  const queryKey = (handle as { queryKey?: unknown } | null)?.queryKey;
  if (!Array.isArray(queryKey) || !Array.isArray(queryKey[0])) {
    throw notAHandle(handle, 'no query key');
  }
  const key = queryKey as unknown as TrpcQueryKey;
  if (key[1]?.type !== 'query') {
    throw notAHandle(handle, `a key of type ${String(key[1]?.type)}`);
  }
  const path = key[0];
  if (keyPrefix === undefined) return { path, input: key[1].input };
  if (path[0] !== keyPrefix) {
    throw new TypeError(
      `The handle for "${path.join('.')}" has no keyPrefix "${keyPrefix}", which these helpers use`,
    );
  }
  return { path: path.slice(1), input: key[1].input };
}
