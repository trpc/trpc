import type {
  DataTag,
  DefinedInitialDataInfiniteOptions,
  QueryClient,
  QueryFunction,
  SkipToken,
  UndefinedInitialDataInfiniteOptions,
  UnusedSkipTokenInfiniteOptions,
} from '@tanstack/react-query';
import { infiniteQueryOptions, skipToken } from '@tanstack/react-query';
import type { TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import type { DistributiveOmit } from '@trpc/server/unstable-core-do-not-import';
import type {
  ExtractCursorType,
  FeatureFlags,
  ResolverDef,
  TRPCInfiniteData,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
  TRPCQueryOptionsResult,
} from './types';
import { createTRPCOptionsResult, getClientArgs } from './utils';

type ReservedOptions =
  | 'queryKey'
  | 'queryFn'
  | 'queryHashFn'
  | 'queryHash'
  | 'initialPageParam';

interface UndefinedTRPCInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends DistributiveOmit<
      UndefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags['keyPrefix']>,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {
  initialCursor?: NonNullable<ExtractCursorType<TInput>> | null;
}

interface UndefinedTRPCInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends DistributiveOmit<
      UndefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags['keyPrefix']>,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags['keyPrefix']>,
    TRPCInfiniteData<TInput, TData>,
    TError
  >;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
}

interface DefinedTRPCInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends DistributiveOmit<
      DefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags['keyPrefix']>,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {
  initialCursor?: NonNullable<ExtractCursorType<TInput>> | null;
}

interface DefinedTRPCInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends DistributiveOmit<
      DefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags['keyPrefix']>,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags['keyPrefix']>,
    TRPCInfiniteData<TInput, TData>,
    TError
  >;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
}

interface UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends DistributiveOmit<
      UnusedSkipTokenInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags['keyPrefix']>,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {
  initialCursor?: NonNullable<ExtractCursorType<TInput>> | null;
}

/**
 * Output type for tRPC infinite query options when the input is **not** `skipToken`.
 *
 * Explicitly omits and re-declares `queryFn` as a concrete `QueryFunction`
 * (without `SkipToken | undefined`) so this type is assignable to
 * `UseSuspenseInfiniteQueryOptions`, which excludes `SkipToken` from `queryFn`.
 * This matches the runtime guarantee: `trpcInfiniteQueryOptions` always sets a
 * real `queryFn` when called with non-`skipToken` input.
 *
 * @internal
 */
interface UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends DistributiveOmit<
      UnusedSkipTokenInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags['keyPrefix']>,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam' | 'queryFn'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags['keyPrefix']>,
    TRPCInfiniteData<TInput, TData>,
    TError
  >;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
  queryFn: QueryFunction<
    TQueryFnData,
    TRPCQueryKey<TFeatureFlags['keyPrefix']>,
    NonNullable<ExtractCursorType<TInput>> | null
  >;
}

/**
 * Options builder for tRPC infinite query procedures, compatible with TanStack Query.
 *
 * Returns typed infinite query options that can be spread directly into
 * `useInfiniteQuery`, `useSuspenseInfiniteQuery`, or
 * `queryClient.fetchInfiniteQuery`.
 *
 * Supports three call signatures:
 * - With `DefinedInitialDataInfiniteOptions` when `initialData` is provided
 *   (result data is always defined)
 * - With `UnusedSkipTokenInfiniteOptions` when `input` is not `skipToken`
 *   (guarantees `queryFn` is a concrete function, enabling `useSuspenseInfiniteQuery`)
 * - With `UndefinedInitialDataInfiniteOptions` as the default fallback
 *
 * @template TDef - The resolved tRPC procedure definition including input, output,
 *   transformer, errorShape, and feature flags
 *
 * @example
 * ```ts
 * const options = trpc.posts.list.infiniteQueryOptions(
 *   { limit: 10 },
 *   { getNextPageParam: (page) => page.nextCursor },
 * );
 * const query = useSuspenseInfiniteQuery(options);
 * ```
 */
