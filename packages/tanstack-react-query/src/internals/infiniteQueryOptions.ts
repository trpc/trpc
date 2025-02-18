import type {
  DataTag,
  DefinedInitialDataInfiniteOptions,
  InfiniteData,
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
  ResolverDef,
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
  queryKey: DataTag<TRPCQueryKey, TData, TError>;
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
  queryKey: DataTag<TRPCQueryKey, TData, TError>;
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
  queryKey: DataTag<TRPCQueryKey, TData, TError>;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
}

export interface TRPCInfiniteQueryOptions<TDef extends ResolverDef> {
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts: DefinedTRPCInfiniteQueryOptionsIn<
      TDef['input'],
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TDef>
    >,
  ): DefinedTRPCInfiniteQueryOptionsOut<
    TDef['input'],
    TQueryFnData,
    TData,
    TRPCClientErrorLike<TDef>
  >;
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'],
    opts: UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
      TDef['input'],
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TDef>
    >,
  ): UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
    TDef['input'],
    TQueryFnData,
    TData,
    TRPCClientErrorLike<TDef>
  >;
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts?: UndefinedTRPCInfiniteQueryOptionsIn<
      TDef['input'],
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TDef>
    >,
  ): UndefinedTRPCInfiniteQueryOptionsOut<
    TDef['input'],
    TQueryFnData,
    TData,
    TRPCClientErrorLike<TDef>
  >;
}

type AnyTRPCInfiniteQueryOptionsIn =
  | DefinedTRPCInfiniteQueryOptionsIn<unknown, unknown, unknown, unknown>
  | UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
      unknown,
      unknown,
      unknown,
      unknown
    >
  | UndefinedTRPCInfiniteQueryOptionsIn<unknown, unknown, unknown, unknown>;

type AnyTRPCInfiniteQueryOptionsOut =
  | DefinedTRPCInfiniteQueryOptionsOut<unknown, unknown, unknown, unknown>
  | UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
      unknown,
      unknown,
      unknown,
      unknown
    >
  | UndefinedTRPCInfiniteQueryOptionsOut<unknown, unknown, unknown, unknown>;

export function trpcInfiniteQueryOptions(args: {
  query: typeof TRPCUntypedClient.prototype.query;
  queryClient: QueryClient | (() => QueryClient);
  path: readonly string[];
  queryKey: TRPCQueryKey;
  opts: AnyTRPCInfiniteQueryOptionsIn;
}): AnyTRPCInfiniteQueryOptionsOut {
  const { query, path, queryKey, opts } = args;
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
      ...opts,
      queryKey,
      queryFn: inputIsSkipToken ? skipToken : queryFn,
      initialPageParam: opts?.initialCursor ?? null,
    }),
    { trpc: createTRPCOptionsResult({ path }) },
  );
}
