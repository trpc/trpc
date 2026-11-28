import type { QueryClient, QueryFunction } from '@tanstack/react-query';
import { skipToken } from '@tanstack/react-query';
import type { OperationPipeline } from '@trpc/client/unstable-internals';
import { pipelineContext } from '@trpc/client/unstable-internals';
import type {
  EntryDataRef,
  EntryInputRef,
  QueryEntryState,
} from '@trpc/client/unstable-internals';
import {
  blankInput,
  isReplaced,
  queryEntryState,
  readInputRefs,
  replaceEntryDataRefs,
} from '@trpc/client/unstable-internals';
import type {
  DecorateInfiniteQueryProcedure,
  DecorateQueryProcedure,
} from '../internals/createOptionsProxy';
import type {
  ResolverDef,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
} from '../internals/types';
import { readQueryKey } from '../internals/utils';
import type {
  EntryArgs,
  HandleType,
  PrefetchEntryArgs,
  TRPCEntryKind,
  TRPCInfiniteEntryOptions,
  TRPCInfiniteQueryEntry,
  TRPCQueryEntry,
} from './types';
import { nothing } from './utils';

/**
 * How an entry's first request goes, decided once, when the entry is built.
 * Only a `pipelined` request has what the server needs to make it in
 * another's request, so code that pipelines has to narrow to it first.
 */
export type EntryRequest =
  /** Its input is `skipToken`: no request */
  | { readonly kind: 'skipped' }
  /**
   * A request of its own, which neither goes in another's nor carries
   * others'. For an entry with a `trpc.context` of its own, which a link may
   * route by, or an infinite query that reads its whole input, to which the
   * request adds the cursor
   */
  | { readonly kind: 'alone' }
  /**
   * A request that can go in another's, or carry others' in it: for an
   * infinite query, the request of the first page
   */
  | {
      readonly kind: 'pipelined';
      /** The procedure's path, joined by dots */
      readonly path: string;
      /** The input, with `undefined` for every value the server fills in */
      readonly input: unknown;
      /**
       * The `experimental_dataOf()` values the server fills in. Not a cursor
       * that `initialCursor` takes the place of, nor an infinite query's
       * direction: TanStack Query sets those, and the page would be another
       */
      readonly serverReads: ReadonlySet<EntryInputRef>;
    };

/**
 * The `trpc.context` of a query's options, if it has one of its own: one
 * with a key, symbol keys too, as a link may route by any of them. The one
 * check of it, for an entry and for a handle that is read alike
 */
export function ownContextOf(
  opts: TRPCQueryBaseOptions | undefined,
): Readonly<Record<PropertyKey, unknown>> | null {
  const context = opts?.trpc?.context;
  return context && Reflect.ownKeys(context).length > 0 ? context : null;
}

/** Builds an entry's `EntryRequest`. Pure: it reads only what the entry was built with */
function planRequest(opts: {
  type: HandleType;
  path: string[];
  input: unknown;
  opts: unknown;
  /** Every `experimental_dataOf()` value in the input */
  allRefs: EntryInputRef[];
  /** The ones the query reads: not those that `isReplaced()` */
  refs: EntryInputRef[];
}): EntryRequest {
  const entryOpts = opts.opts as
    | (TRPCQueryBaseOptions & { initialCursor?: unknown })
    | undefined;
  if (opts.input === skipToken) {
    return { kind: 'skipped' };
  }
  if (
    ownContextOf(entryOpts) !== null ||
    (opts.type === 'infinite' &&
      opts.allRefs.some((ref) => ref.to.length === 0))
  ) {
    return { kind: 'alone' };
  }
  let input = replaceEntryDataRefs(opts.input, [], nothing);
  if (opts.type === 'infinite') {
    // The first page's request, as `infiniteQueryOptions()` makes it: its
    // key has the input without `cursor` and `direction`, and the request
    // adds a cursor only if there is one. A `cursor: undefined` is left out,
    // as is one the server fills in, which it writes the key of itself
    const initialCursor = entryOpts?.initialCursor;
    const {
      cursor: inputCursor,
      direction: _direction,
      ...rest
    } = (input ?? {}) as { cursor?: unknown; direction?: unknown };
    const cursor = initialCursor ?? inputCursor;
    input = {
      ...rest,
      ...(cursor !== undefined ? { cursor } : {}),
      direction: 'forward',
    };
  }
  return {
    kind: 'pipelined',
    path: opts.path.join('.'),
    input,
    serverReads: new Set(opts.refs),
  };
}

export const entryState = Symbol('trpc.handleEntry');
export interface EntryState {
  /** The function that built it, for messages */
  fn: string;
  /** The input as it was given, with its `experimental_dataOf()` values */
  input: unknown;
  /** The options as they were given */
  opts: unknown;
  kind: TRPCEntryKind;
  type: HandleType;
  /** The procedure's path */
  path: string[];
  /**
   * The `experimental_dataOf()` values in the entry's input that its query
   * reads: not a cursor that `initialCursor` takes the place of, nor an
   * infinite query's direction, which TanStack Query sets
   */
  refs: EntryInputRef[];
  /**
   * The query's options, with every `experimental_dataOf()` value in the input replaced.
   * Its requests carry `pipeline`, for a link that pipelines.
   */
  options: (opts: {
    dataOfRef: (ref: EntryDataRef) => unknown;
    pipeline: OperationPipeline | null;
  }) => EntryQueryOptions;
  /** How the entry's first request goes, decided when the entry is built */
  request: EntryRequest;
  /**
   * Whether an infinite entry's first cursor is its `initialCursor` option,
   * which takes the place of a cursor in its input
   */
  cursorFromOptions: boolean;
  /** The entry's own `trpc.context`, which its requests go to the links with. `null` for none */
  context: Readonly<Record<PropertyKey, unknown>> | null;
  /** The `QueryClient` of the proxy that built the entry */
  queryClient: QueryClient;
  /** The procedure of the proxy that built the entry */
  procedure: unknown;
  /**
   * What the requests of the proxy that built the entry go through: its
   * request goes in no request of another's
   */
  transport: unknown;
}

