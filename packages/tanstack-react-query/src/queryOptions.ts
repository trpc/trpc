import type { QueryClient, QueryFunctionContext } from '@tanstack/react-query';
import { queryOptions, skipToken, type SkipToken } from '@tanstack/react-query';
import type { TRPCClientError, TRPCUntypedClient } from '@trpc/client';
import type {
  AnyQueryProcedure,
  AnyTRPCRouter,
  inferProcedureInput,
  inferTransformedProcedureOutput,
} from '@trpc/server';
import type { AnyRootTypes } from '@trpc/server/unstable-core-do-not-import';
import { isAsyncIterable } from '@trpc/server/unstable-core-do-not-import';
import type { TRPCQueryKey } from './queryKey';
import type {
  DefinedTRPCQueryOptionsIn,
  DefinedTRPCQueryOptionsOut,
  UndefinedTRPCQueryOptionsIn,
  UndefinedTRPCQueryOptionsOut,
} from './types';
import {
  buildQueryFromAsyncIterable,
  createTRPCOptionsResult,
  getClientArgs,
} from './utils';

export interface TRPCQueryOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyQueryProcedure,
> {
  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions#queryoptions
   */
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
  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions#queryoptions
   */
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
