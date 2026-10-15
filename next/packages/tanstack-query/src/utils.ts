import {
  experimental_streamedQuery as streamedQuery,
  skipToken,
  type DataTag,
  type InfiniteData,
  type InfiniteQueryObserverOptions,
  type MutationObserverOptions,
  type QueryFilters,
  type QueryFunction,
  type QueryFunctionContext,
  type QueryObserverOptions,
  type SkipToken,
} from '@tanstack/query-core';
import { structuralSharing } from './sharing.ts';
import type { RouterOf, TrpcClient } from 'trpcdev/client';
import {
  pathKey,
  procedureKey,
  type TrpcMutationKey,
  type TrpcQueryKey,
} from './keys.ts';
import type {
  SubscriptionCallbacks,
  TrpcSubscriptionOptions,
} from './subscription.ts';

type AnyFn = (...args: any[]) => any;
type NonUndefined<T> = T extends undefined ? never : T;

type InputOf<F> = F extends (input: infer I, ...rest: any[]) => any ? I : never;
type ContextOf<F> = F extends (input: any, opts?: infer O) => any
  ? Omit<NonNullable<O>, 'signal' | 'lastEventId'>
  : never;
type OutputOf<F> = F extends (...args: any[]) => PromiseLike<infer T>
  ? T
  : never;
type ErrorOf<F> = F extends (...args: any[]) => infer R
  ? R extends { readonly '~error'?: infer E }
    ? NonNullable<E>
    : unknown
  : unknown;
type EventOf<F> = F extends (...args: any[]) => AsyncIterable<infer T>
  ? T
  : never;

/**
 * The data a query caches: its output, or the chunks so far when the output
 * is an `AsyncIterable` (they stream into the cache as they arrive).
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type QueryData<TOutput> =
  TOutput extends AsyncIterable<infer TChunk> ? TChunk[] : TOutput;

/**
 * A query key tagged with its data and error types, so
 * `queryClient.getQueryData(key)` is typed.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TrpcQueryKeyFor<TData, TError> = DataTag<
  TrpcQueryKey,
  TData,
  TError
>;

type InputBag<TInput> = undefined extends TInput
  ? { input?: TInput | SkipToken }
  : { input: TInput | SkipToken };
type ContextBag<TContext> = {
  /**
   * The call option fields links read (17 F-B), typed from what the
   * client's links declare. A bag here, so they can't collide with
   * TanStack's options.
   */
  context?: TContext | undefined;
};
type BagArgs<TInput, TOpts> = undefined extends TInput
  ? [opts?: InputBag<TInput> & TOpts]
  : [opts: InputBag<TInput> & TOpts];
type KeyArgs<TInput> = undefined extends TInput
  ? [opts?: { input?: TInput | SkipToken }]
  : [opts: { input: TInput | SkipToken }];

/**
 * TanStack's query options, minus what tRPC fills in.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type QueryOptionsIn<TQueryFnData, TError, TData> = Omit<
  QueryObserverOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryFnData,
    TrpcQueryKeyFor<TQueryFnData, TError>
  >,
  'queryKey' | 'queryFn'
>;

/**
 * What `queryOptions()` returns: pass it to `useQuery`, `prefetchQuery`,
 * `fetchQuery` and friends in any TanStack adapter.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type QueryOptionsOut<TQueryFnData, TError, TData> = Omit<
  QueryOptionsIn<TQueryFnData, TError, TData>,
  'enabled' | 'initialData'
> & {
  /** A boolean, so the options fit every adapter (Vue has no `(query) => boolean`). */
  enabled?: boolean;
  queryKey: TrpcQueryKeyFor<TQueryFnData, TError>;
  queryFn: QueryFunction<TQueryFnData, TrpcQueryKeyFor<TQueryFnData, TError>>;
};

type DefinedInitialData<TQueryFnData> = {
  initialData: NonUndefined<TQueryFnData> | (() => NonUndefined<TQueryFnData>);
};

type InfiniteKey<TOutput, TError, TPageParam> = TrpcQueryKeyFor<
  InfiniteData<TOutput, TPageParam>,
  TError
>;

