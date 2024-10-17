import {
  infiniteQueryOptions,
  skipToken,
  type QueryClient,
  type QueryFunctionContext,
  type SkipToken,
} from '@tanstack/react-query';
import type { TRPCClientError, TRPCUntypedClient } from '@trpc/client';
import type {
  AnyQueryProcedure,
  AnyTRPCRouter,
  inferProcedureInput,
  inferTransformedProcedureOutput,
} from '@trpc/server';
import type { AnyRootTypes } from '@trpc/server/unstable-core-do-not-import/rootConfig';
import type { TRPCQueryKey } from './queryKey';
import type {
  DefinedTRPCInfiniteQueryOptionsIn,
  DefinedTRPCInfiniteQueryOptionsOut,
  UndefinedTRPCInfiniteQueryOptionsIn,
  UndefinedTRPCInfiniteQueryOptionsOut,
  UnusedSkipTokenTRPCInfiniteQueryOptionsIn,
  UnusedSkipTokenTRPCInfiniteQueryOptionsOut,
} from './types';
import { createTRPCOptionsResult, getClientArgs } from './utils';

export interface TRPCInfiniteQueryOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyQueryProcedure,
> {
  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/infiniteQueryOptions#infinitequeryoptions
   */
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
  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/infiniteQueryOptions#infinitequeryoptions
   */
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
  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/infiniteQueryOptions#infinitequeryoptions
   */
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

export const trpcInfiniteQueryOptions = <
  TRoot extends AnyRootTypes,
  TProcedure extends AnyQueryProcedure,
>(args: {
  untypedClient: TRPCUntypedClient<AnyTRPCRouter>;
  queryClient: QueryClient;
  path: readonly string[];
  queryKey: TRPCQueryKey;
  opts: UndefinedTRPCInfiniteQueryOptionsIn<unknown, unknown, unknown, unknown>;
}): TRPCInfiniteQueryOptions<TRoot, TProcedure> => {
  const { untypedClient, path, queryKey, opts } = args;
  const inputIsSkipToken = queryKey[1]?.input === skipToken;

  const queryFn = async (
    queryFnContext: QueryFunctionContext<TRPCQueryKey, unknown>,
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
  ) as any;
};
