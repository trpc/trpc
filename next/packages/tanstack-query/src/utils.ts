import {
  experimental_streamedQuery as streamedQuery,
  matchQuery,
  skipToken,
  type DataTag,
  type InfiniteData,
  type InfiniteQueryObserverOptions,
  type MutationFilters,
  type MutationFunctionContext,
  type MutationObserverOptions,
  type QueryFilters,
  type QueryFunction,
  type QueryFunctionContext,
  type QueryObserverOptions,
  type SkipToken,
} from '@tanstack/query-core';
import { structuralSharing } from './sharing.ts';
import type {
  ChainTypes,
  ClientTypes,
  RouterOf,
  TrpcClient,
} from '@trpc12/trpc/client';
import { createRecursiveProxy } from '@trpc12/trpc/extend';
import {
  pathKey,
  procedureKey,
  type TrpcMutationKey,
  type TrpcQueryKey,
} from './keys.ts';
import {
  SubscriptionCache,
  type SubscriptionCallbacks,
  type TrpcSubscriptionOptions,
} from './subscription.ts';

type AnyFn = (...args: any[]) => any;

const subscriptionCaches = new WeakMap<object, SubscriptionCache>();
const subscriptionCacheFor = (client: object): SubscriptionCache => {
  let cache = subscriptionCaches.get(client);
  if (!cache) subscriptionCaches.set(client, (cache = new SubscriptionCache()));
  return cache;
};
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
 * @since 0.1.0
 * @stability stable
 */
export type QueryData<TOutput> =
  TOutput extends AsyncIterable<infer TChunk> ? TChunk[] : TOutput;

/**
 * A query key tagged with its data and error types, so
 * `queryClient.getQueryData(key)` is typed.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
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
 * What `queryOptions()` returns: pass it to `useQuery`, `queryClient.query`
 * and friends in any TanStack adapter.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export type MutationVariables<TInput> = undefined extends TInput
  ? TInput | void
  : TInput;

/**
 * TanStack's mutation options, minus what tRPC fills in.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export type MutationOptionsOut<TInput, TOutput, TError, TOnMutateResult> =
  MutationOptionsIn<TInput, TOutput, TError, TOnMutateResult> & {
    mutationKey: TrpcMutationKey;
    mutationFn: (input: MutationVariables<TInput>) => Promise<TOutput>;
  };

type ChunkOf<TOutput> =
  TOutput extends AsyncIterable<infer TChunk> ? TChunk : never;

/**
 * Options for `streamedMutationOptions()`, on top of TanStack's.
 * @since 0.1.0
 * @stability stable
 */
export interface StreamedMutationOptions<TChunk, TInput = unknown> {
  /** Called with each chunk and every chunk so far. */
  onChunk?: ((chunk: TChunk, chunks: TChunk[]) => void) | undefined;
  /**
   * Stop the server stream once nothing reads the chunks: when the last
   * `chunksOptions()` query observer goes away (the screen unmounts).
   * `data` is the chunks so far.
   * @default false
   */
  abortWhenUnobserved?: boolean | undefined;
  /**
   * Stops a call's stream when aborted; `data` is the chunks so far. A
   * function is called for each `mutate`, so each call can get its own.
   */
  signal?:
    | AbortSignal
    | ((variables: TInput) => AbortSignal | undefined)
    | undefined;
}

/**
 * How `streamedOptions()` keeps events.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export type QueryFiltersIn = Omit<QueryFilters, 'queryKey'>;

/**
 * Keys and filters available on every router and procedure.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export interface QueryProcedureUtils<
  TInput,
  TOutput,
  TError,
  TContext,
> extends PathUtils {
  /**
   * Options for `useQuery`, `useSuspenseQuery`, `queryClient.query`, … in any
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
 * @since 0.1.0
 * @stability stable
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
  /**
   * Filters for this procedure's mutations, typed for `predicate`. For
   * `useMutationState`, `useIsMutating` and `queryClient.isMutating()`.
   *
   * @example
   * ```ts
   * const pending = useMutationState({
   *   filters: trpc.post.create.mutationFilter({ status: 'pending' }),
   *   select: (mutation) => mutation.state.variables,
   * });
   * ```
   */
  mutationFilter(
    filters?: Omit<
      MutationFilters<TOutput, TError, MutationVariables<TInput>>,
      'mutationKey'
    >,
  ): MutationFilters & { mutationKey: TrpcMutationKey };
  /**
   * Options for `useMutation` when the output is an `AsyncIterable`: `data`
   * is every chunk once the stream ends. While it runs, the chunks so far
   * are in the query cache at `streamedMutationKey()`, so a query on that
   * key (`chunksOptions()`) re-renders as they arrive. Each `mutate` starts
   * them over.
   *
   * @example
   * ```ts
   * const send = useMutation(trpc.chat.reply.streamedMutationOptions());
   * const { data: chunks } = useQuery(trpc.chat.reply.chunksOptions());
   * ```
   */
  streamedMutationOptions<TOnMutateResult = unknown>(
    opts?: ContextBag<TContext> &
      StreamedMutationOptions<ChunkOf<TOutput>, TInput> &
      MutationOptionsIn<TInput, ChunkOf<TOutput>[], TError, TOnMutateResult>,
  ): MutationOptionsOut<TInput, ChunkOf<TOutput>[], TError, TOnMutateResult>;
  /** Where `streamedMutationOptions()` keeps the chunks so far. */
  streamedMutationKey(): TrpcQueryKeyFor<ChunkOf<TOutput>[], TError>;
  /**
   * Query options that read the chunks `streamedMutationOptions()` writes,
   * without fetching.
   */
  chunksOptions<TData = ChunkOf<TOutput>[]>(
    opts?: Omit<QueryOptionsIn<ChunkOf<TOutput>[], TError, TData>, 'enabled'>,
  ): QueryOptionsOut<ChunkOf<TOutput>[], TError, TData>;
}

