import type {
  DataTag,
  DefinedInitialDataOptions,
  QueryClient,
  QueryFunction,
  UndefinedInitialDataOptions,
  UnusedSkipTokenOptions,
} from '@tanstack/react-query';
import { queryOptions, skipToken, type SkipToken } from '@tanstack/react-query';
import type { TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import type {
  coerceAsyncIterableToArray,
  DistributiveOmit,
} from '@trpc/server/unstable-core-do-not-import';
import { isAsyncIterable } from '@trpc/server/unstable-core-do-not-import';
import type {
  ResolverDef,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
  TRPCQueryOptionsResult,
} from './types';
import {
  buildQueryFromAsyncIterable,
  createTRPCOptionsResult,
  getClientArgs,
} from './utils';

type ReservedOptions = 'queryKey' | 'queryFn' | 'queryHashFn' | 'queryHash';

interface UndefinedTRPCQueryOptionsIn<TQueryFnData, TData, TError>
  extends DistributiveOmit<
      UndefinedInitialDataOptions<
        coerceAsyncIterableToArray<TQueryFnData>,
        TError,
        coerceAsyncIterableToArray<TData>,
        TRPCQueryKey
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

interface UndefinedTRPCQueryOptionsOut<TQueryFnData, TOutput, TError>
  extends UndefinedInitialDataOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TOutput>,
      TRPCQueryKey
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, coerceAsyncIterableToArray<TOutput>>;
}

interface DefinedTRPCQueryOptionsIn<TQueryFnData, TData, TError>
  extends DistributiveOmit<
      DefinedInitialDataOptions<
        coerceAsyncIterableToArray<TQueryFnData>,
        TError,
        coerceAsyncIterableToArray<TData>,
        TRPCQueryKey
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

interface DefinedTRPCQueryOptionsOut<TQueryFnData, TData, TError>
  extends DefinedInitialDataOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TData>,
      TRPCQueryKey
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, coerceAsyncIterableToArray<TData>>;
}

interface UnusedSkipTokenTRPCQueryOptionsIn<TQueryFnData, TData, TError>
  extends DistributiveOmit<
      UnusedSkipTokenOptions<
        coerceAsyncIterableToArray<TQueryFnData>,
        TError,
        coerceAsyncIterableToArray<TData>,
        TRPCQueryKey
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

interface UnusedSkipTokenTRPCQueryOptionsOut<TQueryFnData, TOutput, TError>
  extends UnusedSkipTokenOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TOutput>,
      TRPCQueryKey
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, coerceAsyncIterableToArray<TOutput>>;
}

export interface TRPCQueryOptions<TDef extends ResolverDef> {
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts: DefinedTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TDef>
    >,
  ): DefinedTRPCQueryOptionsOut<TQueryFnData, TData, TRPCClientErrorLike<TDef>>;
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'],
    opts?: UnusedSkipTokenTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TDef>
    >,
  ): UnusedSkipTokenTRPCQueryOptionsOut<
    TQueryFnData,
    TData,
    TRPCClientErrorLike<TDef>
  >;
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts?: UndefinedTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TDef>
    >,
  ): UndefinedTRPCQueryOptionsOut<
    TQueryFnData,
    TData,
    TRPCClientErrorLike<TDef>
  >;
}

export function trpcQueryOptions(args: {
  query: typeof TRPCUntypedClient.prototype.query;
  queryClient: QueryClient;
  path: readonly string[];
  queryKey: TRPCQueryKey;
  opts: UndefinedTRPCQueryOptionsIn<unknown, unknown, unknown>;
}) {
  const { query, queryClient, path, queryKey, opts } = args;

  const inputIsSkipToken = queryKey[1]?.input === skipToken;

  const queryFn: QueryFunction<unknown, TRPCQueryKey> = async (
    queryFnContext,
  ) => {
    const actualOpts = {
      ...opts,
      trpc: {
        ...opts?.trpc,
        ...(opts?.trpc?.abortOnUnmount
          ? { signal: queryFnContext.signal }
          : { signal: null }),
      },
    };

    const result = await query(...getClientArgs(queryKey, actualOpts));

    if (isAsyncIterable(result)) {
      return buildQueryFromAsyncIterable(result, queryClient, queryKey);
    }

    return result;
  };

  return Object.assign(
    queryOptions({
      ...opts,
      queryKey,
      queryFn: inputIsSkipToken ? skipToken : queryFn,
    }),
    { trpc: createTRPCOptionsResult({ path }) },
  );
}
