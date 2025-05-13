import type {
  DataTag,
  InfiniteData,
  InitialDataFunction,
  QueryClient,
  QueryFunction,
  SkipToken,
  SolidInfiniteQueryOptions,
} from '@tanstack/solid-query';
import { infiniteQueryOptions, skipToken } from '@tanstack/solid-query';
import type { TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import type { DistributiveOmit } from '@trpc/server/unstable-core-do-not-import';
import type {
  ExtractCursorType,
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

type PageParam<TInput> = NonNullable<ExtractCursorType<TInput>> | null;
type NonUndefinedGuard<T> = T extends undefined ? never : T;
type InitialData<TQueryFnData, TInput> =
  | NonUndefinedGuard<InfiniteData<TQueryFnData, PageParam<TInput>>>
  | (() => NonUndefinedGuard<InfiniteData<TQueryFnData, PageParam<TInput>>>)
  | InitialDataFunction<
      NonUndefinedGuard<InfiniteData<TQueryFnData, PageParam<TInput>>>
    >
  | undefined;

type BaseInfiniteQueryOptions<
  TInput,
  TQueryFnData,
  TData,
  TError,
  THasInitial extends boolean,
> = SolidInfiniteQueryOptions<
  TQueryFnData,
  TError,
  TRPCInfiniteData<TInput, TData>,
  TQueryFnData,
  TRPCQueryKey,
  PageParam<TInput>
> & {
  initialData?: THasInitial extends true
    ? Exclude<InitialData<TQueryFnData, TInput>, undefined>
    : InitialData<TQueryFnData, TInput>;
};

type TRPCInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
  THasInitial extends boolean,
> = DistributiveOmit<
  BaseInfiniteQueryOptions<TInput, TQueryFnData, TData, TError, THasInitial>,
  ReservedOptions
> &
  TRPCQueryBaseOptions & {
    initialCursor?: PageParam<TInput>;
  };

type TRPCInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
  THasInitial extends boolean,
> = DistributiveOmit<
  BaseInfiniteQueryOptions<TInput, TQueryFnData, TData, TError, THasInitial>,
  'initialPageParam'
> &
  TRPCQueryOptionsResult & {
    queryKey: DataTag<TRPCQueryKey, TRPCInfiniteData<TInput, TData>, TError>;
    initialPageParam: PageParam<TInput>;
  };

export interface TRPCInfiniteQueryOptions<TDef extends ResolverDef> {
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts: TRPCInfiniteQueryOptionsIn<
      TDef['input'],
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        transformer: TDef['transformer'];
        errorShape: TDef['errorShape'];
      }>,
      false
    >,
  ): TRPCInfiniteQueryOptionsOut<
    TDef['input'],
    TQueryFnData,
    TData,
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>,
    false
  >;
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts?: TRPCInfiniteQueryOptionsIn<
      TDef['input'],
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        transformer: TDef['transformer'];
        errorShape: TDef['errorShape'];
      }>,
      true
    >,
  ): TRPCInfiniteQueryOptionsOut<
    TDef['input'],
    TQueryFnData,
    TData,
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>,
    true
  >;
}

type AnyTRPCInfiniteQueryOptionsIn =
  | TRPCInfiniteQueryOptionsIn<any, any, any, any, false>
  | TRPCInfiniteQueryOptionsIn<any, any, any, any, true>;

type AnyTRPCInfiniteQueryOptionsOut =
  | TRPCInfiniteQueryOptionsOut<any, any, any, any, false>
  | TRPCInfiniteQueryOptionsOut<any, any, any, any, true>;

export function trpcInfiniteQueryOptions(args: {
  input: unknown;
  query: typeof TRPCUntypedClient.prototype.query;
  queryClient: QueryClient | (() => QueryClient);
  path: readonly string[];
  queryKey: TRPCQueryKey;
  opts: AnyTRPCInfiniteQueryOptionsIn;
}): AnyTRPCInfiniteQueryOptionsOut {
  const { input, query, path, queryKey, opts } = args;
  const inputIsSkipToken = input === skipToken;

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

  if ('initialData' in opts && isValidInitialData(opts.initialData)) {
    const finalOpts = {
      ...opts,
      queryKey,
      queryFn: inputIsSkipToken ? skipToken : queryFn,
      initialPageParam: opts?.initialCursor ?? (input as any)?.cursor,
      initialData: opts.initialData,
    };

    return Object.assign(infiniteQueryOptions(finalOpts), {
      trpc: createTRPCOptionsResult({ path }),
    });
  } else {
    const finalOpts = {
      ...opts,
      queryKey,
      queryFn: inputIsSkipToken ? skipToken : queryFn,
      initialPageParam: opts?.initialCursor ?? (input as any)?.cursor,
      initialData: undefined,
    };

    return Object.assign(infiniteQueryOptions(finalOpts), {
      trpc: createTRPCOptionsResult({ path }),
    });
  }
}

function isValidInitialData<T>(
  data: unknown,
): data is InfiniteData<T, any> | (() => InfiniteData<T, any>) {
  return (
    typeof data === 'function' ||
    (typeof data === 'object' &&
      data !== null &&
      'pages' in data &&
      'pageParams' in data)
  );
}