/**
 * TanStack's infinite query options, minus what tRPC fills in.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type InfiniteOptionsIn<TOutput, TError, TData, TPageParam> = Omit<
  InfiniteQueryObserverOptions<
    TOutput,
    TError,
    TData,
    InfiniteKey<TOutput, TError, TPageParam>,
    TPageParam
  >,
  'queryKey' | 'queryFn'
>;

/**
 * What `infiniteOptions()` returns, for `useInfiniteQuery` and
 * `prefetchInfiniteQuery`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type InfiniteOptionsOut<TOutput, TError, TData, TPageParam> = Omit<
  InfiniteOptionsIn<TOutput, TError, TData, TPageParam>,
  'enabled' | 'initialData'
> & {
  enabled?: boolean;
  queryKey: InfiniteKey<TOutput, TError, TPageParam>;
  queryFn: QueryFunction<
    TOutput,
    InfiniteKey<TOutput, TError, TPageParam>,
    TPageParam
  >;
};

/**
 * A mutation's variables: optional when the input is.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type MutationVariables<TInput> = undefined extends TInput
  ? TInput | void
  : TInput;

/**
 * TanStack's mutation options, minus what tRPC fills in.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type MutationOptionsIn<TInput, TOutput, TError, TOnMutateResult> = Omit<
  MutationObserverOptions<
    TOutput,
    TError,
    MutationVariables<TInput>,
    TOnMutateResult
  >,
  'mutationKey' | 'mutationFn'
>;

/**
 * What `mutationOptions()` returns, for `useMutation`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type MutationOptionsOut<TInput, TOutput, TError, TOnMutateResult> =
  MutationOptionsIn<TInput, TOutput, TError, TOnMutateResult> & {
    mutationKey: TrpcMutationKey;
    mutationFn: (input: MutationVariables<TInput>) => Promise<TOutput>;
  };

/**
 * How `streamedOptions()` keeps events.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface StreamedOptions {
  /**
   * On refetch: `'reset'` clears the events, `'append'` keeps them and adds
   * new ones, `'replace'` swaps them once the new stream ends.
   * @default 'reset'
   */
  refetchMode?: 'append' | 'reset' | 'replace' | undefined;
  /** Keeps only the newest events. */
  maxChunks?: number | undefined;
}

/**
 * Filters for `queryClient.invalidateQueries()` and friends, minus the key.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type QueryFiltersIn = Omit<QueryFilters, 'queryKey'>;

/**
 * Keys and filters available on every router and procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface PathUtils {
  /**
   * A key that partially matches everything under this path: queries,
   * infinite queries, streamed and live queries, and mutations.
   */
  pathKey(): TrpcQueryKey;
  /** Filters for everything under this path. */
  pathFilter(
    filters?: QueryFiltersIn,
  ): QueryFiltersIn & { queryKey: TrpcQueryKey };
}

/**
 * The TanStack helpers for a query procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface QueryProcedureUtils<
  TInput,
  TOutput,
  TError,
  TContext,
> extends PathUtils {
  /**
   * Options for `useQuery`, `useSuspenseQuery`, `prefetchQuery`, … in any
   * TanStack adapter. `input: skipToken` disables the query.
   *
   * @example
   * ```ts
   * useQuery(trpc.post.byId.queryOptions({ input: { id }, staleTime: 1000 }));
   * ```
   */
  queryOptions<TData = QueryData<TOutput>>(
    opts: InputBag<TInput> &
      ContextBag<TContext> &
      QueryOptionsIn<QueryData<TOutput>, TError, TData> &
      DefinedInitialData<QueryData<TOutput>>,
  ): QueryOptionsOut<QueryData<TOutput>, TError, TData> &
    DefinedInitialData<QueryData<TOutput>>;
  queryOptions<TData = QueryData<TOutput>>(
    ...args: BagArgs<
      TInput,
      ContextBag<TContext> & QueryOptionsIn<QueryData<TOutput>, TError, TData>
    >
  ): QueryOptionsOut<QueryData<TOutput>, TError, TData>;
  /** The exact key `queryOptions()` uses. Typed for `getQueryData`. */
  queryKey(
    ...args: KeyArgs<TInput>
  ): TrpcQueryKeyFor<QueryData<TOutput>, TError>;
  /**
   * Filters for this procedure's queries: every input, or just `input`.
   *
   * @example
   * ```ts
   * await queryClient.invalidateQueries(trpc.post.byId.queryFilter());
   * ```
   */
  queryFilter(opts?: { input?: TInput } & QueryFiltersIn): QueryFiltersIn & {
    queryKey: TrpcQueryKeyFor<QueryData<TOutput>, TError>;
  };
  /**
   * Options for `useInfiniteQuery`. `input` maps the page param to the
   * procedure's input. Annotate it when `initialPageParam` is `undefined`.
   *
   * @example
   * ```ts
   * useInfiniteQuery(
   *   trpc.post.list.infiniteOptions({
   *     input: (cursor: string | undefined) => ({ limit: 10, cursor }),
   *     initialPageParam: undefined,
   *     getNextPageParam: (page) => page.nextCursor,
   *   }),
   * );
   * ```
   */
  infiniteOptions<TPageParam, TData = InfiniteData<TOutput, TPageParam>>(
    opts: {
      input: ((pageParam: TPageParam) => TInput) | SkipToken;
    } & ContextBag<TContext> &
      InfiniteOptionsIn<TOutput, TError, TData, TPageParam>,
  ): InfiniteOptionsOut<TOutput, TError, TData, TPageParam>;
  /** The exact key `infiniteOptions()` uses. */
  infiniteKey<TPageParam>(opts: {
    input: ((pageParam: TPageParam) => TInput) | SkipToken;
    initialPageParam: TPageParam;
  }): InfiniteKey<TOutput, TError, TPageParam>;
}

