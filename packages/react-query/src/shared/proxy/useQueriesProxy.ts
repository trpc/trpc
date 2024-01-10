import type { QueryOptions } from '@tanstack/react-query';
import type { TRPCClient, TRPCClientError } from '@trpc/client';
import type {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  Filter,
  inferProcedureInput,
} from '@trpc/server';
import type { inferTransformedProcedureOutput } from '@trpc/server/shared';
import { createRecursiveProxy } from '@trpc/server/shared';
import { getQueryKeyInternal } from '../../internals/getQueryKey';
import type { TrpcQueryOptionsForUseQueries } from '../../internals/useQueries';
import type { TRPCReactRequestOptions } from '../hooks/types';

type GetQueryOptions<TProcedure extends AnyProcedure, TPath extends string> = <
  TData = inferTransformedProcedureOutput<TProcedure>,
>(
  input: inferProcedureInput<TProcedure>,
  opts?: TrpcQueryOptionsForUseQueries<
    TPath,
    inferProcedureInput<TProcedure>,
    inferTransformedProcedureOutput<TProcedure>,
    TData,
    TRPCClientError<TProcedure>
  >,
) => TrpcQueryOptionsForUseQueries<
  TPath,
  inferProcedureInput<TProcedure>,
  inferTransformedProcedureOutput<TProcedure>,
  TData,
  TRPCClientError<TProcedure>
>;

/**
 * @internal
 */
export type UseQueriesProcedureRecord<
  TRouter extends AnyRouter,
  TPath extends string = '',
> = {
  [TKey in keyof Filter<
    TRouter['_def']['record'],
    AnyQueryProcedure | AnyRouter
  >]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? UseQueriesProcedureRecord<
        TRouter['_def']['record'][TKey],
        `${TPath}${TKey & string}.`
      >
    : GetQueryOptions<
        TRouter['_def']['record'][TKey],
        `${TPath}${TKey & string}`
      >;
};

/**
 * Create proxy for `useQueries` options
 * @internal
 */
export function createUseQueriesProxy<TRouter extends AnyRouter>(
  client: TRPCClient<TRouter>,
) {
  return createRecursiveProxy((opts) => {
    const path = opts.path.join('.');
    const [input, _opts] = opts.args as [
      unknown,
      (
        | undefined
        | {
            trpc?: TRPCReactRequestOptions;
          }
      ),
    ];

    const queryKey = getQueryKeyInternal(path, input);

    const options: QueryOptions = {
      queryKey,
      queryFn: () => {
        return client.query(path, input, _opts?.trpc);
      },
      ...(_opts as any),
    };

    return options;
  }) as UseQueriesProcedureRecord<TRouter>;
}