/**
 * The TanStack helpers for a subscription procedure.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export type TrpcQueryUtilsFor<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> = TrpcQueryUtils<TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>>;

/**
 * Options for {@link createTrpcQueryUtils}.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export type TrpcContextOptions = Omit<
  CreateTrpcQueryUtilsOptions<unknown>,
  'client'
>;

/** A client factory's client; anything else as is. */
type Unwrapped<T> = T extends (...args: any) => infer C ? C : T;

type KnownClient<T> = [ClientTypes<Unwrapped<T>>] extends [never]
  ? undefined
  : ClientTypes<Unwrapped<T>>;

/**
 * The router a framework's `createTrpcContext<T>()` types: the router of a
 * client factory's or a client's type, else `T` itself (a router type, a
 * `routerType()` value's type or a contract).
 *
 * @example
 * ```ts
 * const makeClient = () => createTrpcClient({ router: routerType<AppRouter>(), links });
 * export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();
 * ```
 * @since 0.1.0
 * @stability stable
 */
export type SourceRouter<T> =
  KnownClient<T> extends { router: infer R } ? R : Unwrapped<T>;

/**
 * The context a client's links declare, for `createTrpcContext<T>()`; `{}`
 * when `T` isn't a client factory's or a client's type.
 * @since 0.1.0
 * @stability stable
 */
export type SourceContext<T> =
  KnownClient<T> extends { context: infer C extends object } ? C : {};

/**
 * A client's link types (errors, unsupported operations, result form), for
 * `createTrpcContext<T>()`; `{}` when `T` isn't a client factory's or a
 * client's type.
 * @since 0.1.0
 * @stability stable
 */
export type SourceLinks<T> =
  KnownClient<T> extends { links: infer L extends ChainTypes } ? L : {};

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  );
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
  return (opts) =>
    method(input, { ...(context as object), signal: opts.signal });
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
 * @since 0.1.0
 * @stability stable
 */
export function createTrpcQueryUtils<TClient extends object>(
  opts: CreateTrpcQueryUtilsOptions<TClient>,
): TrpcQueryUtils<TClient> {
  const subscriptionCache = subscriptionCacheFor(opts.client);
  const method = (path: readonly string[], name: string): ClientMethod => {
    let target: any = opts.client;
    for (const key of path) target = target[key];
    return (input, callOpts) => target[name](input, callOpts);
  };

  return createRecursiveProxy((fullPath, args) => {
    const name = fullPath.at(-1);
    const callPath = fullPath.slice(0, -1);
    const path =
      opts.keyPrefix === undefined ? callPath : [opts.keyPrefix, ...callPath];
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
        const toInput = input as ((pageParam: unknown) => unknown) | SkipToken;
        const queryKey = procedureKey(
          path,
          toInput === skipToken ? skipToken : toInput(rest['initialPageParam']),
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
      case 'mutationFilter':
        return { ...(args[0] as object), mutationKey: [path] };
      case 'streamedMutationKey':
        return procedureKey(path, undefined, 'mutation');
      case 'chunksOptions':
        return {
          staleTime: Infinity,
          ...(args[0] as object),
          queryKey: procedureKey(path, undefined, 'mutation'),
          queryFn: skipToken,
        };
      case 'streamedMutationOptions': {
        const { onChunk, abortWhenUnobserved, signal, ...mutationOpts } =
          rest as Bag & StreamedMutationOptions<unknown>;
        const mutate = method(callPath, 'mutate');
        const queryKey = procedureKey(path, undefined, 'mutation');
        return {
          ...mutationOpts,
          mutationKey: [path],
          mutationFn: async (
            variables: unknown,
            fnContext: MutationFunctionContext,
          ) => {
            const chunks: unknown[] = [];
            const controller = new AbortController();
            const callSignal =
              typeof signal === 'function' ? signal(variables) : signal;
            const stop = () => controller.abort(callSignal?.reason);
            if (callSignal?.aborted) stop();
            callSignal?.addEventListener('abort', stop, { once: true });
            const unsubscribe = abortWhenUnobserved
              ? fnContext.client.getQueryCache().subscribe((event) => {
                  if (
                    event.type === 'observerRemoved' &&
                    matchQuery({ queryKey, exact: true }, event.query) &&
                    event.query.getObserversCount() === 0
                  ) {
                    stop();
                  }
                })
              : undefined;
            fnContext.client.setQueryData(queryKey, []);
            try {
              const output: unknown = await mutate(variables, {
                ...(context as object),
                signal: controller.signal,
              });
              if (!isAsyncIterable(output)) {
                throw new TypeError(
                  `${callPath.join('.')} did not return an AsyncIterable`,
                );
              }
              for await (const chunk of output) {
                chunks.push(chunk);
                fnContext.client.setQueryData(queryKey, [...chunks]);
                onChunk?.(chunk, chunks);
              }
            } catch (cause) {
              if (!controller.signal.aborted) throw cause;
            } finally {
              unsubscribe?.();
              callSignal?.removeEventListener('abort', stop);
            }
            return chunks;
          },
        };
      }
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
          subscriptionCache,
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
                    ? { streamFn, ...(refetchMode && { refetchMode }) }
                    : {
                        streamFn,
                        ...(refetchMode && { refetchMode }),
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
