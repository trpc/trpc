import type {
  DataTag,
  DefinedInitialDataOptions,
  QueryClient,
  QueryFunctionContext,
  UndefinedInitialDataOptions,
  UnusedSkipTokenOptions,
} from '@tanstack/react-query';
import { queryOptions, skipToken, type SkipToken } from '@tanstack/react-query';
import type { TRPCClientError, TRPCUntypedClient } from '@trpc/client';
import type {
  AnyQueryProcedure,
  AnyTRPCRouter,
  inferProcedureInput,
  inferTransformedProcedureOutput,
} from '@trpc/server';
import type {
  AnyRootTypes,
  coerceAsyncIterableToArray,
  DistributiveOmit,
} from '@trpc/server/unstable-core-do-not-import';
import { isAsyncIterable } from '@trpc/server/unstable-core-do-not-import';
import type {
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

export interface TRPCQueryOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyQueryProcedure,
> {
  <
    TQueryFnData extends inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure> | SkipToken,
    opts: DefinedTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      TRPCClientError<TRoot>
    >,
  ): DefinedTRPCQueryOptionsOut<TQueryFnData, TData, TRPCClientError<TRoot>>;
  <
    TQueryFnData extends inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure>,
    opts?: UnusedSkipTokenTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      TRPCClientError<TRoot>
    >,
  ): UnusedSkipTokenTRPCQueryOptionsOut<
    TQueryFnData,
    TData,
    TRPCClientError<TRoot>
  >;
  <
    TQueryFnData extends inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure> | SkipToken,
    opts?: UndefinedTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      TRPCClientError<TRoot>
    >,
  ): UndefinedTRPCQueryOptionsOut<TQueryFnData, TData, TRPCClientError<TRoot>>;
}

export const trpcQueryOptions = <
  TRoot extends AnyRootTypes,
  TProcedure extends AnyQueryProcedure,
>(args: {
  untypedClient: TRPCUntypedClient<AnyTRPCRouter>;
  queryClient: QueryClient;
  path: readonly string[];
  queryKey: TRPCQueryKey;
  opts: UndefinedTRPCQueryOptionsIn<unknown, unknown, unknown>;
}): TRPCQueryOptions<TRoot, TProcedure> => {
  const { untypedClient, queryClient, path, queryKey, opts } = args;

  const inputIsSkipToken = queryKey[1]?.input === skipToken;

  const queryFn = async (
    queryFnContext: QueryFunctionContext<TRPCQueryKey>,
  ): Promise<unknown> => {
    const actualOpts = {
      ...opts,
      trpc: {
        ...opts?.trpc,
        ...(opts?.trpc?.abortOnUnmount
          ? { signal: queryFnContext.signal }
          : { signal: null }),
      },
    };

    const result = await untypedClient.query(
      ...getClientArgs(queryKey, actualOpts),
    );

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
  ) as any;
};
