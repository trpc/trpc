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
