import type {
  FetchQueryOptions,
  QueryClient,
  QueryFunction,
  QueryFunctionContext,
} from '@tanstack/react-query';
import { hashKey, isCancelledError, skipToken } from '@tanstack/react-query';
import { isTRPCClientError } from '@trpc/client';
import type { OperationPipeline } from '@trpc/client/unstable-internals';
import { pipelineContext } from '@trpc/client/unstable-internals';
import {
  createOperationPipeline,
  pipeCall,
} from '@trpc/client/unstable-internals';
import type { PipelinePath } from '@trpc/server/unstable-core-do-not-import';
import { readPipelinePath } from '@trpc/server/unstable-core-do-not-import';
import type { DecorateRouterKeyable } from '../internals/createOptionsProxy';
import type {
  UnusedSkipTokenTRPCInfiniteQueryOptionsIn,
  UnusedSkipTokenTRPCInfiniteQueryOptionsOut,
} from '../internals/infiniteQueryOptions';
import type {
  UnusedSkipTokenTRPCQueryOptionsIn,
  UnusedSkipTokenTRPCQueryOptionsOut,
} from '../internals/queryOptions';
import type {
  ResolverDef,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
} from '../internals/types';
import { readQueryKey } from '../internals/utils';
import type { EntryQueryOptions, ProxyContext } from './entry';
import { optionsOf, ownContextOf, queryClientOf, readProxy } from './entry';
import type { ErrorOf } from './entryError';
import { attempt } from './outcome';
import { outcomeOfItem, withPipelinedResult } from './pipelined';
import type {
  AnyTRPCHandle,
  HandleType,
  PerItemQueries,
  TRPCInfiniteQueryHandle,
  TRPCQueryHandle,
  experimental_TRPCInfiniteQueryHandlePerItem,
  experimental_TRPCQueryHandlePerItem,
} from './types';
import { isPlainObject, nothing } from './utils';

export const notAHandle = 'Expected a tRPC handle from `loadHandles()`';

export function readHandle(handle: AnyTRPCHandle, prefix: string | undefined) {
  const queryKey = handle?.queryKey as unknown as TRPCQueryKey<any> | undefined;
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
    // `skipToken` is no value a handle can carry from a loader to a component
    ...(options.queryFn === skipToken && { skipped: true }),
  };
  // `null` too, which is a cursor: no cursor is `undefined`
  if (type === 'infinite' && options.initialPageParam !== undefined) {
    handle['initialCursor'] = options.initialPageParam;
  }
  return handle;
}

export function isServerEnvironment() {
  return typeof window === 'undefined' || 'Deno' in globalThis;
}

export const warnedNotHydrated = new Set<string>();

export function warnIfNotHydrated(
  path: readonly string[],
  queryFn: QueryFunction<any, any, any>,
): QueryFunction<any, any, any> {
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

export const watchedHydrations = new WeakSet<Promise<unknown>>();

/**
 * A query dehydrated as pending that later rejects reaches the browser as a
 * redacted error, before any `retry` from `fromHandle()` applies. Refetch such
 * a query once so error boundaries see a `TRPCClientError` from this client.
 */
export function refetchRejectedHydration(
  queryClient: QueryClient,
  type: HandleType,
  options: any,
) {
  if (isServerEnvironment()) {
    return;
  }
  // With the QueryClient's defaults, which can disable it too
  const defaulted = queryClient.defaultQueryOptions(options);
  const enabled =
    typeof defaulted.enabled === 'function'
      ? defaulted.enabled
      : () => defaulted.enabled;
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
    // Older query-core versions take the infinite behavior from the fetch's
    // options, so `query.fetch` would store a bare page there.
    // `fetchInfiniteQuery` skips retries unless asked, unlike a query's fetch
    // in the browser, which retries 3 times by default.
    const refetch =
      type === 'infinite'
        ? queryClient.fetchInfiniteQuery({
            ...options,
            retry: defaulted.retry ?? 3,
          })
        : query.fetch(defaulted);
    refetch.catch(() => {
      // surfaces through the query's state
    });
  });
}

export function prepareHandleRead<
  TOptions extends { queryFn?: unknown },
>(opts: {
  queryClient: QueryClient;
  handle: ReturnType<typeof readHandle>;
  options: TOptions;
}): TOptions {
  const { options } = opts;
  if (
    globalThis.process?.env?.['NODE_ENV'] !== 'production' &&
    typeof options.queryFn === 'function'
  ) {
    options.queryFn = warnIfNotHydrated(
      opts.handle.path,
      options.queryFn as QueryFunction<any, any, any>,
    );
  }
  refetchRejectedHydration(opts.queryClient, opts.handle.type, options);
  return options;
}

