import type {
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  QueryClient,
  QueryFunction,
  QueryKey,
} from '@tanstack/react-query';
import { hashKey, isCancelledError } from '@tanstack/react-query';
import { isTRPCClientError } from '@trpc/client';
import type { DecorateRouterKeyable } from '../internals/createOptionsProxy';
import type {
  UnusedSkipTokenTRPCInfiniteQueryOptionsIn,
  UnusedSkipTokenTRPCInfiniteQueryOptionsOut,
} from '../internals/infiniteQueryOptions';
import type {
  UnusedSkipTokenTRPCQueryOptionsIn,
  UnusedSkipTokenTRPCQueryOptionsOut,
} from '../internals/queryOptions';
import type { AnyTRPCQueryKey, ResolverDef } from '../internals/types';
import { readQueryKey } from '../internals/utils';
import { optionsOf, queryClientOf, readProxy } from './entry';
import type { ErrorOf } from './entryError';
import type {
  AnyTRPCHandle,
  EntryQueryOptions,
  HandleType,
  TRPCInfiniteQueryHandle,
  TRPCQueryHandle,
} from './types';

const notAHandle = 'Expected a tRPC handle from `loadHandles()`';

function readHandle(handle: AnyTRPCHandle, prefix: string | undefined) {
  const queryKey = handle?.queryKey as unknown as AnyTRPCQueryKey | undefined;
  if (!Array.isArray(queryKey)) {
    throw new Error(`${notAHandle}, got ${JSON.stringify(handle)}`);
  }
  const data = readQueryKey(queryKey);
  const type = data.args?.type;
  if (type !== 'query' && type !== 'infinite') {
    throw new Error(
      `${notAHandle}, got a key of type ${String(type)} for "${data.path.join('.')}"`,
    );
  }
  if ((data.prefix?.[0] ?? undefined) !== prefix) {
    throw new Error(
      `The handle for "${data.path.join('.')}" was created with keyPrefix ${JSON.stringify(data.prefix?.[0])}, but this proxy uses ${JSON.stringify(prefix)}`,
    );
  }
  return {
    type,
    path: data.path,
    input: data.args?.input,
    queryKey,
  };
}

export function toHandle(options: EntryQueryOptions, type: HandleType) {
  const input = readQueryKey(options.queryKey).args?.input;
  // Next.js rejects `undefined` in `getServerSideProps` / `getStaticProps` props
  const handle: Record<string, unknown> = {
    queryKey: options.queryKey,
    ...(input !== undefined && { input }),
  };
  if (type === 'infinite' && options.initialPageParam != null) {
    handle['initialCursor'] = options.initialPageParam;
  }
  return handle;
}

function isServerEnvironment() {
  return typeof window === 'undefined' || 'Deno' in globalThis;
}

const warnedNotHydrated = new Set<string>();

/** A query's function, of any page param: `warnIfNotHydrated()` passes it on */
type AnyQueryFunction = QueryFunction<unknown, QueryKey, unknown>;

function warnIfNotHydrated(
  path: readonly string[],
  queryFn: AnyQueryFunction,
): AnyQueryFunction {
  return (context) => {
    if (isServerEnvironment()) {
      const queryHash = hashKey(context.queryKey);
      if (!warnedNotHydrated.has(queryHash)) {
        warnedNotHydrated.add(queryHash);
        // oxlint-disable-next-line no-console
        console.warn(
          `[@trpc/tanstack-react-query] The handle for "${path.join('.')}" is being fetched again during server rendering. ` +
            `Unless its data is stale, the query it refers to isn't in this QueryClient. ` +
            `Render the reading component inside <HydrateClient> or <HydrationBoundary>, and don't return handles from server functions or server actions. ` +
            `See https://trpc.io/docs/client/tanstack-react-query/handles#where-handles-dont-work`,
        );
      }
    }
    return queryFn(context);
  };
}

const watchedHydrations = new WeakSet<Promise<unknown>>();

/**
 * A query dehydrated as pending that later rejects reaches the browser as a
 * redacted error, before any `retry` from `fromHandle()` applies. Refetch such
 * a query once so error boundaries see a `TRPCClientError` from this client.
 */
