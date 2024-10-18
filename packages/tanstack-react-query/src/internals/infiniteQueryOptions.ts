import type {
  DataTag,
  DefinedInitialDataInfiniteOptions,
  InfiniteData,
  QueryFunction,
  UndefinedInitialDataInfiniteOptions,
  UnusedSkipTokenInfiniteOptions,
} from '@tanstack/react-query';
import {
  infiniteQueryOptions,
  skipToken,
  type QueryClient,
  type SkipToken,
} from '@tanstack/react-query';
import type { TRPCClientError, TRPCUntypedClient } from '@trpc/client';
import type {
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  DistributiveOmit,
  inferProcedureInput,
  inferTransformedProcedureOutput,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  ExtractCursorType,
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
> extends DistributiveOmit<
      UndefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
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
> extends DistributiveOmit<
      UndefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, TData>;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
}

interface DefinedTRPCInfiniteQueryOptionsIn<TInput, TQueryFnData, TData, TError>
  extends DistributiveOmit<
      DefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
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
> extends DistributiveOmit<
      DefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, TData>;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
}

interface UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
> extends DistributiveOmit<
      UnusedSkipTokenInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {
  initialCursor?: NonNullable<ExtractCursorType<TInput>> | null;
}

interface UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
> extends DistributiveOmit<
      UnusedSkipTokenInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, TData>;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
}

export interface TRPCInfiniteQueryOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyQueryProcedure,
> {
  <
    TQueryFnData extends inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure> | SkipToken,
    opts: DefinedTRPCInfiniteQueryOptionsIn<
      inferProcedureInput<TProcedure>,
      TQueryFnData,
      TData,
      TRPCClientError<TRoot>
    >,
  ): DefinedTRPCInfiniteQueryOptionsOut<
    inferProcedureInput<TProcedure>,
    TQueryFnData,
    TData,
    TRPCClientError<TRoot>
  >;
  <
    TQueryFnData extends inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure>,
    opts: UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
      inferProcedureInput<TProcedure>,
      TQueryFnData,
      TData,
      TRPCClientError<TRoot>
    >,
  ): UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
    inferProcedureInput<TProcedure>,
    TQueryFnData,
    TData,
    TRPCClientError<TRoot>
  >;
  <
    TQueryFnData extends inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure> | SkipToken,
    opts?: UndefinedTRPCInfiniteQueryOptionsIn<
      inferProcedureInput<TProcedure>,
      TQueryFnData,
      TData,
      TRPCClientError<TRoot>
    >,
  ): UndefinedTRPCInfiniteQueryOptionsOut<
    inferProcedureInput<TProcedure>,
    TQueryFnData,
    TData,
    TRPCClientError<TRoot>
  >;
}

export function trpcInfiniteQueryOptions(args: {
  untypedClient: TRPCUntypedClient<AnyRouter>;
  queryClient: QueryClient;
  path: readonly string[];
  queryKey: TRPCQueryKey;
  opts: UndefinedTRPCInfiniteQueryOptionsIn<unknown, unknown, unknown, unknown>;
}) {
  const { untypedClient, path, queryKey, opts } = args;
  const inputIsSkipToken = queryKey[1]?.input === skipToken;

  const queryFn: QueryFunction<unknown, TRPCQueryKey, unknown> = async (
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

    const result = await untypedClient.query(
      ...getClientArgs(queryKey, actualOpts, {
        direction: queryFnContext.direction,
        pageParam: queryFnContext.pageParam,
      }),
    );

    return result;
  };

  return Object.assign(
    infiniteQueryOptions({
      ...opts,
      queryKey,
      queryFn: inputIsSkipToken ? skipToken : queryFn,
      initialPageParam: opts?.initialCursor ?? null,
    }),
    { trpc: createTRPCOptionsResult({ path }) },
  );
}
