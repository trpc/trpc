import type {
  DataTag,
  DefinedInitialDataOptions,
  QueryClient,
  QueryFunction,
  SkipToken,
  UndefinedInitialDataOptions,
  UnusedSkipTokenOptions,
} from '@tanstack/react-query';
import { queryOptions, skipToken } from '@tanstack/react-query';
import type { TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import type {
  coerceAsyncIterableToArray,
  DistributiveOmit,
} from '@trpc/server/unstable-core-do-not-import';
import { isAsyncIterable } from '@trpc/server/unstable-core-do-not-import';
import type {
  DefaultFeatureFlags,
  FeatureFlags,
  ResolverDef,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
  TRPCQueryOptionsResult,
} from './types';
import {
  buildQueryFromAsyncIterable,
  createTRPCOptionsResult,
  getClientArgs,
  unwrapLazyArg,
} from './utils';

type ReservedOptions = 'queryKey' | 'queryFn' | 'queryHashFn' | 'queryHash';

interface UndefinedTRPCQueryOptionsIn<
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends DistributiveOmit<
      UndefinedInitialDataOptions<
        coerceAsyncIterableToArray<TQueryFnData>,
        TError,
        coerceAsyncIterableToArray<TData>,
        TRPCQueryKey<TFeatureFlags['keyPrefix']>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

interface UndefinedTRPCQueryOptionsOut<
  TQueryFnData,
  TOutput,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends UndefinedInitialDataOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TOutput>,
      TRPCQueryKey<TFeatureFlags['keyPrefix']>
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags['keyPrefix']>,
    coerceAsyncIterableToArray<TOutput>,
    TError
  >;
}

interface DefinedTRPCQueryOptionsIn<
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends DistributiveOmit<
      DefinedInitialDataOptions<
        coerceAsyncIterableToArray<NoInfer<TQueryFnData>>,
        TError,
        coerceAsyncIterableToArray<TData>,
        TRPCQueryKey<TFeatureFlags['keyPrefix']>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

interface DefinedTRPCQueryOptionsOut<
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends DefinedInitialDataOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TData>,
      TRPCQueryKey<TFeatureFlags['keyPrefix']>
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags['keyPrefix']>,
    coerceAsyncIterableToArray<TData>,
    TError
  >;
}

interface UnusedSkipTokenTRPCQueryOptionsIn<
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends DistributiveOmit<
      UnusedSkipTokenOptions<
        coerceAsyncIterableToArray<TQueryFnData>,
        TError,
        coerceAsyncIterableToArray<TData>,
        TRPCQueryKey<TFeatureFlags['keyPrefix']>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

interface UnusedSkipTokenTRPCQueryOptionsOut<
  TQueryFnData,
  TOutput,
  TError,
  TFeatureFlags extends FeatureFlags,
> extends UnusedSkipTokenOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TOutput>,
      TRPCQueryKey<TFeatureFlags['keyPrefix']>
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags['keyPrefix']>,
    coerceAsyncIterableToArray<TOutput>,
    TError
  >;
}

export interface TRPCQueryOptions<
  TDef extends ResolverDef,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> {
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts: DefinedTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        transformer: TDef['transformer'];
        errorShape: TDef['errorShape'];
      }>,
      TFeatureFlags
    >,
  ): DefinedTRPCQueryOptionsOut<
    TQueryFnData,
    TData,
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>,
    TFeatureFlags
  >;
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'],
    opts?: UnusedSkipTokenTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        transformer: TDef['transformer'];
        errorShape: TDef['errorShape'];
      }>,
      TFeatureFlags
    >,
  ): UnusedSkipTokenTRPCQueryOptionsOut<
    TQueryFnData,
    TData,
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>,
    TFeatureFlags
  >;
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts?: UndefinedTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        transformer: TDef['transformer'];
        errorShape: TDef['errorShape'];
      }>,
      TFeatureFlags
    >,
  ): UndefinedTRPCQueryOptionsOut<
    TQueryFnData,
    TData,
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>,
    TFeatureFlags
  >;
}

type AnyTRPCQueryOptionsIn<TFeatureFlags extends FeatureFlags> =
  | DefinedTRPCQueryOptionsIn<unknown, unknown, unknown, TFeatureFlags>
  | UnusedSkipTokenTRPCQueryOptionsIn<unknown, unknown, unknown, TFeatureFlags>
  | UndefinedTRPCQueryOptionsIn<unknown, unknown, unknown, TFeatureFlags>;

type AnyTRPCQueryOptionsOut<
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> =
  | DefinedTRPCQueryOptionsOut<unknown, unknown, unknown, TFeatureFlags>
  | UnusedSkipTokenTRPCQueryOptionsOut<unknown, unknown, unknown, TFeatureFlags>
  | UndefinedTRPCQueryOptionsOut<unknown, unknown, unknown, TFeatureFlags>;

/**
 * @internal
 */
export function trpcQueryOptions<TFeatureFlags extends FeatureFlags>(args: {
  input: unknown;
  query: typeof TRPCUntypedClient.prototype.query;
  queryClient: QueryClient | (() => QueryClient);
  path: string[];
  queryKey: TRPCQueryKey<TFeatureFlags['keyPrefix']>;
  opts: AnyTRPCQueryOptionsIn<TFeatureFlags> | undefined;
}): AnyTRPCQueryOptionsOut<TFeatureFlags> {
  const { input, query, path, queryKey, opts } = args;
  const queryClient = unwrapLazyArg(args.queryClient);

  const inputIsSkipToken = input === skipToken;

  const queryFn: QueryFunction<
    unknown,
    TRPCQueryKey<TFeatureFlags['keyPrefix']>
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
    const queryKey = queryFnContext.queryKey;

    const result = await query(...getClientArgs(queryKey, actualOpts));

    if (isAsyncIterable(result)) {
      return buildQueryFromAsyncIterable(result, queryClient, queryKey);
    }

    return result;
  };

  return Object.assign(
    queryOptions({
      ...opts,
      queryKey: queryKey,
      queryFn: inputIsSkipToken ? skipToken : queryFn,
    }),
    { trpc: createTRPCOptionsResult({ path }) },
  );
}
