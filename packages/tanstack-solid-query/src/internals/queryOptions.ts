import type {
  DataTag,
  QueryClient,
  QueryFunction,
  SkipToken,
  SolidQueryOptions,
} from '@tanstack/solid-query';
import { queryOptions, skipToken } from '@tanstack/solid-query';
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
  unwrapLazyArg,
} from './utils';

type ReservedOptions = 'queryKey' | 'queryFn' | 'queryHashFn' | 'queryHash';

type UndefinedInitialDataOptions<TQueryFnData, TData, TError> =
  SolidQueryOptions<
    coerceAsyncIterableToArray<TQueryFnData>,
    TError,
    coerceAsyncIterableToArray<TData>,
    TRPCQueryKey
  > & {
    initialData?: undefined;
  };
type DefinedInitialDataOptions<TQueryFnData, TData, TError> = SolidQueryOptions<
  coerceAsyncIterableToArray<TQueryFnData>,
  TError,
  coerceAsyncIterableToArray<TData>,
  TRPCQueryKey
> & {
  initialData: TQueryFnData | (() => TQueryFnData);
};

interface UndefinedTRPCQueryOptionsIn<TQueryFnData, TData, TError>
  extends DistributiveOmit<
      UndefinedInitialDataOptions<
        coerceAsyncIterableToArray<TQueryFnData>,
        TError,
        coerceAsyncIterableToArray<TData>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

interface UndefinedTRPCQueryOptionsOut<TQueryFnData, TOutput, TError>
  extends UndefinedInitialDataOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TOutput>
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, coerceAsyncIterableToArray<TOutput>, TError>;
}

interface DefinedTRPCQueryOptionsIn<TQueryFnData, TData, TError>
  extends DistributiveOmit<
      DefinedInitialDataOptions<
        coerceAsyncIterableToArray<TQueryFnData>,
        TError,
        coerceAsyncIterableToArray<TData>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

interface DefinedTRPCQueryOptionsOut<TQueryFnData, TData, TError>
  extends DefinedInitialDataOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TData>
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, coerceAsyncIterableToArray<TData>, TError>;
}

export interface TRPCQueryOptions<TDef extends ResolverDef> {
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts: DefinedTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        transformer: TDef['transformer'];
        errorShape: TDef['errorShape'];
      }>
    >,
  ): DefinedTRPCQueryOptionsOut<
    TQueryFnData,
    TData,
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>
  >;
  <TQueryFnData extends TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts?: UndefinedTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        transformer: TDef['transformer'];
        errorShape: TDef['errorShape'];
      }>
    >,
  ): UndefinedTRPCQueryOptionsOut<
    TQueryFnData,
    TData,
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>
  >;
}

type AnyTRPCQueryOptionsIn =
  | DefinedTRPCQueryOptionsIn<unknown, unknown, unknown>
  | UndefinedTRPCQueryOptionsIn<unknown, unknown, unknown>;

type AnyTRPCQueryOptionsOut =
  | DefinedTRPCQueryOptionsOut<unknown, unknown, unknown>
  | UndefinedTRPCQueryOptionsOut<unknown, unknown, unknown>;

/**
 * @internal
 */
export function trpcQueryOptions(args: {
  input: unknown;
  query: typeof TRPCUntypedClient.prototype.query;
  queryClient: QueryClient | (() => QueryClient);
  path: readonly string[];
  queryKey: TRPCQueryKey;
  opts: AnyTRPCQueryOptionsIn;
}): AnyTRPCQueryOptionsOut {
  const { input, query, path, queryKey, opts } = args;
  const inputIsSkipToken = input === skipToken;

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
      const queryClient = unwrapLazyArg(args.queryClient);
      return buildQueryFromAsyncIterable(result, queryClient, queryKey);
    }

    return result;
  };

  return Object.assign(
    queryOptions({
      ...opts,
      queryKey,
      queryFn: inputIsSkipToken ? skipToken : queryFn,
      initialData: opts.initialData,
    }),
    { trpc: createTRPCOptionsResult({ path }) },
  );
}