/**
 * The TanStack helpers for a mutation procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface MutationProcedureUtils<
  TInput,
  TOutput,
  TError,
  TContext,
> extends PathUtils {
  /**
   * Options for `useMutation`.
   *
   * @example
   * ```ts
   * useMutation(
   *   trpc.post.create.mutationOptions({
   *     onSuccess: () => queryClient.invalidateQueries(trpc.post.pathFilter()),
   *   }),
   * );
   * ```
   */
  mutationOptions<TOnMutateResult = unknown>(
    opts?: ContextBag<TContext> &
      MutationOptionsIn<TInput, TOutput, TError, TOnMutateResult>,
  ): MutationOptionsOut<TInput, TOutput, TError, TOnMutateResult>;
  /** The key `mutationOptions()` uses, for `useIsMutating` and filters. */
  mutationKey(): TrpcMutationKey;
}

/**
 * The TanStack helpers for a subscription procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface SubscriptionProcedureUtils<
  TInput,
  TEvent,
  TError,
  TContext,
> extends PathUtils {
  /**
   * Options for a framework's `useSubscription` (or a
   * `SubscriptionObserver`): the latest event plus callbacks, outside the
   * query cache.
   *
   * @example
   * ```ts
   * const sub = useSubscription(
   *   trpc.post.onAdd.subscriptionOptions({ onData: (post) => toast(post.title) }),
   * );
   * ```
   */
  subscriptionOptions(
    ...args: BagArgs<
      TInput,
      ContextBag<TContext> & {
        /** @default true, or `false` when `input` is `skipToken` */
        enabled?: boolean | undefined;
      } & SubscriptionCallbacks<TEvent, TError>
    >
  ): TrpcSubscriptionOptions<TEvent, TError>;
  /**
   * Query options whose data is every event so far, built on TanStack's
   * `streamedQuery`. The subscription closes when no observer is left.
   *
   * @example
   * ```ts
   * const { data: messages } = useQuery(
   *   trpc.chat.onMessage.streamedOptions({ input: { room }, maxChunks: 100 }),
   * );
   * ```
   */
  streamedOptions<TData = TEvent[]>(
    ...args: BagArgs<
      TInput,
      ContextBag<TContext> &
        StreamedOptions &
        QueryOptionsIn<TEvent[], TError, TData>
    >
  ): QueryOptionsOut<TEvent[], TError, TData>;
  /** The exact key `streamedOptions()` uses. */
  streamedKey(...args: KeyArgs<TInput>): TrpcQueryKeyFor<TEvent[], TError>;
  /**
   * Query options whose data is the latest event. The subscription closes
   * when no observer is left.
   *
   * @example
   * ```ts
   * const { data: price } = useQuery(
   *   trpc.price.onTick.liveOptions({ input: { symbol: 'TRPC' } }),
   * );
   * ```
   */
  liveOptions<TData = TEvent>(
    ...args: BagArgs<
      TInput,
      ContextBag<TContext> & QueryOptionsIn<TEvent, TError, TData>
    >
  ): QueryOptionsOut<TEvent, TError, TData>;
  /** The exact key `liveOptions()` uses. */
  liveKey(...args: KeyArgs<TInput>): TrpcQueryKeyFor<TEvent, TError>;
}