export interface TRPCInfiniteQueryOptions<TDef extends ResolverDef> {
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts: DefinedTRPCInfiniteQueryOptionsIn<
      TDef['input'],
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        transformer: TDef['transformer'];
        errorShape: TDef['errorShape'];
      }>,
      TDef['featureFlags']
    >,
  ): DefinedTRPCInfiniteQueryOptionsOut<
    TDef['input'],
    TQueryFnData,
    TData,
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>,
    TDef['featureFlags']
  >;
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'],
    opts: UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
      TDef['input'],
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        transformer: TDef['transformer'];
        errorShape: TDef['errorShape'];
      }>,
      TDef['featureFlags']
    >,
  ): UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
    TDef['input'],
    TQueryFnData,
    TData,
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>,
    TDef['featureFlags']
  >;
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts?: UndefinedTRPCInfiniteQueryOptionsIn<
      TDef['input'],
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        transformer: TDef['transformer'];
        errorShape: TDef['errorShape'];
      }>,
      TDef['featureFlags']
    >,
  ): UndefinedTRPCInfiniteQueryOptionsOut<
    TDef['input'],
    TQueryFnData,
    TData,
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>,
    TDef['featureFlags']
  >;
}

type AnyTRPCInfiniteQueryOptionsIn<TFeatureFlags extends FeatureFlags> =
  | DefinedTRPCInfiniteQueryOptionsIn<any, any, any, any, TFeatureFlags>
  | UnusedSkipTokenTRPCInfiniteQueryOptionsIn<any, any, any, any, TFeatureFlags>
  | UndefinedTRPCInfiniteQueryOptionsIn<any, any, any, any, TFeatureFlags>;

type AnyTRPCInfiniteQueryOptionsOut<TFeatureFlags extends FeatureFlags> =
  | DefinedTRPCInfiniteQueryOptionsOut<any, any, any, any, TFeatureFlags>
  | UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
      any,
      any,
      any,
      any,
      TFeatureFlags
    >
  | UndefinedTRPCInfiniteQueryOptionsOut<any, any, any, any, TFeatureFlags>;

/**
 * Constructs TanStack Query infinite query options for a tRPC procedure.
 *
 * Wires up `queryFn` to call the tRPC client's `query` method with the correct
 * arguments, including `cursor` / `direction` for pagination. When `input` is
 * `skipToken`, `queryFn` is set to `skipToken` so TanStack Query skips the fetch.
 *
 * The returned object is tagged with a `trpc` property (see {@link TRPCQueryOptionsResult})
 * so tRPC utilities can identify these options downstream.
 *
 * @param args.input - The procedure input, or `skipToken` to disable fetching
 * @param args.query - The tRPC untyped client `query` method
 * @param args.queryClient - Accepted for API parity with `trpcQueryOptions`; not used
 *   by the infinite-query implementation (no async-iterable coercion path)
 * @param args.path - The tRPC procedure path segments (e.g. `['posts', 'list']`)
 * @param args.queryKey - The pre-built tRPC query key
 * @param args.opts - Additional TanStack infinite query options (e.g. `getNextPageParam`)
 * @returns Fully constructed infinite query options with a `trpc` result tag
 *
 * @internal
 */
export function trpcInfiniteQueryOptions<
  TFeatureFlags extends FeatureFlags,
>(args: {
  input: unknown;
  query: typeof TRPCUntypedClient.prototype.query;
  queryClient: QueryClient | (() => QueryClient);
  path: string[];
  queryKey: TRPCQueryKey<TFeatureFlags['keyPrefix']>;
  opts: AnyTRPCInfiniteQueryOptionsIn<TFeatureFlags> | undefined;
}): AnyTRPCInfiniteQueryOptionsOut<TFeatureFlags> {
  const { input, query, path, queryKey, opts } = args;
  const inputIsSkipToken = input === skipToken;

  const queryFn: QueryFunction<
    unknown,
    TRPCQueryKey<TFeatureFlags['keyPrefix']>,
    unknown
  > = async (queryFnContext) => {
    const actualOpts = {
      ...opts,
      trpc: {
        ...opts?.trpc,
        ...(opts?.trpc?.abortOnUnmount
          ? { signal: queryFnContext.signal }
          : { signal: null }),
      },
    };

    const result = await query(
      ...getClientArgs(queryKey, actualOpts, {
        direction: queryFnContext.direction,
        pageParam: queryFnContext.pageParam,
      }),
    );

    return result;
  };

  return Object.assign(
    infiniteQueryOptions({
      ...(opts ?? ({} as AnyTRPCInfiniteQueryOptionsIn<TFeatureFlags>)),
      queryKey,
      queryFn: inputIsSkipToken ? skipToken : queryFn,
      initialPageParam: opts?.initialCursor ?? (input as any)?.cursor,
    }),
    { trpc: createTRPCOptionsResult({ path }) },
  );
}
