import { QueryOptions } from '@tanstack/react-query';
import { TRPCClientError, TRPCUntypedClient } from '@trpc/client';
import {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  Filter,
  inferProcedureInput,
} from '@trpc/server';
import {
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { getQueryKeyInternal } from '../../internals/getQueryKey';
import { TrpcQueryOptionsForUseQueries } from '../../internals/useQueries';
import { TRPCUseQueryBaseOptions } from '../hooks/types';

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
  client: TRPCUntypedClient<TRouter>,
) {
  return createRecursiveProxy((opts) => {
    const arrayPath = opts.path;
    const dotPath = arrayPath.join('.');
    const [input, _opts] = opts.args as [
      unknown,
      Partial<QueryOptions> & TRPCUseQueryBaseOptions,
    ];

    const options: QueryOptions = {
      queryKey: getQueryKeyInternal(arrayPath, input, 'query'),
      queryFn: () => {
        return client.query(dotPath, input, _opts?.trpc);
      },
      ..._opts,
    };

    return options;
  }) as UseQueriesProcedureRecord<TRouter>;
}