export function withInputAt(
  input: unknown,
  to: readonly string[],
  value: unknown,
) {
  const [key, ...rest] = to;
  if (key === undefined) {
    return value;
  }
  const container: object = Array.isArray(input)
    ? [...input]
    : { ...(input as object | undefined) };
  // Not an assignment, which would set the prototype for a `__proto__` key
  Object.defineProperty(container, key, {
    value: withInputAt((input as any)?.[key], rest, value),
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return container;
}

/** An unfinished handle's input with the parts of `item` in it */
function finishInput(
  unfinished: {
    input: unknown;
    itemInputs: readonly {
      readonly to: readonly string[];
      readonly path: PipelinePath;
    }[];
  },
  item: unknown,
) {
  return unfinished.itemInputs.reduce(
    (input, itemInput) =>
      withInputAt(
        input,
        itemInput.to,
        readPipelinePath(item, itemInput.path, null),
      ),
    unfinished.input,
  );
}

/**
 * The procedure of the options proxy at `path`, from a proxy at `ctx`.
 * `null` if `path` isn't in the part of the router that `ctx` is
 */
function procedureAt(ctx: ProxyContext, path: readonly string[]) {
  if (!ctx.path.every((segment, index) => path[index] === segment)) {
    return null;
  }
  return path
    .slice(ctx.path.length)
    .reduce((level, segment) => level[segment], ctx.proxy);
}

/**
 * The handle of one item's query, from the handle of an `experimental_entryPerItem()` entry.
 * Read it with `fromHandle(trpc, handle)`, like any handle.
 *
 * It works for any item of the list's kind, also one the load didn't have, such
 * as an item on a later page. Its query then loads when it is read.
 *
 * It also finishes the handle of an `experimental_dataOf(entry, (data) => entry)`
 * entry, with that entry's data.
 * @example
 * ```tsx
 * <AuthorName author={experimental_handleOfItem(handles.authors, post)} />
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#entry-per-item
 */
export function experimental_handleOfItem<TDef extends ResolverDef, TItem>(
  handle: experimental_TRPCQueryHandlePerItem<TDef, TItem>,
  item: NoInfer<TItem>,
): TRPCQueryHandle<TDef>;
export function experimental_handleOfItem<TDef extends ResolverDef, TItem>(
  handle: experimental_TRPCInfiniteQueryHandlePerItem<TDef, TItem>,
  item: NoInfer<TItem>,
): TRPCInfiniteQueryHandle<TDef>;
export function experimental_handleOfItem(
  handle: unknown,
  item: unknown,
): unknown {
  const perItem = handle as {
    queryKey?: unknown[];
    input?: unknown;
    initialCursor?: unknown;
    itemInputs?: { to: string[]; path: PipelinePath }[];
    experimental_perItem?: unknown;
    skipped?: true;
  } | null;
  if (!Array.isArray(perItem?.queryKey) || !Array.isArray(perItem.itemInputs)) {
    throw new Error(
      `Expected the handle of an entry from \`experimental_entryPerItem()\`, or from \`experimental_dataOf()\` with a callback, got ${JSON.stringify(handle)}`,
    );
  }
  const filled = finishInput(
    { input: perItem.input, itemInputs: perItem.itemInputs },
    item,
  );
  const args = perItem.queryKey[perItem.queryKey.length - 1] as {
    type?: unknown;
  };
  // An infinite query's key has no cursor: it is the handle's `initialCursor`,
  // as `infiniteQueryOptions()` takes it from the input
  const infinite = args.type === 'infinite' && isPlainObject(filled);
  const {
    cursor,
    direction: _,
    ...withoutCursor
  }: Record<string, unknown> = infinite ? filled : {};
  const input = infinite ? withoutCursor : filled;
  const initialCursor =
    perItem.initialCursor !== undefined ? perItem.initialCursor : cursor;
  return {
    queryKey: [...perItem.queryKey.slice(0, -1), { ...args, input }],
    ...(input !== undefined && { input }),
    ...(initialCursor !== undefined && { initialCursor }),
    // An item of an entry whose input is `skipToken` is skipped too
    ...(perItem.skipped && { skipped: true }),
    // What the items of its own list load, if it is a list
    ...(perItem.experimental_perItem !== undefined && {
      experimental_perItem: perItem.experimental_perItem,
    }),
  };
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
  opts?: TRPCQueryBaseOptions,
): unknown {
  const ctx = readProxy(trpc, 'fromHandle');
  if ('itemInputs' in rawHandle) {
    throw new Error(
      `\`fromHandle()\` got a handle that isn't finished: its input needs an item or another entry's data. Pass it through \`experimental_handleOfItem(handle, item)\` first`,
    );
  }
  const handle = readHandle(rawHandle, ctx.prefix);
  const procedure = procedureAt(ctx, handle.path);
  if (procedure === null) {
    throw new Error(
      `\`fromHandle(trpc.${ctx.path.join('.')}, handle)\` got a handle for \`${handle.path.join('.')}\`, which isn't in \`${ctx.path.join('.')}\`. Pass the root proxy, \`trpc\``,
    );
  }
  const firstCursor = (rawHandle as TRPCInfiniteQueryHandle).initialCursor;
  const readOpts =
    handle.type === 'infinite' ? { initialCursor: firstCursor, ...opts } : opts;
  // `infiniteQueryOptions()` takes a `null` `initialCursor` for none. A `null`
  // cursor goes in the input instead, which the query key leaves out
  const input =
    handle.type === 'infinite' && firstCursor === null
      ? { ...(handle.input as object | undefined), cursor: null }
      : handle.input;
  const options = optionsOf(procedure, handle.type)(
    rawHandle.skipped ? skipToken : input,
    readOpts,
  );
  // Not for a read with a `trpc.context` of its own, which a link may route
  // by: the items' calls would go where the list goes
  const itemQueries =
    ownContextOf(readOpts) === null
      ? readItemQueries(ctx, rawHandle.experimental_perItem ?? [])
      : [];
  return prepareHandleRead({
    queryClient: queryClientOf(ctx),
    handle,
    options:
      itemQueries.length > 0 && typeof options.queryFn === 'function'
        ? withItemQueries({
            ctx,
            itemQueries,
            options,
            // The request of one fetch, which a link that pipelines marks
            optionsWith: (pipeline) =>
              optionsOf(procedure, handle.type)(input, {
                ...readOpts,
                trpc: {
                  ...readOpts?.trpc,
                  context: {
                    ...readOpts?.trpc?.context,
                    ...pipelineContext(pipeline),
                  },
                },
              }),
          })
        : options,
  });
}

/**
 * What an `experimental_entryPerItem()` entry loads for each item of a list,
 * as a later fetch of the list loads it: read once, as the handle is read
 */
interface ItemQueries {
  /** The procedure of the options proxy the items' queries are of */
  procedure: any;
  path: string;
  /** The input, without the parts that come from an item */
  input: unknown;
  itemInputs: readonly { readonly to: string[]; readonly path: PipelinePath }[];
  list: readonly string[];
  itemRead: readonly string[];
}

/**
 * The item queries a handle's list loads in its later fetches. Not one whose
 * input is `skipToken`, for which an item has nothing to load; nor one that
 * reads nothing of its item, which every row loads once, when it reads it;
 * nor one whose procedure isn't in the part of the router `ctx` is
 */
function readItemQueries(
  ctx: ProxyContext,
  perItem: readonly PerItemQueries[],
): ItemQueries[] {
  return perItem.flatMap((queries) => {
    if (queries.skipped || queries.itemInputs.length === 0) {
      return [];
    }
    const { path } = readQueryKey(queries.queryKey);
    const procedure = procedureAt(ctx, path);
    return procedure === null
      ? []
      : [
          {
            procedure,
            path: path.join('.'),
            input: queries.input,
            itemInputs: queries.itemInputs,
            list: queries.list,
            itemRead: queries.itemRead,
          },
        ];
  });
}

/**
 * Makes every fetch of a list also load what its items load, in the same
 * request, when the link pipelines. Each item's query is then in the cache
 * when the item's component reads it.
 */
export function withItemQueries(opts: {
  ctx: ProxyContext;
  itemQueries: readonly ItemQueries[];
  options: any;
  /** The list's options, with a pipeline on their requests */
  optionsWith: (pipeline: OperationPipeline) => any;
}) {
  const queryClient = queryClientOf(opts.ctx);
  return {
    ...opts.options,
    queryFn: (context: QueryFunctionContext<any, any>) => {
      const pipeline = createOperationPipeline();
      const list: Promise<unknown> = Promise.resolve(
        opts.optionsWith(pipeline).queryFn(context),
      );
      for (const queries of opts.itemQueries) {
        // One call, which the server runs for every item of the list. Without
        // a link that took the list into a batch, the items load when they
        // are read
        const call = pipeCall({
          path: queries.path,
          input: queries.input,
          reads: {
            each: { from: pipeline, path: [...queries.list] },
            // From the element: the item is `itemRead` of it
            reads: queries.itemInputs.map((itemInput) => ({
              kind: 'item',
              to: itemInput.to,
              path: [...queries.itemRead, ...itemInput.path],
            })),
          },
        });
        if (!call) {
          continue;
        }
        // Before the list's data reaches the components that read the items
        void list.then((data) => {
          const listData = readPipelinePath(data, queries.list, null);
          for (const [index, element] of Array.isArray(listData)
            ? listData.entries()
            : []) {
            const item = readPipelinePath(element, [...queries.itemRead], null);
            // A row whose query can't start, such as for an input no query
            // key can hold, fails by itself: the row that reads it gets that
            // error, and the others load
            void attempt(() =>
              queryClient.prefetchQuery(
                withPipelinedResult({
                  options: optionsOf(queries.procedure, 'query')(
                    finishInput(queries, item),
                    undefined,
                  ),
                  result: outcomeOfItem(call, [index]),
                  // The server filled in the inputs from the same list
                  sameInput: () => Promise.resolve(true),
                }) as unknown as FetchQueryOptions,
              ),
            );
          }
        }, nothing);
      }
      return list;
    },
  };
}