/**
 * The TanStack helpers for a client: one entry per router and procedure,
 * typed from the client's methods.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TrpcQueryUtils<TClient> = PathUtils & {
  [K in keyof TClient]: TClient[K] extends { query: infer F extends AnyFn }
    ? QueryProcedureUtils<InputOf<F>, OutputOf<F>, ErrorOf<F>, ContextOf<F>>
    : TClient[K] extends { mutate: infer F extends AnyFn }
      ? MutationProcedureUtils<
          InputOf<F>,
          OutputOf<F>,
          ErrorOf<F>,
          ContextOf<F>
        >
      : TClient[K] extends { subscribe: infer F extends AnyFn }
        ? SubscriptionProcedureUtils<
            InputOf<F>,
            EventOf<F>,
            ErrorOf<F>,
            ContextOf<F>
          >
        : TrpcQueryUtils<TClient[K]>;
};

/**
 * The helpers for a router type, `routerType()` value or contract, for
 * when there is no client value to infer them from (context helpers).
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TrpcQueryUtilsFor<
  TRouter,
  TContext extends object = {},
> = TrpcQueryUtils<TrpcClient<RouterOf<TRouter>, TContext>>;

/**
 * Options for {@link createTrpcQueryUtils}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface CreateTrpcQueryUtilsOptions<TClient> {
  /**
   * A typed client: `createTrpcClient(...)` in the browser, or
   * `createRouterClient(router, { ctx })` to prefetch on the server.
   */
  client: TClient;
  /**
   * Puts this string before every key's path, so two tRPC APIs can share one
   * `QueryClient`: `[['billing', 'post', 'byId'], { input, type }]`. Applies
   * to query and mutation keys, `pathKey()` and `pathFilter()`.
   */
  keyPrefix?: string | undefined;
}

