import type { QueryClient, QueryOptions } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import {
  getUntypedClient,
  TRPCUntypedClient,
  type TRPCClientError,
} from '@trpc/client';
import type {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import { createRecursiveProxy } from '@trpc/server/unstable-core-do-not-import';
import { getQueryKeyInternal } from '../../getQueryKey';
import { fetchQueryData } from '../../internals/trpcResult';
import type {
  TrpcQueryOptionsForUseQueries,
  TrpcQueryOptionsForUseSuspenseQueries,
} from '../../internals/useQueries';
import type { TRPCUseQueryBaseOptions } from '../hooks/types';

type GetQueryOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
> = <TData = inferTransformedProcedureOutput<TRoot, TProcedure>>(
  input: inferProcedureInput<TProcedure>,
  opts?: TrpcQueryOptionsForUseQueries<
    inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData,
    TRPCClientError<TRoot>
  >,
) => TrpcQueryOptionsForUseQueries<
  inferTransformedProcedureOutput<TRoot, TProcedure>,
  TData,
  TRPCClientError<TRoot>
>;

/**
 * @internal
 */
export type UseQueriesProcedureRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyQueryProcedure
      ? GetQueryOptions<TRoot, $Value>
      : $Value extends RouterRecord
        ? UseQueriesProcedureRecord<TRoot, $Value>
        : never
    : never;
};

type GetSuspenseQueryOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyQueryProcedure,
> = <TData = inferTransformedProcedureOutput<TRoot, TProcedure>>(
  input: inferProcedureInput<TProcedure>,
  opts?: TrpcQueryOptionsForUseSuspenseQueries<
    inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData,
    TRPCClientError<TRoot>
  >,
) => TrpcQueryOptionsForUseSuspenseQueries<
  inferTransformedProcedureOutput<TRoot, TProcedure>,
  TData,
  TRPCClientError<TRoot>
>;

/**
 * @internal
 */
export type UseSuspenseQueriesProcedureRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyQueryProcedure
      ? GetSuspenseQueryOptions<TRoot, $Value>
      : $Value extends RouterRecord
        ? UseSuspenseQueriesProcedureRecord<TRoot, $Value>
        : never
    : never;
};

/**
 * Create proxy for `useQueries` options
 * @internal
 */
export function createUseQueries<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter> | TRPCClient<TRouter>,
  abortOnUnmount: boolean | undefined,
  queryClient: QueryClient,
) {
  const untypedClient: TRPCUntypedClient<TRouter> =
    client instanceof TRPCUntypedClient ? client : getUntypedClient(client);

  return createRecursiveProxy<
    UseQueriesProcedureRecord<
      TRouter['_def']['_config']['$types'],
      TRouter['_def']['record']
    >
  >((opts) => {
    const arrayPath = opts.path;
    const dotPath = arrayPath.join('.');
    const [input, _opts] = opts.args as [
      unknown,
      Partial<QueryOptions> & TRPCUseQueryBaseOptions,
    ];

    // request option should take priority over global
    const shouldAbortOnUnmount = _opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

    const queryKey = getQueryKeyInternal(arrayPath, input, 'query');

    const options: QueryOptions = {
      queryKey,
      queryFn: (queryFunctionContext) => {
        return fetchQueryData({
          context: queryFunctionContext,
          fallback: { client: queryClient, queryKey },
          request: () =>
            untypedClient.query(dotPath, input, {
              ..._opts?.trpc,
              ...(shouldAbortOnUnmount
                ? { signal: queryFunctionContext.signal }
                : {}),
            }),
        });
      },
      ..._opts,
    };

    return options;
  });
}
