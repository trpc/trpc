import type { QueryClient } from '@tanstack/react-query';
import type {
  DecorateInfiniteQueryProcedure,
  DecorateQueryProcedure,
} from '../internals/createOptionsProxy';
import type { ResolverDef, TRPCQueryKey } from '../internals/types';
import { readQueryKey } from '../internals/utils';
import type {
  AnyTRPCEntry,
  EntryArgs,
  HandleType,
  TRPCEntryKind,
  TRPCInfiniteEntryOptions,
  TRPCInfiniteQueryEntry,
  TRPCQueryEntry,
} from './types';

const entryState = Symbol('trpc.handleEntry');

export interface EntryState {
  kind: TRPCEntryKind;
  type: HandleType;
  options: any;
  /** The `QueryClient` of the proxy that built the entry */
  queryClient: QueryClient;
}

function createEntry(state: EntryState) {
  return { [entryState]: state };
}

export function readEntry(key: string, entry: AnyTRPCEntry): EntryState {
  const state = (entry as { [entryState]?: EntryState } | null)?.[entryState];
  if (!state) {
    throw new Error(
      `Expected an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, or \`skipToken\`, for "${key}", got ${JSON.stringify(entry)}`,
    );
  }
  return state;
}

interface ProxyContext {
  proxy: any;
  path: string[];
  prefix: string | undefined;
}

export function readProxy(proxy: unknown, fn: string): ProxyContext {
  const queryKey = (proxy as { queryKey?: unknown } | null)?.queryKey;
  if (Array.isArray(queryKey)) {
    throw new Error(
      `\`${fn}()\` expects a tRPC options proxy or one of its procedures, got a handle for \`${readQueryKey(queryKey as TRPCQueryKey<any>).path.join('.')}\``,
    );
  }
  if (typeof queryKey !== 'function') {
    throw new Error(
      `\`${fn}()\` expects a tRPC options proxy or one of its procedures, got ${String(proxy)}`,
    );
  }
  const key = readQueryKey(queryKey());
  return {
    proxy,
    path: key.path,
    prefix: key.prefix?.[0],
  };
}

export function queryClientOf(ctx: ProxyContext): QueryClient {
  return ctx.proxy['~queryClient']();
}

export function optionsOf(
  procedure: any,
  type: HandleType,
): (input: unknown, opts: unknown) => any {
  return type === 'infinite'
    ? procedure.infiniteQueryOptions
    : procedure.queryOptions;
}

export function readRoot(trpc: unknown, fn: string) {
  const ctx = readProxy(trpc, fn);
  if (ctx.path.length > 0) {
    throw new Error(
      `\`${fn}()\` takes the root proxy, \`trpc\`, got \`trpc.${ctx.path.join('.')}\``,
    );
  }
  return ctx;
}

function entry(opts: {
  fn: string;
  type: HandleType;
  kind: TRPCEntryKind;
  procedure: unknown;
  input: unknown;
  opts: unknown;
}) {
  const ctx = readProxy(opts.procedure, opts.fn);
  return createEntry({
    type: opts.type,
    kind: opts.kind,
    options: optionsOf(ctx.proxy, opts.type)(opts.input, opts.opts),
    queryClient: queryClientOf(ctx),
  });
}

/**
 * An entry for `loadHandles()` that starts the query without waiting, like
 * `queryClient.prefetchQuery`. It never makes the load reject: errors surface where
 * the handle is read. Creating the entry starts nothing.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#prefetch
 */
export function prefetchEntry<TDef extends ResolverDef>(
  procedure: DecorateQueryProcedure<TDef>,
  ...args: EntryArgs<TDef>
): TRPCQueryEntry<TDef, 'prefetch'>;
export function prefetchEntry(
  procedure: unknown,
  input?: unknown,
  opts?: unknown,
): unknown {
  return entry({
    fn: 'prefetchEntry',
    type: 'query',
    kind: 'prefetch',
    procedure,
    input,
    opts,
  });
}

/**
 * An entry for `loadHandles()` that waits for fresh data, like `queryClient.fetchQuery`:
 * cached data is used only if it isn't stale. The load rejects if the request fails.
 * Creating the entry starts nothing.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#fetch
 */
export function fetchEntry<TDef extends ResolverDef>(
  procedure: DecorateQueryProcedure<TDef>,
  ...args: EntryArgs<TDef>
): TRPCQueryEntry<TDef, 'fetch'>;
export function fetchEntry(
  procedure: unknown,
  input?: unknown,
  opts?: unknown,
): unknown {
  return entry({
    fn: 'fetchEntry',
    type: 'query',
    kind: 'fetch',
    procedure,
    input,
    opts,
  });
}

/**
 * An entry for `loadHandles()` that uses any cached data, even stale, like
 * `queryClient.ensureQueryData({ revalidateIfStale: true })`. It fetches and waits only
 * when the cache has no data, and the load rejects if that request fails. Stale data is
 * refetched in the background. Creating the entry starts nothing.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#ensure
 */
export function ensureEntry<TDef extends ResolverDef>(
  procedure: DecorateQueryProcedure<TDef>,
  ...args: EntryArgs<TDef>
): TRPCQueryEntry<TDef, 'ensure'>;
export function ensureEntry(
  procedure: unknown,
  input?: unknown,
  opts?: unknown,
): unknown {
  return entry({
    fn: 'ensureEntry',
    type: 'query',
    kind: 'ensure',
    procedure,
    input,
    opts,
  });
}

/**
 * Like `prefetchEntry`, for an infinite query. Loads the first page unless `pages` is set.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
 */
export function prefetchInfiniteEntry<TDef extends ResolverDef>(
  procedure: DecorateInfiniteQueryProcedure<TDef>,
  input: TDef['input'],
  opts?: TRPCInfiniteEntryOptions<TDef>,
): TRPCInfiniteQueryEntry<TDef, 'prefetch'> {
  return entry({
    fn: 'prefetchInfiniteEntry',
    type: 'infinite',
    kind: 'prefetch',
    procedure,
    input,
    opts,
  }) as any;
}

/**
 * Like `fetchEntry`, for an infinite query.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
 */
export function fetchInfiniteEntry<TDef extends ResolverDef>(
  procedure: DecorateInfiniteQueryProcedure<TDef>,
  input: TDef['input'],
  opts?: TRPCInfiniteEntryOptions<TDef>,
): TRPCInfiniteQueryEntry<TDef, 'fetch'> {
  return entry({
    fn: 'fetchInfiniteEntry',
    type: 'infinite',
    kind: 'fetch',
    procedure,
    input,
    opts,
  }) as any;
}

/**
 * Like `ensureEntry`, for an infinite query.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
 */
export function ensureInfiniteEntry<TDef extends ResolverDef>(
  procedure: DecorateInfiniteQueryProcedure<TDef>,
  input: TDef['input'],
  opts?: TRPCInfiniteEntryOptions<TDef>,
): TRPCInfiniteQueryEntry<TDef, 'ensure'> {
  return entry({
    fn: 'ensureInfiniteEntry',
    type: 'infinite',
    kind: 'ensure',
    procedure,
    input,
    opts,
  }) as any;
}