/**
 * Options for a framework's `createTrpcContext()`: everything
 * {@link createTrpcQueryUtils} takes except the client, which the provider
 * gets.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TrpcContextOptions = Omit<
  CreateTrpcQueryUtilsOptions<unknown>,
  'client'
>;

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  );
}

function createProxy(
  callback: (path: readonly string[], args: unknown[]) => unknown,
  path: readonly string[] = [],
): any {
  return new Proxy(() => {}, {
    get(_target, key) {
      if (typeof key !== 'string' || key === 'then') return undefined;
      return createProxy(callback, [...path, key]);
    },
    apply(_target, _this, args: unknown[]) {
      return callback(path, args);
    },
  });
}

type Bag = {
  input?: unknown;
  context?: unknown;
  [key: string]: unknown;
};

type ClientMethod = (input: unknown, opts: object) => any;

function streamFrom(
  method: ClientMethod,
  input: unknown,
  context: unknown,
): (ctx: { signal: AbortSignal }) => AsyncIterable<unknown> {
  return ({ signal }) => method(input, { ...(context as object), signal });
}

/**
 * Creates the TanStack Query helpers for a client. The result is plain
 * options objects, so it works with every TanStack adapter: React, Preact,
 * Vue, Solid, Svelte, Angular and Lit.
 *
 * Every router and procedure also has `pathKey()` and `pathFilter()`, so
 * don't name a procedure `pathKey`, `pathFilter` or after one of the
 * helpers.
 *
 * @example
 * ```ts
 * export const trpc = createTrpcQueryUtils({ client });
 *
 * const post = useQuery(trpc.post.byId.queryOptions({ input: { id } }));
 * const create = useMutation(trpc.post.create.mutationOptions());
 * await queryClient.invalidateQueries(trpc.post.pathFilter());
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createTrpcQueryUtils<TClient extends object>(
  opts: CreateTrpcQueryUtilsOptions<TClient>,
): TrpcQueryUtils<TClient> {
  const { client, keyPrefix } = opts;
  const method = (path: readonly string[], name: string): ClientMethod => {
    let target: any = client;
    for (const key of path) target = target[key];
    return (input, callOpts) => target[name](input, callOpts);
  };

  return createProxy((fullPath, args) => {
    const name = fullPath.at(-1);
    const callPath = fullPath.slice(0, -1);
    const path = keyPrefix === undefined ? callPath : [keyPrefix, ...callPath];
    const { input, context, ...rest } = (args[0] ?? {}) as Bag;

    switch (name) {
      case 'pathKey':
        return pathKey(path);
      case 'pathFilter':
        return { ...(args[0] as object), queryKey: pathKey(path) };
      case 'queryKey':
        return procedureKey(path, input, 'query');
      case 'queryFilter':
        return { ...rest, queryKey: procedureKey(path, input, 'query') };
      case 'queryOptions': {
        const query = method(callPath, 'query');
        return {
          structuralSharing,
          ...rest,
          queryKey: procedureKey(path, input, 'query'),
          queryFn:
            input === skipToken
              ? skipToken
              : async (ctx: QueryFunctionContext) => {
                  const output = await query(input, {
                    ...(context as object),
                    signal: ctx.signal,
                  });
                  if (!isAsyncIterable(output)) return output;
                  return streamedQuery({ streamFn: () => output })(ctx);
                },
        };
      }
      case 'infiniteKey':
      case 'infiniteOptions': {
        const { initialPageParam } = rest;
        const toInput = input as ((pageParam: unknown) => unknown) | SkipToken;
        const queryKey = procedureKey(
          path,
          toInput === skipToken ? skipToken : toInput(initialPageParam),
          'infinite',
        );
        if (name === 'infiniteKey') return queryKey;
        const query = method(callPath, 'query');
        return {
          structuralSharing,
          ...rest,
          queryKey,
          queryFn:
            toInput === skipToken
              ? skipToken
              : (ctx: QueryFunctionContext<TrpcQueryKey, unknown>) =>
                  query(toInput(ctx.pageParam), {
                    ...(context as object),
                    signal: ctx.signal,
                  }),
        };
      }
      case 'mutationKey':
        return [path];
      case 'mutationOptions': {
        const mutate = method(callPath, 'mutate');
        return {
          ...rest,
          mutationKey: [path],
          mutationFn: (variables: unknown) => mutate(variables, context ?? {}),
        };
      }
      case 'subscriptionOptions': {
        const { enabled, ...callbacks } = rest;
        return {
          ...callbacks,
          subscriptionKey: procedureKey(path, input, undefined),
          enabled: input !== skipToken && enabled !== false,
          subscribe: streamFrom(method(callPath, 'subscribe'), input, context),
        };
      }
      case 'streamedKey':
        return procedureKey(path, input, 'streamed');
      case 'streamedOptions': {
        const { refetchMode, maxChunks, ...queryOpts } = rest as Bag &
          StreamedOptions;
        const streamFn = streamFrom(
          method(callPath, 'subscribe'),
          input,
          context,
        );
        return {
          ...queryOpts,
          queryKey: procedureKey(path, input, 'streamed'),
          queryFn:
            input === skipToken
              ? skipToken
              : streamedQuery<unknown, unknown[]>(
                  maxChunks === undefined
                    ? { streamFn, refetchMode }
                    : {
                        streamFn,
                        refetchMode,
                        initialValue: [],
                        reducer: (events, event) =>
                          [...events, event].slice(-maxChunks),
                      },
                ),
        };
      }
      case 'liveKey':
        return procedureKey(path, input, 'live');
      case 'liveOptions': {
        const streamFn = streamFrom(
          method(callPath, 'subscribe'),
          input,
          context,
        );
        return {
          ...rest,
          queryKey: procedureKey(path, input, 'live'),
          queryFn:
            input === skipToken
              ? skipToken
              : streamedQuery<unknown, unknown>({
                  streamFn,
                  initialValue: undefined,
                  reducer: (_previous, event) => event,
                }),
        };
      }
      default:
        throw new TypeError(
          `${fullPath.join('.')}() is not a TanStack Query helper`,
        );
    }
  }) as TrpcQueryUtils<TClient>;
}