function refetchRejectedHydration(
  queryClient: QueryClient,
  type: HandleType,
  entryOptions: EntryQueryOptions,
) {
  // The options proxy built them for a query of this type
  const options = entryOptions as unknown as FetchQueryOptions & {
    enabled?: boolean | ((query: unknown) => boolean);
  };
  const enabled =
    typeof options.enabled === 'function'
      ? options.enabled
      : () => options.enabled;
  if (isServerEnvironment()) {
    return;
  }
  const query = queryClient
    .getQueryCache()
    .find({ queryKey: options.queryKey, exact: true });
  const promise = query?.promise;
  if (
    !query ||
    !promise ||
    query.state.data !== undefined ||
    query.state.fetchStatus === 'idle' ||
    enabled(query) === false ||
    watchedHydrations.has(promise)
  ) {
    return;
  }
  watchedHydrations.add(promise);
  promise.catch((error: unknown) => {
    if (
      isTRPCClientError(error) ||
      isCancelledError(error) ||
      query.state.fetchStatus !== 'idle' ||
      enabled(query) === false
    ) {
      return;
    }
    const defaulted = queryClient.defaultQueryOptions(options);
    // Older query-core versions take the infinite behavior from the fetch's
    // options, so `query.fetch` would store a bare page there.
    // `fetchInfiniteQuery` skips retries unless asked, unlike a query's fetch
    // in the browser, which retries 3 times by default.
    const refetch =
      type === 'infinite'
        ? queryClient.fetchInfiniteQuery({
            ...(entryOptions as unknown as FetchInfiniteQueryOptions),
            retry: defaulted.retry ?? 3,
          })
        : query.fetch(defaulted);
    refetch.catch(() => {
      // surfaces through the query's state
    });
  });
}

function prepareHandleRead(opts: {
  queryClient: QueryClient;
  handle: ReturnType<typeof readHandle>;
  options: EntryQueryOptions;
}): EntryQueryOptions {
  const { options } = opts;
  if (
    globalThis.process?.env?.['NODE_ENV'] !== 'production' &&
    typeof options.queryFn === 'function'
  ) {
    options.queryFn = warnIfNotHydrated(
      opts.handle.path,
      options.queryFn as AnyQueryFunction,
    );
  }
  refetchRejectedHydration(opts.queryClient, opts.handle.type, options);
  return options;
}

/**
 * Options for a handle: the same options `trpc.<path>.queryOptions(input)` or
 * `trpc.<path>.infiniteQueryOptions(input, opts)` return for the handle's procedure and
 * input. Pass them to `useQuery`, `useSuspenseQuery`, `useSuspenseInfiniteQuery`, etc.
 * `trpc` is the proxy or a router on the handle's path, usually `useTRPC()`.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#reading-a-handle
 */
export function fromHandle<TDef extends ResolverDef, TData = TDef['output']>(
  trpc: DecorateRouterKeyable<NoInfer<TDef['featureFlags']>>,
  handle: TRPCQueryHandle<TDef>,
  opts?: UnusedSkipTokenTRPCQueryOptionsIn<
    NoInfer<TDef['output']>,
    TData,
    ErrorOf<TDef>,
    TDef['featureFlags']
  >,
): UnusedSkipTokenTRPCQueryOptionsOut<
  TDef['output'],
  TData,
  ErrorOf<TDef>,
  TDef['featureFlags']
>;
export function fromHandle<TDef extends ResolverDef, TData = TDef['output']>(
  trpc: DecorateRouterKeyable<NoInfer<TDef['featureFlags']>>,
  handle: TRPCInfiniteQueryHandle<TDef>,
  opts: UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
    TDef['input'],
    NoInfer<TDef['output']>,
    TData,
    ErrorOf<TDef>,
    TDef['featureFlags']
  >,
): UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
  TDef['input'],
  TDef['output'],
  TData,
  ErrorOf<TDef>,
  TDef['featureFlags']
>;
export function fromHandle(
  trpc: unknown,
  rawHandle: AnyTRPCHandle,
  opts?: object,
): unknown {
  const ctx = readProxy(trpc, 'fromHandle');
  const handle = readHandle(rawHandle, ctx.prefix);
  if (!ctx.path.every((segment, index) => handle.path[index] === segment)) {
    throw new Error(
      `\`fromHandle(trpc.${ctx.path.join('.')}, handle)\` got a handle for \`${handle.path.join('.')}\`, which isn't in \`${ctx.path.join('.')}\`. Pass the root proxy, \`trpc\``,
    );
  }
  const procedure = handle.path
    .slice(ctx.path.length)
    .reduce<unknown>(
      (level, segment) => (level as Record<string, unknown>)[segment],
      ctx.proxy,
    );
  const options = optionsOf(procedure, handle.type)(
    handle.input,
    handle.type === 'infinite'
      ? {
          initialCursor: (rawHandle as TRPCInfiniteQueryHandle).initialCursor,
          ...opts,
        }
      : opts,
  );
  return prepareHandleRead({
    queryClient: queryClientOf(ctx),
    handle,
    options,
  });
}