export function createEntry(state: EntryState, shared: QueryEntryState) {
  return { [entryState]: state, [queryEntryState]: shared };
}

export function entryStateOf(entry: unknown): EntryState | undefined {
  return (entry as { [entryState]?: EntryState } | null)?.[entryState];
}

export interface ProxyContext {
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

export function transportOf(ctx: ProxyContext): unknown {
  return ctx.proxy['~transport']();
}

/**
 * A query's options, as the options proxy builds them: what a load reads of
 * them. The rest goes to the `QueryClient` as it is.
 */
export interface EntryQueryOptions {
  queryKey: TRPCQueryKey<any>;
  queryFn: QueryFunction<unknown, any, any> | typeof skipToken;
  /** The first page's cursor, of an infinite query */
  initialPageParam?: unknown;
  [option: string]: unknown;
}

/**
 * The options builder of a procedure of the options proxy, which has no
 * types here: its options are `EntryQueryOptions` from here on
 */
export function optionsOf(
  procedure: any,
  type: HandleType,
): (input: unknown, opts: unknown) => EntryQueryOptions {
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

export function entry(opts: {
  fn: string;
  type: HandleType;
  kind: TRPCEntryKind;
  procedure: unknown;
  input: unknown;
  opts: unknown;
}) {
  const ctx = readProxy(opts.procedure, opts.fn);
  const queryOpts = opts.opts as TRPCQueryBaseOptions | undefined;
  const cursorFromOptions =
    opts.type === 'infinite' &&
    (opts.opts as { initialCursor?: unknown } | undefined)?.initialCursor !=
      null;
  const { all: refs, read } = readInputRefs({
    fn: opts.fn,
    type: opts.type,
    input: opts.input,
    cursorFromOptions,
  });
  const trpcOpts = (pipeline: OperationPipeline) => ({
    ...queryOpts?.trpc,
    context: { ...queryOpts?.trpc?.context, ...pipelineContext(pipeline) },
  });
  const options = (input: unknown, pipeline: OperationPipeline | null) =>
    optionsOf(ctx.proxy, opts.type)(
      input,
      pipeline ? { ...queryOpts, trpc: trpcOpts(pipeline) } : opts.opts,
    );
  // Without `experimental_dataOf()` values, a bad input or option throws here, not in the load
  const built = refs.length === 0 ? options(opts.input, null) : null;
  const infiniteOpts = opts.opts as
    | { initialCursor?: unknown; getNextPageParam?: (page: any) => unknown }
    | undefined;
  return createEntry(
    {
      fn: opts.fn,
      input: opts.input,
      opts: opts.opts,
      type: opts.type,
      kind: opts.kind,
      path: ctx.path,
      refs: read,
      options: (optionsOpts) =>
        optionsOpts.pipeline === null && built
          ? built
          : options(
              // What the query doesn't read has no data to fill in
              replaceEntryDataRefs(opts.input, [], (ref) =>
                isReplaced({ type: opts.type, cursorFromOptions }, ref)
                  ? blankInput
                  : optionsOpts.dataOfRef(ref),
              ),
              optionsOpts.pipeline,
            ),
      request: planRequest({
        type: opts.type,
        path: ctx.path,
        input: opts.input,
        opts: opts.opts,
        allRefs: refs,
        refs: read,
      }),
      cursorFromOptions,
      context: ownContextOf(queryOpts),
      queryClient: queryClientOf(ctx),
      procedure: opts.procedure,
      transport: transportOf(ctx),
    },
    {
      type: opts.type,
      path: ctx.path,
      input: opts.input,
      refs: read,
      context: ownContextOf(queryOpts),
      initialCursor:
        opts.type === 'infinite' ? infiniteOpts?.initialCursor : undefined,
      getNextPageParam:
        opts.type === 'infinite'
          ? (infiniteOpts?.getNextPageParam ?? null)
          : null,
    },
  );
}

/**
 * An entry for `loadHandles()` that starts the query without waiting, like
 * `queryClient.prefetchQuery`. A failed request doesn't make the load reject:
 * the error surfaces where the handle is read. It does if another entry reads
 * its data with `experimental_dataOf()`, and a throw as the load starts it,
 * such as from a `staleTime` function, does too. `loadHandlesSettled()` has no
 * result for a prefetch entry, so it rejects in those cases as well. Creating
 * the entry starts nothing.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#prefetch
 */
export function prefetchEntry<TDef extends ResolverDef>(
  procedure: DecorateQueryProcedure<TDef>,
  ...args: PrefetchEntryArgs<TDef>
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
  input: TDef['input'] | typeof skipToken,
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
